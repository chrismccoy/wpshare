const path = require("path");
const { escapeHtml } = require("../text");

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const NOT_INSIDE_A_LONGER_PATH = "(?<![\\w./-])";
const NOT_FOLLOWED_BY_MORE_PATH = "(?![\\w/-]|\\.\\w)";

const linkPaths = (html, currentPath, allPaths) => {
  const candidates = new Map();
  const add = (text, target) => {
    if (text === "") return;
    const key = escapeHtml(text);
    for (const form of [key, key.replaceAll("&#39;", "&#x27;")]) {
      if (!candidates.has(form)) candidates.set(form, target);
    }
  };

  for (const filePath of allPaths) add(filePath, filePath);
  const dir = path.posix.dirname(String(currentPath));
  if (dir !== ".") {
    for (const filePath of allPaths) {
      const relative = path.posix.relative(dir, filePath);
      add(relative, filePath);
      add("./" + relative, filePath);
    }
  }
  if (candidates.size === 0) return html;

  const alternation = [...candidates.keys()]
    .sort((a, b) => b.length - a.length)
    .map(escapeRegex)
    .join("|");
  const re = new RegExp(`${NOT_INSIDE_A_LONGER_PATH}(${alternation})${NOT_FOLLOWED_BY_MORE_PATH}`, "g");

  return html
    .split(/(<[^>]+>)/)
    .map((segment, i) => {
      if (i % 2 === 1) return segment;
      return segment.replace(re, (match) => {
        const target = candidates.get(match);
        return `<a data-path="${escapeHtml(target)}" class="tok-n underline decoration-dotted cursor-pointer">${match}</a>`;
      });
    })
    .join("");
};

module.exports = { linkPaths };
