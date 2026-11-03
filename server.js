// WPShare

const path = require("path");
const express = require("express");
const helmet = require("helmet");
const morgan = require("morgan");
const cookieParser = require("cookie-parser");
const session = require("express-session");
const adminRoutes = require("./routes/admin");
const packageRoutes = require("./routes/package");
const { createCsrf } = require("./middleware/csrf");
const { createErrorHandler, notFoundHandler } = require("./middleware/errors");
const { db } = require("./lib/infra/db");
const storage = require("./lib/infra/storage");
const format = require("./lib/format");
const { createCleanupJob } = require("./lib/infra/cleanup");
const { createLogger } = require("./lib/infra/logger");
const packageService = require("./services/package");

const {
  MAX_FORM_BYTES,
  IS_PRODUCTION,
  SESSION_SECRET,
  PORT,
  BIND_IP,
  TRUST_PROXY,
  GRACEFUL_SHUTDOWN_MS,
  CLEANUP_INTERVAL_MS,
  MAX_UPLOAD_BYTES,
  CSRF_SECRET,
  CSRF_COOKIE_NAME,
  LOG_LEVEL,
  SITE,
} = require("./config");

const logger = createLogger({ level: LOG_LEVEL });

const { csrfMiddleware, csrfErrorHandler } = createCsrf({
  secret: CSRF_SECRET,
  cookieName: CSRF_COOKIE_NAME,
  secure: IS_PRODUCTION,
});

const app = express();

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.set("trust proxy", TRUST_PROXY);
app.locals.site = SITE;
app.locals.format = format;

app.use(morgan(IS_PRODUCTION ? "combined" : "dev"));

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'self'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  })
);

app.use(express.static(path.join(__dirname, "public")));
app.use("/js/shared", express.static(path.join(__dirname, "lib", "shared")));
app.use(express.urlencoded({ extended: false, limit: MAX_FORM_BYTES }));
app.use(cookieParser());

app.use(
  session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "strict",
      secure: IS_PRODUCTION,
    },
  })
);

app.use(csrfMiddleware);

app.use(packageRoutes);
app.use(adminRoutes);
app.use(notFoundHandler);
app.use(csrfErrorHandler);
app.use(createErrorHandler({ maxUploadBytes: MAX_UPLOAD_BYTES, logger }));

module.exports = app;

let server = null;
let cleanup = null;
let isShuttingDown = false;

const start = async () => {
  await storage.init();
  cleanup = createCleanupJob({
    intervalMs: CLEANUP_INTERVAL_MS,
    logger,
    tasks: [
      { run: packageService.deleteExpired, label: "expired packages" },
      { run: packageService.sweepOrphans, label: "orphaned directories" },
    ],
  });

  server = app.listen(PORT, BIND_IP, () => {
    logger.info(`App running at http://${BIND_IP}:${PORT}`);
    cleanup.start();
  });
};

const shutdown = async (signal) => {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.info(`\n${signal} received — shutting down`);
  cleanup?.stop();

  const forceExit = setTimeout(
    () => process.exit(1),
    GRACEFUL_SHUTDOWN_MS
  );
  forceExit.unref();

  try {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
      logger.info("HTTP server closed");
    }
    await db.destroy();
    logger.info("Database connections closed");
    process.exit(0);
  } catch (err) {
    logger.error("Error during shutdown:", err.message);
    process.exit(1);
  }
};

if (require.main === module) {
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
  start();
}
