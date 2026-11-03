const { BYTES_PER_MB } = require("../lib/shared/files");

const TRUE_VALUES = new Set(["true", "1", "yes", "on"]);
const FALSE_VALUES = new Set(["false", "0", "no", "off"]);

const WHOLE_NUMBER_RE = /^\d+$/;
const DECIMAL_RE = /^(\d+(\.\d*)?|\.\d+)$/;


const createEnvReader = (env) => {
  const readTrimmed = (name) => {
    const value = env[name]?.trim();
    return value ? value : undefined;
  };

  const requirePositiveInt = (name, fallback) => {
    const raw = readTrimmed(name);
    if (raw === undefined) return fallback;

    const parsed = Number(raw);

    if (!WHOLE_NUMBER_RE.test(raw) || !Number.isSafeInteger(parsed) || parsed <= 0) {
      throw new Error(
        `Invalid configuration: ${name}="${raw}" must be a positive integer`
      );
    }
    return parsed;
  };

  const requireNonNegativeInt = (name, fallback) => {
    const raw = readTrimmed(name);
    if (raw === undefined) return fallback;

    const parsed = Number(raw);

    if (!WHOLE_NUMBER_RE.test(raw) || !Number.isSafeInteger(parsed)) {
      throw new Error(
        `Invalid configuration: ${name}="${raw}" must be a whole number (0 or more)`
      );
    }
    return parsed;
  };

  const requirePositiveMb = (name, fallbackMb) => {
    const raw = readTrimmed(name);
    if (raw === undefined) return Math.round(fallbackMb * BYTES_PER_MB);

    const parsed = Number(raw);

    if (!DECIMAL_RE.test(raw) || !Number.isFinite(parsed) || parsed <= 0) {
      throw new Error(
        `Invalid configuration: ${name}="${raw}" must be a positive number of megabytes`
      );
    }
    const bytes = Math.round(parsed * BYTES_PER_MB);
    if (bytes < 1) {
      throw new Error(
        `Invalid configuration: ${name}="${raw}" is smaller than one byte`
      );
    }
    return bytes;
  };

  const requireBoolean = (name, fallback) => {
    const raw = readTrimmed(name);
    if (raw === undefined) return fallback;

    const value = raw.toLowerCase();
    if (TRUE_VALUES.has(value)) return true;
    if (FALSE_VALUES.has(value)) return false;
    throw new Error(
      `Invalid configuration: ${name}="${raw}" must be true or false`
    );
  };

  const optionalString = (name, fallback) => readTrimmed(name) ?? fallback;

  const requiredString = (name, hint = "") => {
    const value = env[name]?.trim();
    if (!value) {
      const extra = hint ? ` ${hint}` : "";
      throw new Error(
        `${name} must be set in your environment (e.g. in .env).${extra}`
      );
    }
    return value;
  };

  const requiredSecret = (name, minLength, hint = "") => {
    const value = requiredString(name, hint);
    if (value.length < minLength) {
      const extra = hint ? ` ${hint}` : "";
      throw new Error(`${name} must be at least ${minLength} characters.${extra}`);
    }
    return value;
  };

  const requireTimeZone = (name, fallback) => {
    const zone = optionalString(name, fallback);
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: zone });
    } catch {
      throw new Error(
        `Invalid configuration: ${name}="${zone}" is not a known time zone (e.g. America/Toronto, UTC)`
      );
    }
    return zone;
  };

  const requireOneOf = (name, choices, fallback) => {
    const value = optionalString(name, fallback).toLowerCase();
    if (!choices.includes(value)) {
      throw new Error(
        `Invalid configuration: ${name}="${value}" must be one of ${choices.join(", ")}`
      );
    }
    return value;
  };

  const optionalUrl = (name) => {
    const raw = readTrimmed(name);
    if (raw === undefined) return null;

    let url;
    try {
      url = new URL(raw);
    } catch {
      url = null;
    }
    const isOrigin =
      url !== null &&
      (url.protocol === "http:" || url.protocol === "https:") &&
      url.pathname === "/" &&
      !url.search &&
      !url.hash &&
      !url.username &&
      !url.password;
    if (!isOrigin) {
      throw new Error(
        `Invalid configuration: ${name}="${raw}" must be an http(s) URL with no path ` +
          "(e.g. https://packages.example.com)"
      );
    }
    return url.origin;
  };

  return {
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
  };
};

module.exports = { createEnvReader, ...createEnvReader(process.env) };
