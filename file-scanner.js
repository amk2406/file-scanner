const fs = require("fs");
const path = require("path");
const { EventEmitter } = require("events");
const chokidar = require("chokidar");
const { JSONDB } = require("low-json-db");
const { classify } = require("./categories");

function toPosix(filePath) {
  return String(filePath).split(path.sep).join("/");
}

function asList(value) {
  if (value == null || value === "") return [];
  if (Array.isArray(value)) {
    return value.flatMap((item) => asList(item));
  }
  return String(value)
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function globToRegExp(pattern, caseSensitive) {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");
  return new RegExp(`^${escaped}$`, caseSensitive ? "" : "i");
}

const VIRTUAL = ["/proc", "/sys", "/dev", "/run"];
const SYSTEM = [
  "/proc",
  "/sys",
  "/dev",
  "/run",
  "/usr",
  "/bin",
  "/sbin",
  "/boot",
  "/lib",
  "/lib64",
  "/etc",
  "/opt",
  "/System",
  "/Library",
  "/Applications",
  "/Windows",
  "/Program Files",
  "/Program Files (x86)",
  "/ProgramData",
  "C:/Windows",
  "C:/Program Files",
  "C:/Program Files (x86)",
  "C:/ProgramData",
];

function startsWithPrefix(filePath, prefixes) {
  const lower = toPosix(filePath).toLowerCase();
  return prefixes.some((prefix) => {
    const n = toPosix(prefix).toLowerCase().replace(/\/+$/, "");
    return lower === n || lower.startsWith(`${n}/`);
  });
}

function matchesFolder(filePath, folder, caseSensitive) {
  const p = caseSensitive ? toPosix(filePath) : toPosix(filePath).toLowerCase();
  const f = (caseSensitive ? toPosix(folder) : toPosix(folder).toLowerCase()).replace(
    /\/+$/,
    "",
  );
  if (!f) return false;
  if (p === f || p.startsWith(`${f}/`)) return true;
  const name = f.split("/").pop();
  return p.split("/").includes(name);
}

function matchesFile(filePath, pattern, caseSensitive) {
  const base = path.basename(filePath);
  const re = globToRegExp(pattern, caseSensitive);
  return re.test(base) || re.test(toPosix(filePath));
}

function resolveOne(input) {
  if (!input) return process.cwd();
  if (path.isAbsolute(input)) return path.resolve(input);
  return path.resolve(process.cwd(), input);
}

function statFile(filePath) {
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) return null;
    const name = path.basename(filePath);
    return {
      path: toPosix(path.resolve(filePath)),
      name,
      ext: path.extname(filePath).toLowerCase(),
      dir: toPosix(path.dirname(path.resolve(filePath))),
      size: stat.size,
      mtimeMs: stat.mtimeMs,
      ctimeMs: stat.ctimeMs,
      category: classify(name),
      updatedAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

class FileScanner extends EventEmitter {
  /**
   * @param {object} [options]
   * @param {string|string[]} [options.paths] Absolute or partial paths (alias: watchPath)
   * @param {number} [options.delay=0] Milliseconds to wait before saving a file
   * @param {string|string[]} [options.excludeFolder]
   * @param {string|string[]} [options.excludeFile]
   * @param {boolean} [options.scanSystemDirectory=false]
   * @param {string|string[]} [options.categories] Only persist these kinds
   * @param {boolean} [options.includeHidden=false]
   * @param {boolean} [options.recursive=true]
   * @param {number} [options.depth=0] 0 = unlimited
   * @param {number} [options.minSize=0]
   * @param {number} [options.maxSize=0]
   * @param {boolean} [options.caseSensitive=false]
   * @param {string} [options.dbDir='./data']
   * @param {string} [options.collectionName='files']
   * @param {boolean} [options.persistent=true]
   * @param {boolean} [options.ignoreInitial=false]
   */
  constructor(options = {}) {
    super();
    const paths = asList(options.paths ?? options.watchPath ?? ".");
    this.paths = paths.length ? paths.map(resolveOne) : [process.cwd()];
    this.delay = Math.max(0, Number(options.delay ?? options.debounce ?? 0) || 0);
    this.excludeFolder = asList(options.excludeFolder);
    this.excludeFile = asList(options.excludeFile);
    this.scanSystemDirectory = Boolean(options.scanSystemDirectory);
    this.categories = asList(options.categories).map((item) => item.toLowerCase());
    this.includeHidden = Boolean(options.includeHidden);
    this.recursive = options.recursive !== false;
    this.depth = Number(options.depth ?? 0) || 0;
    this.minSize = Number(options.minSize ?? 0) || 0;
    this.maxSize = Number(options.maxSize ?? 0) || 0;
    this.caseSensitive = Boolean(options.caseSensitive);
    this.dbDir = options.dbDir ?? "./data";
    this.collectionName = options.collectionName ?? "files";
    this.persistent = options.persistent !== false;
    this.ignoreInitial = Boolean(options.ignoreInitial);
    this.extraIgnored = options.ignored ?? [];

    this.db = new JSONDB(this.dbDir);
    this.files = this.db.collection({
      name: this.collectionName,
      autoId: true,
      idType: "uuid",
      indexes: ["path", "category"],
      pretty: true,
    });

    this.watcher = null;
    this.pending = new Map();
  }

  isIgnored(filePath) {
    const posix = toPosix(path.resolve(filePath));
    const name = path.basename(posix);

    if (startsWithPrefix(posix, [path.resolve(this.dbDir)])) return true;
    if (posix.split("/").includes("node_modules")) return true;
    if (startsWithPrefix(posix, VIRTUAL)) return true;
    if (!this.scanSystemDirectory && startsWithPrefix(posix, SYSTEM)) return true;

    if (!this.includeHidden) {
      const parts = posix.split("/");
      if (parts.some((part) => part.startsWith(".") && part !== "." && part !== "..")) {
        return true;
      }
    }

    if (this.excludeFolder.some((folder) => matchesFolder(posix, folder, this.caseSensitive))) {
      return true;
    }
    if (this.excludeFile.some((pattern) => matchesFile(posix, pattern, this.caseSensitive))) {
      return true;
    }
    if (!this.recursive) {
      const root = this.paths.find((item) => {
        const r = toPosix(item);
        return posix === r || posix.startsWith(`${r}/`);
      });
      if (root) {
        const rel = posix.slice(toPosix(root).length);
        if (rel.split("/").filter(Boolean).length > 1) return true;
      }
    }
    if (this.depth > 0) {
      const root = this.paths.find((item) => posix.startsWith(toPosix(item)));
      if (root) {
        const rel = posix.slice(toPosix(root).length);
        if (rel.split("/").filter(Boolean).length > this.depth) return true;
      }
    }
    if (typeof this.extraIgnored === "function") return this.extraIgnored(filePath);
    return false;
  }

  shouldSave(record) {
    if (!record) return false;
    if (this.minSize > 0 && record.size < this.minSize) return false;
    if (this.maxSize > 0 && record.size > this.maxSize) return false;
    if (this.categories.length && !this.categories.includes(record.category)) return false;
    return true;
  }

  schedule(filePath, kind) {
    const prev = this.pending.get(filePath);
    if (prev) clearTimeout(prev);
    const run = () => {
      this.pending.delete(filePath);
      if (kind === "unlink") {
        this.remove(filePath);
        return;
      }
      const doc = this.upsert(filePath);
      if (doc) this.emit(kind, doc);
    };
    if (!this.delay) {
      run();
      return;
    }
    this.pending.set(filePath, setTimeout(run, this.delay));
  }

  upsert(filePath) {
    if (this.isIgnored(filePath)) return null;
    const record = statFile(filePath);
    if (!record || !this.shouldSave(record)) return null;

    const existing = this.files.findOne({ path: record.path });
    if (existing) {
      this.files.updateOne({ path: record.path }, { $set: record });
      const saved = this.files.findOne({ path: record.path });
      this.emit("upsert", saved);
      return saved;
    }
    const saved = this.files.insert({
      ...record,
      addedAt: new Date().toISOString(),
    });
    this.emit("upsert", saved);
    return saved;
  }

  remove(filePath) {
    const abs = toPosix(path.resolve(filePath));
    const existing = this.files.findOne({ path: abs });
    if (!existing) return false;
    this.files.deleteOne({ path: abs });
    this.emit("remove", existing);
    return true;
  }

  list() {
    return this.files.find({}).toArray();
  }

  findByExt(ext) {
    const normalized = ext.startsWith(".") ? ext.toLowerCase() : `.${ext.toLowerCase()}`;
    return this.files.find({ ext: normalized }).toArray();
  }

  findByCategory(category) {
    return this.files.find({ category: String(category).toLowerCase() }).toArray();
  }

  start() {
    if (this.watcher) return this.watcher;

    this.watcher = chokidar.watch(this.paths, {
      persistent: this.persistent,
      ignoreInitial: this.ignoreInitial,
      ignored: (watchPath) => this.isIgnored(watchPath),
      awaitWriteFinish: {
        stabilityThreshold: Math.max(200, this.delay),
        pollInterval: 50,
      },
    });

    this.watcher
      .on("add", (filePath) => this.schedule(filePath, "add"))
      .on("change", (filePath) => this.schedule(filePath, "change"))
      .on("unlink", (filePath) => this.schedule(filePath, "unlink"))
      .on("error", (err) => this.emit("error", err))
      .on("ready", () => this.emit("ready", this.list()));

    return this.watcher;
  }

  async stop() {
    for (const timer of this.pending.values()) clearTimeout(timer);
    this.pending.clear();
    if (!this.watcher) return;
    await this.watcher.close();
    this.watcher = null;
  }
}

module.exports = { FileScanner, statFile, classify, asList };
