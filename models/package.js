const { PATH_FOR_TYPE } = require("../config");

class Package {
  constructor({
    id,
    key,
    storageName,
    type,
    headerPath,
    name,
    version,
    description,
    removedDeps,
    fileCount,
    sizeBytes,
    zipBytes,
    expiresAt,
    createdAt,
  }) {
    this.id = id;
    this.key = key;
    this.storageName = storageName;
    this.type = type;
    this.headerPath = headerPath;
    this.name = name;
    this.version = version ?? null;
    this.description = description ?? null;
    this.removedDeps = removedDeps ?? [];
    this.fileCount = fileCount;
    this.sizeBytes = sizeBytes;
    this.zipBytes = zipBytes;
    this.expiresAt = expiresAt ?? null;
    this.createdAt = createdAt ?? null;
  }

  get typeLabel() {
    return this.type === "theme" ? "WordPress theme" : "WordPress plugin";
  }

  get url() {
    return `${PATH_FOR_TYPE[this.type]}/${this.key}`;
  }

  get zipUrl() {
    return `${this.url}.zip`;
  }

  get downloadName() {
    const safe = this.name.replace(/[^\w.-]+/g, "-");
    return `${/[A-Za-z0-9]/.test(safe) ? safe : this.type}.zip`;
  }

  get isExpired() {
    return this.expiresAt !== null && this.expiresAt < Date.now();
  }
}

module.exports = { Package };
