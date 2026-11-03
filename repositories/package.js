const { db } = require("../lib/infra/db");
const { Package } = require("../models/package");
const { DuplicateKeyError } = require("../lib/errors");

const TABLE = "packages";

const parseDbTime = (value) => {
  if (value instanceof Date) return value;
  if (typeof value === "string" && !/(Z|[+-]\d\d:?\d\d)$/.test(value)) {
    return new Date(`${value.replace(" ", "T")}Z`);
  }
  return new Date(value);
};

const toPackage = (row) =>
  row &&
  new Package({
    id: row.id,
    key: row.key,
    storageName: row.storage_name,
    type: row.type,
    headerPath: row.header_path,
    name: row.name,
    version: row.version,
    description: row.description,
    removedDeps: row.removed_deps ? row.removed_deps.split(",") : [],
    fileCount: row.file_count,
    sizeBytes: row.size_bytes,
    zipBytes: row.zip_bytes,
    expiresAt: row.expires_at,
    createdAt: row.created_at ? parseDbTime(row.created_at) : null,
  });

const toRow = (fields) => ({
  key: fields.key,
  storage_name: fields.storageName,
  type: fields.type,
  header_path: fields.headerPath,
  name: fields.name,
  version: fields.version,
  description: fields.description,
  removed_deps: (fields.removedDeps ?? []).join(","),
  file_count: fields.fileCount,
  size_bytes: fields.sizeBytes,
  zip_bytes: fields.zipBytes,
  expires_at: fields.expiresAt,
});

const findByKey = async (key) => toPackage(await db(TABLE).where("key", key).first());

const findById = async (id) => toPackage(await db(TABLE).where("id", id).first());

const insert = async (fields) => {
  try {
    const [id] = await db(TABLE).insert(toRow(fields));
    return id;
  } catch (err) {
    if (err.code === "SQLITE_CONSTRAINT_UNIQUE") throw new DuplicateKeyError();
    throw err;
  }
};

const deleteById = (id) => db(TABLE).where("id", id).del();

const findExpired = async () => {
  const rows = await db(TABLE)
    .whereNotNull("expires_at")
    .where("expires_at", "<", Date.now())
    .select("id", "storage_name");
  return rows.map((row) => ({ id: row.id, storageName: row.storage_name }));
};

const DELETE_CHUNK_SIZE = 500;

const deleteByIds = async (ids) => {
  let deleted = 0;
  for (let start = 0; start < ids.length; start += DELETE_CHUNK_SIZE) {
    deleted += await db(TABLE)
      .whereIn("id", ids.slice(start, start + DELETE_CHUNK_SIZE))
      .del();
  }
  return deleted;
};

const deleteAll = () => db(TABLE).del();

const findAll = async (page, perPage) => {
  const rows = await db(TABLE)
    .orderBy("created_at", "desc")
    .orderBy("id", "desc")
    .limit(perPage)
    .offset((page - 1) * perPage);
  return rows.map(toPackage);
};

const countAll = async () => {
  const [{ count }] = await db(TABLE).count("id as count");
  return Number(count);
};

const allStorageNames = async () => {
  const rows = await db(TABLE).select("storage_name");
  return new Set(rows.map((row) => row.storage_name));
};

module.exports = {
  findByKey,
  findById,
  insert,
  deleteById,
  findExpired,
  deleteByIds,
  deleteAll,
  findAll,
  countAll,
  allStorageNames,
};
