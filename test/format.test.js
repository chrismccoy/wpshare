process.env.TZ = "America/Toronto";

const { ready } = require("./helpers/setup");
const { test, before, after } = require("node:test");
const assert = require("node:assert");
const { db } = require("../lib/infra/db");
const packageRepository = require("../repositories/package");
const { timeAgo, timeLeft, dateTime, splitCodeSpans } = require("../lib/format");
const { formatSize, formatMb, isZipName } = require("../lib/shared/files");

before(() => ready);
after(() => db.destroy());

const dbTime = (ms) => new Date(ms).toISOString().slice(0, 19).replace("T", " ");

test("repository treats SQLite timestamp as UTC", async () => {
  const id = await packageRepository.insert({
    key: "tz-test",
    storageName: "a".repeat(32),
    type: "plugin",
    headerPath: "n.php",
    name: "n",
    fileCount: 1,
    sizeBytes: 1,
    zipBytes: 1,
    expiresAt: null,
  });
  try {
    await db("packages").where("id", id).update({ created_at: dbTime(Date.now()) });
    const pkg = await packageRepository.findByKey("tz-test");
    assert.ok(pkg.createdAt instanceof Date);
    assert.strictEqual(timeAgo(pkg.createdAt), "just now");
  } finally {
    await db("packages").where("id", id).del();
  }
});

test("timeAgo uses singular forms", () => {
  const ago = (ms) => timeAgo(new Date(Date.now() - ms));
  assert.strictEqual(ago(61 * 1000), "1 minute ago");
  assert.strictEqual(ago(3601 * 1000), "1 hour ago");
  assert.strictEqual(ago(86401 * 1000), "1 day ago");
  assert.strictEqual(ago(2 * 61 * 1000), "2 minutes ago");
  assert.strictEqual(timeAgo(null), "just now");
});

test("timeLeft covers never, expired and each unit", () => {
  const inFuture = (seconds) => timeLeft(Date.now() + seconds * 1000 + 500);
  assert.strictEqual(timeLeft(null), "never");
  assert.strictEqual(timeLeft(Date.now() - 1000), "expired");
  assert.strictEqual(inFuture(30), "31 seconds");
  assert.strictEqual(inFuture(60), "1 minute");
  assert.strictEqual(inFuture(2 * 3600), "2 hours");
  assert.strictEqual(inFuture(7 * 86400), "7 days");
  assert.strictEqual(inFuture(2 * 365 * 86400), "2.0 years");
});

test("dateTime shows a dash when missing", () => {
  assert.strictEqual(dateTime(null), "—");
  assert.match(dateTime(new Date(Date.UTC(2030, 0, 1, 12))), /^1\/1\/2030, 7:00:00\sAM$/);
});

test("formatSize has an MB step", () => {
  assert.strictEqual(formatSize(0), "0 B");
  assert.strictEqual(formatSize(500), "500 B");
  assert.strictEqual(formatSize(18400), "18.4 KB");
  assert.strictEqual(formatSize(1500000), "1.50 MB");
});

test("formatMb and isZipName", () => {
  assert.strictEqual(formatMb(10_000_000), "10 MB");
  assert.strictEqual(formatMb(256_000), "0.256 MB");
  assert.ok(isZipName("Package.ZIP"));
  assert.ok(!isZipName("pkg.zip.txt"));
});

test("splitCodeSpans marks backtick sections as code", () => {
  assert.deepStrictEqual(splitCodeSpans("a `b` c"), [
    { text: "a ", code: false },
    { text: "b", code: true },
    { text: " c", code: false },
  ]);
});
