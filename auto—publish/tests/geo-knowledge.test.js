"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createGeoKnowledgeStore } = require("../src/content/geo-knowledge-store");
const { normalizeCandidate, mergeKnowledge } = require("../src/content/geo-knowledge-merge");
const { createGeoKnowledgeApplication } = require("../src/content/geo-knowledge-application");
const { createGeoKnowledgeResearch } = require("../src/content/geo-knowledge-research");
const { createDoubaoGeoClient } = require("../src/content/doubao-geo-client");
const source = { id: "source-1", type: "client_input", title: "客户填写" };
function candidate(name = "合成门店") { return { profile: { fields: { name }, basis: "fact", sourceIds: [source.id] } }; }
function document(name) { return normalizeCandidate(candidate(name), [source], "client-1"); }
function workspace(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "geo-test-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}
test("atomic persistence, revision and malformed content protect previous knowledge", t => {
  const root = workspace(t);
  const store = createGeoKnowledgeStore({ workspaceRoot: root });
  assert.equal(store.load("client-1"), null);
  const saved = store.save(document(), 0);
  assert.equal(saved.revision, 1);
  assert.deepEqual(createGeoKnowledgeStore({ workspaceRoot: root }).load("client-1"), saved);
  assert.throws(() => store.save(document("stale"), 0), { code: "GEO_REVISION_CONFLICT" });
  assert.throws(() => store.save({ ...saved, schemaVersion: 2 }, 1), { code: "GEO_KNOWLEDGE_INVALID" });
  const broken = createGeoKnowledgeStore({ workspaceRoot: root, atomicWriter: { write() { throw new Error("disk-full"); } } });
  assert.throws(() => broken.save(document(), 1), { code: "GEO_SAVE_FAILED" });
  assert.deepEqual(store.load("client-1"), saved);
  assert.throws(() => store.load("../escape"), { code: "GEO_PATH_UNSAFE" });
});
test("manual lock survives research and conflicting facts remain unresolved", t => {
  const store = createGeoKnowledgeStore({ workspaceRoot: workspace(t) });
  let saved = store.save(document(), 0);
  const conflict = mergeKnowledge(saved, document("另一名称"));
  assert.equal(conflict.profile.fields.name, "合成门店");
  assert.equal(conflict.restrictions[0].type, "conflict");
  saved = store.edit("client-1", saved.revision, "profile", saved.profile.id, { fields: { name: "人工名称" } });
  assert.equal(saved.profile.locked, true);
  assert.equal(saved.sources.find(source => source.id === saved.profile.sourceIds[0]).title, "人工编辑确认");
  assert.notDeepEqual(saved.profile.sourceIds, [source.id]);
  assert.equal(mergeKnowledge(saved, document("AI新名称")).profile.fields.name, "人工名称");
});
test("unreferenced fact is candidate; invented references cannot enter canonical state", () => {
  const input = candidate(); input.profile.sourceIds = [];
  assert.equal(normalizeCandidate(input, [], "client-1").profile.basis, "candidate");
  input.profile.sourceIds = ["invented"];
  assert.throws(() => normalizeCandidate(input, [], "client-1"), { code: "GEO_SOURCE_INVALID" });
});
test("small material input works; malformed output gets only one repair", async () => {
  let calls = 0;
  const research = createGeoKnowledgeResearch({ client: { async request() {
    calls++; return { text: calls === 1 ? "not json" : JSON.stringify({ profile: { fields: {} } }), citations: [] };
  } } });
  const result = await research.extract({ clientId: "client-1", clientName: "合成门店", materials: [] });
  assert.equal(result.offerings.length, 0); assert.equal(calls, 2);
  const broken = createGeoKnowledgeResearch({ client: { async request() { throw Object.assign(new Error(), { code: "GEO_REQUEST_UNCERTAIN" }); } } });
  await assert.rejects(broken.extract({ clientId: "client-1", materials: [] }), { code: "GEO_REQUEST_UNCERTAIN" });
});
test("generation rejects duplicates and concurrent edits preserve user changes", async t => {
  const store = createGeoKnowledgeStore({ workspaceRoot: workspace(t) });
  const first = store.save(document(), 0);
  let finish;
  const application = createGeoKnowledgeApplication({ store, getClient: () => ({ name: "合成门店" }), materialStore: { async listMaterials() { return []; } }, research: { extract: () => new Promise(resolve => { finish = resolve; }) } });
  const running = application.generate("client-1");
  await new Promise(resolve => setImmediate(resolve));
  await assert.rejects(application.generate("client-1"), { code: "GEO_ALREADY_RUNNING" });
  store.edit("client-1", first.revision, "profile", first.profile.id, { fields: { name: "并发人工编辑" } });
  finish(document());
  await assert.rejects(running, { code: "GEO_REVISION_CONFLICT" });
  assert.equal(store.load("client-1").profile.fields.name, "并发人工编辑");
});
test("Responses transport separates trusted citations and never retries uncertain requests", async () => {
  let calls = 0;
  const client = createDoubaoGeoClient({ getConfig: () => ({ apiKey: "synthetic", model: "synthetic-model", baseUrl: "https://ark.cn-beijing.volces.com/api/coding/v3" }), fetch: async (url, options) => {
    calls++; assert.equal(JSON.parse(options.body).tools[0].type, "web_search");
    return { ok: true, json: async () => ({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: "{}", annotations: [{ type: "url_citation", title: "来源", url: "https://example.com" }] }] }] }) };
  } });
  assert.equal((await client.request({ prompt: "合成测试", search: true })).citations.length, 1); assert.equal(calls, 1);
});

test("configuration stores encrypted credentials and status never returns the key", t => {
  const { createDoubaoGeoConfigStore } = require("../desktop/doubao-geo-config-store");
  const root = workspace(t);
  const safeStorage = { isEncryptionAvailable: () => true, encryptString: s => Buffer.from(s.split("").reverse().join("")), decryptString: b => b.toString().split("").reverse().join("") };
  const config = createDoubaoGeoConfigStore({ userDataPath: root, safeStorage });
  assert.equal(config.status().configured, false);
  config.save({ model: "synthetic", apiKey: "secret-fixture", webSearch: true, baseUrl: "https://ark.cn-beijing.volces.com/api/coding/v3" });
  assert.equal(JSON.stringify(config.status()).includes("secret-fixture"), false);
  assert.equal(fs.readFileSync(path.join(root, "doubao-geo.json"), "utf8").includes("secret-fixture"), false);
  config.save({ model: "changed", apiKey: "", webSearch: false, baseUrl: "https://ark.cn-beijing.volces.com/api/coding/v3" });
  assert.equal(config.read().apiKey, "secret-fixture");
});

test("cancelled generation cannot save a late successful response", async t => {
  const store = createGeoKnowledgeStore({ workspaceRoot: workspace(t) });
  let finish;
  const application = createGeoKnowledgeApplication({ store, getClient: () => ({}), materialStore: { async listMaterials() { return []; } }, research: { extract: () => new Promise(resolve => { finish = resolve; }) } });
  const pending = application.generate("client-1");
  await new Promise(resolve => setImmediate(resolve));
  application.cancel("client-1"); finish(document());
  await assert.rejects(pending, { code: "GEO_CANCELLED" });
  assert.equal(store.load("client-1"), null);
});

test("knowledge refuses a linked storage directory", t => {
  const root = workspace(t);
  const outside = workspace(t);
  fs.mkdirSync(path.join(root, ".autopublish"));
  fs.symlinkSync(outside, path.join(root, ".autopublish", "geo-knowledge"), "junction");
  const store = createGeoKnowledgeStore({ workspaceRoot: root });
  assert.throws(() => store.save(document(), 0), { code: "GEO_PATH_UNSAFE" });
  assert.deepEqual(fs.readdirSync(outside), []);
});
