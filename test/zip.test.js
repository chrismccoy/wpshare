const { test } = require("node:test");
const assert = require("node:assert");
const { extractPackage: extractRaw, repackPackage } = require("../lib/package/extract");
const { locatePackage } = require("../lib/package/wordpress");
const { ValidationError } = require("../lib/errors");
const { makeZip } = require("./helpers/makeZip");

const HELLO = "<?php\n// Plugin Name: Hello\n";

const limits = {
  maxEntries: 200,
  maxRawEntries: 50000,
  maxUnzippedBytes: 25_000_000,
  maxFileBytes: 5_000_000,
  maxDsStoreBytes: 65_536,
  alwaysIgnoredDirs: [".git", ".claude", ".remember"],
  dependencyDirs: { vendor: "composer.json", node_modules: "package.json" },
};

const extractPackage = async (buf, l) => {
  const out = await extractRaw(buf, l);
  return { ...out, files: locatePackage(out.files, "x.zip").files };
};

const paths = async (entries, l = limits) =>
  (await extractPackage(makeZip(entries), l)).files.map((f) => f.path).sort();

const rejects = (buf, re, l = limits) =>
  assert.rejects(
    () => extractPackage(buf, l),
    (err) => err instanceof ValidationError && re.test(err.message)
  );

test("plugin file at root", async () => {
  assert.deepStrictEqual(
    await paths([
      { name: "hello.php", data: HELLO },
      { name: "references/a.md", data: "y" },
    ]),
    ["hello.php", "references/a.md"]
  );
});

test("strips single wrapper folder", async () => {
  assert.deepStrictEqual(
    await paths([
      { name: "pdf/hello.php", data: HELLO },
      { name: "pdf/scripts/v.py", data: "y" },
    ]),
    ["hello.php", "scripts/v.py"]
  );
});

test("ignores __MACOSX and .DS_Store when detecting wrapper", async () => {
  assert.deepStrictEqual(
    await paths([
      { name: "pdf/hello.php", data: HELLO },
      { name: "__MACOSX/pdf/._hello.php", data: "j" },
      { name: "pdf/.DS_Store", data: "j" },
    ]),
    ["hello.php"]
  );
});

test("skips directory entries", async () => {
  assert.deepStrictEqual(
    await paths([
      { name: "references/", dir: true },
      { name: "hello.php", data: HELLO },
    ]),
    ["hello.php"]
  );
});

test("rejects ../ path", () =>
  rejects(
    makeZip([{ name: "hello.php", data: HELLO }, { name: "../x", data: "y" }]),
    /unsafe file path: \.\.\/x/
  ));

test("rejects absolute path", () =>
  rejects(
    makeZip([{ name: "hello.php", data: HELLO }, { name: "/etc/x", data: "y" }]),
    /unsafe file path/
  ));

test("rejects backslash path", () =>
  rejects(
    makeZip([{ name: "hello.php", data: HELLO }, { name: "a\\b.md", data: "y" }]),
    /unsafe file path/
  ));

test("rejects symlink", () =>
  rejects(
    makeZip([
      { name: "hello.php", data: HELLO },
      { name: "link", data: "/etc/passwd", symlink: true },
    ]),
    /symbolic link/
  ));

test("rejects too many entries", () =>
  rejects(
    makeZip([
      { name: "hello.php", data: HELLO },
      { name: "a.md", data: "x" },
      { name: "b.md", data: "x" },
    ]),
    /more than 2 files/,
    { ...limits, maxEntries: 2 }
  ));

test("rejects total over cap (header pre-check)", () =>
  rejects(
    makeZip([
      { name: "hello.php", data: Buffer.alloc(600_000, 97) },
      { name: "b.md", data: Buffer.alloc(600_000, 97) },
    ]),
    /expands to more than 1 MB/,
    { ...limits, maxUnzippedBytes: 1_000_000 }
  ));

test("rejects file over per-file cap", () =>
  rejects(
    makeZip([
      { name: "hello.php", data: HELLO },
      { name: "big.bin", data: Buffer.alloc(1_200_000, 97) },
    ]),
    /per-file limit/,
    { ...limits, maxFileBytes: 1_000_000 }
  ));

test("rejects missing header", () =>
  rejects(makeZip([{ name: "README.md", data: "x" }]), /No WordPress plugin or theme header found/));

test("rejects header nested two deep", () =>
  rejects(makeZip([{ name: "a/b/hello.php", data: HELLO }]), /No WordPress plugin or theme header found/));

test("rejects non-zip bytes", () =>
  rejects(Buffer.from("hello"), /not a valid zip/));

test("classifies binary", async () => {
  const { files } = await extractPackage(
    makeZip([
      { name: "hello.php", data: HELLO + "é" },
      { name: "nul.bin", data: Buffer.from([0x41, 0x00, 0x42]) },
      { name: "bad.bin", data: Buffer.from([0xff, 0xfe, 0x41]) },
    ]),
    limits
  );
  const by = Object.fromEntries(files.map((f) => [f.path, f]));
  assert.strictEqual(by["hello.php"].binary, false);
  assert.strictEqual(by["nul.bin"].binary, true);
  assert.strictEqual(by["bad.bin"].binary, true);
  assert.strictEqual(by["bad.bin"].size, 3);
});

test("rejects stored entry whose header declares fewer bytes than present", () =>
  rejects(
    makeZip([
      { name: "hello.php", data: HELLO },
      { name: "a.md", data: Buffer.alloc(100, 97), declaredSize: 5 },
    ]),
    /not a valid zip archive/
  ));

test("rejects duplicate paths, case-insensitive", () =>
  rejects(
    makeZip([
      { name: "hello.php", data: HELLO },
      { name: "Hello.php", data: "y" },
    ]),
    /duplicate file path: Hello\.php/
  ));

test("only ._ files under __MACOSX are junk", async () => {
  assert.deepStrictEqual(
    await paths([
      { name: "hello.php", data: HELLO },
      { name: "__MACOSX/run.sh", data: "y" },
      { name: "__MACOSX/._hello.php", data: "j" },
    ]),
    ["__MACOSX/run.sh", "hello.php"]
  );
});

test("large .DS_Store is kept, small one skipped", async () => {
  assert.deepStrictEqual(
    await paths([
      { name: "hello.php", data: HELLO },
      { name: ".DS_Store", data: Buffer.alloc(70_000, 97) },
      { name: "sub/.DS_Store", data: "j" },
    ]),
    [".DS_Store", "hello.php"]
  );
});

test("rejects Unicode Path extra field", () => {
  const extra = Buffer.alloc(4 + 5);
  extra.writeUInt16LE(0x7075, 0);
  extra.writeUInt16LE(5, 2);
  return rejects(
    makeZip([{ name: "hello.php", data: HELLO, extra }]),
    /unsafe file path/
  );
});

for (const [label, name] of [
  ["control char", "a\u0001b.md"],
  ["DEL", "a\u007fb.md"],
  ["bidi override", "a\u202eb.md"],
  ["bidi isolate", "a\u2066b.md"],
  ["replacement char", "a\ufffdb.md"],
  ["empty segment", "a//b.md"],
  ["dot segment", "./x.md"],
]) {
  test(`rejects ${label} in path`, () =>
    rejects(
      makeZip([{ name: "hello.php", data: HELLO }, { name, data: "y" }]),
      /unsafe file path/
    ));
}

test("rejects invalid UTF-8 name bytes", () => {
  const buf = makeZip([{ name: "hello.php", data: HELLO }, { name: "aXb", data: "y" }]);
  for (let at = buf.indexOf("aXb"); at !== -1; at = buf.indexOf("aXb", at + 1)) {
    buf[at + 1] = 0xff;
  }
  return rejects(buf, /unsafe file path/);
});

test("skips .claude and .remember folders at any depth", async () => {
  const result = await extractPackage(
    makeZip([
      { name: "hello.php", data: HELLO },
      { name: ".claude/", dir: true },
      { name: ".claude/settings.local.json", data: "{}" },
      { name: ".remember/now.md", data: "notes" },
      { name: "scripts/.Claude/x.json", data: "{}" },
      { name: "references/.remember/a.md", data: "a" },
      { name: "references/b.md", data: "b" },
      { name: "scripts/.claude-notes.md", data: "kept" },
    ]),
    limits
  );
  assert.deepStrictEqual(
    result.files.map((f) => f.path).sort(),
    ["hello.php", "references/b.md", "scripts/.claude-notes.md"]
  );
  assert.strictEqual(result.trimmed, true);
});

test("ignored folders do not block wrapper detection", async () => {
  assert.deepStrictEqual(
    await paths([
      { name: "pdf/hello.php", data: HELLO },
      { name: ".claude/settings.json", data: "{}" },
    ]),
    ["hello.php"]
  );
});

test("ignored folders do not count toward size limits", async () => {
  assert.deepStrictEqual(
    await paths(
      [
        { name: "hello.php", data: HELLO },
        { name: ".claude/big.bin", data: Buffer.alloc(50) },
      ],
      { ...limits, maxFileBytes: 40, maxUnzippedBytes: 40 }
    ),
    ["hello.php"]
  );
});

test("trimmed is false when nothing was skipped", async () => {
  const result = await extractPackage(makeZip([{ name: "hello.php", data: HELLO }]), limits);
  assert.strictEqual(result.trimmed, false);
});

test("repackPackage round-trips kept files under their original names", async () => {
  const { files } = await extractPackage(
    makeZip([
      { name: "pdf/hello.php", data: HELLO },
      { name: "pdf/scripts/run.sh", data: "echo hi\n" },
      { name: "pdf/.claude/settings.local.json", data: "{}" },
    ]),
    limits
  );
  const rebuilt = await repackPackage(files);
  const again = await extractPackage(rebuilt, limits);
  assert.deepStrictEqual(
    again.files.map((f) => [f.path, f.data.toString()]).sort(),
    [["hello.php", HELLO], ["scripts/run.sh", "echo hi\n"]]
  );
  assert.strictEqual(again.trimmed, false);
});

test("readZip reports typed errors and honours skipFor", async () => {
  const { readZip, ZipError } = require("../lib/infra/zip");
  await assert.rejects(
    readZip(Buffer.from("nope"), limits),
    (err) => err instanceof ZipError && err.code === "NOT_ZIP"
  );
  await assert.rejects(
    readZip(makeZip([{ name: "a", data: "1" }, { name: "A", data: "2" }]), limits),
    (err) => err instanceof ZipError && err.code === "DUPLICATE_PATH" && err.detail.name === "A"
  );
  const files = await readZip(
    makeZip([{ name: "keep.md", data: "k" }, { name: "drop.md", data: "d" }]),
    { ...limits, skipFor: () => (name) => name === "drop.md" }
  );
  assert.deepStrictEqual(files.map((f) => [f.name, f.data.toString()]), [["keep.md", "k"]]);
});

test("maxEntries counts only kept files", async () => {
  const { readZip } = require("../lib/infra/zip");
  const entries = [{ name: "a.txt", data: "a" }, ...Array.from({ length: 5 }, (_, i) => ({ name: `vendor/f${i}`, data: "x" }))];
  const files = await readZip(makeZip(entries), { ...limits, maxEntries: 1, skipFor: () => (n) => n.startsWith("vendor/") });
  assert.deepStrictEqual(files.map((f) => f.name), ["a.txt"]);
});

test("raw cap rejects before reading", async () => {
  const { readZip } = require("../lib/infra/zip");
  const entries = Array.from({ length: 4 }, (_, i) => ({ name: `f${i}`, data: "x" }));
  await assert.rejects(readZip(makeZip(entries), { ...limits, maxRawEntries: 3 }), { code: "TOO_MANY_ENTRIES" });
});

test("symlink inside a skipped folder is dropped", async () => {
  const { readZip } = require("../lib/infra/zip");
  const zip = makeZip([{ name: "a.txt", data: "a" }, { name: "node_modules/.bin/x", data: "../x", symlink: true }]);
  const files = await readZip(zip, { ...limits, skipFor: () => (n) => n.startsWith("node_modules/") });
  assert.deepStrictEqual(files.map((f) => f.name), ["a.txt"]);
});

test("symlink outside skipped folders still rejects", async () => {
  const { readZip } = require("../lib/infra/zip");
  const zip = makeZip([{ name: "link", data: "x", symlink: true }]);
  await assert.rejects(readZip(zip, limits), { code: "SYMLINK" });
});

test("unsafe path inside a skipped folder still rejects", async () => {
  const { readZip } = require("../lib/infra/zip");
  const zip = makeZip([{ name: "vendor/../../evil", data: "x" }]);
  await assert.rejects(readZip(zip, { ...limits, skipFor: () => (n) => n.startsWith("vendor/") }), { code: "UNSAFE_PATH" });
});

test("skipFor sees every entry name once", async () => {
  const { readZip } = require("../lib/infra/zip");
  const calls = [];
  await readZip(makeZip([{ name: "a", data: "1" }, { name: "b/c", data: "2" }]), { ...limits, skipFor: (names) => { calls.push(names); return () => false; } });
  assert.deepStrictEqual(calls, [["a", "b/c"]]);
});
