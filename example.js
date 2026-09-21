const path = require('path');
const { FileScanner } = require('./file-scanner');

// Create scanner
const scanner = new FileScanner({
  paths: [path.join(__dirname, '..')],   // scan the parent folder (artifacts)
  dbPath: './scanner-db',
  collectionName: 'files',
  mode: 'full',                          // full scan + watch
  recursive: true,
  delay: 2,                              // small delay
  categories: ['code', 'document', 'image', 'other'],
  allowSystemDir: false
});

// Events
scanner.on('scan-start', () => {
  console.log('→ Scan started...');
});

scanner.on('add', (file) => {
  console.log('[ADD]', file.path);
});

scanner.on('change', (file) => {
  console.log('[CHANGE]', file.path);
});

scanner.on('unlink', (file) => {
  console.log('[DELETE]', file.path);
});

scanner.on('scan-end', (stats) => {
  console.log('→ Scan finished:', stats);
});

scanner.on('finish', (stats) => {
  console.log('→ Scanner ready / finished');
  console.log('Total files in DB:', scanner.count());

  // Example: get some files
  const codeFiles = scanner.getFiles({ category: 'code' });
  console.log('Code files found:', codeFiles.length);
});

scanner.on('error', (err) => {
  console.error('[ERROR]', err.message);
});

// Start
(async () => {
  try {
    await scanner.startAsync();
    console.log('Scanner is running. Press Ctrl+C to stop.');
  } catch (err) {
    console.error(err);
  }
})();
