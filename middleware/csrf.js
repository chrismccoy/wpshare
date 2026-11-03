const { doubleCsrf } = require("csrf-csrf");
const { respond } = require("./errors");

const CSRF_MESSAGE =
  "Invalid or missing CSRF token. Please go back, refresh the page, and try again.";

const createCsrf = ({ secret, cookieName, secure }) => {
  const { generateCsrfToken, doubleCsrfProtection } = doubleCsrf({
    getSecret: () => secret,
    getSessionIdentifier: () => "",
    cookieName,
    cookieOptions: {
      httpOnly: true,
      sameSite: "strict",
      secure,
      path: "/",
    },
    getCsrfTokenFromRequest: (req) =>
      req.body?._csrf ?? req.headers["x-csrf-token"],
  });

  const csrfMiddleware = (req, res, next) => {
    doubleCsrfProtection(req, res, (err) => {
      if (err) return next(err);
      res.locals.csrfToken = generateCsrfToken(req, res);
      next();
    });
  };

  return { csrfMiddleware, csrfErrorHandler };
};

const csrfErrorHandler = (err, req, res, next) => {
  if (err.code !== "EBADCSRFTOKEN") return next(err);
  respond(req, res, 403, CSRF_MESSAGE);
};

module.exports = { createCsrf };
