const assert = require("node:assert/strict");
const { describe, it } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

describe("J4125 auth contract", function() {
  it("contains an isolated HTTPS auth service contract without business data", function() {
    const root = path.resolve(__dirname, "../auth-server");
    const server = fs.readFileSync(path.join(root, "src/server.js"), "utf8");
    const store = fs.readFileSync(path.join(root, "src/auth-store.js"), "utf8");
    assert.match(server, /healthz/);
    assert.match(server, /v1\/auth\/login/);
    assert.match(server, /v1\/auth\/refresh/);
    assert.match(server, /v1\/auth\/logout/);
    assert.match(store, /passwordHash/);
    assert.doesNotMatch(store, /article|publication|cookie|prompt/i);
  });
});
