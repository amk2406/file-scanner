# node-file-scanner

>A file system scanner using chokidar + chunkjson-db. Supports full scan, live watching, categories, smart re-scan, and events.

A powerful and resilient file system scanner built with **chokidar** + **file-json-db**.

### Features

- Full recursive scan
- Live watching (add / change / delete)
- Smart re-scan: checks if path already exists before inserting
- Category filtering (code, image, document, video, audio, archive...)
- Configurable delay between files
- Events support
- Useful DB helpers (`getFiles`, `find`, `findOne`, `count`, `deleteAll`)
- Works even if the process was killed and restarted

---

## Installation

```bash
npm install node-file-scanner
```

---

## Quick Start

```js
const { FileScanner } = require('node-file-scanner');

const scanner = new FileScanner({
  paths: ['./my-folder', './documents'],   // string or array
  dbPath: './scanner-data',
  collectionName: 'files',
  mode: 'full',                            // 'full' | 'watch' | 'scan-only'
  recursive: true,
  delay: 5,
  categories: ['code', 'image', 'document'],
  allowSystemDir: false
});

scanner.on('add', (file) => console.log('Added:', file.path));
scanner.on('change', (file) => console.log('Changed:', file.path));
scanner.on('unlink', (file) => console.log('Deleted:', file.path));
scanner.on('finish', (stats) => {
  console.log('Finished!', stats);
  console.log('Total files:', scanner.count());
});

await scanner.startAsync();
```

---

## Options

| Option            | Type             | Default     | Description |
|-------------------|------------------|-------------|-------------|
| `paths`           | string \| array  | required    | Folder(s) to scan |
| `dbPath`          | string           | `./scanner-data` | Where file-json-db stores data |
| `collectionName`  | string           | `files`     | Collection name |
| `mode`            | string           | `full`      | `full`, `watch`, or `scan-only` |
| `recursive`       | boolean          | `true`      | Scan subfolders |
| `delay`           | number           | `5`         | Delay (ms) between each file |
| `categories`      | array            | all         | Only save these categories |
| `allowSystemDir`  | boolean          | `false`     | Allow scanning system folders |
| `ignored`         | array            | defaults    | Extra ignore patterns |

---

## Methods

- `start()` / `startAsync()`
- `stop()` / `stopAsync()`
- `scan()` / `scanAsync()`
- `getFiles(filter?)`
- `find(filter)` / `findOne(filter)`
- `count(filter?)`
- `deleteAll()` → deletes **all** data in the collection

---

## Events

- `add`
- `change`
- `unlink`
- `scan-start`
- `scan-end`
- `finish`
- `error`

---

## Smart Re-scan Behavior

When you run the scanner again after the process died:

1. It checks if the `path` already exists in the database
2. If **not found** → inserts the file
3. If **found** → updates only if `mtime` or `size` has changed
4. Emits `add` or `change` accordingly

This makes it safe to restart anytime.

---

## License

MIT
