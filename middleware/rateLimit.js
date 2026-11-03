const { RateLimitError } = require("../lib/errors");

const createRateLimiter = ({ windowMs, max, keyFor = (req) => req.ip }) => {
  const hits = new Map();
  let pruneTimer = null;

  const prune = () => {
    const now = Date.now();
    for (const [key, timestamps] of hits) {
      const recent = timestamps.filter((t) => now - t < windowMs);
      if (recent.length === 0) {
        hits.delete(key);
      } else {
        hits.set(key, recent);
      }
    }
  };

  const startPruning = () => {
    if (pruneTimer) return;
    pruneTimer = setInterval(prune, windowMs);
    pruneTimer.unref();
  };

  return (req, res, next) => {
    startPruning();
    const key = keyFor(req);
    const now = Date.now();
    const timestamps = (hits.get(key) ?? []).filter(
      (t) => now - t < windowMs
    );

    if (timestamps.length >= max) {
      res.set("Retry-After", String(Math.ceil(windowMs / 1000)));
      return next(new RateLimitError(windowMs));
    }

    timestamps.push(now);
    hits.set(key, timestamps);
    next();
  };
};

module.exports = { createRateLimiter };
