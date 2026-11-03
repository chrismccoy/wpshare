require("dotenv").config();

const { loadConfig } = require("./load");

module.exports = loadConfig(process.env);
