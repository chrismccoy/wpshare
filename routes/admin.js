const express = require("express");
const packageService = require("../services/package");
const { timingSafeStringEqual } = require("../lib/infra/crypto");
const { NotFoundError } = require("../lib/errors");
const { requireAdmin } = require("../middleware/requireAdmin");
const { createRateLimiter } = require("../middleware/rateLimit");
const {
  ADMIN_USERNAME,
  ADMIN_PASSWORD,
  LOGIN_RATE_LIMIT_MAX,
  RATE_LIMIT_WINDOW_MS,
  SESSION_COOKIE_NAME,
} = require("../config");

const DASHBOARD_PATH = "/admin";

const router = express.Router();
const loginLimiter = createRateLimiter({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: LOGIN_RATE_LIMIT_MAX,
});

const pageUrl = (page) => (page === 1 ? DASHBOARD_PATH : `${DASHBOARD_PATH}/page/${page}`);

const parsePageParam = (param) => {
  if (param === undefined) return 1;
  if (!/^[1-9]\d*$/.test(param)) throw new NotFoundError();
  return Number(param);
};

router.get("/admin/login", (req, res) => {
  if (req.session?.isAdmin) return res.redirect(DASHBOARD_PATH);
  res.render("admin/login", { error: null });
});

router.post("/admin/login", loginLimiter, (req, res, next) => {
  const { username = "", password = "" } = req.body;

  const userMatch = timingSafeStringEqual(username, ADMIN_USERNAME);
  const passMatch = timingSafeStringEqual(password, ADMIN_PASSWORD);

  if (!userMatch || !passMatch) {
    return res.status(401).render("admin/login", {
      error: "Invalid username or password.",
    });
  }

  req.session.regenerate((err) => {
    if (err) return next(err);
    req.session.isAdmin = true;
    res.redirect(DASHBOARD_PATH);
  });
});

router.post("/admin/logout", requireAdmin, (req, res, next) => {
  req.session.destroy((err) => {
    if (err) return next(err);
    res.clearCookie(SESSION_COOKIE_NAME, { path: "/" });
    res.redirect("/admin/login");
  });
});

const renderDashboard = async (req, res) => {
  const page = parsePageParam(req.params.page);
  if (req.params.page !== undefined && page === 1) return res.redirect(301, pageUrl(1));

  const { packages, total, totalPages } = await packageService.listPackages(page);
  if (total > 0 && page > totalPages) throw new NotFoundError();
  res.render("admin/dashboard", { packages, total, page, totalPages, pageUrl });
};

router.get(DASHBOARD_PATH, requireAdmin, renderDashboard);
router.get(`${DASHBOARD_PATH}/page/:page`, requireAdmin, renderDashboard);

router.delete("/admin/packages", requireAdmin, async (req, res) => {
  await packageService.deleteAll();
  res.status(204).end();
});

router.delete("/admin/packages/:id", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!/^[1-9]\d*$/.test(req.params.id) || !Number.isSafeInteger(id)) {
    return res.status(400).json({ error: "Invalid ID" });
  }
  await packageService.deletePackage(id);
  res.status(204).end();
});

module.exports = router;
