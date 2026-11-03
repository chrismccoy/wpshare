const test = require("node:test");
const assert = require("node:assert");
const { requirePositiveMb, requireBoolean } = require("../config/env");

const withEnvVar = (name, value, fn) => {
  const before = process.env[name];
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
  try {
    return fn();
  } finally {
    if (before === undefined) delete process.env[name];
    else process.env[name] = before;
  }
};

const withEnv = (value, fn) => withEnvVar("TEST_SIZE_MB", value, fn);

test("requirePositiveMb converts megabytes to bytes", () => {
  assert.strictEqual(withEnv("10", () => requirePositiveMb("TEST_SIZE_MB", 1)), 10_000_000);
});

test("requirePositiveMb accepts decimals", () => {
  assert.strictEqual(withEnv("0.256", () => requirePositiveMb("TEST_SIZE_MB", 1)), 256_000);
});

test("requirePositiveMb falls back when unset or empty", () => {
  assert.strictEqual(withEnv(undefined, () => requirePositiveMb("TEST_SIZE_MB", 0.256)), 256_000);
  assert.strictEqual(withEnv("", () => requirePositiveMb("TEST_SIZE_MB", 2)), 2_000_000);
});

test("requirePositiveMb rejects zero, negatives and non-numbers", () => {
  for (const bad of ["0", "-1", "abc", "Infinity", "10MB", "0.0000001"]) {
    assert.throws(() => withEnv(bad, () => requirePositiveMb("TEST_SIZE_MB", 1)), /TEST_SIZE_MB/, bad);
  }
});

const withVar = (value, fn) => withEnvVar("TEST_FLAG", value, fn);

test("requireBoolean reads true/false words", () => {
  for (const v of ["true", "TRUE", "1", "yes", "on", " true "]) {
    assert.strictEqual(withVar(v, () => requireBoolean("TEST_FLAG", false)), true, v);
  }
  for (const v of ["false", "False", "0", "no", "off"]) {
    assert.strictEqual(withVar(v, () => requireBoolean("TEST_FLAG", true)), false, v);
  }
});

test("requireBoolean falls back when unset or empty", () => {
  assert.strictEqual(withVar(undefined, () => requireBoolean("TEST_FLAG", true)), true);
  assert.strictEqual(withVar("", () => requireBoolean("TEST_FLAG", false)), false);
});

test("requireBoolean rejects other values", () => {
  assert.throws(() => withVar("maybe", () => requireBoolean("TEST_FLAG", true)), /TEST_FLAG/);
});

test("requireNonNegativeInt accepts zero and rejects negatives", () => {
  const { requireNonNegativeInt } = require("../config/env");
  assert.strictEqual(withVar("0", () => requireNonNegativeInt("TEST_FLAG", 1)), 0);
  assert.strictEqual(withVar("", () => requireNonNegativeInt("TEST_FLAG", 1)), 1);
  assert.throws(() => withVar("-1", () => requireNonNegativeInt("TEST_FLAG", 1)), /TEST_FLAG/);
  assert.throws(() => withVar("1.5", () => requireNonNegativeInt("TEST_FLAG", 1)), /TEST_FLAG/);
});

test("requireTimeZone and requireOneOf validate", () => {
  const { requireTimeZone, requireOneOf } = require("../config/env");
  assert.strictEqual(withVar("UTC", () => requireTimeZone("TEST_FLAG", "UTC")), "UTC");
  assert.throws(() => withVar("Mars/Base", () => requireTimeZone("TEST_FLAG", "UTC")), /TEST_FLAG/);
  assert.strictEqual(withVar("WARN", () => requireOneOf("TEST_FLAG", ["error", "warn"], "error")), "warn");
  assert.throws(() => withVar("loud", () => requireOneOf("TEST_FLAG", ["error"], "error")), /TEST_FLAG/);
});

test("loadConfig reads from the env object it is given", () => {
  const { loadConfig } = require("../config/load");
  const config = loadConfig({
    CSRF_SECRET: "a".repeat(32),
    SESSION_SECRET: "b".repeat(32),
    ADMIN_USERNAME: "c",
    ADMIN_PASSWORD: "d",
    PORT: "4100",
    DISPLAY_TIME_ZONE: "UTC",
  });
  assert.strictEqual(config.PORT, 4100);
  assert.strictEqual(config.DISPLAY_TIME_ZONE, "UTC");
  assert.strictEqual(config.LOG_LEVEL, "info");
  assert.throws(() => loadConfig({}), /CSRF_SECRET/);
});

test("loadConfig refuses secrets shorter than 32 characters", () => {
  const { loadConfig } = require("../config/load");
  const valid = {
    CSRF_SECRET: "a".repeat(32),
    SESSION_SECRET: "b".repeat(32),
    ADMIN_USERNAME: "c",
    ADMIN_PASSWORD: "d",
  };
  assert.doesNotThrow(() => loadConfig(valid));
  for (const name of ["CSRF_SECRET", "SESSION_SECRET"]) {
    assert.throws(
      () => loadConfig({ ...valid, [name]: "x".repeat(31) }),
      new RegExp(`${name} must be at least 32 characters`),
      name
    );
  }
});

test("loadConfig default limits", () => {
  const { loadConfig } = require("../config/load");
  const config = loadConfig({
    CSRF_SECRET: "a".repeat(32),
    SESSION_SECRET: "b".repeat(32),
    ADMIN_USERNAME: "c",
    ADMIN_PASSWORD: "d",
  });
  assert.strictEqual(config.MAX_UPLOAD_BYTES, 50_000_000);
  assert.strictEqual(config.ZIP_RULES.maxEntries, 2000);
  assert.strictEqual(config.ZIP_RULES.maxUnzippedBytes, 100_000_000);
  assert.strictEqual(config.ZIP_RULES.maxFileBytes, 5_000_000);
  assert.strictEqual(config.ZIP_RULES.maxRawEntries, 50_000);
});
