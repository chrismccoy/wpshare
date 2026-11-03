const fs = require("fs/promises");
const path = require("path");
const { randomBytes } = require("crypto");
const { UPLOAD_DIR, ORPHAN_GRACE_MS } = require("../../config");

const ZIP_FILE = "original.zip";
const MANIFEST_FILE = "manifest.json";
const RENDERED_FILE = "rendered.json";
const TMP_NAME = "tmp";

const isStorageName = (name) => /^[0-9a-f]{32}$/.test(name);

const sweepDirectory = async (directory, keep, cutoff) => {
  let removed = 0;
  const entries = await fs.readdir(directory, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory() || !isStorageName(entry.name) || keep.has(entry.name)) continue;

    const full = path.join(directory, entry.name);
    let stats;
    try {
      stats = await fs.stat(full);
    } catch (err) {
      if (err.code === "ENOENT") continue;
      throw err;
    }
    if (stats.mtimeMs > cutoff) continue;

    await fs.rm(full, { recursive: true, force: true });
    removed += 1;
  }

  return removed;
};

const createStorage = ({ uploadDir, orphanGraceMs }) => {
  const tmpDir = path.join(uploadDir, TMP_NAME);

  const init = async () => {
    await fs.mkdir(tmpDir, { recursive: true });
  };

  const dirFor = (storageName) => {
    if (!isStorageName(storageName)) throw new Error("Invalid storage name");
    return path.join(uploadDir, storageName);
  };

  const zipPath = (storageName) => path.join(dirFor(storageName), ZIP_FILE);

  const writePackage = async ({ zip, manifest, rendered }) => {
    const storageName = randomBytes(16).toString("hex");
    const stagingDir = path.join(tmpDir, storageName);

    try {
      await fs.mkdir(stagingDir, { recursive: true });
      await fs.writeFile(path.join(stagingDir, ZIP_FILE), zip);
      await fs.writeFile(path.join(stagingDir, MANIFEST_FILE), JSON.stringify(manifest));
      await fs.writeFile(path.join(stagingDir, RENDERED_FILE), JSON.stringify(rendered));
      await fs.rename(stagingDir, dirFor(storageName));
    } catch (err) {
      await fs.rm(stagingDir, { recursive: true, force: true });
      throw err;
    }

    return storageName;
  };

  const readJson = async (storageName, fileName) => {
    const text = await fs.readFile(path.join(dirFor(storageName), fileName), "utf8");
    return JSON.parse(text);
  };

  const readManifest = (storageName) => readJson(storageName, MANIFEST_FILE);

  const readRendered = (storageName) => readJson(storageName, RENDERED_FILE);

  const remove = async (storageName) => {
    await fs.rm(dirFor(storageName), { recursive: true, force: true });
  };

  const sweepOrphans = async (knownNames) => {
    const cutoff = Date.now() - orphanGraceMs;
    const stranded = await sweepDirectory(uploadDir, new Set(knownNames), cutoff);
    const stale = await sweepDirectory(tmpDir, new Set(), cutoff);
    return stranded + stale;
  };

  return {
    init,
    isStorageName,
    zipPath,
    writePackage,
    readManifest,
    readRendered,
    remove,
    sweepOrphans,
  };
};

module.exports = {
  createStorage,
  ...createStorage({ uploadDir: UPLOAD_DIR, orphanGraceMs: ORPHAN_GRACE_MS }),
};
