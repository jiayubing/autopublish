"use strict";

const assert = require("node:assert/strict");
const { afterEach, beforeEach, test } = require("node:test");
const { createMediaSettingsAdapter } = require("../desktop/services/platform-settings/media-settings-adapter");
const { createMediaRiskConfirmationAdapter } = require("../desktop/services/platform-settings/media-risk-confirmation-adapter");
const { createPlatformSettingsService } = require("../desktop/services/platform-settings-service");
const { MediaClient } = require("../src/platforms/media/media-client");
const { EndpointPolicy } = require("../src/platforms/media/endpoint-policy");
const { MediaTransport } = require("../src/platforms/media/media-transport");

let originalFetch;

beforeEach(() => {
  originalFetch = global.fetch;
});

afterEach(() => {
  global.fetch = originalFetch;
});

function jsonResponse(status, value) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(value),
  };
}

test("unconfirmed HTTP is rejected before API key or multipart body creation", async () => {
  let calls = 0;
  global.fetch = async () => {
    calls += 1;
    return jsonResponse(200, { ok: true });
  };
  const policy = new EndpointPolicy({ endpoint: "http://provider.example" });
  const transport = new MediaTransport({ fetch: global.fetch, timeoutMs: 1000 });
  let prepared = false;

  await assert.rejects(
    transport.post({
      policy,
      path: "/api/media/send",
      prepare: () => {
        prepared = true;
        return { headers: {}, body: Buffer.from("api_key=secret&content=private") };
      },
    }),
    (error) => error.code === "MEDIA_HTTP_CONFIRMATION_REQUIRED",
  );
  assert.equal(prepared, false);
  assert.equal(calls, 0);
  const adapter = createMediaSettingsAdapter();
  assert.throws(
    () => adapter.validate({ apiKey: "fixture-key", timeoutMs: 30000 }),
    (error) => error.code === "MEDIA_ENDPOINT_REQUIRED",
  );
  assert.throws(
    () => adapter.validate({ apiKey: "fixture-key", baseUrl: "ftp://provider.example", timeoutMs: 30000 }),
    (error) => error.code === "MEDIA_CONFIG_INVALID",
  );
  assert.throws(
    () => new MediaClient({ apiKey: "fixture-key", baseUrl: "http://provider.example" }),
    (error) => error.code === "MEDIA_HTTP_CONFIRMATION_REQUIRED" && /allowInsecure=true/.test(error.message),
  );
});

test("explicit HTTP confirmation is bound to the exact endpoint", () => {
  const adapter = createMediaSettingsAdapter();
  const first = adapter.validate({
    apiKey: "fixture-key",
    baseUrl: "http://provider.example:8080",
    timeoutMs: 30000,
    allowInsecure: true,
  });
  assert.equal(first.allowInsecure, true);
  assert.equal(first.insecureEndpoint, "http://provider.example:8080");

  const changed = Object.assign({}, first, { baseUrl: "http://provider.example:8081" });
  assert.throws(
    () => adapter.validate(changed, first, { baseUrl: changed.baseUrl }),
    (error) => error.code === "MEDIA_HTTP_CONFIRMATION_REQUIRED",
  );
  const explicitlyChanged = adapter.validate(changed, first, {
    baseUrl: changed.baseUrl,
    allowInsecure: true,
  });
  assert.equal(explicitlyChanged.insecureEndpoint, "http://provider.example:8081");

  const risk = createMediaRiskConfirmationAdapter();
  risk.confirm("http://provider.example:8080");
  assert.equal(risk.isConfirmed("http://provider.example:8080"), true);
  assert.equal(risk.isConfirmed("http://provider.example:8081"), false);
  assert.equal(risk.isConfirmed("https://provider.example:8080"), false);
});

test("approved HTTP sends the API key and article body only to the configured endpoint", async () => {
  const requests = [];
  global.fetch = async (url, options) => {
    requests.push({ url, options });
    return jsonResponse(200, { data: { order_nid: "order-1" } });
  };
  const client = new MediaClient({
    apiKey: "fixture-key",
    baseUrl: "http://provider.example",
    allowInsecure: true,
    fetch: global.fetch,
  });
  await client.sendArticle({
    resourceId: "resource-1",
    title: "private title",
    content: "private body",
  });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, "http://provider.example/api/media/send");
  assert.equal(requests[0].options.redirect, "manual");
  const body = requests[0].options.body.toString("utf8");
  assert.match(body, /fixture-key/);
  assert.match(body, /private title/);
  assert.match(body, /private body/);
});

test("all 3xx responses are rejected without following Location", async () => {
  const requests = [];
  global.fetch = async (url, options) => {
    requests.push({ url, options });
    return {
      ok: false,
      status: 307,
      headers: { get: (name) => name.toLowerCase() === "location" ? "http://attacker.example/receive" : null },
      text: async () => "",
    };
  };
  const client = new MediaClient({ apiKey: "fixture-key", baseUrl: "https://media.example.test", fetch: global.fetch });

  await assert.rejects(client.sendArticle({
    resourceId: "resource-1",
    title: "private title",
    content: "private body",
  }), (error) => error.code === "MEDIA_REDIRECT_REJECTED");
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, "https://media.example.test/api/media/send");
  assert.equal(requests[0].options.redirect, "manual");
  assert.equal(requests.some((request) => request.url === "http://attacker.example/receive"), false);
});

test("server errors keep their stable classification even with non-JSON bodies", async () => {
  for (const [status, expected] of [[429, "MEDIA_REMOTE_REJECTED"], [503, "MEDIA_SERVER_ERROR"]]) {
    global.fetch = async () => ({ ok: false, status, text: async () => "upstream unavailable" });
    const client = new MediaClient({ apiKey: "fixture-key", baseUrl: "https://media.example.test", fetch: global.fetch });
    await assert.rejects(client.getBalance(), (error) => {
      return error.code === expected && error.category === (status >= 500 ? "remote" : "remote");
    });
  }
});

test("TLS certificate and hostname failures have stable transport diagnostics", async () => {
  for (const fixture of [
    { code: "CERT_HAS_EXPIRED", expected: "MEDIA_TLS_CERTIFICATE_ERROR" },
    { code: "ERR_TLS_CERT_ALTNAME_INVALID", expected: "MEDIA_TLS_HOSTNAME_MISMATCH" },
  ]) {
    global.fetch = async () => {
      throw Object.assign(new Error("fake TLS failure"), { code: fixture.code });
    };
    const client = new MediaClient({ apiKey: "fixture-key", baseUrl: "https://media.example.test", fetch: global.fetch });
    await assert.rejects(client.getBalance(), (error) => {
      return error.code === fixture.expected && error.category === "transport" && error.retryability === "manual-check";
    });
  }
});

test("connect and read timeout failures remain distinguishable", async () => {
  global.fetch = async () => {
    throw Object.assign(new Error("fake connect timeout"), { code: "ETIMEDOUT", phase: "connect" });
  };
  const connectClient = new MediaClient({ apiKey: "fixture-key", baseUrl: "https://media.example.test", fetch: global.fetch });
  await assert.rejects(connectClient.getBalance(), (error) => {
    return error.code === "MEDIA_CONNECT_TIMEOUT" && error.category === "transport";
  });

  global.fetch = async () => ({
    ok: true,
    status: 200,
    text: async () => {
      throw Object.assign(new Error("fake read timeout"), { code: "UND_ERR_BODY_TIMEOUT", phase: "read" });
    },
  });
  const readClient = new MediaClient({ apiKey: "fixture-key", baseUrl: "https://media.example.test", fetch: global.fetch });
  await assert.rejects(readClient.getBalance(), (error) => {
    return error.code === "MEDIA_READ_TIMEOUT" && error.category === "transport" && error.retryability === "manual-check";
  });
});

test("settings projection exposes only safe transport state and a masked key", () => {
  const adapter = createMediaSettingsAdapter();
  assert.equal(adapter.status(null, { source: "application", lastTest: null }).transport, "disabled");
  assert.equal(adapter.status({ apiKey: "fixture-key", baseUrl: "not-a-url", timeoutMs: 30000 }, { source: "application" }).transport, "invalid");
  const secure = adapter.validate({ apiKey: "fixture-key", baseUrl: "https://media.example.test", timeoutMs: 30000 });
  const status = adapter.status(secure, { source: "application", lastTest: null });
  assert.equal(status.transport, "secure");
  assert.equal(status.apiKeyMask, "fixt****-key");
  assert.equal(JSON.stringify(status).includes("fixture-key"), false);
  assert.equal(Object.hasOwn(status, "apiKey"), false);
});

test("incomplete environment media configuration is projected as invalid", () => {
  const service = createPlatformSettingsService({
    adapters: [createMediaSettingsAdapter()],
    env: { XQW_API_KEY: "fixture-key" },
  });
  const status = service.getStatus("media");
  assert.equal(status.transport, "invalid");
  assert.equal(status.source, "environment");
  assert.equal(JSON.stringify(status).includes("fixture-key"), false);
});
