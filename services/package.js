const { Package } = require("../models/package");
const packageRepository = require("../repositories/package");
const storage = require("../lib/infra/storage");
const { generateKey } = require("../lib/infra/keygen");
const { preparePackage } = require("../lib/package/prepare");
const { buildTree } = require("../lib/package/tree");
const { NotFoundError, ValidationError, DuplicateKeyError } = require("../lib/errors");

const {
  ZIP_RULES,
  PREVIEW_LIMITS,
  EXPIRY_OPTIONS,
  DEFAULT_EXPIRY,
  DAY_MS,
  MAX_KEY_ATTEMPTS,
  PACKAGES_PER_PAGE,
} = require("../config");

const resolveExpiresAt = (expiry) => {
  const choice = expiry === undefined || expiry === "" ? DEFAULT_EXPIRY : expiry;
  if (typeof choice !== "string" || !Object.hasOwn(EXPIRY_OPTIONS, choice)) {
    throw new ValidationError("Choose a valid expiry.");
  }
  const days = EXPIRY_OPTIONS[choice];
  return days === null ? null : Date.now() + days * DAY_MS;
};

const findByKey = async (key) => {
  const pkg = await packageRepository.findByKey(key);
  if (!pkg) throw new NotFoundError("Package not found");
  return pkg;
};

const findLiveByKey = async (key) => {
  const pkg = await findByKey(key);

  if (pkg.isExpired) {
    try {
      await deletePackage(pkg.id);
    } catch {
    }
    throw new NotFoundError("Package has expired");
  }

  return pkg;
};

const getView = async (pkg) => {
  let manifest;
  let rendered;
  try {
    [manifest, rendered] = await Promise.all([
      storage.readManifest(pkg.storageName),
      storage.readRendered(pkg.storageName),
    ]);
  } catch (err) {
    if (err.code === "ENOENT") throw new NotFoundError("Package files missing");
    throw err;
  }
  return { manifest, rendered, tree: buildTree(manifest, pkg.headerPath) };
};

const zipPathFor = (pkg) => storage.zipPath(pkg.storageName);

const insertWithUniqueKey = async (fields) => {
  let lastError;

  for (let attempt = 0; attempt < MAX_KEY_ATTEMPTS; attempt++) {
    const keyed = { ...fields, key: generateKey() };
    try {
      const id = await packageRepository.insert(keyed);
      return new Package({ id, ...keyed });
    } catch (err) {
      if (!(err instanceof DuplicateKeyError)) throw err;
      lastError = err;
    }
  }

  throw new Error(
    `Failed to generate unique key after ${MAX_KEY_ATTEMPTS} attempts: ${lastError?.message}`
  );
};

const persistPackage = async ({ zip, manifest, rendered, details }, expiresAt) => {
  const storageName = await storage.writePackage({ zip, manifest, rendered });

  try {
    return await insertWithUniqueKey({
      ...details,
      storageName,
      zipBytes: zip.length,
      expiresAt,
    });
  } catch (err) {
    await storage.remove(storageName);
    throw err;
  }
};

const createPackage = async ({ buffer, originalName, expiry }) => {
  const expiresAt = resolveExpiresAt(expiry);
  const prepared = await preparePackage(buffer, originalName, {
    zipRules: ZIP_RULES,
    previewLimits: PREVIEW_LIMITS,
  });
  return persistPackage(prepared, expiresAt);
};

const deletePackage = async (id) => {
  const pkg = await packageRepository.findById(id);
  if (!pkg) return;

  await packageRepository.deleteById(id);
  await storage.remove(pkg.storageName);
};

const deleteExpired = async () => {
  const expired = await packageRepository.findExpired();
  if (expired.length === 0) return 0;

  await packageRepository.deleteByIds(expired.map((pkg) => pkg.id));

  for (const pkg of expired) {
    await storage.remove(pkg.storageName);
  }

  return expired.length;
};

const deleteAll = async () => {
  const storageNames = await packageRepository.allStorageNames();
  const deleted = await packageRepository.deleteAll();

  for (const storageName of storageNames) {
    await storage.remove(storageName);
  }

  return deleted;
};

const sweepOrphans = async () =>
  storage.sweepOrphans(await packageRepository.allStorageNames());

const isPositiveInt = (value) => Number.isInteger(value) && value > 0;

const listPackages = async (page = 1, perPage = PACKAGES_PER_PAGE) => {
  if (!isPositiveInt(page) || !isPositiveInt(perPage)) {
    throw new RangeError(`listPackages needs positive integers, got page=${page} perPage=${perPage}`);
  }

  const [packages, total] = await Promise.all([
    packageRepository.findAll(page, perPage),
    packageRepository.countAll(),
  ]);

  return { packages, total, totalPages: Math.ceil(total / perPage) };
};

module.exports = {
  findByKey,
  findLiveByKey,
  getView,
  zipPathFor,
  createPackage,
  deletePackage,
  deleteExpired,
  deleteAll,
  sweepOrphans,
  listPackages,
};
