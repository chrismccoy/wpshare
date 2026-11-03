const crypto = require("crypto");

const HMAC_KEY = crypto.randomBytes(32);

const timingSafeStringEqual = (a, b) => {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const hashA = crypto.createHmac("sha256", HMAC_KEY).update(String(a)).digest();
  const hashB = crypto.createHmac("sha256", HMAC_KEY).update(String(b)).digest();
  return crypto.timingSafeEqual(hashA, hashB);
};

module.exports = { timingSafeStringEqual };
