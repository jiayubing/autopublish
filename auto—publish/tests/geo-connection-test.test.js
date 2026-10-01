"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  createGeoKnowledgeService,
} = require("../desktop/services/geo-knowledge-service");
const { createDoubaoGeoClient } = require("../src/content/doubao-geo-client");
const { CODING_BASE_URL } = require("../src/content/doubao-geo-endpoint");
const { setTimeout: delay } = require("node:timers/promises");
function service(t, client) {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "geo-probe-"));
  const instance = createGeoKnowledgeService({
    workspaceRoot,
    client,
    getClient: () => {
      throw new Error("must not read customer");
    },
    materialStore: {
      listMaterials: () => {
        throw new Error("must not read materials");
      },
    },
    configStore: {
      save: () => {
        throw new Error("must not save config");
      },
    },
  });
  t.after(() => {
    instance.dispose();
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  });
  return instance;
}

test("request deadline covers headers and body and never retries an uncertain timeout", async () => {
  for (const phase of ["headers", "body"]) {
    let calls = 0;
    const client = createDoubaoGeoClient({
      getConfig: () => ({ baseUrl: CODING_BASE_URL, apiKey: "fixture", model: "fixture" }),
      fetch: async (_, { signal }) => {
        calls++;
        if (phase === "headers") await delay(80, undefined, { signal });
        return { ok: true, json: async () => {
          if (phase === "body") await delay(80, undefined, { signal });
          return { status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: "OK" }] }] };
        } };
      },
    });
    await assert.rejects(client.request({ prompt: "synthetic", timeoutMs: 20 }), error =>
      error.code === "GEO_REQUEST_TIMEOUT" && error.message === "GEO_REQUEST_TIMEOUT",
    );
    assert.equal(calls, 1);
  }
});

test("a longer request deadline accepts a response that exceeds the shorter deadline", async () => {
  const client = createDoubaoGeoClient({
    getConfig: () => ({ baseUrl: CODING_BASE_URL, apiKey: "fixture", model: "fixture" }),
    fetch: async (_, { signal }) => {
      await delay(40, undefined, { signal });
      return { ok: true, json: async () => ({ output: [{ type: "message", content: [{ type: "output_text", text: "OK" }] }] }) };
    },
  });
  assert.equal((await client.request({ prompt: "synthetic", timeoutMs: 200 })).text, "OK");
});

test("request deadlines are bounded before dispatch and user cancellation remains distinct", async () => {
  let calls = 0;
  const client = createDoubaoGeoClient({
    getConfig: () => ({ baseUrl: CODING_BASE_URL, apiKey: "fixture", model: "fixture" }),
    fetch: async (_, { signal }) => {
      calls++;
      await delay(80, undefined, { signal });
      return { ok: true, json: async () => ({ output: [{ type: "message", content: [{ type: "output_text", text: "OK" }] }] }) };
    },
  });
  for (const timeoutMs of [0, -1, 1.5, 600001, "20"])
    await assert.rejects(client.request({ prompt: "synthetic", timeoutMs }), { code: "GEO_REQUEST_INVALID" });
  assert.equal(calls, 0);
  const controller = new AbortController();
  const pending = client.request({ prompt: "synthetic", timeoutMs: 200, signal: controller.signal });
  await delay(10);
  controller.abort();
  await assert.rejects(pending, { code: "GEO_CANCELLED" });
  assert.equal(calls, 1);
});
test("connection probes use one fixed request and return no customer or provider text", async (t) => {
  const requests = [];
  const instance = service(t, {
    request: async (input) => {
      requests.push(input);
      return {
        text: "sensitive provider text",
        citations: input.search ? [{ url: "https://example.com" }] : [],
      };
    },
  });
  assert.deepEqual(await instance.testConnection({ search: false }), {
    search: false,
    citationCount: 0,
  });
  assert.deepEqual(await instance.testConnection({ search: true }), {
    search: true,
    citationCount: 1,
  });
  assert.equal(requests.length, 2);
  assert.equal(requests[0].prompt, "连接测试：请只回复 OK。");
  assert.match(requests[1].prompt, /火山引擎官网/);
});
test("probe blocks double clicks, config writes and generation; disposal fences late success", async (t) => {
  let complete;
  let signal;
  const instance = service(t, {
    request: (input) => {
      signal = input.signal;
      return new Promise((resolve) => {
        complete = resolve;
      });
    },
  });
  const pending = instance.testConnection({ search: false });
  await assert.rejects(instance.testConnection({ search: true }), {
    code: "GEO_ALREADY_RUNNING",
  });
  await assert.rejects(instance.generate({ clientId: "fixture" }), {
    code: "GEO_ALREADY_RUNNING",
  });
  assert.throws(() => instance.saveConfig({}), { code: "GEO_ALREADY_RUNNING" });
  instance.dispose();
  assert.equal(signal.aborted, true);
  complete({ text: "OK", citations: [] });
  await assert.rejects(pending, { code: "GEO_CANCELLED" });
  await assert.rejects(instance.testConnection({ search: false }), {
    code: "GEO_CANCELLED",
  });
});
test("failed probes release busy state and never retry", async (t) => {
  let calls = 0;
  const instance = service(t, {
    request: async () => {
      calls++;
      throw Object.assign(new Error("private"), {
        code: "GEO_REQUEST_UNCERTAIN",
      });
    },
  });
  await assert.rejects(instance.testConnection({ search: false }), {
    code: "GEO_REQUEST_UNCERTAIN",
  });
  assert.equal(calls, 1);
  await assert.rejects(instance.testConnection({ search: false }), {
    code: "GEO_REQUEST_UNCERTAIN",
  });
  assert.equal(calls, 2);
});
test("transport distinguishes authentication, permission, capability and uncertain errors without raw details", async () => {
  for (const [status, code] of [
    [401, "GEO_AUTH_REJECTED"],
    [403, "GEO_PERMISSION_DENIED"],
    [400, "GEO_CAPABILITY_REJECTED"],
    [500, "GEO_REQUEST_FAILED"],
    [0, "GEO_REQUEST_UNCERTAIN"],
  ]) {
    let calls = 0;
    const client = createDoubaoGeoClient({
      getConfig: () => ({
        baseUrl: CODING_BASE_URL,
        model: "fixture",
        apiKey: "private-key",
      }),
      fetch: async () => {
        calls++;
        if (!status) throw new Error("private-key");
        return {
          ok: false,
          status,
          json: () => {
            throw new Error("must not expose provider body");
          },
        };
      },
    });
    await assert.rejects(
      client.request({ prompt: "synthetic" }),
      (error) => error.code === code && error.message === code,
    );
    assert.equal(calls, 1);
  }
});
