const { test, before, after } = require("node:test");
const assert = require("node:assert");
const request = require("supertest");
const { ready } = require("./helpers/setup");
const app = require("../server");
const { db } = require("../lib/infra/db");
const { makeZip } = require("./helpers/makeZip");

const PKG_MD = "<?php\n/**\n * Plugin Name: pdf-package\n * Description: Works with PDFs\n */\n";

let agent;
let token;

before(async () => {
  await ready;
  agent = request.agent(app);
  const page = await agent.get("/");
  token = /name="csrf-token" content="([^"]+)"/.exec(page.text)[1];
});
after(() => db.destroy());

test("GET / renders upload page", async () => {
  const res = await agent.get("/");
  assert.strictEqual(res.status, 200);
  assert.ok(res.text.includes("Drop your plugin or theme .zip,"));
  assert.ok(res.text.includes("get a link."));
  assert.ok(res.text.includes("SHARE YOUR CODE"));
  assert.ok(res.text.includes("<title>WPShare — Upload a plugin or theme</title>"));
  assert.ok(res.text.includes("share WordPress plugins and themes"));
  assert.ok(
    res.text.includes(
      'We read the <code class="font-mono text-gray-300">Plugin Name</code> or <code class="font-mono text-gray-300">Theme Name</code> header'
    )
  );
  assert.ok(!res.text.includes("Private"));
});

test("upload -> 201 and zip reachable", async () => {
  const zipBuf = makeZip([{ name: "hello.php", data: PKG_MD }]);
  const res = await agent
    .post("/upload")
    .set("x-csrf-token", token)
    .set("Accept", "application/json")
    .field("expiry", "7d")
    .attach("file", zipBuf, "pdf.zip");
  assert.strictEqual(res.status, 201);
  assert.match(res.body.url, /^\/p\/\w{8}$/);

  const zip = await agent
    .get(`${res.body.url}.zip`)
    .buffer(true)
    .parse((r, cb) => {
      const chunks = [];
      r.on("data", (c) => chunks.push(c));
      r.on("end", () => cb(null, Buffer.concat(chunks)));
    });
  assert.strictEqual(zip.status, 200);
  assert.match(zip.headers["content-type"], /application\/zip/);
  assert.ok(zip.headers["content-disposition"].includes('filename="pdf-package.zip"'));
  assert.ok(zip.body.equals(zipBuf));
});

test("upload without header -> 422 json error", async () => {
  const zipBuf = makeZip([{ name: "readme.txt", data: "hi" }]);
  const res = await agent
    .post("/upload")
    .set("x-csrf-token", token)
    .set("Accept", "application/json")
    .attach("file", zipBuf, "bad.zip");
  assert.strictEqual(res.status, 422);
  assert.match(res.body.error, /No WordPress plugin or theme header found/);
});

test("upload without file -> 422", async () => {
  const res = await agent
    .post("/upload")
    .set("x-csrf-token", token)
    .set("Accept", "application/json")
    .field("expiry", "7d");
  assert.strictEqual(res.status, 422);
  assert.match(res.body.error, /Choose a \.zip file/);
});

test("upload without csrf -> 403", async () => {
  const res = await request(app)
    .post("/upload")
    .set("Accept", "application/json")
    .attach("file", makeZip([{ name: "hello.php", data: PKG_MD }]), "pdf.zip");
  assert.strictEqual(res.status, 403);
  assert.match(res.body.error, /CSRF/);
});

test("unknown key -> 404", async () => {
  const res = await agent.get("/p/zzzzzzzz");
  assert.strictEqual(res.status, 404);
  const zip = await agent.get("/p/zzzzzzzz.zip");
  assert.strictEqual(zip.status, 404);
});

test("extra form field -> 422 json, not 500", async () => {
  const res = await agent
    .post("/upload")
    .set("x-csrf-token", token)
    .set("Accept", "application/json")
    .field("expiry", "7d")
    .field("extra", "x")
    .attach("file", makeZip([{ name: "hello.php", data: PKG_MD }]), "pdf.zip");
  assert.strictEqual(res.status, 422);
  assert.strictEqual(res.body.error, "Upload one .zip file using the form.");
});

test("404 shows spec copy", async () => {
  const res = await agent.get("/p/zzzzzzzz.zip").set("Accept", "application/json");
  assert.strictEqual(res.status, 404);
  assert.strictEqual(
    res.body.error,
    "The plugin or theme you're looking for doesn't exist or has expired."
  );
});

test("missing zip on disk -> 404 without attachment header", async () => {
  const up = await agent
    .post("/upload")
    .set("x-csrf-token", token)
    .set("Accept", "application/json")
    .attach("file", makeZip([{ name: "hello.php", data: PKG_MD }]), "gone.zip");
  const fs = require("fs");
  const storage = require("../lib/infra/storage");
  const pkg = await require("../services/package").findByKey(up.body.key);
  fs.rmSync(storage.zipPath(pkg.storageName));
  const res = await agent.get(`${up.body.url}.zip`).set("Accept", "application/json");
  assert.strictEqual(res.status, 404);
  assert.ok(!(res.headers["content-disposition"] || "").includes("attachment"));
});

const upload = async (entries, name = "pdf.zip") => {
  const res = await agent
    .post("/upload")
    .set("x-csrf-token", token)
    .set("Accept", "application/json")
    .attach("file", makeZip(entries), name);
  assert.strictEqual(res.status, 201);
  return res.body.url;
};

const download = (url) =>
  agent
    .get(`${url}.zip`)
    .buffer(true)
    .parse((r, cb) => {
      const chunks = [];
      r.on("data", (c) => chunks.push(c));
      r.on("end", () => cb(null, Buffer.concat(chunks)));
    });

test(".claude and .remember are left out of the page and the download", async () => {
  const url = await upload([
    { name: "hello.php", data: PKG_MD },
    { name: ".claude/settings.local.json", data: '{"secret":"s3cret-token"}' },
    { name: ".remember/now.md", data: "private notes" },
  ]);
  const page = await agent.get(url);
  assert.ok(!page.text.includes("settings.local.json"));
  assert.ok(!page.text.includes(".remember"));

  const zip = await download(url);
  assert.strictEqual(zip.status, 200);
  assert.ok(zip.body.includes("hello.php"));
  assert.ok(!zip.body.includes(".claude"));
  assert.ok(!zip.body.includes(".remember"));
});

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);

test("share page renders tree and panes", async () => {
  const url = await upload([
    { name: "hello.php", data: PKG_MD + "see references/a.md\n" },
    { name: "references/a.md", data: "# A\n" },
    { name: "scripts/v.py", data: "import os\n" },
    { name: "logo.png", data: PNG },
  ]);
  const res = await agent.get(url);
  assert.strictEqual(res.status, 200);
  for (const s of [
    'data-path="references/a.md"',
    'data-folder="references"',
    "📦 ",
    "4 files",
    "Uploaded just now •",
    "COPY LINK",
    "+ Upload .zip",
    "⬇ Download .zip",
    "click highlighted paths to navigate",
    "binary file —",
    '<script src="/js/package.js">',
  ]) {
    assert.ok(res.text.includes(s), `missing ${s}`);
  }
  assert.ok(res.text.split('data-path="references/a.md"').length - 1 >= 3, "tree, pane and link");
});

test("hostile content is escaped", async () => {
  const url = await upload([
    { name: "hello.php", data: PKG_MD + "</textarea><script>alert(1)</script>\n" },
  ]);
  const res = await agent.get(url);
  assert.strictEqual(res.status, 200);
  assert.ok(!res.text.includes("<script>alert(1)"));
  assert.ok(res.text.includes("&lt;/textarea&gt;"));
});

test("no inline handlers", async () => {
  const url = await upload([
    { name: "hello.php", data: PKG_MD + "see references/a.md\n" },
    { name: "references/a.md", data: "# A\n" },
  ]);
  const res = await agent.get(url);
  assert.strictEqual(res.status, 200);
  assert.doesNotMatch(res.text, /\son[a-z]+=/i);
});

test("header without a version omits version text", async () => {
  const url = await upload([{ name: "hello.php", data: PKG_MD }], "plain-package.zip");
  const res = await agent.get(url);
  assert.strictEqual(res.status, 200);
  assert.match(res.text, /font-normal text-gray-400">\s*1 files • /);
  assert.doesNotMatch(res.text, /font-normal text-gray-400">\s*v/);
});

test("version text shown when the header has a version", async () => {
  const url = await upload([
    { name: "hello.php", data: "<?php\n/**\n * Plugin Name: v-package\n * Version: 2.0.1\n */\n" },
  ]);
  const res = await agent.get(url);
  assert.match(res.text, /font-normal text-gray-400">\s*v2\.0\.1 • 1 files • /);
});

test("macOS junk beside a wrapped plugin is dropped and the upload accepted", async () => {
  const zipBuf = makeZip([
    { name: "my-plugin/my-plugin.php", data: PKG_MD },
    { name: "__MACOSX/my-plugin/._my-plugin.php", data: "junk" },
  ]);
  const res = await agent
    .post("/upload")
    .set("x-csrf-token", token)
    .set("Accept", "application/json")
    .field("expiry", "7d")
    .attach("file", zipBuf, "my-plugin.zip");
  assert.strictEqual(res.status, 201);
});

test("oversized text file gets too-large pane", async () => {
  const url = await upload([
    { name: "hello.php", data: PKG_MD },
    { name: "references/big.md", data: "x".repeat(300_000) },
  ]);
  const res = await agent.get(url);
  assert.strictEqual(res.status, 200);
  assert.ok(res.text.includes("file too large to preview — 300.0 KB"));
  assert.ok(res.text.includes('data-path="references/big.md" data-lang="markdown" data-lines="" data-preview="too-large"'));
  assert.ok(!res.text.includes('data-raw="references/big.md"'));
});

test("copy and raw buttons have disabled styles", async () => {
  const url = await upload([{ name: "hello.php", data: PKG_MD }]);
  const res = await agent.get(url);
  for (const id of ["copyFileBtn", "rawBtn"]) {
    const tag = new RegExp(`id="${id}"\\s+class="([^"]+)"`).exec(res.text);
    assert.ok(tag, id);
    assert.ok(tag[1].includes("disabled:hover:bg-white/10 disabled:cursor-not-allowed"), id);
  }
});

test("admin requires login", async () => {
  const res = await request(app).get("/admin");
  assert.strictEqual(res.status, 302);
  assert.strictEqual(res.headers.location, "/admin/login");
});

test("admin lists and deletes", async () => {
  const url = await upload([{ name: "hello.php", data: PKG_MD }]);
  const login = await agent
    .post("/admin/login")
    .type("form")
    .send({ username: "admin", password: "pw", _csrf: token });
  assert.strictEqual(login.status, 302);

  const list = await agent.get("/admin");
  assert.strictEqual(list.status, 200);
  assert.ok(list.text.includes("Packages"));
  assert.ok(list.text.includes("pdf-package"));

  const pkg = await require("../services/package").findByKey(url.split("/").pop());
  const del = await agent.delete(`/admin/packages/${pkg.id}`).set("x-csrf-token", token);
  assert.strictEqual(del.status, 204);

  const gone = await agent.get(url).set("Accept", "application/json");
  assert.strictEqual(gone.status, 404);
});

test("admin delete rejects a bad id with a JSON error", async () => {
  await agent
    .post("/admin/login")
    .type("form")
    .send({ username: "admin", password: "pw", _csrf: token });
  const res = await agent.delete("/admin/packages/abc").set("x-csrf-token", token);
  assert.strictEqual(res.status, 400);
  assert.deepStrictEqual(res.body, { error: "Invalid ID" });
});

test("admin delete without csrf token -> 403", async () => {
  const url = await upload([{ name: "hello.php", data: PKG_MD }]);
  const pkg = await require("../services/package").findByKey(url.split("/").pop());
  const res = await agent.delete(`/admin/packages/${pkg.id}`);
  assert.strictEqual(res.status, 403);
});

test("admin pagination uses pretty URLs", async () => {
  const packageService = require("../services/package");
  const { PACKAGES_PER_PAGE } = require("../config");
  const zip = makeZip([{ name: "hello.php", data: PKG_MD }]);
  for (let i = 0; i < PACKAGES_PER_PAGE + 1; i++) {
    await packageService.createPackage({ buffer: zip, originalName: "pkg.zip", expiry: "7d" });
  }
  const admin = request.agent(app);
  const t = /name="csrf-token" content="([^"]+)"/.exec((await admin.get("/")).text)[1];
  const login = await admin.post("/admin/login").type("form").send({ username: "admin", password: "pw", _csrf: t });
  assert.strictEqual(login.status, 302);

  const p1 = await admin.get("/admin");
  assert.strictEqual(p1.status, 200);
  assert.ok(p1.text.includes('href="/admin/page/2"'));

  const p2 = await admin.get("/admin/page/2");
  assert.strictEqual(p2.status, 200);
  assert.ok(p2.text.includes("Page 2 of 2"));
  assert.ok(p2.text.includes('href="/admin"'));
  assert.ok(!p2.text.includes("?page="));

  const one = await admin.get("/admin/page/1");
  assert.strictEqual(one.status, 301);
  assert.strictEqual(one.headers.location, "/admin");

  const legacy = await admin.get("/admin?page=2");
  assert.strictEqual(legacy.status, 200);
  assert.ok(legacy.text.includes("Page 1 of 2"));

  for (const bad of ["0", "abc", "02", "99"]) {
    const res = await admin.get(`/admin/page/${bad}`);
    assert.strictEqual(res.status, 404, bad);
  }

  const anon = await request(app).get("/admin/page/2");
  assert.strictEqual(anon.status, 302);
  assert.strictEqual(anon.headers.location, "/admin/login");
});

test("upload page expiry choices come from config", async () => {
  const { EXPIRY_OPTIONS, DEFAULT_EXPIRY } = require("../config");
  const res = await request(app).get("/");
  const values = [...res.text.matchAll(/name="expiry"\s+value="([^"]+)"/g)].map((m) => m[1]);
  assert.deepStrictEqual(values, Object.keys(EXPIRY_OPTIONS));
  const checked = /value="([^"]+)"\s+data-hint="[^"]*"\s+class="[^"]*"\s+checked/.exec(res.text);
  assert.strictEqual(checked[1], DEFAULT_EXPIRY);
  assert.ok(res.text.includes(">expires in 7 days</span>"));
});

test("trash all needs csrf and a session", async () => {
  await upload([{ name: "hello.php", data: PKG_MD }]);
  const noCsrf = await agent.delete("/admin/packages");
  assert.strictEqual(noCsrf.status, 403);

  const anon = request.agent(app);
  const t = /name="csrf-token" content="([^"]+)"/.exec((await anon.get("/")).text)[1];
  const noSession = await anon.delete("/admin/packages").set("x-csrf-token", t).set("Accept", "application/json");
  assert.strictEqual(noSession.status, 401);
  assert.ok((await db("packages").count("id as c"))[0].c > 0);
});

test("trash all deletes every package and hides the button afterwards", async () => {
  await agent.post("/admin/login").type("form").send({ username: "admin", password: "pw", _csrf: token });
  await upload([{ name: "hello.php", data: PKG_MD }]);
  const before = await agent.get("/admin");
  assert.match(before.text, /id="trashAllBtn"/);

  const res = await agent.delete("/admin/packages").set("x-csrf-token", token);
  assert.strictEqual(res.status, 204);
  assert.strictEqual(Number((await db("packages").count("id as c"))[0].c), 0);

  const after = await agent.get("/admin");
  assert.ok(!after.text.includes('id="trashAllBtn"'));
  assert.ok(after.text.includes("No packages yet."));
});
