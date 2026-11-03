const { ready } = require("./helpers/setup");

const { test, before, after } = require("node:test");
const assert = require("node:assert");
const request = require("supertest");
const app = require("../server");
const { db } = require("../lib/infra/db");

before(() => ready);
after(() => db.destroy());

test("GET / responds 200", async () => {
  const res = await request(app).get("/");
  assert.strictEqual(res.status, 200);
});
