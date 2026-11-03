const knex = require("knex");
const buildKnexConfig = require("../../knexfile");

const db = knex(buildKnexConfig());

module.exports = { db };
