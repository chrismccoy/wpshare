const { respond } = require("./errors");

const requireAdmin = (req, res, next) => {
  if (req.session?.isAdmin) return next();
  if (req.method === "GET" || req.method === "HEAD") return res.redirect("/admin/login");
  respond(req, res, 401);
};

module.exports = { requireAdmin };
