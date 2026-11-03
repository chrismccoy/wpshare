const { test, mock, before, after } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { ready } = require("./helpers/setup");
const { db } = require("../lib/infra/db");
const { createCleanupJob } = require("../lib/infra/cleanup");
const { createStorage } = require("../lib/infra/storage");
const { createKeyGenerator } = require("../lib/infra/keygen");

before(() => ready);
after(() => db.destroy());

test("cleanup job runs injected tasks and logs removals", async () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const logs = [];
    const logger = { info: (msg) => logs.push(msg), error: (...args) => logs.push(args.join(" ")) };
    const job = createCleanupJob({
      intervalMs: 1000,
      logger,
      tasks: [
        { run: async () => 2, label: "expired packages" },
        { run: async () => 0, label: "orphaned directories" },
      ],
    });
    job.start();
    mock.timers.tick(1000);
    await new Promise(setImmediate);
    job.stop();
    assert.deepStrictEqual(logs, ["Cleanup: removed 2 expired packages"]);
  } finally {
    mock.timers.reset();
  }
});

test("createStorage writes under the directory it is given", async () => {
  const uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), "wpshare-store-"));
  try {
    const store = createStorage({ uploadDir, orphanGraceMs: 0 });
    await store.init();
    const name = await store.writePackage({ zip: Buffer.from("z"), manifest: [1], rendered: { a: 1 } });
    assert.ok(store.zipPath(name).startsWith(uploadDir));
    assert.deepStrictEqual(await store.readManifest(name), [1]);
    assert.deepStrictEqual(await store.readRendered(name), { a: 1 });
  } finally {
    fs.rmSync(uploadDir, { recursive: true, force: true });
  }
});

test("createKeyGenerator uses the given alphabet and length", () => {
  const generate = createKeyGenerator({ length: 12, alphabet: "ab" });
  const key = generate();
  assert.strictEqual(key.length, 12);
  assert.match(key, /^[ab]+$/);
  assert.strictEqual(generate(3).length, 3);
});

test("createLogger drops messages above its level", () => {
  const { createLogger } = require("../lib/infra/logger");
  const seen = [];
  const sink = { error: (m) => seen.push(`E:${m}`), warn: (m) => seen.push(`W:${m}`), log: (m) => seen.push(`I:${m}`) };
  const logger = createLogger({ level: "warn", sink });
  logger.error("a");
  logger.warn("b");
  logger.info("c");
  assert.deepStrictEqual(seen, ["E:a", "W:b"]);
  assert.throws(() => createLogger({ level: "debug" }), /debug/);
});

test("theme url uses /t", () => {
  const { Package } = require("../models/package");
  assert.match(new Package({ key: "abc", type: "theme", name: "x" }).url, /^\/t\/abc$/);
  assert.strictEqual(new Package({ key: "abc", type: "theme", name: "x" }).typeLabel, "WordPress theme");
});

test("non-ASCII name falls back to type.zip", () => {
  const { Package } = require("../models/package");
  assert.strictEqual(new Package({ key: "k", type: "plugin", name: "日本語" }).downloadName, "plugin.zip");
});
