const { test } = require("node:test");
const assert = require("node:assert");
const { renderPackage } = require("../lib/package/render");

const file = (path, text, extra = {}) => {
  const data = Buffer.from(text);
  return { path, size: data.length, binary: false, data, ...extra };
};
const limits = { maxPreviewBytes: 1000, maxPreviewTotalBytes: 10000 };

test("renderPackage text", () => {
  const files = [file("readme.md", "---\nname: a\n---\nsee inc/v.php\n"), file("inc/v.php", "<?php\n")];
  const { manifest, rendered } = renderPackage(files, { ...limits, pinnedPath: "readme.md" });
  assert.strictEqual(manifest[0].path, "readme.md");
  assert.strictEqual(manifest[0].preview, "text");
  assert.strictEqual(manifest[0].lang, "markdown");
  assert.strictEqual(manifest[0].lines, 4);
  assert.ok(rendered["readme.md"].html.includes('data-path="inc/v.php"'));
  assert.strictEqual(rendered["readme.md"].raw, "---\nname: a\n---\nsee inc/v.php\n");
});

test("renderPackage strips BOM", () => {
  const { rendered } = renderPackage([file("a.md", "﻿hi")], limits);
  assert.strictEqual(rendered["a.md"].raw, "hi");
});

test("renderPackage binary", () => {
  const files = [{ path: "a.png", size: 3, binary: true, data: Buffer.from([0, 1, 2]) }];
  const { manifest, rendered } = renderPackage(files, limits);
  assert.strictEqual(manifest[0].preview, "binary");
  assert.strictEqual(manifest[0].lang, "binary");
  assert.strictEqual(manifest[0].lines, null);
  assert.strictEqual(rendered["a.png"], undefined);
});

test("renderPackage per-file cap", () => {
  const { manifest, rendered } = renderPackage([file("a.py", "x".repeat(11))], { maxPreviewBytes: 10, maxPreviewTotalBytes: 100 });
  assert.strictEqual(manifest[0].preview, "too-large");
  assert.strictEqual(manifest[0].lang, "python");
  assert.strictEqual(manifest[0].lines, null);
  assert.strictEqual(rendered["a.py"], undefined);
});

test("renderPackage total cap in tree order", () => {
  const files = [file("inc/a.txt", "a".repeat(10)), file("main.txt", "s".repeat(10))];
  const { manifest, rendered } = renderPackage(files, { maxPreviewBytes: 100, maxPreviewTotalBytes: 15 });
  assert.deepStrictEqual(manifest.map((e) => [e.path, e.preview]), [["inc/a.txt", "text"], ["main.txt", "over-budget"]]);
  assert.strictEqual(rendered["main.txt"], undefined);
});

test("budget goes to php before minified assets", () => {
  const f = (path, n) => ({ path, data: Buffer.alloc(n, 97), size: n, binary: false });
  const { manifest } = renderPackage([f("assets/app.min.js", 60), f("inc/core.php", 60), f("main.php", 10)], { maxPreviewBytes: 100, maxPreviewTotalBytes: 80, pinnedPath: "main.php" });
  const byPath = Object.fromEntries(manifest.map((e) => [e.path, e.preview]));
  assert.deepStrictEqual(byPath, { "main.php": "text", "inc/core.php": "text", "assets/app.min.js": "over-budget" });
  assert.strictEqual(manifest[0].path, "main.php");
});

test("budget priority: pinned, php, other text, min/map; binary is free", () => {
  const f = (path, n, binary = false) => ({ path, data: Buffer.alloc(n, 97), size: n, binary });
  const files = [f("a.map", 10), f("b.min.css", 10), f("c.css", 10), f("d.php", 10), f("e.png", 500, true), f("style.css", 10)];
  const { manifest } = renderPackage(files, { maxPreviewBytes: 100, maxPreviewTotalBytes: 30, pinnedPath: "style.css" });
  const byPath = Object.fromEntries(manifest.map((e) => [e.path, e.preview]));
  assert.deepStrictEqual(byPath, { "style.css": "text", "d.php": "text", "c.css": "text", "b.min.css": "over-budget", "a.map": "over-budget", "e.png": "binary" });
  assert.strictEqual(manifest[0].path, "style.css");
});

test("renderPackage handles __proto__ path", () => {
  const { rendered } = renderPackage([file("__proto__", "hello")], limits);
  assert.strictEqual(rendered["__proto__"].raw, "hello");
  assert.strictEqual(Object.getPrototypeOf(rendered), null);
  for (const key of ["raw", "html"]) {
    assert.ok(!Object.hasOwn(Object.prototype, key), key);
  }
});
