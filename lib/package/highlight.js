const hljs = require("highlight.js");
const { fileTypeFor } = require("./fileTypes");
const { escapeHtml, stripBom, FRONTMATTER_RE } = require("../text");

const KNOWN_LANGUAGES = new Set(
  hljs.listLanguages().flatMap((id) => [id, ...(hljs.getLanguage(id).aliases || [])]),
);

const languageFor = (filePath) => {
  const { ext, lang } = fileTypeFor(filePath);
  if (!ext) return "plaintext";
  if (lang) return lang;
  return KNOWN_LANGUAGES.has(ext) ? ext : "plaintext";
};

const FRONTMATTER_KEY = /^(\s*)([A-Za-z0-9_-]+:)(.*)$/;

const highlightFrontmatter = (block) =>
  block
    .split("\n")
    .map((line) => {
      const cr = line.endsWith("\r") ? "\r" : "";
      const body = cr ? line.slice(0, -1) : line;
      if (stripBom(body) === "---") return `<span class="tok-k">---</span>${cr}`;
      const match = FRONTMATTER_KEY.exec(body);
      if (!match) return escapeHtml(body) + cr;
      return `${escapeHtml(match[1])}<span class="tok-k">${escapeHtml(match[2])}</span>${escapeHtml(match[3])}${cr}`;
    })
    .join("\n");

const highlight = (text, lang) => {
  if (typeof lang !== "string" || lang === "plaintext" || !KNOWN_LANGUAGES.has(lang)) {
    return escapeHtml(text);
  }
  const source = String(text);
  const frontmatter = lang === "markdown" ? FRONTMATTER_RE.exec(source) : null;
  if (!frontmatter) return hljs.highlight(source, { language: lang, ignoreIllegals: true }).value;
  const rest = source.slice(frontmatter[0].length);
  const restHtml = rest ? hljs.highlight(rest, { language: lang, ignoreIllegals: true }).value : "";
  return highlightFrontmatter(frontmatter[0]) + restHtml;
};

module.exports = { languageFor, highlight };
