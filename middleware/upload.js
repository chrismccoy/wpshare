const multer = require("multer");
const { isZipName } = require("../lib/shared/files");

const createPackageUpload = ({ maxBytes }) =>
  multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: maxBytes,
      files: 1,
      fields: 1,
    },
    fileFilter: (_req, file, cb) => {
      cb(null, isZipName(file.originalname));
    },
  }).single("file");

module.exports = { createPackageUpload };
