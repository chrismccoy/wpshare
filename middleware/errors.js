const { STATUS_CODES } = require("http");
const multer = require("multer");
const { AppError } = require("../lib/errors");
const { formatMb } = require("../lib/shared/files");

const ERROR_MAP = {
  401: {
    heading: "Unauthorized",
    message: "Log in to continue.",
  },
  403: {
    heading: "Forbidden",
    message: "You do not have permission to perform this action.",
  },
  404: {
    heading: "Not Found",
    message: "The plugin or theme you're looking for doesn't exist or has expired.",
  },
  413: { heading: "File Too Large" },
  422: { heading: "Invalid Input" },
  429: { heading: "Too Many Requests" },
  500: {
    heading: "Internal Server Error",
    message: "Something unexpected went wrong. We're working on it.",
  },
};

const isTooLarge = (err) =>
  (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") ||
  err.type === "entity.too.large";

const wantsJson = (req) => req.accepts(["html", "json"]) === "json";

const CLIENT_ERROR_MESSAGE = "The request could not be completed.";

const defaultsFor = (statusCode) => {
  if (ERROR_MAP[statusCode]) return ERROR_MAP[statusCode];
  const isClientError = statusCode >= 400 && statusCode < 500;
  return {
    heading: STATUS_CODES[statusCode] || ERROR_MAP[500].heading,
    message: isClientError ? CLIENT_ERROR_MESSAGE : ERROR_MAP[500].message,
  };
};

const respond = (req, res, statusCode, message) => {
  const defaults = defaultsFor(statusCode);
  const body = statusCode === 404 ? defaults.message : message || defaults.message;

  if (wantsJson(req)) {
    return res.status(statusCode).json({ error: body });
  }

  res.status(statusCode).render("error", {
    code: statusCode,
    heading: defaults.heading,
    message: body,
  });
};

const createErrorHandler = ({ maxUploadBytes, logger = console }) => {
  const tooLargeMessage = `That file is larger than the ${formatMb(maxUploadBytes)} limit.`;

  return (err, req, res, next) => {
    if (res.headersSent) return next(err);

    if (isTooLarge(err)) return respond(req, res, 413, tooLargeMessage);

    if (err instanceof multer.MulterError) {
      return respond(req, res, 422, "Upload one .zip file using the form.");
    }

    if (err instanceof AppError) {
      return respond(req, res, err.statusCode, err.message);
    }

    logger.error(err.stack);
    respond(req, res, 500);
  };
};

const notFoundHandler = (req, res) => respond(req, res, 404);

module.exports = { createErrorHandler, notFoundHandler, respond };
