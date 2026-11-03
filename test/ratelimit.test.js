const { test, before, after } = require("node:test");
const assert = require("node:assert");
const request = require("supertest");
const { ready } = require("./helpers/setup");
const app = require("../server");
const { db } = require("../lib/infra/db");
const { RATE_LIMIT_MAX } = require("../config");

let agent;
let token;

before(async () => {
  await ready;
  agent = request.agent(app);
  const page = await agent.get("/");
  const match = /name="csrf-token" content="([^"]+)"/.exec(page.text);
  assert.ok(match, "csrf-token meta tag missing from GET /");
  token = match[1];
});
after(() => db.destroy());

test("POST /upload is limited to RATE_LIMIT_MAX requests per window", async () => {
  const post = () =>
    agent
      .post("/upload")
      .set("x-csrf-token", token)
      .set("Accept", "application/json");

  for (let i = 0; i < RATE_LIMIT_MAX; i++) {
    const res = await post();
    assert.strictEqual(res.status, 422, `request ${i + 1}`);
  }
  const res = await post();
  assert.strictEqual(res.status, 429);
  assert.ok(res.body.error);
});

test("createRateLimiter counts per keyFor value", () => {
  const { createRateLimiter } = require("../middleware/rateLimit");
  const limiter = createRateLimiter({ windowMs: 60_000, max: 1, keyFor: (req) => req.user });
  const res = { set: () => {} };
  const run = (user) => {
    let result;
    limiter({ user }, res, (err) => (result = err));
    return result;
  };
  assert.strictEqual(run("a"), undefined);
  assert.strictEqual(run("b"), undefined);
  assert.strictEqual(run("a")?.statusCode, 429);
});
