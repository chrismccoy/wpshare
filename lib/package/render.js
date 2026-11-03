const { orderPaths } = require("./tree");
const { highlight, languageFor } = require("./highlight");
const { linkPaths } = require("./links");
const { stripBom, TEXT_ENCODING } = require("../text");

const countLines = (text) =>
  text === "" ? 0 : text.split("\n").length - (text.endsWith("\n") ? 1 : 0);

const priorityOf = (filePath, pinnedPath) => {
  if (filePath === pinnedPath) return 0;
  const name = filePath.split("/").pop();
  if (/\.(min\.[^.]+|map)$/i.test(name)) return 3;
  return /\.php$/i.test(name) ? 1 : 2;
};

const renderPackage = (
  files,
  {
    maxPreviewBytes,
    maxPreviewTotalBytes,
    pinnedPath,
    order = orderPaths,
    toHtml = highlight,
    addLinks = linkPaths,
  }
) => {
  const byPath = new Map(files.map((file) => [file.path, file]));
  const ordered = order(files.map((file) => file.path), pinnedPath);
  const decided = new Map();
  const rendered = Object.create(null);
  let total = 0;

  const byPriority = ordered
    .map((filePath, index) => ({ filePath, index, level: priorityOf(filePath, pinnedPath) }))
    .sort((a, b) => a.level - b.level || a.index - b.index);

  for (const { filePath } of byPriority) {
    const file = byPath.get(filePath);
    if (file.binary) {
      decided.set(filePath, { path: filePath, size: file.size, preview: "binary", lang: "binary", lines: null });
      continue;
    }
    const lang = languageFor(filePath);
    const skip = (preview) => decided.set(filePath, { path: filePath, size: file.size, preview, lang, lines: null });
    if (file.size > maxPreviewBytes) {
      skip("too-large");
      continue;
    }
    if (total + file.size > maxPreviewTotalBytes) {
      skip("over-budget");
      continue;
    }
    total += file.size;
    const raw = stripBom(file.data.toString(TEXT_ENCODING.name));
    const html = addLinks(toHtml(raw, lang), filePath, ordered);
    rendered[filePath] = { raw, html };
    decided.set(filePath, { path: filePath, size: file.size, preview: "text", lang, lines: countLines(raw) });
  }
  return { manifest: ordered.map((filePath) => decided.get(filePath)), rendered };
};

module.exports = { renderPackage };
