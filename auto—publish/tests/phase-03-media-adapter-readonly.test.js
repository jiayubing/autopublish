"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { createMediaAdapter } = require("../src/platforms/media/adapter");

test("media adapter does not import or write the legacy order JSON store", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "src", "platforms", "media", "adapter.js"), "utf8");
  assert.doesNotMatch(source, /SubmissionOrderStore/);
  assert.doesNotMatch(source, /\.record\s*\(/);
});

test("media adapter maps the accepted remote order identity into its public result", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "media-adapter-behavior-"));
  const articleFile = path.join(root, "article.txt");
  const previousFetch = globalThis.fetch;
  const requests = [];
  try {
    fs.writeFileSync(articleFile, "synthetic article", "utf8");
    globalThis.fetch = async (url, options) => {
      requests.push({ url, options });
      return {
        status: 200,
        ok: true,
        text: async () => JSON.stringify({ data: { order_nid: "remote-order-1" } }),
      };
    };

    const result = await createMediaAdapter({
      mainProcess: true,
      apiKey: "synthetic-key",
      baseUrl: "https://supplier.example",
    }).publish({
      title: "Synthetic article",
      contentFile: articleFile,
      resourceId: "resource-1",
      thirdId: "submission-1",
    });

    assert.deepEqual(result, {
      platform: "media",
      status: "order_created",
      title: "Synthetic article",
      resourceId: "resource-1",
      thirdId: "submission-1",
      orderNid: "remote-order-1",
    });
    assert.equal(new URL(requests[0].url).pathname, "/api/media/send");
    assert.equal(requests[0].options.method, "POST");
  } finally {
    globalThis.fetch = previousFetch;
    fs.rmSync(root, { recursive: true, force: true });
  }
});
