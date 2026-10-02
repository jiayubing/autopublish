const assert = require("node:assert/strict");
const test = require("node:test");
const { spawn } = require("node:child_process");
const { AuthDomain } = require("../src/auth-domain");
const { AuthAdministration } = require("../src/auth-administration");
const { SqliteAuthRepository } = require("../src/repositories/sqlite-auth-repository");
const { temporaryDb, createUser } = require("./helpers");

test("malformed request target does not terminate the HTTP process", async () => {
  const script = `
    const http = require('node:http');
    const { createAuthServer } = require('./src/server');
    const { InMemoryAuthRepository } = require('./src/repositories/in-memory-auth-repository');
    const app = createAuthServer({ repository: new InMemoryAuthRepository() });
    function request(path) {
      return new Promise((resolve, reject) => {
        const req = http.get({ host: '127.0.0.1', port: app.server.address().port, path }, res => {
          let body = ''; res.on('data', c => body += c);
          res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(body) }));
        }); req.on('error', reject);
      });
    }
    app.server.listen(0, '127.0.0.1', async () => {
      try {
        const bad = await request('//[');
        const good = await request('/healthz/live');
        if (bad.status !== 400 || bad.body.error.code !== 'AUTH_INPUT_INVALID' || good.status !== 200) process.exitCode = 2;
      } catch { process.exitCode = 3; }
      finally { app.server.close(); }
    });`;
  const child = spawn(process.execPath, ["-e", script], { cwd: require("node:path").resolve(__dirname, ".."), stdio: "pipe" });
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  const result = await new Promise((resolve, reject) => { child.on("error", reject); child.on("exit", resolve); });
  assert.equal(result, 0, stderr);
});

test("failed logins and account lock survive SQLite reopen", async (t) => {
  const temp = temporaryDb();
  let repository = new SqliteAuthRepository({ filePath: temp.filePath });
  t.after(() => { repository.close(); temp.cleanup(); });
  const options = { loginFailureThreshold: 3, passwordCost: 16384 };
  let domain = new AuthDomain({ ...options, repository });
  await createUser(new AuthAdministration({ repository, domain }), "synthetic-login");
  const input = { loginName: "synthetic-login", password: "wrong-password", deviceId: "synthetic-device" };
  for (let index = 1; index <= 3; index += 1) {
    await assert.rejects(domain.login(input), { code: index === 3 ? "AUTH_ACCOUNT_LOCKED" : "AUTH_INVALID_CREDENTIALS" });
    assert.equal(repository.findUserByLoginName(input.loginName).failedLoginCount, index);
  }
  repository.close();
  repository = new SqliteAuthRepository({ filePath: temp.filePath });
  domain = new AuthDomain({ ...options, repository });
  assert.equal(repository.listAuditEvents().filter((event) => event.eventCode === "LOGIN_FAILED").length, 2);
  assert.equal(repository.listAuditEvents().filter((event) => event.eventCode === "ACCOUNT_LOCKED").length, 1);
  await assert.rejects(domain.login({ ...input, password: "temporary-password" }), { code: "AUTH_ACCOUNT_LOCKED" });
});
