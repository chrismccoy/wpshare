const { test, before, after } = require("node:test");
const assert = require("node:assert");
const request = require("supertest");
const { ready } = require("./helpers/setup");
const app = require("../server");
const { db } = require("../lib/infra/db");
const { makeZip } = require("./helpers/makeZip");

const PLUGIN_SRC = "<?php\n/**\n * Plugin Name: pdf-package\n * Description: Works with PDFs\n */\n";

let agent;
let token;

before(async () => {
  await ready;
  agent = request.agent(app);
  const page = await agent.get("/");
  token = /name="csrf-token" content="([^"]+)"/.exec(page.text)[1];
});
after(() => db.destroy());

const upload = async (entries, name = "pdf.zip") => {
  const res = await agent
    .post("/upload")
    .set("x-csrf-token", token)
    .set("Accept", "application/json")
    .attach("file", makeZip(entries), name);
  assert.strictEqual(res.status, 201);
  return res.body.url;
};

const THEME_CSS = "/*\nTheme Name: Twenty Five\nVersion: 1.0\n*/";
const keyOf = (url) => url.split("/").pop();

test("theme upload lives under /t and wrong prefix redirects", async () => {
  const themeUrl = await upload([{ name: "style.css", data: THEME_CSS }], "t.zip");
  assert.match(themeUrl, /^\/t\/\w{8}$/);
  const themePage = await agent.get(themeUrl);
  assert.strictEqual(themePage.status, 200);
  assert.ok(themePage.text.includes("WordPress theme"));
  assert.ok(!themePage.text.includes("removed. Run"));
  assert.strictEqual((await agent.get(`${themeUrl}.zip`)).status, 200);
  const themeWrong = await agent.get(`/p/${keyOf(themeUrl)}`);
  assert.strictEqual(themeWrong.status, 301);
  assert.strictEqual(themeWrong.headers.location, themeUrl);

  const pluginUrl = await upload([{ name: "p.php", data: PLUGIN_SRC }], "p.zip");
  const wrong = await agent.get(pluginUrl.replace("/p/", "/t/"));
  assert.strictEqual(wrong.status, 301);
  assert.strictEqual(wrong.headers.location, pluginUrl);
  const wrongZip = await agent.get(`${pluginUrl.replace("/p/", "/t/")}.zip`);
  assert.strictEqual(wrongZip.status, 301);
  assert.strictEqual(wrongZip.headers.location, `${pluginUrl}.zip`);
});

test("share page shows type label and composer note", async () => {
  const url = await upload(
    [
      { name: "p/p.php", data: PLUGIN_SRC },
      { name: "p/composer.json", data: "{}" },
      { name: "p/vendor/a.php", data: "x" },
    ],
    "p.zip"
  );
  const page = await agent.get(url);
  assert.ok(page.text.includes("Uploaded just now • WordPress plugin"));
  assert.ok(page.text.includes("vendor/ removed. Run <code"));
  assert.ok(page.text.includes("composer install</code> to restore dependencies."));
  assert.ok(!page.text.includes("npm install"));
});

test("share page shows npm note when node_modules removed", async () => {
  const url = await upload(
    [
      { name: "p/p.php", data: PLUGIN_SRC },
      { name: "p/package.json", data: "{}" },
      { name: "p/node_modules/x/i.js", data: "x" },
    ],
    "p.zip"
  );
  const page = await agent.get(url);
  assert.ok(page.text.includes("node_modules/ removed. Run <code"));
  assert.ok(page.text.includes("npm install</code> to restore dependencies."));
  assert.ok(!page.text.includes("composer install"));
});

test("header HTML is escaped on share page and admin list", async () => {
  const url = await upload(
    [{ name: "p.php", data: "<?php\n// Plugin Name: <script>alert(1)</script>\n" }],
    "p.zip"
  );
  const page = await agent.get(url);
  assert.ok(!page.text.includes("<script>alert(1)</script>"));
  assert.ok(page.text.includes("&lt;script&gt;alert(1)&lt;/script&gt;"));

  const login = await agent
    .post("/admin/login")
    .type("form")
    .send({ username: "admin", password: "pw", _csrf: token });
  assert.strictEqual(login.status, 302);
  const list = await agent.get("/admin");
  assert.ok(!list.text.includes("<script>alert(1)</script>"));
  assert.ok(list.text.includes("&lt;script&gt;alert(1)&lt;/script&gt;"));
});

test("expired key under wrong prefix is 404, not redirect", async () => {
  const url = await upload([{ name: "p.php", data: PLUGIN_SRC }], "p.zip");
  await db("packages").where("key", keyOf(url)).update({ expires_at: Date.now() - 1000 });
  const wrong = await agent.get(url.replace("/p/", "/t/")).set("Accept", "application/json");
  assert.strictEqual(wrong.status, 404);
  const wrongZip = await agent.get(`${url.replace("/p/", "/t/")}.zip`).set("Accept", "application/json");
  assert.strictEqual(wrongZip.status, 404);
  const missing = await agent.get("/t/zzzzzzzz").set("Accept", "application/json");
  assert.strictEqual(missing.status, 404);
});
