const { test } = require("node:test");
const assert = require("node:assert");
const { languageFor, highlight } = require("../lib/package/highlight");

test("languageFor", () => {
  assert.strictEqual(languageFor("readme.md"), "markdown");
  assert.strictEqual(languageFor("scripts/validate.py"), "python");
  assert.strictEqual(languageFor("init.sh"), "bash");
  assert.strictEqual(languageFor("LICENSE"), "plaintext");
  assert.strictEqual(languageFor("a.weird"), "plaintext");
});

test("escapes html", () => {
  const out = highlight("<script>alert(1)</script></textarea>", "plaintext");
  assert.ok(out.includes("&lt;script&gt;"));
  assert.ok(!out.includes("<script>"));
});

test("python produces spans", () => {
  assert.match(highlight("import os", "python"), /<span class="hljs-keyword">import<\/span>/);
});

test("prototype-named extensions are plaintext", () => {
  for (const name of ["a.constructor", "a.__proto__", "a.toString", "a.hasOwnProperty"]) {
    assert.strictEqual(languageFor(name), "plaintext");
  }
  assert.doesNotThrow(() => highlight("x", languageFor("a.constructor")));
  assert.doesNotThrow(() => highlight("x", "constructor"));
  assert.doesNotThrow(() => highlight("x", {}));
});

test("markdown frontmatter is rendered as tok-k keys and delimiters", () => {
  const out = highlight("---\nname: pdf-package\nversion: 1.2.0\n---\n# PDF Package\n", "markdown");
  assert.ok(
    out.startsWith('<span class="tok-k">---</span>\n<span class="tok-k">name:</span> pdf-package\n'),
    out
  );
  assert.ok(out.includes('<span class="tok-k">version:</span> 1.2.0\n<span class="tok-k">---</span>\n'));
  assert.match(out, /<span class="hljs-section"># PDF Package<\/span>/);
});

test("frontmatter values are escaped", () => {
  const out = highlight("---\nname: <script>alert(1)</script>\n<b>x</b>\n---\n", "markdown");
  assert.ok(!out.includes("<script>"));
  assert.ok(!out.includes("<b>"));
  assert.ok(out.includes('<span class="tok-k">name:</span> &lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(out.includes("&lt;b&gt;x&lt;/b&gt;"));
});

test("markdown without frontmatter is plain hljs output", () => {
  const hljs = require("highlight.js");
  const text = "# Title\n\nSome text\n---\nmore\n";
  assert.strictEqual(
    highlight(text, "markdown"),
    hljs.highlight(text, { language: "markdown", ignoreIllegals: true }).value
  );
});

test("paths inside frontmatter values are still linked", () => {
  const { linkPaths } = require("../lib/package/links");
  const out = linkPaths(
    highlight("---\nsee: references/a.md\n---\nbody\n", "markdown"),
    "readme.md",
    ["readme.md", "references/a.md"]
  );
  assert.ok(
    out.includes(
      '<span class="tok-k">see:</span> <a data-path="references/a.md" class="tok-n underline decoration-dotted cursor-pointer">references/a.md</a>'
    ),
    out
  );
});

test("php is highlighted", () => {
  assert.strictEqual(languageFor("a.php"), "php");
  assert.ok(highlight("<?php echo 1;", "php").includes("hljs-"));
});

test("wordpress file types map to languages", () => {
  const expected = { "a.scss": "scss", "a.less": "less", "a.twig": "twig", "a.jsx": "javascript", "a.tsx": "typescript", "a.vue": "xml", "a.po": "plaintext", "a.pot": "plaintext", "a.lock": "json", "a.map": "json" };
  for (const [name, lang] of Object.entries(expected)) assert.strictEqual(languageFor(name), lang, name);
});
