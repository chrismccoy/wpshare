const FILE_TYPES = {
  md: { lang: "markdown" },
  markdown: { lang: "markdown" },
  py: { lang: "python", icon: "🐍" },
  sh: { lang: "bash", icon: "⚙️" },
  bash: { lang: "bash", icon: "⚙️" },
  zsh: { lang: "bash", icon: "⚙️" },
  js: { lang: "javascript", icon: "📜" },
  mjs: { lang: "javascript", icon: "📜" },
  cjs: { lang: "javascript", icon: "📜" },
  ts: { lang: "typescript", icon: "📜" },
  json: { lang: "json", icon: "🧾" },
  yml: { lang: "yaml", icon: "🧾" },
  yaml: { lang: "yaml", icon: "🧾" },
  toml: { lang: "ini", icon: "🧾" },
  ini: { lang: "ini" },
  cfg: { lang: "ini" },
  html: { lang: "xml" },
  xml: { lang: "xml" },
  svg: { lang: "xml", icon: "🖼️" },
  css: { lang: "css" },
  php: { lang: "php", icon: "🐘" },
  scss: { lang: "scss" },
  less: { lang: "less" },
  twig: { lang: "twig" },
  jsx: { lang: "javascript", icon: "📜" },
  tsx: { lang: "typescript", icon: "📜" },
  vue: { lang: "xml" },
  po: { lang: "plaintext" },
  pot: { lang: "plaintext" },
  lock: { lang: "json" },
  map: { lang: "json" },
  txt: { lang: "plaintext" },
  png: { icon: "🖼️" },
  jpg: { icon: "🖼️" },
  jpeg: { icon: "🖼️" },
  gif: { icon: "🖼️" },
  webp: { icon: "🖼️" },
};

const DEFAULT_ICON = "📄";

const extensionOf = (filePath) => {
  const name = String(filePath).split("/").pop();
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
};

const fileTypeFor = (filePath) => {
  const ext = extensionOf(filePath);
  return { ext, ...(Object.hasOwn(FILE_TYPES, ext) ? FILE_TYPES[ext] : {}) };
};

module.exports = { fileTypeFor, DEFAULT_ICON };
