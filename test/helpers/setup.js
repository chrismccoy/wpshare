const fs = require("fs");
const os = require("os");

const tmpDir = fs.mkdtempSync(`${os.tmpdir()}/wpshare-`);
process.on("exit", () => fs.rmSync(tmpDir, { recursive: true, force: true }));

process.env.CSRF_SECRET = "test-csrf-secret-0123456789abcdef";
process.env.SESSION_SECRET = "test-session-secret-0123456789abcdef";
process.env.ADMIN_USERNAME = "admin";
process.env.ADMIN_PASSWORD = "pw";
process.env.DB_PATH = `${tmpDir}/db.sqlite`;
process.env.UPLOAD_DIR = `${tmpDir}/uploads`;
for (const name of ["SITE_NAME", "SITE_TAGLINE", "HERO_EYEBROW_ENABLED", "HERO_EYEBROW", "HERO_TITLE", "HERO_TITLE_GRADIENT", "HERO_INTRO", "DISPLAY_TIME_ZONE", "LOG_LEVEL", "TRUST_PROXY"]) {
  process.env[name] = "";
}

const { db } = require("../../lib/infra/db");
const storage = require("../../lib/infra/storage");

const ready = db.migrate.latest().then(() => storage.init());

module.exports = { ready, tmpDir };
