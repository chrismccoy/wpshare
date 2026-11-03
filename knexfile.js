const fs = require("fs");
const path = require("path");
const { DB_PATH } = require("./config/db");

const buildKnexConfig = () => {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

  return {
    client: "sqlite3",
    connection: {
      filename: DB_PATH,
    },
    useNullAsDefault: true,
    migrations: {
      directory: path.join(__dirname, "db"),
    },
    pool: {
      min: 1,
      max: 1,
      afterCreate(conn, done) {
        conn.serialize(() => {
          conn.run("PRAGMA journal_mode = WAL");
          conn.run("PRAGMA synchronous = NORMAL");
          conn.run("PRAGMA foreign_keys = ON", done);
        });
      },
    },
  };
};

module.exports = buildKnexConfig;
