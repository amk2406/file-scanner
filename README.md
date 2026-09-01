# file-scanner

Watch folders with **chokidar**, classify files by extension, and persist metadata with **low-json-db**.

## Features

- 🔍 **Real-time monitoring** — Watch directories and track file changes instantly
- 📂 **Auto-categorization** — 19 built-in categories (video, audio, image, code, etc.)
- 💾 **Persistent storage** — Store file metadata in a JSON database
- ⏱️ **Debouncing** — Wait for file write completion before indexing
- 🔐 **Flexible filtering** — Filter by extension, depth, and custom patterns
- 🛡️ **Error resilient** — Handles permissions, missing roots, and symlink issues
- ⚡ **Hot-reload roots** — Add/remove watch paths dynamically without restart

## Installation

```bash
npm install chokidar low-json-db
```

## Quick Start

```javascript
const { createScanner } = require('./folder-scanner');

const scanner = createScanner({
  roots: ['/home/user/Documents', '/media/usb'],
  dbPath: './data'
});

scanner.on('add', (doc) => 
  console.log(`Added: ${doc.name} (${doc.category})`));

scanner.on('ready', () => 
  console.log(`Indexed ${scanner.collection.find({}).count()} files`));

await scanner.start();
```

## API Reference

### `createScanner(options)`

Returns an EventEmitter with methods for scanning and querying files.

#### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `roots` | `string[]` | `[]` | Directories to watch (absolute or relative paths) |
| `dbPath` | `string` | `'./data'` | Database storage location |
| `collection` | `string` | `'files'` | Database collection name |
| `ignored` | `string[]` \| `function` | See below | Patterns/folders to skip |
| `persistent` | `boolean` | `true` | Keep watcher alive after initial scan |
| `ignoreInitial` | `boolean` | `false` | Skip initial file discovery |
| `depth` | `number` | — | Max directory depth to scan |
| `followSymlinks` | `boolean` | `false` | Follow symbolic links |
| `extensions` | `string[]` | — | Only index these file extensions |
| `awaitWriteFinish` | `boolean` | `true` | Wait for file write to complete |
| `stabilityThreshold` | `number` | `800` | MS to wait for file stability |
| `waitForRoots` | `boolean` | `true` | Wait if roots don't exist initially |
| `waitTimeout` | `number` | `0` | MS to wait for roots (0 = forever) |
| `waitPollInterval` | `number` | `1000` | How often to re-check missing roots |
| `startDelay` | `number` | `0` | Delay before starting watcher (MS) |
| `skipMissingRoots` | `boolean` | `true` | Skip roots missing after timeout |
| `categories` | `object` | — | Merge extra category definitions |

**Default ignored patterns:**
```javascript
[
  '**/node_modules/**',
  '**/.git/**',
  '**/.svn/**',
  '**/.hg/**',
  '**/.DS_Store',
  '**/Thumbs.db',
  '**/*.tmp',
  '**/*.temp',
  '**/*~'
]
```

### Methods

#### `await scanner.start()`
Begin watching directories and indexing files.

#### `await scanner.stop()`
Stop the watcher and clean up resources.

#### `scanner.addRoot(dir)`
Dynamically add a directory to watch (waits if missing).

#### `scanner.removeRoot(dir)`
Remove a directory from watching and clear its files.

#### `scanner.scanOnce(dir)`
One-shot recursive scan without starting the watcher. Returns array of file docs.

#### Query Methods
```javascript
scanner.findByPath(fullPath)        // Find by absolute path
scanner.findByExt('.js')            // Find by extension
scanner.findByRoot(rootPath)        // Find all in root
scanner.findByName('package.json')  // Find by filename
scanner.findByCategory('code')      // Find by category
scanner.search({ size: { $gt: 1000000 } })  // MongoDB-style filter
scanner.all()                       // Get all files
scanner.count()                     // Total file count
scanner.countByCategory()           // Count per category
scanner.clear()                     // Delete all indexed files
```

#### Properties
```javascript
scanner.roots              // Array of watched directories
scanner.isRunning          // Boolean — watcher active
scanner.categories         // Array of available categories
scanner.collection         // Direct access to database collection
scanner.db                 // Low-json-db instance
```

### Events

```javascript
scanner.on('add', (doc) => {})           // New file found
scanner.on('change', (doc) => {})        // File modified
scanner.on('unlink', (doc) => {})        // File deleted
scanner.on('file', (kind, doc) => {})    // Any file event (add/change/unlink)
scanner.on('ready', (info) => {})        // Initial scan complete
scanner.on('root-ready', (root) => {})   // Root directory is ready
scanner.on('waiting', (msg) => {})       // Waiting for missing root
scanner.on('error', (err) => {})         // Error occurred
scanner.on('stop', () => {})             // Watcher stopped
```

**Event data:**
```javascript
{
  fullPath: '/abs/path/to/file.js',
  root: '/abs/path/to/root',
  name: 'file.js',
  basename: 'file',
  ext: '.js',
  category: 'code',
  dir: '/abs/path/to',
  size: 1024,
  mtimeMs: 1609459200000,
  ctimeMs: 1609459200000,
  birthtimeMs: 1609459200000,
  updatedAt: 1609459200000
}
```

## File Categories

| Category | Examples |
|----------|----------|
| `image` | `.jpg`, `.png`, `.gif`, `.webp`, `.svg`, `.ico`, `.raw`, `.psd` |
| `video` | `.mp4`, `.mkv`, `.avi`, `.mov`, `.webm`, `.m4v`, `.ts` |
| `audio` | `.mp3`, `.wav`, `.flac`, `.aac`, `.ogg`, `.wma`, `.m4a` |
| `text` | `.txt`, `.md`, `.html`, `.json`, `.yaml`, `.csv`, `.env` |
| `code` | `.js`, `.ts`, `.py`, `.java`, `.go`, `.rs`, `.php`, `.sql` |
| `document` | `.pdf`, `.doc`, `.docx`, `.epub`, `.tex` |
| `spreadsheet` | `.xls`, `.xlsx`, `.ods`, `.csv` |
| `presentation` | `.ppt`, `.pptx`, `.odp`, `.key` |
| `archive` | `.zip`, `.rar`, `.7z`, `.tar`, `.gz` |
| `execution` | `.exe`, `.dll`, `.bat`, `.cmd`, `.app`, `.deb` |
| `database` | `.db`, `.sqlite`, `.mdb`, `.accdb` |
| `font` | `.ttf`, `.otf`, `.woff`, `.woff2` |
| `design` | `.ai`, `.xd`, `.fig`, `.sketch`, `.psd` |
| `model3d` | `.obj`, `.fbx`, `.stl`, `.blend`, `.gltf` |
| `disk` | `.img`, `.vmdk`, `.vdi`, `.vhd` |
| `subtitle` | `.srt`, `.vtt`, `.ass`, `.ssa` |
| `other` | Uncategorized extensions |

## Examples

### Basic directory watch
```javascript
const { createScanner } = require('./folder-scanner');

const scanner = createScanner({ roots: ['./my-files'] });
scanner.on('add', (file) => console.log(`New file: ${file.name}`));
await scanner.start();
```

### Watch multiple roots with filtering
```javascript
const scanner = createScanner({
  roots: ['/home/user/Downloads', '/home/user/Documents'],
  extensions: ['.pdf', '.txt', '.md'],
  depth: 3
});

scanner.on('ready', () => {
  console.log(scanner.countByCategory());
});

await scanner.start();
```

### Dynamic root management
```javascript
const scanner = createScanner({ dbPath: './data' });
await scanner.start();

// Later...
scanner.addRoot('/media/usb');
scanner.removeRoot('/media/usb');
```

### Search by category
```javascript
const codeFiles = scanner.findByCategory('code');
const images = scanner.findByExt('.png');
const largeFiles = scanner.search({ size: { $gt: 100000000 } });
```

### One-shot scan without watching
```javascript
const files = scanner.scanOnce('./my-folder');
console.log(`Found ${files.length} files`);
```

## License

MIT

<hr>

Happy coding