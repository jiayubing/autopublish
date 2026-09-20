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
const { validateKnowledge } = require("../src/content/geo-knowledge-schema");
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
  assert.throws(() => store.save({ ...saved, schemaVersion: 3 }, 1), { code: "GEO_KNOWLEDGE_INVALID" });
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
  const client = createDoubaoGeoClient({ getConfig: () => ({ apiKey: "synthetic", model: "synthetic-model", baseUrl: "https://ark.cn-beijing.volces.com/api/plan/v3" }), fetch: async (url, options) => {
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
  config.save({ model: "synthetic", apiKey: "secret-fixture", webSearch: true, baseUrl: "https://ark.cn-beijing.volces.com/api/plan/v3" });
  assert.equal(JSON.stringify(config.status()).includes("secret-fixture"), false);
  assert.equal(fs.readFileSync(path.join(root, "doubao-geo.json"), "utf8").includes("secret-fixture"), false);
  config.save({ model: "changed", apiKey: "", webSearch: false, baseUrl: "https://ark.cn-beijing.volces.com/api/plan/v3" });
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

test("V2 profile projects only accepted fact or research claims", () => {
  const derived = normalizeCandidate(
    { profile: { fields: { name: "推导名称" }, basis: "derived", sourceIds: [] } },
    [],
    "client-1",
  );
  assert.deepEqual(derived.profile.fields, {});
  assert.equal(derived.profile.claims[0].status, "candidate");
  const invalid = structuredClone(derived);
  invalid.profile.claims[0].status = "accepted";
  invalid.profile.fields.name = "推导名称";
  assert.throws(() => validateKnowledge(invalid), { code: "GEO_KNOWLEDGE_INVALID" });
});

test("new evidence sections and recommendation relations are enforced", () => {
  assert.throws(
    () => normalizeCandidate({ profile: { fields: {} }, history: [{ name: "开业", basis: "candidate", sourceIds: [] }] }, [], "client-1"),
    { code: "GEO_KNOWLEDGE_INVALID" },
  );
  assert.throws(
    () => normalizeCandidate({ profile: { fields: {} }, recommendationAngles: [{ name: "无依据角度", basis: "derived", sourceIds: [] }] }, [], "client-1"),
    { code: "GEO_KNOWLEDGE_INVALID" },
  );
  const related = normalizeCandidate({
    profile: { fields: {} },
    offerings: [{ name: "合成产品", basis: "candidate", sourceIds: [] }],
    recommendationAngles: [{ name: "产品角度", basis: "derived", sourceIds: [], relatedOfferingNames: ["合成产品"] }],
  }, [], "client-1");
  assert.equal(related.recommendationAngles[0].relatedOfferingIds[0], related.offerings[0].id);
});

test("legacy V1 is detected and replaced only after valid V2 generation", async t => {
  const root = workspace(t);
  const directory = path.join(root, ".autopublish", "geo-knowledge");
  fs.mkdirSync(directory, { recursive: true });
  const legacy = {
    schemaVersion: 1, clientId: "client-1", revision: 7, profile: {}, sources: [],
    offerings: [], capabilities: [], scenarios: [], geoQuestions: [], externalResearch: [], restrictions: [],
  };
  const file = path.join(directory, "client-1.json");
  fs.writeFileSync(file, JSON.stringify(legacy));
  const store = createGeoKnowledgeStore({ workspaceRoot: root });
  assert.equal(store.inspect("client-1").status, "legacy_v1");
  assert.equal(store.load("client-1"), null);
  const failed = createGeoKnowledgeApplication({
    store, getClient: () => ({ name: "合成客户" }), materialStore: { async listMaterials() { return []; } },
    research: { async extract() { throw Object.assign(new Error(), { code: "GEO_SCHEMA_INVALID" }); } },
  });
  await assert.rejects(failed.generate("client-1"), { code: "GEO_SCHEMA_INVALID" });
  assert.deepEqual(JSON.parse(fs.readFileSync(file, "utf8")), legacy);
  const application = createGeoKnowledgeApplication({
    store, getClient: () => ({ name: "合成客户" }), materialStore: { async listMaterials() { return []; } },
    research: { async extract() { return document("新版客户"); } },
  });
  const saved = await application.generate("client-1");
  assert.equal(saved.schemaVersion, 2);
  assert.equal(saved.revision, 1);
  assert.equal(saved.profile.fields.name, "新版客户");
});

test("source confirmation is bounded, safe and stale-protected", t => {
  const root = workspace(t);
  const web = { id: "source-web", type: "third_party", title: "搜索结果", url: "https://example.com", fetchedAt: new Date().toISOString(), citationVerified: true };
  const store = createGeoKnowledgeStore({ workspaceRoot: root });
  const saved = store.save(normalizeCandidate({ profile: { fields: { name: "公开名称" }, basis: "research", sourceIds: [web.id] } }, [web], "client-1"), 0);
  const confirmed = store.confirmSourceType("client-1", saved.revision, web.id, "official_web");
  assert.equal(confirmed.sources[0].type, "official_web");
  assert.equal(confirmed.profile.claims[0].basis, "research");
  assert.throws(() => store.confirmSourceType("client-1", saved.revision, web.id, "client_public"), { code: "GEO_REVISION_CONFLICT" });
  assert.throws(() => store.confirmSourceType("client-1", confirmed.revision, web.id, "client_public"), { code: "GEO_SOURCE_INVALID" });
});

test("manual conflict resolution creates a fact claim and preserves the selected observation", t => {
  const store = createGeoKnowledgeStore({ workspaceRoot: workspace(t) });
  const first = store.save(document("名称甲"), 0);
  const conflicted = store.save(mergeKnowledge(first, document("名称乙")), first.revision);
  const conflict = conflicted.restrictions.find(item => item.type === "conflict");
  const candidateClaim = conflicted.profile.claims.find(claim => claim.value === "名称乙");
  const resolved = store.resolveConflict("client-1", conflicted.revision, conflict.id, { claimId: candidateClaim.id });
  assert.equal(resolved.profile.fields.name, "名称乙");
  assert.equal(resolved.profile.claims.find(claim => claim.id === candidateClaim.id).status, "candidate");
  const accepted = resolved.profile.claims.find(claim => claim.status === "accepted");
  assert.deepEqual({ basis: accepted.basis, origin: accepted.origin, locked: accepted.locked }, { basis: "fact", origin: "manual", locked: true });
  assert.equal(resolved.sources.find(value => value.id === accepted.sourceIds[0]).type, "client_input");
  const reopened = mergeKnowledge(resolved, document("名称丙"));
  assert.equal(reopened.restrictions.find(item => item.id === conflict.id).conflictStatus, "open");
});
