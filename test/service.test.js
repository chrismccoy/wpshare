require("./helpers/setup");

const { test, before, after } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const { ready } = require("./helpers/setup");
const { db } = require("../lib/infra/db");
const storage = require("../lib/infra/storage");
const service = require("../services/package");
const { makeZip } = require("./helpers/makeZip");
const { NotFoundError, ValidationError } = require("../lib/errors");

before(() => ready);
after(() => db.destroy());

const PLUGIN = "<?php\n/**\n * Plugin Name: pdf-package\n * Description: Does pdfs\n * Version: 1.2.0\n */\n";

const pdfZip = () =>
  makeZip([
    { name: "pdf/pdf-package.php", data: Buffer.from(PLUGIN) },
    { name: "pdf/scripts/v.py", data: Buffer.from("print(1)\n") },
  ]);

const plainZip = () => makeZip([{ name: "hello.php", data: Buffer.from(PLUGIN) }]);

const make = (buffer = plainZip(), originalName = "x.zip", expiry = "7d") =>
  service.createPackage({ buffer, originalName, expiry });

test("createPackage stores and finds", async () => {
  const buffer = pdfZip();
  const pkg = await make(buffer, "pdf.zip");
  assert.strictEqual(pkg.name, "pdf-package");
  assert.strictEqual(pkg.version, "1.2.0");
  assert.strictEqual(pkg.fileCount, 2);
  assert.strictEqual(pkg.url, `/p/${pkg.key}`);

  const found = await service.findByKey(pkg.key);
  assert.strictEqual(found.id, pkg.id);

  const view = await service.getView(found);
  assert.ok(view.manifest.some((e) => e.path === "pdf-package.php"));
  assert.ok(view.tree.some((n) => n.name === "pdf-package.php"));

  const zipPath = storage.zipPath(pkg.storageName);
  assert.ok(fs.existsSync(zipPath));
  assert.ok(fs.readFileSync(zipPath).equals(buffer));
});

test("zip without a header is rejected", async () => {
  const buffer = makeZip([{ name: "readme.txt", data: "hi" }]);
  await assert.rejects(make(buffer, "my-thing.zip"), (err) => err instanceof ValidationError && /No WordPress plugin or theme header found/.test(err.message));
});

test("rejects bad expiry", async () => {
  await assert.rejects(make(plainZip(), "x.zip", "5y"), ValidationError);
  await assert.rejects(make(plainZip(), "x.zip", "__proto__"), ValidationError);
});

test("never expiry survives deleteExpired", async () => {
  const pkg = await make(plainZip(), "n.zip", "never");
  assert.strictEqual(pkg.expiresAt, null);
  await service.deleteExpired();
  const found = await service.findByKey(pkg.key);
  assert.strictEqual(found.expiresAt, null);
  assert.strictEqual(found.isExpired, false);
});

test("expired package is deleted on access", async () => {
  const pkg = await make();
  await db("packages").where("id", pkg.id).update({ expires_at: Date.now() - 1 });
  await assert.rejects(service.findLiveByKey(pkg.key), NotFoundError);
  assert.ok(!fs.existsSync(storage.zipPath(pkg.storageName)));
});

test("deletePackage removes row and dir", async () => {
  const pkg = await make();
  await service.deletePackage(pkg.id);
  assert.strictEqual(await db("packages").where("id", pkg.id).first(), undefined);
  assert.ok(!fs.existsSync(storage.zipPath(pkg.storageName)));
});

test("listPackages paginates", async () => {
  for (const { id } of await db("packages").select("id")) await service.deletePackage(id);
  for (let i = 0; i < 3; i++) await make();
  const page = await service.listPackages(1, 2);
  assert.strictEqual(page.packages.length, 2);
  assert.strictEqual(page.total, 3);
  assert.strictEqual(page.totalPages, 2);
});

test("listPackages orders same-second packages newest first by id", async () => {
  const a = await make();
  const b = await make();
  const c = await make();
  await db("packages").whereIn("id", [a.id, b.id, c.id]).update({ created_at: "2030-01-01 00:00:00" });
  const { packages } = await service.listPackages(1, 3);
  assert.deepStrictEqual(packages.map((s) => s.id), [c.id, b.id, a.id]);
});

test("listPackages rejects invalid paging", async () => {
  for (const [page, perPage] of [[0, 20], [1.5, 20], ["2", 20], [1, 0], [1, -5]]) {
    await assert.rejects(service.listPackages(page, perPage), RangeError, `${page}/${perPage}`);
  }
});

test("createPackage rolls back storage when every key attempt collides", async () => {
  const { mock } = require("node:test");
  const path = require("path");
  const packageRepository = require("../repositories/package");
  const { DuplicateKeyError } = require("../lib/errors");
  const { UPLOAD_DIR, MAX_KEY_ATTEMPTS } = require("../config");
  const storedDirs = () => fs.readdirSync(UPLOAD_DIR).filter((name) => name !== "tmp").sort();

  const before = storedDirs();
  const insert = mock.method(packageRepository, "insert", async () => {
    throw new DuplicateKeyError();
  });
  try {
    await assert.rejects(
      make(),
      new RegExp(`Failed to generate unique key after ${MAX_KEY_ATTEMPTS} attempts`)
    );
    assert.strictEqual(insert.mock.callCount(), MAX_KEY_ATTEMPTS);
    const keys = insert.mock.calls.map((call) => call.arguments[0].key);
    assert.strictEqual(new Set(keys).size, keys.length);
  } finally {
    insert.mock.restore();
  }
  assert.deepStrictEqual(storedDirs(), before);
  assert.deepStrictEqual(fs.readdirSync(path.join(UPLOAD_DIR, "tmp")), []);
});

test("createPackage rolls back storage on any other insert error", async () => {
  const { mock } = require("node:test");
  const packageRepository = require("../repositories/package");
  const { UPLOAD_DIR } = require("../config");
  const storedDirs = () => fs.readdirSync(UPLOAD_DIR).filter((name) => name !== "tmp").sort();

  const before = storedDirs();
  const insert = mock.method(packageRepository, "insert", async () => {
    throw new Error("disk full");
  });
  try {
    await assert.rejects(make(), /disk full/);
    assert.strictEqual(insert.mock.callCount(), 1);
  } finally {
    insert.mock.restore();
  }
  assert.deepStrictEqual(storedDirs(), before);
});

test("deleteAll removes every row and stored directory", async () => {
  const packages = [await make(), await make(), await make()];
  const removed = await service.deleteAll();
  assert.ok(removed >= 3);
  assert.strictEqual(Number((await db("packages").count("id as c"))[0].c), 0);
  for (const pkg of packages) assert.ok(!fs.existsSync(storage.zipPath(pkg.storageName)));
});

test("deleteAll on an empty table is a no-op", async () => {
  assert.strictEqual(await service.deleteAll(), 0);
});

test("createPackage stores type, header path, removed deps", async () => {
  const zip = makeZip([
    { name: "p/p.php", data: Buffer.from(PLUGIN) },
    { name: "p/composer.json", data: Buffer.from("{}") },
    { name: "p/vendor/a.php", data: Buffer.from("x") },
  ]);
  const pkg = await service.createPackage({ buffer: zip, originalName: "p.zip", expiry: "7d" });
  const again = await service.findLiveByKey(pkg.key);
  assert.strictEqual(again.type, "plugin");
  assert.strictEqual(again.headerPath, "p.php");
  assert.deepStrictEqual(again.removedDeps, ["vendor"]);
  assert.match(again.url, /^\/p\/\w{8}$/);
});
