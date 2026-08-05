const assert = require("node:assert/strict");
const { describe, it, before, after } = require("node:test");
const http = require("node:http");
const { createAuthServer } = require("../src/server");
const { AuthDomain } = require("../src/auth-domain");
const {
  InMemoryAuthRepository,
} = require("../src/repositories/in-memory-auth-repository");

describe("isolated auth API", () => {
  let server;
  let baseUrl;
  before(async () => {
    const repository = new InMemoryAuthRepository();
    const domain = new AuthDomain({ repository, passwordCost: 16384 });
    await domain.createManagedUser({
      loginName: "admin",
      password: "correct horse battery staple",
      permanent: true,
      role: "admin",
      mustChangePassword: false,
    });
    const app = createAuthServer({ repository, domain });
    server = app.server;
    server.listen(0, "127.0.0.1");
    baseUrl = new Promise((resolve) =>
      server.once("listening", () =>
        resolve(`http://127.0.0.1:${server.address().port}`),
      ),
    );
  });
  after(() => {
    if (server) server.close();
  });

  async function request(method, route, body, token) {
    const base = await baseUrl;
    return new Promise((resolve, reject) => {
      const request = http.request(
        `${base}${route}`,
        {
          method,
          headers: Object.assign(
            { "content-type": "application/json" },
            token ? { authorization: `Bearer ${token}` } : {},
          ),
        },
        (response) => {
          let text = "";
          response.on("data", (chunk) => {
            text += chunk;
          });
          response.on("end", () =>
            resolve({ status: response.statusCode, data: JSON.parse(text) }),
          );
        },
      );
      request.on("error", reject);
      if (body) request.write(JSON.stringify(body));
      request.end();
    });
  }

  it("supports login, refresh rotation, session and revoke without sensitive errors", async () => {
    assert.equal((await request("GET", "/healthz")).status, 200);
    assert.equal(
      (
        await request("POST", "/v1/auth/login", {
          loginName: "admin",
          password: "wrong",
        })
      ).data.error.code,
      "AUTH_INVALID_CREDENTIALS",
    );
    const login = await request("POST", "/v1/auth/login", {
      loginName: "admin",
      password: "correct horse battery staple",
      deviceId: "test",
    });
    assert.equal(login.status, 200);
    const session = await request(
      "GET",
      "/v1/auth/session",
      null,
      login.data.data.accessToken,
    );
    assert.equal(session.data.data.user.loginName, "admin");
    const refresh = await request("POST", "/v1/auth/refresh", {
      refreshToken: login.data.data.refreshToken,
      deviceId: "test",
    });
    assert.equal(refresh.status, 200);
    assert.equal(
      (
        await request("POST", "/v1/auth/refresh", {
          refreshToken: login.data.data.refreshToken,
        })
      ).data.error.code,
      "AUTH_TOKEN_REUSE_DETECTED",
    );
    assert.equal(
      (
        await request(
          "POST",
          "/v1/auth/logout",
          null,
          refresh.data.data.accessToken,
        )
      ).status,
      200,
    );
  });

  it("drains an oversized multi-chunk body without responding before upload completion", async () => {
    const base = await baseUrl;
    let responseStarted = false;
    let resolveResponse;
    let rejectResponse;
    const responseResult = new Promise((resolve, reject) => {
      resolveResponse = resolve;
      rejectResponse = reject;
    });
    const request = http.request(
      `${base}/v1/auth/login`,
      { method: "POST", headers: { "content-type": "application/json" } },
      (response) => {
        responseStarted = true;
        let text = "";
        response.on("data", (chunk) => { text += chunk; });
        response.on("end", () => resolveResponse({ status: response.statusCode, data: JSON.parse(text) }));
      },
    );
    request.on("error", rejectResponse);

    for (let index = 0; index < 9; index += 1) request.write("x".repeat(4096));
    await new Promise((resolve) => setTimeout(resolve, 25));
    assert.equal(responseStarted, false);
    for (let index = 0; index < 64; index += 1) request.write("y".repeat(4096));
    request.end();

    const response = await responseResult;
    assert.equal(response.status, 400);
    assert.equal(response.data.error.code, "AUTH_INPUT_INVALID");
    assert.equal((await requestApiHealth(base)).status, 200);
  });
});

function requestApiHealth(base) {
  return new Promise((resolve, reject) => {
    const request = http.request(`${base}/healthz`, { method: "GET" }, (response) => {
      response.resume();
      response.on("end", () => resolve({ status: response.statusCode }));
    });
    request.on("error", reject);
    request.end();
  });
}
