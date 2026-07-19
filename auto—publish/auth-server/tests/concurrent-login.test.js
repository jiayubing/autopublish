const assert = require("node:assert/strict");
const { describe, it } = require("node:test");
const http = require("node:http");
const { createAuthServer } = require("../src/server");
const { temporaryDb } = require("./helpers");

function request(base, method, route, body) {
  return new Promise((resolve, reject) => {
    const req = http.request(`${base}${route}`, { method, headers: { "content-type": "application/json" } }, (res) => {
      let text = "";
      res.on("data", (chunk) => { text += chunk; });
      res.on("end", () => resolve({ status: res.statusCode, data: JSON.parse(text) }));
    });
    req.on("error", reject);
    if (body) req.end(JSON.stringify(body)); else req.end();
  });
}

describe("concurrent asynchronous login", () => {
  it("keeps health checks responsive while password work is queued", async () => {
    const temp = temporaryDb();
    const app = createAuthServer({ filePath: temp.filePath, maxConcurrentPasswordComputations: 2 });
    try {
      await app.administration.execute({ type: "create-user", loginName: "load-user", password: "load-password", permanent: true, mustChangePassword: false });
      await new Promise((resolve) => app.server.listen(0, "127.0.0.1", resolve));
      const base = `http://127.0.0.1:${app.server.address().port}`;
      const logins = Array.from({ length: 10 }, (_, index) => request(base, "POST", "/v1/auth/login", { loginName: "load-user", password: "load-password", deviceId: "load-device", appVersion: `1.${index}` }));
      const health = await request(base, "GET", "/healthz");
      assert.equal(health.status, 200);
      const results = await Promise.all(logins);
      assert.equal(results.filter((result) => result.status === 200).length, 10);
    } finally {
      if (app.server.listening) await new Promise((resolve) => app.server.close(resolve));
      app.repository.close();
      temp.cleanup();
    }
  });
});
