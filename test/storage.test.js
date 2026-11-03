const { test, before, after } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { ready } = require("./helpers/setup");
const { db } = require("../lib/infra/db");
const storage = require("../lib/infra/storage");
const { UPLOAD_DIR } = require("../config");

before(() => ready);
after(() => db.destroy());

const makeStale = (name) => {
  const dir = path.join(UPLOAD_DIR, name);
  fs.mkdirSync(dir, { recursive: true });
  const old = new Date(Date.now() - 24 * 3600 * 1000);
  fs.utimesSync(dir, old, old);
  return dir;
};

test("zipPath rejects non-storage names", () => {
  for (const bad of ["..", "", "abc"]) {
    assert.throws(() => storage.zipPath(bad), /Invalid storage name/, JSON.stringify(bad));
  }
});

test("zipPath uses original.zip", () => {
  assert.ok(storage.zipPath("a".repeat(32)).endsWith("original.zip"));
});

test("sweepOrphans removes only stale unknown hex dirs", async () => {
  const unknown = makeStale("b".repeat(32));
  const known = makeStale("c".repeat(32));
  const foreign = makeStale("keepme");
  const tmp = makeStale("tmp");

  await storage.sweepOrphans(new Set(["c".repeat(32)]));

  assert.ok(!fs.existsSync(unknown));
  assert.ok(fs.existsSync(known));
  assert.ok(fs.existsSync(foreign));
  assert.ok(fs.existsSync(tmp));
});
