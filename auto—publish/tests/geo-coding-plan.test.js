"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createDoubaoGeoConfigStore } = require("../desktop/doubao-geo-config-store");
const { createDoubaoGeoClient } = require("../src/content/doubao-geo-client");
const { CODING_BASE_URL, STANDARD_BASE_URL } = require("../src/content/doubao-geo-endpoint");
const { createGeoKnowledgeResearch } = require("../src/content/geo-knowledge-research");
const { normalizeCandidate } = require("../src/content/geo-knowledge-merge");
test("new config defaults to Coding Plan; legacy retains standard address until explicitly saved", t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "geo-plan-"));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  const safeStorage = {isEncryptionAvailable: () => true, encryptString: s => Buffer.from(s), decryptString: b => b.toString()};
  const store = createDoubaoGeoConfigStore({userDataPath: root, safeStorage});
  assert.equal(store.status().baseUrl, CODING_BASE_URL);
  fs.writeFileSync(path.join(root, "doubao-geo.json"), JSON.stringify({version: 1, model: "fixture", webSearch: true, encryptedApiKey: Buffer.from("fixture-secret").toString("base64")}));
  assert.equal(store.read().baseUrl, STANDARD_BASE_URL);
  store.save({baseUrl: CODING_BASE_URL + "/", model: "ark-code-latest", apiKey: "", webSearch: true});
  assert.equal(store.read().baseUrl, CODING_BASE_URL);
  assert.equal(store.read().apiKey, "fixture-secret");
  assert.equal(createDoubaoGeoConfigStore({userDataPath: root, safeStorage}).status().baseUrl, CODING_BASE_URL);
  for (const baseUrl of [undefined, "https://evil.invalid/api/v3", CODING_BASE_URL + "/responses", STANDARD_BASE_URL + "?redirect=x"]) {
    assert.throws(() => store.save({baseUrl, model: "fixture", apiKey: "", webSearch: true}), {code: "GEO_CONFIG_INVALID"});
    assert.equal(store.read().baseUrl, CODING_BASE_URL);
  }
});
test("requests stay on the selected endpoint for extraction and search; rejection never falls back or retries", async () => {
  for (const baseUrl of [CODING_BASE_URL, STANDARD_BASE_URL]) {
    for (const search of [false, true]) {
      const urls = [];
      const client = createDoubaoGeoClient({getConfig: () => ({baseUrl, apiKey: "fixture", model: "ark-code-latest", webSearch: true}), fetch: async (url, options) => {
        urls.push(url);
        assert.equal(options.redirect, "error");
        assert.equal(JSON.parse(options.body).model, "ark-code-latest");
        assert.equal(Boolean(JSON.parse(options.body).tools), search);
        return {ok: false, status: 400};
      }});
      await assert.rejects(client.request({prompt: "synthetic", search}), {code: "GEO_CAPABILITY_REJECTED"});
      assert.deepEqual(urls, [baseUrl + "/responses"]);
    }
  }
});
test("unverified web output stops all remaining research tasks instead of pretending success", async () => {
  let calls = 0;
  const client = createDoubaoGeoClient({getConfig: () => ({baseUrl: CODING_BASE_URL, apiKey: "fixture", model: "fixture", webSearch: true}), fetch: async () => {
    calls++;
    const payload = calls === 1 ? {tasks: [{type: "industry", topic: "测试一", queries: ["一"]}, {type: "industry", topic: "测试二", queries: ["二"]}]} : {findings: [], unresolved: []};
    return {ok: true, json: async () => ({status: "completed", output: [{type: "message", content: [{type: "output_text", text: JSON.stringify(payload), annotations: []}]}]})};
  }});
  await assert.rejects(createGeoKnowledgeResearch({client}).enrich(normalizeCandidate({}, [], "client-1")), {code: "GEO_SEARCH_UNCONFIRMED"});
  assert.equal(calls, 2);
});
