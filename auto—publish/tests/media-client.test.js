const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const { MediaClient } = require("../src/platforms/media/media-client");

describe("media-client", function() {
  let originalFetch;
  let request;

  beforeEach(function() {
    originalFetch = global.fetch;
    request = null;
    global.fetch = async function(url, options) {
      request = {
        url: url,
        options: options
      };
      return {
        ok: true,
        status: 200,
        text: async function() {
          return JSON.stringify({ code: 0, data: [] });
        }
      };
    };
  });

  afterEach(function() {
    global.fetch = originalFetch;
  });

  it("sends the provider page_size field in mediaList requests", async function() {
    const client = new MediaClient({
      apiKey: "test-key",
      baseUrl: "http://example.test",
      allowInsecure: true
    });

    await client.mediaList({ page: 2, pageSize: 30 });

    assert.ok(request, "fetch was not called");
    const body = request.options.body.toString("utf8");
    assert.match(body, /name="page"\r?\n\r?\n2/);
    assert.match(body, /name="page_size"\r?\n\r?\n30/);
    assert.doesNotMatch(body, /name="pageSize"/);
    assert.match(body, /name="api_key"\r?\n\r?\ntest-key/);
    assert.equal(request.options.redirect, "manual");
  });

  it("sends the saved title, HTML content, and attempt identity in media submissions", async function() {
    const client = new MediaClient({
      apiKey: "test-key",
      baseUrl: "http://example.test",
      allowInsecure: true
    });

    await client.sendArticle({
      resourceId: "resource-1",
      title: "用户保存的投稿标题",
      content: "<p>第一段</p>\n<p>第二段</p>",
      thirdId: "attempt-fixture"
    });

    const body = request.options.body.toString("utf8");
    assert.match(body, /name="resource_id"\r?\n\r?\nresource-1/);
    assert.match(body, /name="title"\r?\n\r?\n用户保存的投稿标题/);
    assert.match(body, /name="content"\r?\n\r?\n<p>第一段<\/p>\r?\n<p>第二段<\/p>/);
    assert.match(body, /name="third_id"\r?\n\r?\nattempt-fixture/);
  });

  it("refuses redirects instead of forwarding the API key and body to another endpoint", async function() {
    global.fetch = async function(url, options) {
      request = { url: url, options: options };
      return { ok: false, status: 307, text: async function() { return ""; } };
    };
    const client = new MediaClient({ apiKey: "test-key", baseUrl: "https://media.example.test" });

    await assert.rejects(client.getBalance(), /拒绝重定向/);
    assert.equal(request.options.redirect, "manual");
  });
});
