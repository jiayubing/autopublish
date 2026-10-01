"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  createDoubaoGeoConfigStore,
} = require("../desktop/doubao-geo-config-store");
const { createDoubaoGeoClient } = require("../src/content/doubao-geo-client");
const {
  CODING_BASE_URL,
  STANDARD_BASE_URL,
} = require("../src/content/doubao-geo-endpoint");
test("new config defaults to Coding Plan; legacy retains standard address until explicitly saved", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "geo-plan-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const safeStorage = {
    isEncryptionAvailable: () => true,
    encryptString: (s) => Buffer.from(s),
    decryptString: (b) => b.toString(),
  };
  const store = createDoubaoGeoConfigStore({ userDataPath: root, safeStorage });
  assert.equal(store.status().baseUrl, CODING_BASE_URL);
  fs.writeFileSync(
    path.join(root, "doubao-geo.json"),
    JSON.stringify({
      version: 1,
      model: "fixture",
      webSearch: true,
      encryptedApiKey: Buffer.from("fixture-secret").toString("base64"),
    }),
  );
  assert.equal(store.read().baseUrl, STANDARD_BASE_URL);
  store.save({
    baseUrl: CODING_BASE_URL + "/",
    model: "ark-code-latest",
    apiKey: "",
    webSearch: true,
  });
  assert.equal(store.read().baseUrl, CODING_BASE_URL);
  assert.equal(store.read().apiKey, "fixture-secret");
  assert.equal(
    createDoubaoGeoConfigStore({ userDataPath: root, safeStorage }).status()
      .baseUrl,
    CODING_BASE_URL,
  );
  fs.writeFileSync(
    path.join(root, "doubao-geo.json"),
    JSON.stringify({
      version: 2,
      baseUrl: "https://ark.cn-beijing.volces.com/api/coding/v3",
      model: "fixture",
      webSearch: true,
      encryptedApiKey: Buffer.from("fixture-secret").toString("base64"),
    }),
  );
  assert.equal(store.read().baseUrl, CODING_BASE_URL);
  store.save({
    baseUrl: CODING_BASE_URL,
    model: "fixture",
    apiKey: "",
    webSearch: true,
  });
  for (const baseUrl of [
    undefined,
    "https://evil.invalid/api/v3",
    CODING_BASE_URL + "/responses",
    STANDARD_BASE_URL + "?redirect=x",
  ]) {
    assert.throws(
      () =>
        store.save({ baseUrl, model: "fixture", apiKey: "", webSearch: true }),
      { code: "GEO_CONFIG_INVALID" },
    );
    assert.equal(store.read().baseUrl, CODING_BASE_URL);
  }
});
test("requests stay on the selected endpoint for extraction and search; rejection never falls back or retries", async () => {
  for (const baseUrl of [CODING_BASE_URL, STANDARD_BASE_URL]) {
    for (const search of [false, true]) {
      const urls = [];
      const client = createDoubaoGeoClient({
        getConfig: () => ({
          baseUrl,
          apiKey: "fixture",
          model: "ark-code-latest",
          webSearch: true,
        }),
        fetch: async (url, options) => {
          urls.push(url);
          assert.equal(options.redirect, "error");
          assert.equal(JSON.parse(options.body).model, "ark-code-latest");
          assert.equal(Boolean(JSON.parse(options.body).tools), search);
          return { ok: false, status: 400 };
        },
      });
      await assert.rejects(client.request({ prompt: "synthetic", search }), {
        code: "GEO_CAPABILITY_REJECTED",
      });
      assert.deepEqual(urls, [baseUrl + "/responses"]);
    }
  }
});
