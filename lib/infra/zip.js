const zlib = require("zlib");
const yauzl = require("yauzl");
const yazl = require("yazl");

class ZipError extends Error {
  constructor(code, detail = {}) {
    super(code);
    this.name = this.constructor.name;
    this.code = code;
    this.detail = detail;
  }
}

const OPEN_OPTIONS = { lazyEntries: true, decodeStrings: false, validateEntrySizes: true };

const BAD_CHARS = /[\u0000-\u001f\u007f‪-‮⁦-⁩�]/;
const UNICODE_PATH_EXTRA = 0x7075;

const isUnsafe = (name, entry) => {
  if (BAD_CHARS.test(name) || name.includes("\\")) return true;
  if (name.startsWith("/") || /^[A-Za-z]:/.test(name)) return true;
  const trimmedName = name.endsWith("/") ? name.slice(0, -1) : name;
  if (trimmedName.split("/").some((s) => s === "" || s === "." || s === "..")) {
    return true;
  }
  return (entry.extraFields || []).some((f) => f.id === UNICODE_PATH_EXTRA);
};

const isSymlink = (entry) =>
  ((entry.externalFileAttributes >>> 16) & 0o170000) === 0o120000;

const openZip = (buffer) =>
  new Promise((resolve, reject) => {
    yauzl.fromBuffer(buffer, OPEN_OPTIONS, (err, zipfile) =>
      err ? reject(new ZipError("NOT_ZIP")) : resolve(zipfile)
    );
  });

const entryReader = (zipfile) => {
  let waiting = null;
  let failure = null;

  const settle = (outcome) => {
    const waiter = waiting;
    waiting = null;
    if (waiter) waiter(outcome);
  };

  zipfile.on("entry", (entry) => settle({ entry }));
  zipfile.on("end", () => settle({ entry: null }));
  zipfile.on("error", () => {
    failure = new ZipError("NOT_ZIP");
    settle({ error: failure });
  });

  return () =>
    new Promise((resolve, reject) => {
      if (failure) return reject(failure);
      waiting = ({ entry, error }) => (error ? reject(error) : resolve(entry));
      zipfile.readEntry();
    });
};

const openReadStream = (zipfile, entry) =>
  new Promise((resolve, reject) => {
    zipfile.openReadStream(entry, (err, stream) =>
      err ? reject(new ZipError("NOT_ZIP")) : resolve(stream)
    );
  });

const fileTooBig = (name, limits) =>
  new ZipError("FILE_TOO_BIG", { name, limit: limits.maxFileBytes });

const zipTooBig = (limits) =>
  new ZipError("TOO_BIG", { limit: limits.maxUnzippedBytes });

const checkDeclaredSize = (name, entry, limits, budget) => {
  if (entry.uncompressedSize > limits.maxFileBytes) throw fileTooBig(name, limits);
  if (budget.total + entry.uncompressedSize > limits.maxUnzippedBytes) {
    throw zipTooBig(limits);
  }
};

const readEntryData = async (zipfile, entry, name, limits, budget) => {
  const stream = await openReadStream(zipfile, entry);
  const chunks = [];
  let size = 0;

  try {
    for await (const chunk of stream) {
      size += chunk.length;
      budget.total += chunk.length;
      if (size > limits.maxFileBytes) throw fileTooBig(name, limits);
      if (budget.total > limits.maxUnzippedBytes) throw zipTooBig(limits);
      chunks.push(chunk);
    }
  } catch (err) {
    stream.destroy();
    throw err instanceof ZipError ? err : new ZipError("NOT_ZIP");
  }

  const data = Buffer.concat(chunks);
  if (zlib.crc32(data) !== entry.crc32) throw new ZipError("NOT_ZIP");
  return data;
};

const noSkip = () => () => false;

const collectKept = async (zipfile, { maxEntries, maxRawEntries, skipFor }) => {
  if (zipfile.entryCount > maxRawEntries) {
    throw new ZipError("TOO_MANY_ENTRIES", { limit: maxRawEntries, raw: true });
  }

  const nextEntry = entryReader(zipfile);
  const all = [];
  for (let entry = await nextEntry(); entry; entry = await nextEntry()) {
    const name = entry.fileName.toString("utf8");
    if (isUnsafe(name, entry)) throw new ZipError("UNSAFE_PATH", { name });
    all.push({ name, entry });
  }

  const skip = skipFor(all.map((item) => item.name));
  const kept = [];
  for (const item of all) {
    if (skip(item.name, item.entry)) continue;
    if (isSymlink(item.entry)) throw new ZipError("SYMLINK", { name: item.name });
    if (item.name.endsWith("/")) continue;
    kept.push(item);
  }

  if (kept.length > maxEntries) {
    throw new ZipError("TOO_MANY_ENTRIES", { limit: maxEntries });
  }
  return kept;
};

const readZip = async (
  buffer,
  { maxEntries, maxRawEntries = Infinity, maxUnzippedBytes, maxFileBytes, skipFor = noSkip }
) => {
  const zipfile = await openZip(buffer);

  try {
    const kept = await collectKept(zipfile, { maxEntries, maxRawEntries, skipFor });

    const limits = { maxUnzippedBytes, maxFileBytes };
    const budget = { total: 0 };
    const seen = new Set();
    const files = [];

    for (const { name, entry } of kept) {
      const key = name.toLowerCase();
      if (seen.has(key)) throw new ZipError("DUPLICATE_PATH", { name });
      seen.add(key);

      checkDeclaredSize(name, entry, limits, budget);
      const data = await readEntryData(zipfile, entry, name, limits, budget);
      files.push({
        name,
        data,
        mtime: entry.getLastModDate(),
        mode: entry.externalFileAttributes >>> 16,
      });
    }

    return files;
  } finally {
    zipfile.close();
  }
};

const buildZip = (files) =>
  new Promise((resolve, reject) => {
    const zip = new yazl.ZipFile();
    for (const file of files) {
      zip.addBuffer(file.data, file.name, {
        mtime: file.mtime,
        ...(file.mode ? { mode: file.mode } : {}),
      });
    }
    zip.end();
    const chunks = [];
    zip.outputStream
      .on("data", (chunk) => chunks.push(chunk))
      .on("end", () => resolve(Buffer.concat(chunks)))
      .on("error", reject);
  });

module.exports = { ZipError, readZip, buildZip };
