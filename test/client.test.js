const fs = require("fs");
const path = require("path");
const { test } = require("node:test");
const assert = require("node:assert");
const { JSDOM, VirtualConsole } = require("jsdom");

const source = (...parts) => fs.readFileSync(path.join(__dirname, "..", ...parts), "utf8");

const ADMIN_JS = source("public", "js", "admin.js");
const UPLOAD_JS = source("public", "js", "upload.js");
const PACKAGE_JS = source("public", "js", "package.js");
const FILES_JS = source("lib", "shared", "files.js");

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const page = (body, { head = "", bodyAttrs = "" } = {}) => {
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on("jsdomError", (err) => errors.push(err));
  const dom = new JSDOM(
    `<!doctype html><html><head>${head}</head><body ${bodyAttrs}>${body}</body></html>`,
    { runScripts: "outside-only", url: "http://localhost/", virtualConsole }
  );
  return { window: dom.window, errors };
};

const CSRF_META = '<meta name="csrf-token" content="tok">';

const ADMIN_BODY = `
  <span id="packageCount">1 total</span>
  <table data-package-table><tbody>
    <tr data-row-id="5"><td><div>
      <button class="delete-btn text-red-400 hover:bg-red-500/10" data-id="5">Delete</button>
    </div></td></tr>
  </tbody></table>
  <template id="emptyStateTpl"><p>none</p></template>`;

const loadAdmin = (fetchStub) => {
  const { window } = page(ADMIN_BODY, { head: CSRF_META });
  window.fetch = fetchStub;
  window.eval(ADMIN_JS);
  return { window, btn: window.document.querySelector(".delete-btn") };
};

test("admin: a failed delete asks for confirmation again", async () => {
  const calls = [];
  const { btn } = loadAdmin(async (url, init) => {
    calls.push([url, init]);
    return { ok: false, status: 500 };
  });
  btn.click();
  btn.click();
  await flush();
  assert.strictEqual(calls.length, 1);
  btn.click();
  await flush();
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(btn.textContent, "Confirm?");
});

test("admin: the delete request asks for JSON and failures say why", async () => {
  const calls = [];
  const { btn } = loadAdmin(async (url, init) => {
    calls.push(init);
    return { ok: false, status: 403 };
  });
  btn.click();
  btn.click();
  await flush();
  assert.strictEqual(calls[0].headers.Accept, "application/json");
  assert.strictEqual(btn.textContent, "Reload page");
});

class FakeXhr {
  constructor() {
    this.listeners = {};
    this.upload = { addEventListener() {} };
    FakeXhr.instances.push(this);
  }

  open() {}

  setRequestHeader() {}

  addEventListener(type, fn) {
    (this.listeners[type] ??= []).push(fn);
  }

  send(body) {
    this.body = body;
  }

  fire(type) {
    for (const fn of this.listeners[type] ?? []) fn();
  }
}
FakeXhr.instances = [];

const loadUploadPage = ({ checked = true, head = CSRF_META } = {}) => {
  const { window, errors } = page(
    `<div id="dropzone"><input id="fileInput" type="file"></div>
     <div id="status" class="hidden"><span id="fileName"></span><span id="fileSize"></span></div>
     <span id="ready" class="hidden"></span>
     <button id="submitBtn" disabled>Upload</button>
     <div id="progressWrap" class="hidden"><div id="progress"></div></div>
     <p id="error" class="hidden"></p>
     <p id="expiryHint"></p>
     <input type="radio" name="expiry" value="7d" data-hint="7 days" ${checked ? "checked" : ""}>`,
    { head, bodyAttrs: 'data-max-bytes="1000000" data-upload-url="/upload"' }
  );
  FakeXhr.instances = [];
  window.XMLHttpRequest = FakeXhr;
  window.eval(FILES_JS);
  window.eval(UPLOAD_JS);
  return { window, errors, doc: window.document };
};

const dropAndUpload = (window) => {
  const doc = window.document;
  const drop = new window.Event("drop", { cancelable: true });
  drop.dataTransfer = { files: [new window.File(["zip"], "s.zip")] };
  doc.getElementById("dropzone").dispatchEvent(drop);
  doc.getElementById("submitBtn").click();
};

test("upload: works when no expiry option is checked", () => {
  const { window, errors } = loadUploadPage({ checked: false });
  dropAndUpload(window);
  assert.deepStrictEqual(errors, []);
  assert.strictEqual(FakeXhr.instances.length, 1);
  assert.strictEqual(FakeXhr.instances[0].body.get("expiry"), null);
  assert.ok(FakeXhr.instances[0].body.get("file"));
});

test("upload: an aborted or timed-out request re-enables the form", () => {
  for (const type of ["abort", "timeout"]) {
    const { window, doc } = loadUploadPage();
    dropAndUpload(window);
    assert.strictEqual(doc.getElementById("submitBtn").disabled, true);
    FakeXhr.instances[0].fire(type);
    assert.strictEqual(doc.getElementById("submitBtn").disabled, false, type);
    assert.ok(!doc.getElementById("error").classList.contains("hidden"), type);
  }
});

const loadPackagePage = ({ withPre = true, fetchStub } = {}) => {
  const { window, errors } = page(`
    <header></header>
    <div id="packageBar">
      <button id="copyLinkBtn" data-share-url="http://x/p/k">Copy</button>
      <button id="downloadBtn" data-zip-url="/p/k.zip" data-download-name="k.zip">Get</button>
    </div>
    <section id="viewer">
      <div id="breadcrumb"></div><span id="langBadge"></span><span id="lineCount"></span>
      <button id="copyFileBtn"></button><button id="rawBtn"></button>
      ${withPre ? '<pre><code><div class="file-pane" data-path="readme.md" data-preview="text" data-lang="md" data-lines="1"></div></code></pre>' : ""}
    </section>
    <div id="rawModal"><span id="rawName"></span><textarea id="rawText"></textarea>
      <button id="rawClose"></button></div>
    <div id="toast" class="hidden-toast"><span id="toastMsg"></span></div>`);
  window.ResizeObserver = class {
    observe() {}
  };
  if (fetchStub) window.fetch = fetchStub;
  window.eval(PACKAGE_JS);
  return { window, errors, doc: window.document };
};

test("package page: Escape still closes the raw modal when there is no <pre>", () => {
  const { window, errors, doc } = loadPackagePage({ withPre: false });
  assert.deepStrictEqual(errors, []);
  doc.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape" }));
  assert.ok(doc.getElementById("rawModal").classList.contains("hidden"));
});

test("package page: download reports a missing zip instead of 'download started'", async () => {
  const calls = [];
  const { doc } = loadPackagePage({
    fetchStub: async (url, init) => {
      calls.push([url, init]);
      return { ok: false, status: 404 };
    },
  });
  doc.getElementById("downloadBtn").click();
  await flush();
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0][0], "/p/k.zip");
  assert.strictEqual(calls[0][1].method, "HEAD");
  const message = doc.getElementById("toastMsg").textContent;
  assert.ok(!message.includes("download started"), message);
  assert.match(message, /unavailable/);
});

test("admin and upload scripts load without a csrf-token meta tag", () => {
  const admin = page(ADMIN_BODY);
  assert.doesNotThrow(() => admin.window.eval(ADMIN_JS));
  assert.doesNotThrow(() => loadUploadPage({ head: "" }));
});

const TRASH_BODY = `
  <button id="trashAllBtn" class="text-red-400 hover:bg-red-500/10">Trash all</button>
  <span id="packageCount">2 total</span>
  <div data-package-table><table><tbody>
    <tr data-row-id="5"><td><div>
      <button class="delete-btn text-red-400 hover:bg-red-500/10" data-id="5">Delete</button>
    </div></td></tr>
    <tr data-row-id="6"><td><div>
      <button class="delete-btn text-red-400 hover:bg-red-500/10" data-id="6">Delete</button>
    </div></td></tr>
  </tbody></table></div>
  <div data-pagination>pages</div>
  <template id="emptyStateTpl"><p>No packages yet.</p></template>`;

const loadTrash = (fetchStub) => {
  const { window } = page(TRASH_BODY, { head: CSRF_META });
  const calls = [];
  window.fetch = async (url, init) => {
    calls.push({ url, init });
    return fetchStub(url, init);
  };
  window.eval(ADMIN_JS);
  const doc = window.document;
  return { window, doc, calls, trash: doc.getElementById("trashAllBtn") };
};

test("admin: trash all asks 'Delete all N?' and cancels", () => {
  const { doc, trash, calls } = loadTrash(async () => ({ ok: true, status: 204 }));
  trash.click();
  assert.strictEqual(trash.textContent, "Delete all 2?");
  doc.getElementById("trashAllCancel").click();
  assert.strictEqual(trash.textContent, "Trash all");
  assert.strictEqual(doc.getElementById("trashAllCancel"), null);
  assert.strictEqual(calls.length, 0);
});

test("admin: confirmed trash all empties the page and resets the URL", async () => {
  const { window, doc, trash, calls } = loadTrash(async () => ({ ok: true, status: 204 }));
  window.history.pushState(null, "", "/admin/page/3");
  trash.click();
  trash.click();
  await flush();
  assert.strictEqual(calls[0].url, "/admin/packages");
  assert.strictEqual(calls[0].init.method, "DELETE");
  assert.strictEqual(calls[0].init.headers["x-csrf-token"], "tok");
  assert.strictEqual(calls[0].init.headers.Accept, "application/json");
  assert.strictEqual(doc.querySelector("[data-package-table]"), null);
  assert.strictEqual(doc.querySelector("[data-pagination]"), null);
  assert.ok(doc.body.textContent.includes("No packages yet."));
  assert.strictEqual(doc.getElementById("packageCount").textContent, "0 total");
  assert.strictEqual(doc.getElementById("trashAllBtn"), null);
  assert.strictEqual(window.location.pathname, "/admin");
});

test("admin: trash all failures say why and keep the rows", async () => {
  for (const [status, label] of [[401, "Logged out"], [403, "Reload page"], [500, "Error"]]) {
    const { doc, trash } = loadTrash(async () => ({ ok: false, status }));
    trash.click();
    trash.click();
    await flush();
    assert.strictEqual(trash.textContent, label, String(status));
    assert.strictEqual(trash.disabled, false);
    assert.strictEqual(doc.querySelectorAll("tr[data-row-id]").length, 2);
  }
});

test("admin: single deletes update the trash label and hide it at zero", async () => {
  const { window, doc, trash } = loadTrash(async () => ({ ok: true, status: 204 }));
  const [first, second] = doc.querySelectorAll(".delete-btn");
  first.click();
  first.click();
  await new Promise((r) => setTimeout(r, 250));
  trash.click();
  assert.strictEqual(trash.textContent, "Delete all 1?");
  doc.getElementById("trashAllCancel").click();
  second.click();
  second.click();
  await new Promise((r) => setTimeout(r, 250));
  assert.strictEqual(doc.getElementById("trashAllBtn"), null);
  assert.ok(window.document.body.textContent.includes("No packages yet."));
});
