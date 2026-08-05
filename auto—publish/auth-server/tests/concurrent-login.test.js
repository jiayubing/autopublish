const assert = require("node:assert/strict");
const { describe, it } = require("node:test");
const http = require("node:http");
const { createAuthServer } = require("../src/server");
const { verifyPassword } = require("../src/auth-domain");
const { createMemoryAuth, createUser, temporaryDb } = require("./helpers");

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

  it("rejects old credentials when the password changes during verification", async () => {
    let blockNextVerification = false;
    let blocked = false;
    let signalStarted;
    let releaseVerification;
    const started = new Promise((resolve) => { signalStarted = resolve; });
    const release = new Promise((resolve) => { releaseVerification = resolve; });
    const passwordVerifier = async (password, passwordHash, options) => {
      if (blockNextVerification && !blocked) {
        blocked = true;
        signalStarted();
        await release;
      }
      return verifyPassword(password, passwordHash, options);
    };
    const { domain, administration } = createMemoryAuth({ passwordVerifier });
    await createUser(administration, "password-race", { password: "old-password" });
    const session = await domain.login({ loginName: "password-race", password: "old-password", deviceId: "race-device" });

    blockNextVerification = true;
    const staleLogin = domain.login({ loginName: "password-race", password: "old-password", deviceId: "race-device" });
    await started;
    await domain.changePassword({ accessToken: session.accessToken, currentPassword: "old-password", newPassword: "new-password", deviceId: "race-device" });
    releaseVerification();

    await assert.rejects(() => staleLogin, (error) => error.code === "AUTH_INVALID_CREDENTIALS");
    assert.equal((await domain.login({ loginName: "password-race", password: "new-password", deviceId: "race-device" })).user.loginName, "password-race");
  });
});
