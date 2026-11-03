const { test } = require("node:test");
const assert = require("node:assert");
const { extractPackage, planSkips } = require("../lib/package/extract");
const { ValidationError } = require("../lib/errors");
const { makeZip } = require("./helpers/makeZip");

const rules = {
  alwaysIgnoredDirs: [".git", ".claude", ".remember"],
  dependencyDirs: { vendor: "composer.json", node_modules: "package.json" },
  maxDsStoreBytes: 65536,
};

const limits = {
  maxEntries: 2000,
  maxRawEntries: 50000,
  maxUnzippedBytes: 25_000_000,
  maxFileBytes: 5_000_000,
};

test("kept-file count over the limit reports files", async () => {
  const entries = [
    { name: "style.css", data: "/*\nTheme Name: T\n*/" },
    ...Array.from({ length: 2001 }, (_, i) => ({ name: `vendor/f${i}`, data: "x" })),
  ];
  await assert.rejects(
    () => extractPackage(makeZip(entries), { ...rules, ...limits }),
    (err) => err instanceof ValidationError && err.message === "The zip has more than 2000 files."
  );
});

test("vendor skipped only beside composer.json", () => {
  const { skip, removedDeps } = planSkips(["composer.json", "vendor/a.php", "assets/vendor/lib.js"], rules);
  assert.strictEqual(skip("vendor/a.php", {}), true);
  assert.strictEqual(skip("assets/vendor/lib.js", {}), false);
  assert.deepStrictEqual(removedDeps, ["vendor"]);
});

test("nested node_modules beside nested package.json, case-insensitive", () => {
  const { skip, removedDeps } = planSkips(["build/Package.json", "build/Node_Modules/x/i.js"], rules);
  assert.strictEqual(skip("build/Node_Modules/x/i.js", {}), true);
  assert.deepStrictEqual(removedDeps, ["node_modules"]);
});

test(".git always skipped, never reported", () => {
  const { skip, removedDeps } = planSkips([".git/HEAD", "inc/.git/config"], rules);
  assert.strictEqual(skip(".git/HEAD", {}), true);
  assert.strictEqual(skip("inc/.git/config", {}), true);
  assert.deepStrictEqual(removedDeps, []);
});

test("removedDeps follows dependencyDirs key order and ignores unskipped deps", () => {
  const { removedDeps } = planSkips(
    ["package.json", "node_modules/a.js", "composer.json", "vendor/a.php", "x/vendor/b.php"],
    rules
  );
  assert.deepStrictEqual(removedDeps, ["vendor", "node_modules"]);
  assert.deepStrictEqual(planSkips(["composer.json", "src/a.php"], rules).removedDeps, []);
});

test("junk files are skipped and set trimmed", async () => {
  const out = await extractPackage(
    makeZip([{ name: "p/p.php", data: "<?php" }, { name: "p/.DS_Store", data: "j" }]),
    { ...rules, ...limits }
  );
  assert.deepStrictEqual(out.files.map((f) => f.path), ["p/p.php"]);
  assert.strictEqual(out.trimmed, true);
  assert.deepStrictEqual(out.removedDeps, []);
});

test("extractPackage reports trimmed and removedDeps", async () => {
  const zip = makeZip([{ name: "p/p.php", data: "<?php" }, { name: "p/composer.json", data: "{}" }, { name: "p/vendor/a.php", data: "x" }]);
  const out = await extractPackage(zip, { ...rules, ...limits });
  assert.deepStrictEqual(out.files.map((f) => f.path), ["p/p.php", "p/composer.json"]);
  assert.deepStrictEqual(out.removedDeps, ["vendor"]);
  assert.strictEqual(out.trimmed, true);
});

test("preparePackage repacks a junk-only upload without the junk", async () => {
  const { preparePackage } = require("../lib/package/prepare");
  const { extractPackage: extract } = require("../lib/package/extract");
  const upload = makeZip([{ name: "hello.php", data: "<?php\n// Plugin Name: Hello\n" }, { name: "sub/.DS_Store", data: "j" }]);
  const { zip } = await preparePackage(upload, "p.zip", {
    zipRules: { ...rules, ...limits },
    previewLimits: { maxPreviewBytes: 256_000, maxPreviewTotalBytes: 2_000_000 },
  });
  const stored = await extract(zip, { ...rules, ...limits });
  assert.deepStrictEqual(stored.files.map((f) => f.path), ["hello.php"]);
  assert.strictEqual(stored.trimmed, false);
  assert.ok(!zip.includes(".DS_Store"));
});
