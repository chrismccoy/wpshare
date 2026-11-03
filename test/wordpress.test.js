const { test } = require("node:test");
const assert = require("node:assert");
const { parseHeader, locatePackage } = require("../lib/package/wordpress");

const file = (path, data) => ({ path, data: Buffer.from(data), size: Buffer.byteLength(data) });
const PLUGIN = "<?php\n/**\n * Plugin Name: Hello Dolly\n * Version: 1.7.2\n * Description: Lyrics.\n */";
const THEME = "/*\nTheme Name: Twenty Five\nVersion: 1.0\n*/";
const NO_HEADER = /No WordPress plugin or theme header found/;

test("plugin at root", () => {
  const { header } = locatePackage([file("hello.php", PLUGIN)], "x.zip");
  assert.deepStrictEqual(header, { type: "plugin", path: "hello.php", name: "Hello Dolly", version: "1.7.2", description: "Lyrics." });
});
test("theme inside one top folder is stripped", () => {
  const out = locatePackage([file("tt5/style.css", THEME), file("tt5/index.php", "<?php")], "tt5.zip");
  assert.deepStrictEqual(out.files.map((f) => f.path), ["style.css", "index.php"]);
  assert.strictEqual(out.header.type, "theme");
});
test("theme wins over plugin", () => {
  assert.strictEqual(locatePackage([file("style.css", THEME), file("p.php", PLUGIN)], "x.zip").header.type, "theme");
});
test("plugin file matching folder name preferred", () => {
  const out = locatePackage([file("akismet/a.php", PLUGIN), file("akismet/akismet.php", PLUGIN)], "akismet.zip");
  assert.strictEqual(out.header.path, "akismet.php");
});
test("plugin file matching upload name preferred", () => {
  const out = locatePackage([file("a.php", PLUGIN), file("zed.php", PLUGIN)], "zed.zip");
  assert.strictEqual(out.header.path, "zed.php");
});
test("alphabetically first plugin file when none match", () => {
  const out = locatePackage([file("b.php", PLUGIN), file("a.php", PLUGIN)], "x.zip");
  assert.strictEqual(out.header.path, "a.php");
});
test("header past 8 KiB ignored", () => {
  assert.throws(() => locatePackage([file("p.php", "<?php\n" + " ".repeat(8200) + "// Plugin Name: Late")], "x.zip"), NO_HEADER);
});
test("plugin header only in a subfolder rejected", () => {
  assert.throws(() => locatePackage([file("p/inc/x.php", PLUGIN), file("p/readme.txt", "r")], "x.zip"), NO_HEADER);
});
test("style.css only in a subfolder rejected", () => {
  assert.throws(() => locatePackage([file("t/sub/style.css", THEME), file("t/index.php", "<?php")], "x.zip"), NO_HEADER);
});
test("blank Plugin Name rejected", () => {
  assert.throws(() => locatePackage([file("p.php", "<?php\n// Plugin Name:   \n")], "x.zip"), NO_HEADER);
});
test("BOM and CRLF header detected", () => {
  const out = locatePackage([file("style.css", "﻿/*\r\nTheme Name: Win\r\n*/")], "x.zip");
  assert.strictEqual(out.header.name, "Win");
});
test("trailing */ stripped from value", () => {
  assert.strictEqual(parseHeader(Buffer.from("/* Theme Name: One */"), { name: "Theme Name" }).name, "One");
});
test("locatePackage keeps other file fields and only rewrites path", () => {
  const f = { ...file("w/hello.php", PLUGIN), zipName: "w/hello.php", mode: 420 };
  const out = locatePackage([f], "x.zip");
  assert.deepStrictEqual(out.files[0], { ...f, path: "hello.php" });
});
test("preferred plugin file matches folder name case-insensitively", () => {
  const out = locatePackage([file("Akismet/akismet.php", PLUGIN), file("Akismet/a.php", PLUGIN)], "x.zip");
  assert.strictEqual(out.header.path, "akismet.php");
});
