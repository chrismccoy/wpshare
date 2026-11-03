const path = require("path");
const { createEnvReader } = require("./env");

const ROOT_DIR = path.join(__dirname, "..");

const DAY_IN_SECONDS = 86_400;

const YEAR_IN_SECONDS = 365 * DAY_IN_SECONDS;

const SERVER_TIME_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;

const LOG_LEVELS = ["error", "warn", "info"];

const MIN_SECRET_LENGTH = 32;

const SECRET_HINT =
  `Generate one with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`;

const resolveDbPath = (env) =>
  path.resolve(
    createEnvReader(env).optionalString("DB_PATH", path.join(ROOT_DIR, "data", "db.sqlite"))
  );

const loadConfig = (env) => {
  const {
    requirePositiveInt,
    requireNonNegativeInt,
    requirePositiveMb,
    requireBoolean,
    optionalString,
    requiredString,
    requiredSecret,
    requireTimeZone,
    requireOneOf,
    optionalUrl,
  } = createEnvReader(env);

  const isProduction = env.NODE_ENV === "production";

  return Object.freeze({
    PORT: requirePositiveInt("PORT", 3000),
    BIND_IP: optionalString("IP_ADDRESS", "127.0.0.1"),
    TRUST_PROXY: requireNonNegativeInt("TRUST_PROXY", 0),
    PUBLIC_URL: optionalUrl("PUBLIC_URL"),

    IS_PRODUCTION: isProduction,
    DISPLAY_TIME_ZONE: requireTimeZone("DISPLAY_TIME_ZONE", SERVER_TIME_ZONE),
    LOG_LEVEL: requireOneOf("LOG_LEVEL", LOG_LEVELS, "info"),

    MAX_UPLOAD_BYTES: requirePositiveMb("MAX_UPLOAD_MB", 50),
    ZIP_RULES: Object.freeze({
      maxEntries: requirePositiveInt("MAX_ZIP_ENTRIES", 2000),
      maxRawEntries: 50_000,
      maxUnzippedBytes: requirePositiveMb("MAX_UNZIPPED_MB", 100),
      maxFileBytes: requirePositiveMb("MAX_FILE_MB", 5),
      maxDsStoreBytes: 65_536,
      alwaysIgnoredDirs: Object.freeze([".git", ".claude", ".remember"]),
      dependencyDirs: Object.freeze({ vendor: "composer.json", node_modules: "package.json" }),
    }),
    PREVIEW_LIMITS: Object.freeze({
      maxPreviewBytes: requirePositiveMb("MAX_PREVIEW_MB", 0.256),
      maxPreviewTotalBytes: requirePositiveMb("MAX_PREVIEW_TOTAL_MB", 2),
    }),

    SITE: Object.freeze({
      name: optionalString("SITE_NAME", "WPShare"),
      tagline: optionalString("SITE_TAGLINE", "share WordPress plugins and themes"),
    }),

    HERO: Object.freeze({
      showEyebrow: requireBoolean("HERO_EYEBROW_ENABLED", true),
      eyebrow: optionalString("HERO_EYEBROW", "SHARE YOUR CODE"),
      title: optionalString("HERO_TITLE", "Drop your plugin or theme .zip,"),
      titleGradient: optionalString("HERO_TITLE_GRADIENT", "get a link."),
      intro: optionalString(
        "HERO_INTRO",
        "We read the `Plugin Name` or `Theme Name` header and turn the files into a shareable page."
      ),
    }),

    MAX_FORM_BYTES: 100_000,

    DB_PATH: resolveDbPath(env),
    UPLOAD_DIR: path.resolve(
      optionalString("UPLOAD_DIR", path.join(ROOT_DIR, "uploads"))
    ),
    ORPHAN_GRACE_MS: 15 * 60 * 1000,

    CLEANUP_INTERVAL_MS: 60 * 60 * 1000,
    GRACEFUL_SHUTDOWN_MS: 5_000,

    PLUGIN_PATH: "/p",
    THEME_PATH: "/t",
    PATH_FOR_TYPE: Object.freeze({ plugin: "/p", theme: "/t" }),
    KEY_LENGTH: 8,
    KEY_ALPHABET:
      "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ",
    MAX_KEY_ATTEMPTS: 5,

    PACKAGES_PER_PAGE: 20,

    EXPIRY_OPTIONS: Object.freeze({ "1d": 1, "7d": 7, "30d": 30, never: null }),
    DEFAULT_EXPIRY: "7d",

    DAY_IN_SECONDS,
    DAY_MS: DAY_IN_SECONDS * 1000,
    YEAR_IN_SECONDS,

    RATE_LIMIT_WINDOW_MS: 15 * 60 * 1000,
    RATE_LIMIT_MAX: 20,
    LOGIN_RATE_LIMIT_MAX: 10,

    CSRF_SECRET: requiredSecret("CSRF_SECRET", MIN_SECRET_LENGTH, SECRET_HINT),
    CSRF_COOKIE_NAME: isProduction ? "__Host-csrf" : "__csrf",
    SESSION_COOKIE_NAME: "connect.sid",

    ADMIN_USERNAME: requiredString("ADMIN_USERNAME"),
    ADMIN_PASSWORD: requiredString("ADMIN_PASSWORD"),

    SESSION_SECRET: requiredSecret("SESSION_SECRET", MIN_SECRET_LENGTH, SECRET_HINT),
  });
};

module.exports = { loadConfig, resolveDbPath };
