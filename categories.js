const EXT = {
  video: [
    "mp4", "mkv", "avi", "mov", "wmv", "flv", "webm", "m4v", "mpeg", "mpg",
    "3gp", "ts", "m2ts", "vob", "ogv", "rmvb", "asf",
  ],
  audio: [
    "mp3", "wav", "flac", "aac", "ogg", "m4a", "wma", "aiff", "opus", "midi",
    "mid", "amr",
  ],
  image: [
    "png", "jpg", "jpeg", "gif", "bmp", "webp", "svg", "tiff", "tif", "ico",
    "heic", "heif", "avif", "raw", "cr2", "psd", "ai",
  ],
  text: [
    'txt', 'md', 'markdown', 'html', 'htm', 'css', 'scss', 'sass',
    'less', 'xml', 'json', 'yaml', 'yml', 'toml', 'ini', 'conf',
    'cfg', 'log', 'rst', 'rtf', 'nfo', 'csv', 'tsv', 'env',
    'gitignore', 'editorconfig', 'properties'
  ],
  code: [
    'js', 'mjs', 'cjs', 'ts', 'tsx', 'jsx', 'php', 'py', 'rb',
    'go', 'rs', 'java', 'kt', 'kts', 'swift', 'c', 'h', 'cpp',
    'cc', 'cxx', 'hpp', 'hxx', 'cs', 'vb', 'lua', 'sh', 'bash',
    'zsh', 'ps1', 'r', 'sql', 'pl', 'pm', 'dart', 'scala',
    'groovy', 'vue', 'svelte', 'elm', 'ex', 'exs', 'erl', 'hs',
    'ml', 'mli', 'clj', 'cljs', 'fs', 'fsx', 'asm', 's',
    'makefile', 'cmake', 'gradle', 'dockerfile'
  ],
  archive: ["zip", "rar", "7z", "tar", "gz", "tgz", "bz2", "xz", "zst", "cab", "jar"],
  executable: [
    "exe", "bat", "cmd", "bin", "dll", "so", "dylib", "app", "msi", "deb",
    "rpm", "com", "scr", "sys", "drv",
  ],
    database: [
    "db", "sqlite", "sqlite3", "sql", "mdb", "accdb", "dump", "bak",
  ],
  document: [
    "pdf", "doc", "docx", "odt", "rtf", "xls", "xlsx", "ppt", "pptx", "epub",
    "mobi",
  ],
  font: ["ttf", "otf", "woff", "woff2", "eot", "fon"],
  subtitle: ["srt", "vtt", "ass", "ssa", "sub"],
  disk: ["iso", "img", "dmg", "vmdk", "vdi", "vhd"],
  model: ["obj", "fbx", "gltf", "glb", "stl", "blend", "dwg", "dxf", "step", "stp"],
};

const LOOKUP = new Map();
for (const [category, list] of Object.entries(EXT)) {
  for (const ext of list) LOOKUP.set(ext, category);
}

function classify(nameOrPath) {
  const base = String(nameOrPath).split(/[\\/]/).pop() || nameOrPath;
  const dot = base.lastIndexOf(".");
  if (dot <= 0) return "other";
  return LOOKUP.get(base.slice(dot + 1).toLowerCase()) || "other";
}

module.exports = { EXT, classify, CATEGORY_IDS: [...Object.keys(EXT), "other"] };
