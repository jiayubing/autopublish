"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createGeoKnowledgeResearch } = require("../src/content/geo-knowledge-research");
const { normalizeCandidate } = require("../src/content/geo-knowledge-merge");
const { mergeKnowledge } = require("../src/content/geo-knowledge-merge");
const { stableId } = require("../src/content/geo-knowledge-schema");
const facts = () => normalizeCandidate({ profile: { fields: {} } }, [], "client-1");
test("profile enrichment adds non-conflicting fields and reports only contradictory fields", () => {
  const source = [{id: "s", type: "client_input", title: "合成资料"}];
  const make = fields => normalizeCandidate({profile: {fields, basis: "fact", sourceIds: ["s"]}}, source, "client-1");
  const original = make({name: "合成客户", location: "郑州"});
  const added = mergeKnowledge(original, make({location: "郑州", name: "合成客户", serviceArea: "本地"}));
  assert.deepEqual(added.profile.fields, {location: "郑州", name: "合成客户", serviceArea: "本地"});
  assert.equal(added.restrictions.length, 0);
  const conflict = mergeKnowledge(original, make({name: "合成客户", location: "洛阳", serviceArea: "本地"}));
  assert.equal(conflict.profile.fields.location, "郑州");
  assert.equal(conflict.profile.fields.serviceArea, "本地");
  assert.equal(conflict.restrictions.length, 1);
  assert.match(conflict.restrictions[0].description, /郑州/);
  assert.match(conflict.restrictions[0].description, /洛阳/);
  assert.doesNotMatch(conflict.restrictions[0].description, /serviceArea/);
});
test("partial research keeps trusted citations and does not promote invented URLs", async () => {
  let count = 0;
  const client = { async request(input) {
    count++;
    if (count === 1) return { text: JSON.stringify({ tasks: [{ type: "industry", topic: "选择因素", queries: ["测试"] }, { type: "client", topic: "客户信息", queries: ["测试"] }] }) };
    if (count === 2) return { text: JSON.stringify({ findings: [{ statement: "合成行业知识", category: "industry", urls: ["https://example.com", "https://invented.invalid"] }], unresolved: [] }), citations: [{ title: "合成来源", url: "https://example.com" }] };
    if (count === 3) throw Object.assign(new Error("private transport detail"), { code: "GEO_REQUEST_UNCERTAIN" });
    assert.equal(input.search, undefined);
    return { text: JSON.stringify({ profile: { fields: {} }, externalResearch: [{ name: "选择因素", basis: "research", sourceIds: [stableId("source", "https://example.com")] }] }) };
  } };
  const result = await createGeoKnowledgeResearch({ client }).enrich(facts());
  assert.equal(count, 4);
  assert.equal(result.status.outcome, "partial");
  assert.equal(result.sources.length, 1);
  assert.equal(result.sources[0].url, "https://example.com");
  assert.equal(result.sources[0].type, "third_party");
  assert.equal(result.externalResearch[0].basis, "research");
  assert.equal(JSON.stringify(result).includes("private transport detail"), false);
});
test("invalid oversized plan has one repair and cannot launch search", async () => {
  let count = 0;
  const client = { async request(input) {
    count++; assert.equal(input.search, undefined);
    return { text: JSON.stringify({ tasks: Array.from({ length: 9 }, () => ({ type: "industry", topic: "过量", queries: ["测试"] })) }) };
  } };
  await assert.rejects(createGeoKnowledgeResearch({ client }).enrich(facts()), { code: "GEO_SCHEMA_INVALID" });
  assert.equal(count, 2);
});
test("synthesis cannot drop extracted facts and config failure is not partial success", async () => {
  const existing = normalizeCandidate({ profile: { fields: { name: "合成店铺" }, basis: "fact", sourceIds: ["s"] }, offerings: [{ name: "产品", basis: "fact", sourceIds: ["s"] }] }, [{ id: "s", type: "client_input", title: "基本资料" }], "client-1");
  let calls = 0;
  const research = createGeoKnowledgeResearch({ client: { async request() { return { text: JSON.stringify(++calls === 1 ? { tasks: [] } : { profile: { fields: {} } }) }; } } });
  const result = await research.enrich(existing);
  assert.equal(result.offerings.length, 1);
  assert.equal(result.profile.fields.name, "合成店铺");
  const broken = createGeoKnowledgeResearch({ client: { async request() { throw Object.assign(new Error(), { code: "GEO_CONFIG_REJECTED" }); } } });
  await assert.rejects(broken.enrich(facts()), { code: "GEO_CONFIG_REJECTED" });
});
