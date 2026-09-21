# node-file-scanner

A lightweight Node.js filesystem scanner built with `chokidar` and `file-json-db`.
It can walk one or more folders, index files by category, keep a local JSON database in sync, and watch for file changes while your app is running.

## Features

- Full recursive or shallow scans
- Watch mode for file create, change, and delete events
- Smart re-scan behavior that avoids duplicate inserts and updates records only when metadata changes
- Built-in category detection for code, images, video, audio, documents, archives, folders, and other files
- Custom ignore patterns and system directory blocking
- Event-based API for scan and file lifecycle updates
- Simple database helpers for querying and cleanup

## Installation

```bash
npm install node-file-scanner
```

## Quick Start

```js
const { FileScanner } = require('node-file-scanner');

const scanner = new FileScanner({
  paths: ['./my-folder', './documents'],
  dbPath: './scanner-data',
  collectionName: 'files',
  mode: 'full',
  recursive: true,
  delay: 5,
  categories: ['code', 'image', 'document'],
  allowSystemDir: false,
  ignored: ['**/.tmp/**']
});

scanner.on('add', (file) => console.log('Added:', file.path));
scanner.on('change', (file) => console.log('Changed:', file.path));
scanner.on('unlink', (file) => console.log('Deleted:', file.path));
scanner.on('finish', (stats) => {
  console.log('Scan complete:', stats);
  console.log('Total files:', scanner.count());
});

scanner.on('error', (err) => {
  console.error('Scanner error:', err.message);
});

(async () => {
  await scanner.startAsync();
  console.log('Scanner is running. Press Ctrl+C to stop.');
})();
```

## Supported Modes

The `mode` option accepts:

- `full` — perform an initial scan and then start watching
- `watch` — start watching without a full scan
- `scan-only` — perform a full scan without starting the file watcher

## Configuration Options

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `paths` | `string \| string[]` | required | One or more root folders to scan |
| `dbPath` | `string` | `./scanner-data` | Folder used by the JSON DB |
| `collectionName` | `string` | `files` | Database collection name |
| `mode` | `string` | `full` | `full`, `watch`, or `scan-only` |
| `recursive` | `boolean` | `true` | Recurse into subdirectories |
| `delay` | `number` | `5` | Delay in milliseconds between file processing steps |
| `categories` | `string[]` | `['code', 'image', 'document', 'video', 'audio', 'archive', 'folder', 'other']` | Category whitelist |
| `allowSystemDir` | `boolean` | `false` | Allow scanning system directories such as `/usr` or `C:\Windows` |
| `ignored` | `string[]` | `[]` | Extra glob-like ignore patterns |

## Default Category Mapping

Files are categorized by extension using a built-in mapping:

- `code`: `.js`, `.ts`, `.jsx`, `.tsx`, `.py`, `.java`, `.c`, `.cpp`, `.cs`, `.go`, `.php`, `.json`, `.html`, `.css`, `.md`, etc.
- `image`: `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, `.svg`, `.bmp`, `.ico`
- `video`: `.mp4`, `.mkv`, `.avi`, `.mov`, `.webm`
- `audio`: `.mp3`, `.wav`, `.flac`, `.ogg`, `.m4a`
- `document`: `.pdf`, `.doc`, `.docx`, `.txt`, `.csv`, `.rtf`
- `archive`: `.zip`, `.rar`, `.7z`, `.tar`, `.gz`, `.bz2`, `.xz`
- `folder`: directories
- `other`: anything else not explicitly mapped

## Events

The scanner extends Node's `EventEmitter` and emits:

- `add` — a new file/directory record was inserted
- `change` — an existing file was updated because metadata changed
- `unlink` — a file was removed from the database
- `scan-start` — full scan has begun
- `scan-end` — full scan complete with stats
- `finish` — scanner startup/scan lifecycle completed
- `error` — an error occurred while scanning or watching

## API

### Start / stop

```js
await scanner.startAsync();
scanner.start();

await scanner.stopAsync();
scanner.stop();
```

### Re-scan

```js
await scanner.scanAsync();
scanner.scan();
```

### Query helpers

```js
const allFiles = scanner.getFiles();
const jsFiles = scanner.getFiles({ category: 'code' });
const firstMatch = scanner.findOne({ path: '/some/file.js' });
const matches = scanner.find({ category: 'image' });
const count = scanner.count();
```

Additional async helpers are also available:

- `getFilesAsync(filter?)`
- `countAsync(filter?)`
- `deleteAllAsync()`

### Delete all DB data

```js
scanner.deleteAll();
```

This drops the collection and recreates it so the database starts empty.

## Smart Re-scan Behavior

When the scanner is started again, it does not blindly insert duplicates.
Instead it:

1. Looks up the file by its resolved `path`
2. Inserts it if it does not exist
3. Updates it only if `mtime` or `size` changed
4. Emits `add` or `change` as appropriate

This makes the scanner safe to restart after crashes or process restarts.

## Stored Record Shape

Each indexed item includes:

```js
{
  path: '/absolute/path/to/file.ext',
  name: 'file.ext',
  extension: '.ext',
  ctime: 1720000000000,
  mtime: 1720000000000,
  size: 12345,
  category: 'code'
}
```

## License

MIT
