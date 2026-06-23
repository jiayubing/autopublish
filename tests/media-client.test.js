import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import { MediaClient } from "../src/core/media-client.js";

const TEST_API_KEY = "test-key-media-client-123";

let originalFetch;

function mockFetch(responsesByPath) {
  originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const path = new URL(url).pathname;
    const res = responsesByPath[path];
    if (res) {
      return {
        ok: res.ok !== false,
        status: res.status ?? 200,
        text: async () => res.body,
      };
    }
    return { ok: true, status: 200, text: async () => JSON.stringify({ code: 1 }) };
  };
}

function restoreFetch() {
  if (originalFetch) {
    globalThis.fetch = originalFetch;
    originalFetch = null;
  }
}

afterEach(restoreFetch);

function createClient(overrides = {}) {
  return new MediaClient({ apiKey: TEST_API_KEY, ...overrides });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("MediaClient constructor", () => {
  it("should create a client with a valid API key", () => {
    assert.ok(createClient() instanceof MediaClient);
  });

  it("should throw when API key is missing", () => {
    assert.throws(
      () => new MediaClient({ apiKey: "" }),
      /requires an apiKey/
    );
  });

  it("should strip trailing slash from base URL", () => {
    const client = new MediaClient({
      apiKey: TEST_API_KEY,
      baseUrl: "https://example.com/api/",
    });
    assert.strictEqual(client.baseUrl, "https://example.com/api");
  });
});

describe("MediaClient.getBalance", () => {
  it("should call correct endpoint and return data", async () => {
    let capturedUrl, capturedMethod;
    globalThis.fetch = async (url, init) => {
      capturedUrl = url;
      capturedMethod = init.method;
      return {
        ok: true, status: 200,
        text: async () => JSON.stringify({ code: 1, data: { balance: 100 } }),
      };
    };

    const result = await createClient().getBalance();
    assert.strictEqual(result.code, 1);
    assert.strictEqual(result.data.balance, 100);
    assert.ok(capturedUrl.includes("/api/geo/get_balance"));
    assert.strictEqual(capturedMethod, "POST");
  });

  it("should handle non-JSON response", async () => {
    mockFetch({
      "/api/geo/get_balance": {
        body: "not json at all",
        status: 502,
      },
    });
    await assert.rejects(
      () => createClient().getBalance(),
      /非 JSON/
    );
  });
});

describe("MediaClient.sendArticle", () => {
  it("should throw when resourceId is missing", async () => {
    await assert.rejects(
      () => createClient().sendArticle({ resourceId: "", title: "T", content: "C" }),
      /缺少 resourceId/
    );
  });

  it("should throw when title is missing", async () => {
    await assert.rejects(
      () => createClient().sendArticle({ resourceId: "1", title: "", content: "C" }),
      /缺少 title/
    );
  });

  it("should throw when content is missing", async () => {
    await assert.rejects(
      () => createClient().sendArticle({ resourceId: "1", title: "T", content: "" }),
      /缺少 content/
    );
  });

  it("should call correct endpoint with successful response", async () => {
    let capturedUrl;
    globalThis.fetch = async (url) => {
      capturedUrl = url;
      return {
        ok: true, status: 200,
        text: async () => JSON.stringify({ code: 1, data: { order_nid: "NID-001" } }),
      };
    };

    const res = await createClient().sendArticle({
      resourceId: 123, title: "测试", content: "<p>HTML</p>",
      remark: "备注", thirdId: "MYID",
    });
    assert.strictEqual(res.data.order_nid, "NID-001");
    assert.ok(capturedUrl.includes("/api/media/send"));
  });
});

describe("MediaClient.orderInfo", () => {
  it("should throw when orderNids is empty", async () => {
    await assert.rejects(
      () => createClient().orderInfo([]),
      /缺少 order_nids/
    );
  });

  it("should call correct endpoint for single order", async () => {
    let capturedUrl;
    globalThis.fetch = async (url) => {
      capturedUrl = url;
      return {
        ok: true, status: 200,
        text: async () => JSON.stringify({ code: 1, data: [{ order_nid: "A" }] }),
      };
    };

    const res = await createClient().orderInfo("ORDER-001");
    assert.strictEqual(res.data[0].order_nid, "A");
    assert.ok(capturedUrl.includes("/api/media/order_info"));
  });
});

describe("MediaClient error handling", () => {
  it("should handle network errors", async () => {
    globalThis.fetch = () => { throw new Error("connect ECONNREFUSED"); };
    await assert.rejects(
      () => createClient().getBalance(),
      /网络请求失败/
    );
  });

  it("should handle API error responses", async () => {
    mockFetch({
      "/api/geo/get_balance": {
        ok: false, status: 401,
        body: JSON.stringify({ code: 0, msg: "Invalid API Key" }),
      },
    });
    await assert.rejects(
      () => createClient().getBalance(),
      /Invalid API Key/
    );
  });
});
