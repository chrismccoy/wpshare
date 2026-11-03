const { isUtf8 } = require("buffer");
const { readZip, buildZip, ZipError } = require("../infra/zip");
const { ValidationError } = require("../errors");
const { formatMb } = require("../shared/files");

const INVISIBLE_RE = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u2069\ufeff]/g;

const printable = (name) =>
  String(name).replace(
    INVISIBLE_RE,
    (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`
  );

const MESSAGES = {
  NOT_ZIP: () => "That file is not a valid zip archive.",
  TOO_MANY_ENTRIES: ({ limit, raw }) =>
    `The zip has more than ${limit} ${raw ? "entries" : "files"}.`,
  UNSAFE_PATH: ({ name }) => `The zip contains an unsafe file path: ${printable(name)}`,
  SYMLINK: ({ name }) =>
    `The zip contains a symbolic link: ${printable(name)}. Symlinks are not allowed.`,
  DUPLICATE_PATH: ({ name }) => `The zip contains a duplicate file path: ${printable(name)}`,
  FILE_TOO_BIG: ({ name, limit }) =>
    `${printable(name)} is larger than the ${formatMb(limit)} per-file limit.`,
  TOO_BIG: ({ limit }) => `The zip expands to more than ${formatMb(limit)}.`,
};

const BINARY_SNIFF_BYTES = 8192;

const isJunk = (name, size, maxDsStoreBytes) => {
  const parts = name.split("/");
  const base = parts[parts.length - 1];
  return (
    (parts[0] === "__MACOSX" && base.startsWith("._")) ||
    (base === ".DS_Store" && size <= maxDsStoreBytes)
  );
};

const isBinary = (data) =>
  data.subarray(0, BINARY_SNIFF_BYTES).includes(0) || !isUtf8(data);

const toUserError = (err) =>
  err instanceof ZipError ? new ValidationError(MESSAGES[err.code](err.detail)) : err;


const planSkips = (names, { alwaysIgnoredDirs, dependencyDirs, maxDsStoreBytes }) => {
  const always = new Set(alwaysIgnoredDirs.map((dir) => dir.toLowerCase()));
  const deps = new Map(
    Object.entries(dependencyDirs).map(([dir, manifest]) => [dir.toLowerCase(), manifest.toLowerCase()])
  );
  const lowerNames = new Set(names.map((name) => name.toLowerCase()));

  const folderRule = (name) => {
    const parts = name.toLowerCase().split("/");
    for (let i = 0; i < parts.length - 1; i++) {
      if (always.has(parts[i])) return {};
      const manifest = deps.get(parts[i]);
      if (manifest !== undefined && lowerNames.has([...parts.slice(0, i), manifest].join("/"))) {
        return { dep: parts[i] };
      }
    }
    return null;
  };

  const removed = new Set();
  for (const name of names) {
    const rule = folderRule(name);
    if (rule && rule.dep) removed.add(rule.dep);
  }

  return {
    skip: (name, entry) =>
      folderRule(name) !== null || isJunk(name, entry.uncompressedSize, maxDsStoreBytes),
    removedDeps: [...deps.keys()].filter((dir) => removed.has(dir)),
  };
};

const extractPackage = async (buffer, { alwaysIgnoredDirs, dependencyDirs, maxDsStoreBytes, ...limits }) => {
  let plan;
  let trimmed = false;
  let entries;
  try {
    entries = await readZip(buffer, {
      ...limits,
      skipFor: (names) => {
        plan = planSkips(names, { alwaysIgnoredDirs, dependencyDirs, maxDsStoreBytes });
        return (name, entry) => {
          const skipped = plan.skip(name, entry);
          if (skipped) trimmed = true;
          return skipped;
        };
      },
    });
  } catch (err) {
    throw toUserError(err);
  }

  const files = entries.map(({ name, data, mtime, mode }) => ({
    path: name,
    zipName: name,
    mtime,
    mode,
    size: data.length,
    binary: isBinary(data),
    data,
  }));
  return { files, removedDeps: plan.removedDeps, trimmed };
};

const repackPackage = (files) =>
  buildZip(files.map(({ zipName, data, mtime, mode }) => ({ name: zipName, data, mtime, mode })));

module.exports = { extractPackage, planSkips, repackPackage };
