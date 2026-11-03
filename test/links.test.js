const { test } = require("node:test");
const assert = require("node:assert");
const { linkPaths } = require("../lib/package/links");

const all = ["readme.md", "references/api-reference.md", "references/patterns.md", "scripts/validate.py"];
const count = (s, re) => (s.match(re) || []).length;

test("links root-relative path", () => {
  const out = linkPaths("See references/api-reference.md", "readme.md", all);
  assert.ok(out.includes('<a data-path="references/api-reference.md"'));
});

test("links every occurrence", () => {
  const out = linkPaths("scripts/validate.py and scripts/validate.py", "readme.md", all);
  assert.strictEqual(count(out, /<a /g), 2);
});

test("links inside markdown link", () => {
  const out = linkPaths("[api](references/api-reference.md)", "readme.md", all);
  assert.strictEqual(count(out, /<a /g), 1);
  assert.ok(out.includes(">references/api-reference.md</a>"));
});

test("relative to current dir", () => {
  const out = linkPaths("see patterns.md", "references/api-reference.md", all);
  assert.ok(out.includes('data-path="references/patterns.md"'));
});

test("parent-relative", () => {
  const out = linkPaths("../scripts/validate.py", "references/x", all);
  assert.ok(out.includes('data-path="scripts/validate.py"'));
});

test("does not touch tag attributes", () => {
  const html = '<span class="references/patterns.md">x</span>';
  assert.strictEqual(linkPaths(html, "readme.md", all), html);
});

test("keeps spans intact", () => {
  const out = linkPaths('<span class="hljs-string">"scripts/validate.py"</span>', "readme.md", all);
  assert.ok(/<span class="hljs-string">[^<]*<a [^>]*>scripts\/validate\.py<\/a>[^<]*<\/span>/.test(out));
});

test("no partial matches", () => {
  const html = "myscripts/validate.pyc";
  assert.strictEqual(linkPaths(html, "readme.md", all), html);
});

test("trailing period ok", () => {
  assert.ok(linkPaths("Run scripts/validate.py.", "readme.md", all).includes("<a "));
});

test("path with & and quote links and escapes attribute", () => {
  const p = 'references/a&b".md';
  const out = linkPaths("see references/a&amp;b&quot;.md now", "readme.md", [...all, p]);
  assert.ok(out.includes('<a data-path="references/a&amp;b&quot;.md"'));
  assert.ok(out.includes(">references/a&amp;b&quot;.md</a>"));
});

test("path with apostrophe matches highlight.js escaping", () => {
  const out = linkPaths("see references/it&#39;s.md", "readme.md", ["references/it's.md"]);
  assert.ok(out.includes('<a data-path="references/it&#39;s.md"'));
});

test("__proto__ path is safe", () => {
  const out = linkPaths("see __proto__ and constructor", "readme.md", ["__proto__", "constructor"]);
  assert.strictEqual(count(out, /<a /g), 2);
  assert.ok(out.includes('data-path="__proto__"'));
});
