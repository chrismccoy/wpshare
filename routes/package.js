const express = require("express");
const packageService = require("../services/package");
const { createPackageUpload } = require("../middleware/upload");
const { createRateLimiter } = require("../middleware/rateLimit");
const { splitCodeSpans, describeExpiry } = require("../lib/format");
const { NotFoundError, ValidationError } = require("../lib/errors");
const { TEXT_ENCODING } = require("../lib/text");
const {
  MAX_UPLOAD_BYTES,
  HERO,
  PLUGIN_PATH,
  THEME_PATH,
  PATH_FOR_TYPE,
  EXPIRY_OPTIONS,
  DEFAULT_EXPIRY,
  RATE_LIMIT_WINDOW_MS,
  RATE_LIMIT_MAX,
  PUBLIC_URL,
} = require("../config");

const UPLOAD_URL = "/upload";

const router = express.Router();
const createLimiter = createRateLimiter({ windowMs: RATE_LIMIT_WINDOW_MS, max: RATE_LIMIT_MAX });
const uploadPackage = createPackageUpload({ maxBytes: MAX_UPLOAD_BYTES });

const hero = { ...HERO, introParts: splitCodeSpans(HERO.intro) };

const expiryChoices = Object.entries(EXPIRY_OPTIONS).map(([value, days]) => ({
  value,
  ...describeExpiry(days),
  checked: value === DEFAULT_EXPIRY,
}));
const defaultExpiryHint = expiryChoices.find((choice) => choice.checked).hint;

router.param("key", async (req, _res, next, key) => {
  try {
    req.pkg = await packageService.findLiveByKey(key);
    next();
  } catch (err) {
    next(err);
  }
});

const publicOrigin = (req) => PUBLIC_URL ?? `${req.protocol}://${req.get("host")}`;

router.get("/", (req, res) => {
  res.render("new", {
    maxBytes: MAX_UPLOAD_BYTES,
    host: PUBLIC_URL ? new URL(PUBLIC_URL).host : req.get("host"),
    hero,
    uploadUrl: UPLOAD_URL,
    expiryChoices,
    defaultExpiryHint,
  });
});

router.post(UPLOAD_URL, createLimiter, uploadPackage, async (req, res) => {
  if (!req.file) throw new ValidationError("Choose a .zip file to upload.");

  const pkg = await packageService.createPackage({
    buffer: req.file.buffer,
    originalName: req.file.originalname,
    expiry: req.body.expiry,
  });

  res.status(201).json({ key: pkg.key, url: pkg.url });
});

const DEP_NOTES = {
  vendor: { dir: "vendor/", command: "composer install" },
  node_modules: { dir: "node_modules/", command: "npm install" },
};

const removalNotes = (pkg) =>
  pkg.removedDeps.filter((dep) => DEP_NOTES[dep]).map((dep) => DEP_NOTES[dep]);

const redirectIfWrongPrefix = (base, isZip) => (req, res, next) => {
  const { pkg } = req;
  if (base === PATH_FOR_TYPE[pkg.type]) return next();
  res.redirect(301, isZip ? pkg.zipUrl : pkg.url);
};

const sendZip = (req, res, next) => {
  const { pkg } = req;
  const options = {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${pkg.downloadName}"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, max-age=0",
    },
  };
  res.sendFile(packageService.zipPathFor(pkg), options, (err) => {
    if (!err) return;
    if (err.code === "ENOENT") return next(new NotFoundError("Zip missing"));
    next(err);
  });
};

const showPackage = async (req, res) => {
  const { pkg } = req;
  const { manifest, rendered, tree } = await packageService.getView(pkg);
  const shareUrl = `${publicOrigin(req)}${pkg.url}`;
  const shareHost = shareUrl.replace(/^https?:\/\//, "");

  res.render("show", {
    pkg,
    manifest,
    rendered,
    tree,
    shareUrl,
    shareHost,
    removalNotes: removalNotes(pkg),
    encodingLabel: TEXT_ENCODING.label,
  });
};

for (const base of [PLUGIN_PATH, THEME_PATH]) {
  router.get(`${base}/:key.zip`, redirectIfWrongPrefix(base, true), sendZip);
  router.get(`${base}/:key`, redirectIfWrongPrefix(base, false), showPackage);
}

module.exports = router;
