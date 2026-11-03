const { test } = require("node:test");
const assert = require("node:assert");
const { extractPackage } = require("../lib/package/extract");
const { ValidationError } = require("../lib/errors");
const { makeZip } = require("./helpers/makeZip");

const rules = {
  maxEntries: 200,
  maxRawEntries: 50000,
  maxUnzippedBytes: 25_000_000,
  maxFileBytes: 5_000_000,
  maxDsStoreBytes: 65_536,
  alwaysIgnoredDirs: [".git", ".claude", ".remember"],
  dependencyDirs: { vendor: "composer.json", node_modules: "package.json" },
};

const seededRandom = (seed) => () => {
  seed = (Math.imul(seed, 1_103_515_245) + 12_345) & 0x7fffffff;
  return seed / 2 ** 31;
};

const isSafePath = (p) =>
  !p.startsWith("/") &&
  !p.includes("\\") &&
  !/^[A-Za-z]:/.test(p) &&
  p.split("/").every((part) => part !== "" && part !== "." && part !== "..");

const expectSafeOutcome = async (buffer, label) => {
  try {
    const { files } = await extractPackage(buffer, rules);
    for (const file of files) {
      assert.ok(isSafePath(file.path), `${label}: unsafe path ${JSON.stringify(file.path)}`);
      assert.strictEqual(file.data.length, file.size, `${label}: size mismatch`);
    }
  } catch (err) {
    assert.ok(err instanceof ValidationError, `${label}: ${err.name}: ${err.message}`);
  }
};

const baseZip = () =>
  makeZip([
    { name: "pkg/hello.php", data: "<?php\n// Plugin Name: Hello\n" },
    { name: "pkg/references/a.md", data: "see ../hello.php\n".repeat(20) },
    { name: "pkg/scripts/run.py", data: "print('hi')\n" },
  ]);

test("zip-slip corpus is rejected as an unsafe path", async () => {
  const names = [
    "../evil.md",
    "a/../../evil.md",
    "a/./b.md",
    "/etc/passwd",
    "C:/Windows/evil.md",
    "c:evil.md",
    "a\\..\\evil.md",
    "..",
    "a//b.md",
  ];
  for (const name of names) {
    await assert.rejects(
      extractPackage(makeZip([{ name: "hello.php", data: "x" }, { name, data: "y" }]), rules),
      (err) => err instanceof ValidationError && /unsafe file path/.test(err.message),
      name
    );
  }
});

test("corrupted file data fails the CRC check", async () => {
  const buffer = baseZip();
  const marker = buffer.indexOf("print('hi')");
  buffer[marker] ^= 0xff;
  await assert.rejects(
    extractPackage(buffer, rules),
    (err) => err instanceof ValidationError && /not a valid zip/.test(err.message)
  );
});

test("declared sizes that disagree with the data are rejected", async () => {
  for (const declaredSize of [0, 3, 40, 10_000]) {
    await assert.rejects(
      extractPackage(
        makeZip([{ name: "hello.php", data: "x".repeat(20), declaredSize }]),
        rules
      ),
      ValidationError,
      `declaredSize ${declaredSize}`
    );
  }
});

test("every truncation of a valid zip is rejected cleanly", async () => {
  const buffer = baseZip();
  for (let length = 0; length < buffer.length; length++) {
    await assert.rejects(
      extractPackage(buffer.subarray(0, length), rules),
      ValidationError,
      `length ${length}`
    );
  }
});

test("random byte flips never crash, hang or yield unsafe paths", async () => {
  const random = seededRandom(20261019);
  const original = baseZip();
  for (let round = 0; round < 500; round++) {
    const buffer = Buffer.from(original);
    const flips = 1 + Math.floor(random() * 4);
    for (let i = 0; i < flips; i++) {
      buffer[Math.floor(random() * buffer.length)] = Math.floor(random() * 256);
    }
    await expectSafeOutcome(buffer, `round ${round}`);
  }
});
