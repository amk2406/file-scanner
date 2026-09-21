/**
 * FileScanner
 * A powerful file system scanner using chokidar + filejson-db
 *
 * Features:
 * - Full scan + live watching
 * - Smart re-scan (checks if path already exists)
 * - Category filtering
 * - Configurable delay
 * - Events: add, change, unlink, scan-start, scan-end, finish, error
 * - Utilities: getFiles, find, findOne, count, deleteAll
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');
const chokidar = require('chokidar');

// Try to load chunkjson-db from different possible locations
let JSONDB;
try {
  JSONDB = require('filejson-db').JSONDB;
} catch (e) {
  try {
    JSONDB = require('../file-json-db').JSONDB;
  } catch (e2) {
    try {
      JSONDB = require('../file-json-db/index.js').JSONDB;
    } catch (e3) {
      throw new Error('file-json-db is required. Please make sure it is available.');
    }
  }
}

// ====================== CATEGORY MAP ======================
const EXTENSION_CATEGORIES = {
  // Code
  '.js': 'code', '.ts': 'code', '.jsx': 'code', '.tsx': 'code',
  '.py': 'code', '.java': 'code', '.c': 'code', '.cpp': 'code',
  '.h': 'code', '.hpp': 'code', '.cs': 'code', '.go': 'code',
  '.rs': 'code', '.php': 'code', '.rb': 'code', '.swift': 'code',
  '.kt': 'code', '.scala': 'code', '.sh': 'code', '.bash': 'code',
  '.json': 'code', '.yml': 'code', '.yaml': 'code', '.xml': 'code',
  '.html': 'code', '.css': 'code', '.scss': 'code', '.sass': 'code',
  '.vue': 'code', '.svelte': 'code',

  // Image
  '.png': 'image', '.jpg': 'image', '.jpeg': 'image', '.gif': 'image',
  '.webp': 'image', '.svg': 'image', '.bmp': 'image', '.ico': 'image',
  '.tiff': 'image', '.tif': 'image',

  // Video
  '.mp4': 'video', '.mkv': 'video', '.avi': 'video', '.mov': 'video',
  '.wmv': 'video', '.flv': 'video', '.webm': 'video', '.m4v': 'video',

  // Audio
  '.mp3': 'audio', '.wav': 'audio', '.flac': 'audio', '.aac': 'audio',
  '.ogg': 'audio', '.m4a': 'audio', '.wma': 'audio',

  // Document
  '.pdf': 'document', '.doc': 'document', '.docx': 'document',
  '.xls': 'document', '.xlsx': 'document', '.ppt': 'document',
  '.pptx': 'document', '.txt': 'document', '.md': 'document',
  '.rtf': 'document', '.odt': 'document', '.csv': 'document',

  // Archive
  '.zip': 'archive', '.rar': 'archive', '.7z': 'archive',
  '.tar': 'archive', '.gz': 'archive', '.bz2': 'archive',
  '.xz': 'archive'
};

// Default ignore patterns
const DEFAULT_IGNORED = [
  '**/.git/**',
  '**/node_modules/**',
  '**/.next/**',
  '**/dist/**',
  '**/build/**',
  '**/.DS_Store',
  '**/Thumbs.db',
  '**/.cache/**',
  '**/coverage/**',
  '**/.vscode/**',
  '**/.idea/**'
];

// System directories (blocked unless allowSystemDir = true)
const SYSTEM_DIRS = [
  '/bin', '/sbin', '/usr', '/etc', '/var', '/lib', '/lib64',
  '/boot', '/dev', '/proc', '/sys', '/run', '/snap',
  'C:\\Windows', 'C:\\Program Files', 'C:\\Program Files (x86)'
];

class FileScanner extends EventEmitter {
  /**
   * @param {Object} options
   */
  constructor(options = {}) {
    super();

    // Paths
    this.paths = Array.isArray(options.paths)
      ? options.paths
      : (options.paths ? [options.paths] : []);

    if (this.paths.length === 0) {
      throw new Error('At least one path is required in options.paths');
    }

    // Database
    this.dbPath = options.dbPath || './scanner-data';
    this.collectionName = options.collectionName || 'files';

    // Behavior
    this.mode = options.mode || 'full'; // 'full' | 'watch' | 'scan-only'
    this.recursive = options.recursive !== false;
    this.delay = typeof options.delay === 'number' ? options.delay : 5;
    this.allowSystemDir = options.allowSystemDir === true;

    // Categories whitelist
    this.categories = Array.isArray(options.categories) && options.categories.length > 0
      ? options.categories
      : ['code', 'image', 'document', 'video', 'audio', 'archive', 'folder', 'other'];

    // Ignore patterns
    this.ignored = [
      ...DEFAULT_IGNORED,
      ...(Array.isArray(options.ignored) ? options.ignored : [])
    ];

    // Internal
    this.db = null;
    this.collection = null;
    this.watcher = null;
    this.isRunning = false;
    this.isScanning = false;
    this._stopRequested = false;
  }

  // ====================== INIT DB ======================
  _initDB() {
    if (this.db) return;

    this.db = new JSONDB(this.dbPath);
    this.collection = this.db.collection({
      name: this.collectionName,
      autoId: true,
      indexes: ['path', 'category', 'extension'],
      pretty: true
    });
  }

  // ====================== HELPERS ======================
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  _getCategory(filePath, isDirectory) {
    if (isDirectory) return 'folder';
    const ext = path.extname(filePath).toLowerCase();
    return EXTENSION_CATEGORIES[ext] || 'other';
  }

  _isSystemPath(p) {
    const normalized = path.resolve(p);
    return SYSTEM_DIRS.some(sys => normalized.startsWith(sys));
  }

  _shouldIgnore(filePath) {
    // Simple glob-like check for common cases
    const normalized = filePath.replace(/\\/g, '/');

    for (const pattern of this.ignored) {
      // Very simple matching for **/.git/** style
      const clean = pattern.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*');
      const regex = new RegExp(clean.replace(/\//g, '\\/'));
      if (regex.test(normalized)) return true;
    }
    return false;
  }

  _createFileDoc(filePath, stats) {
    const isDirectory = stats.isDirectory();
    const ext = isDirectory ? '' : path.extname(filePath).toLowerCase();
    const category = this._getCategory(filePath, isDirectory);

    // Only keep allowed categories
    if (!this.categories.includes(category)) {
      return null;
    }

    return {
      path: path.resolve(filePath),
      name: path.basename(filePath),
      extension: ext,
      ctime: stats.ctimeMs || stats.ctime.getTime(),
      mtime: stats.mtimeMs || stats.mtime.getTime(),
      size: isDirectory ? 0 : stats.size,
      category
    };
  }

  // ====================== CORE: UPSERT LOGIC ======================
  /**
   * Smart save:
   * - If path does not exist → insert
   * - If path exists → update only if mtime or size changed
   */
  _upsertFile(doc) {
    if (!doc) return null;

    const existing = this.collection.findOne({ path: doc.path });

    if (!existing) {
      // New file
      const inserted = this.collection.insert(doc);
      this.emit('add', inserted);
      return inserted;
    }

    // Exists → check if changed
    if (existing.mtime !== doc.mtime || existing.size !== doc.size) {
      const updated = this.collection.updateOne(
        { path: doc.path },
        {
          $set: {
            name: doc.name,
            extension: doc.extension,
            ctime: doc.ctime,
            mtime: doc.mtime,
            size: doc.size,
            category: doc.category
          }
        }
      );
      this.emit('change', updated || { ...existing, ...doc });
      return updated;
    }

    // No change
    return existing;
  }

  _removeFile(filePath) {
    const fullPath = path.resolve(filePath);
    const deleted = this.collection.deleteOne({ path: fullPath });
    if (deleted) {
      this.emit('unlink', deleted);
    }
    return deleted;
  }

  // ====================== FULL SCAN ======================
  async _scanPath(rootPath) {
    const results = { total: 0, added: 0, updated: 0, skipped: 0 };

    const walk = async (currentPath) => {
      if (this._stopRequested) return;

      if (!this.allowSystemDir && this._isSystemPath(currentPath)) {
        return;
      }

      if (this._shouldIgnore(currentPath)) {
        return;
      }

      let stats;
      try {
        stats = fs.statSync(currentPath);
      } catch (err) {
        this.emit('error', err);
        return;
      }

      const doc = this._createFileDoc(currentPath, stats);
      if (doc) {
        const before = this.collection.findOne({ path: doc.path });
        this._upsertFile(doc);
        results.total++;

        if (!before) results.added++;
        else if (before.mtime !== doc.mtime || before.size !== doc.size) results.updated++;
        else results.skipped++;

        if (this.delay > 0) {
          await this._sleep(this.delay);
        }
      }

      if (stats.isDirectory() && this.recursive) {
        let entries;
        try {
          entries = fs.readdirSync(currentPath);
        } catch (err) {
          this.emit('error', err);
          return;
        }

        for (const entry of entries) {
          if (this._stopRequested) return;
          const full = path.join(currentPath, entry);
          await walk(full);
        }
      }
    };

    await walk(path.resolve(rootPath));
    return results;
  }

  async _runFullScan() {
    this.isScanning = true;
    this.emit('scan-start');

    let totalStats = { total: 0, added: 0, updated: 0, skipped: 0 };

    for (const p of this.paths) {
      if (this._stopRequested) break;
      const stats = await this._scanPath(p);
      totalStats.total += stats.total;
      totalStats.added += stats.added;
      totalStats.updated += stats.updated;
      totalStats.skipped += stats.skipped;
    }

    this.isScanning = false;
    this.emit('scan-end', totalStats);
    return totalStats;
  }

  // ====================== WATCHER ======================
  _startWatcher() {
    const watchPaths = this.paths.map(p => path.resolve(p));

    this.watcher = chokidar.watch(watchPaths, {
      ignored: this.ignored,
      persistent: true,
      ignoreInitial: true,          // we already did full scan
      followSymlinks: false,
      depth: this.recursive ? undefined : 0,
      awaitWriteFinish: {
        stabilityThreshold: 500,
        pollInterval: 100
      }
    });

    this.watcher
      .on('add', (filePath) => {
        try {
          const stats = fs.statSync(filePath);
          const doc = this._createFileDoc(filePath, stats);
          if (doc) this._upsertFile(doc);
        } catch (err) {
          this.emit('error', err);
        }
      })
      .on('change', (filePath) => {
        try {
          const stats = fs.statSync(filePath);
          const doc = this._createFileDoc(filePath, stats);
          if (doc) this._upsertFile(doc);
        } catch (err) {
          this.emit('error', err);
        }
      })
      .on('unlink', (filePath) => {
        this._removeFile(filePath);
      })
      .on('error', (err) => {
        this.emit('error', err);
      });
  }

  // ====================== PUBLIC METHODS ======================

  /**
   * Start the scanner (async - recommended)
   */
  async startAsync() {
    if (this.isRunning) {
      throw new Error('Scanner is already running');
    }

    this._stopRequested = false;
    this._initDB();
    this.isRunning = true;

    let stats = null;

    if (this.mode === 'full' || this.mode === 'scan-only') {
      stats = await this._runFullScan();
    }

    if (this.mode === 'full' || this.mode === 'watch') {
      this._startWatcher();
    }

    this.emit('finish', stats || { total: 0, added: 0, updated: 0, skipped: 0 });
    return stats;
  }

  /**
   * Start the scanner (sync wrapper)
   */
  start() {
    // Fire and forget async version
    this.startAsync().catch(err => this.emit('error', err));
  }

  /**
   * Stop watching
   */
  async stopAsync() {
    this._stopRequested = true;

    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }

    this.isRunning = false;
    this.isScanning = false;
  }

  stop() {
    this.stopAsync().catch(err => this.emit('error', err));
  }

  /**
   * Force a full scan again
   */
  async scanAsync() {
    this._initDB();
    return await this._runFullScan();
  }

  scan() {
    this.scanAsync().catch(err => this.emit('error', err));
  }

  // ====================== DB UTILITIES ======================

  /**
   * Get all files (optional filter)
   */
  getFiles(filter = {}) {
    this._initDB();
    return this.collection.find(filter).toArray();
  }

  getFilesAsync(filter = {}) {
    return Promise.resolve(this.getFiles(filter));
  }

  /**
   * Find files
   */
  find(filter = {}) {
    this._initDB();
    return this.collection.find(filter);
  }

  findOne(filter = {}) {
    this._initDB();
    return this.collection.findOne(filter);
  }

  /**
   * Count files
   */
  count(filter = {}) {
    this._initDB();
    return this.collection.find(filter).count();
  }

  countAsync(filter = {}) {
    return Promise.resolve(this.count(filter));
  }

  /**
   * Delete ALL data in the collection
   */
  deleteAll() {
    this._initDB();
    // Drop and recreate collection
    this.db.dropCollection(this.collectionName);
    this.collection = this.db.collection({
      name: this.collectionName,
      autoId: true,
      indexes: ['path', 'category', 'extension'],
      pretty: true
    });
    return true;
  }

  deleteAllAsync() {
    return Promise.resolve(this.deleteAll());
  }
}

module.exports = { FileScanner };
