require("dotenv").config();

const { resolveDbPath } = require("./load");

module.exports = { DB_PATH: resolveDbPath(process.env) };
