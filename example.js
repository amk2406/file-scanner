const path = require("path");
const { FileScanner } = require("./file-scanner");

const scanner = new FileScanner({
  paths: [process.argv[2] || path.join(__dirname, "watch-me"), "./watch-me"],
  delay: 250,
  excludeFolder: ["node_modules", ".git", "dist"],
  excludeFile: ["Thumbs.db", ".DS_Store", "*.tmp"],
  scanSystemDirectory: false,
  categories: [],
  includeHidden: false,
  recursive: true,
  dbDir: path.join(__dirname, "data"),
  collectionName: "files",
});

scanner.on("ready", (files) => {
  console.log(`Ready. Tracking ${files.length} file(s).`);
});

scanner.on("add", (file) => {
  console.log("ADD   ", file.category.padEnd(12), file.path);
});

scanner.on("change", (file) => {
  console.log("CHANGE", file.category.padEnd(12), file.path);
});

scanner.on("remove", (file) => {
  console.log("REMOVE", file.path);
});

scanner.on("error", (err) => {
  console.error("Watcher error:", err);
});

scanner.start();

process.on("SIGINT", async () => {
  await scanner.stop();
  process.exit(0);
});
