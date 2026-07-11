const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { createAiClient } = require("../src/content/ai-client");

function config(overrides) {
  return Object.assign({
    apiKey: "test-secret-key",
    baseUrl: "https://provider.example/v1",
    model: "test-model",
    timeoutMs: 50
  }, overrides);
}

function response(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status: status,
    text: async function() { return typeof payload === "string" ? payload : JSON.stringify(payload); }
  };
}

describe("ai client", function() {
  it("posts model and messages to the OpenAI compatible chat endpoint", async function() {
    let request;
    const client = createAiClient(config({ fetch: async function(url, options) {
      request = { url: url, options: options };
      return response(200, { choices: [{ message: { content: "Generated article" } }] });
    } }));

    const content = await client.complete([{ role: "system", content: "Rules" }, { role: "user", content: "Write" }]);

    assert.equal(content, "Generated article");
    assert.equal(request.url, "https://provider.example/v1/chat/completions");
    assert.equal(request.options.headers.Authorization, "Bearer test-secret-key");
    assert.equal(request.options.headers["Content-Type"], "application/json");
    assert.deepStrictEqual(JSON.parse(request.options.body), {
      model: "test-model",
      messages: [{ role: "system", content: "Rules" }, { role: "user", content: "Write" }]
    });
  });

  it("validates required configuration and rejects a full completion endpoint", function() {
    ["apiKey", "baseUrl", "model"].forEach(function(field) {
      const value = config();
      value[field] = "";
      assert.throws(function() { createAiClient(value); }, function(error) { return error.code === "AI_CONFIG_INVALID"; });
    });
    assert.throws(function() {
      createAiClient(config({ baseUrl: "https://provider.example/v1/chat/completions" }));
    }, function(error) { return error.code === "AI_CONFIG_INVALID"; });
    assert.throws(function() {
      createAiClient(config({ baseUrl: "https://provider.example/v1?target=chat" }));
    }, function(error) { return error.code === "AI_CONFIG_INVALID"; });
  });

  it("maps provider failures without exposing the API key", async function() {
    for (const item of [[401, "AI_UNAUTHORIZED"], [429, "AI_RATE_LIMITED"], [500, "AI_REQUEST_FAILED"]]) {
      const client = createAiClient(config({ fetch: async function() { return response(item[0], {}); } }));
      await assert.rejects(client.complete([]), function(error) {
        return error.code === item[1] && !String(error.message).includes("test-secret-key");
      });
    }
  });

  it("maps network failures, invalid JSON, and missing output to safe errors", async function() {
    const cases = [
      { fetch: async function() { throw new Error("network down"); }, code: "AI_REQUEST_FAILED" },
      { fetch: async function() { return response(200, "not json"); }, code: "AI_REQUEST_FAILED" },
      { fetch: async function() { return response(200, { choices: [] }); }, code: "AI_EMPTY_RESPONSE" },
      { fetch: async function() { return response(200, { choices: [{ message: { content: "  " } }] }); }, code: "AI_EMPTY_RESPONSE" }
    ];
    for (const item of cases) {
      const client = createAiClient(config({ fetch: item.fetch }));
      await assert.rejects(client.complete([]), function(error) { return error.code === item.code; });
    }
  });

  it("aborts a request that exceeds the configured timeout", async function() {
    const client = createAiClient(config({ timeoutMs: 5, fetch: function(url, options) {
      return new Promise(function(resolve, reject) {
        options.signal.addEventListener("abort", function() {
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        });
      });
    } }));
    await assert.rejects(client.complete([]), function(error) { return error.code === "AI_TIMEOUT"; });
  });
});
