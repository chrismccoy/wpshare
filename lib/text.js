const TEXT_ENCODING = Object.freeze({ name: "utf8", label: "UTF-8" });

const ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

const escapeHtml = (text) => String(text).replace(/[&<>"']/g, (c) => ESCAPES[c]);

const stripBom = (text) => String(text).replace(/^\uFEFF/, "");

const FRONTMATTER_RE = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;

module.exports = { TEXT_ENCODING, escapeHtml, stripBom, FRONTMATTER_RE };
