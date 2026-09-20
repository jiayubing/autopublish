"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  createGeoKnowledgeResearch,
  createRequestBudget,
  validateTasks,
} = require("../src/content/geo-knowledge-research");
const { normalizeCandidate, mergeKnowledge } = require("../src/content/geo-knowledge-merge");
const { stableId } = require("../src/content/geo-knowledge-schema");
const facts = () => normalizeCandidate({ profile: { fields: {} } }, [], "client-1");
const emptySearch = { findings: [], discoveries: [], unresolved: [] };

test("profile enrichment adds non-conflicting fields and reports only contradictory fields", () => {
  const source = [{ id: "s", type: "client_input", title: "合成资料" }];
  const make = fields => normalizeCandidate({ profile: { fields, basis: "fact", sourceIds: ["s"] } }, source, "client-1");
  const original = make({ name: "合成客户", location: "郑州" });
  const added = mergeKnowledge(original, make({ location: "郑州", name: "合成客户", serviceArea: "本地" }));
  assert.deepEqual(added.profile.fields, { location: "郑州", name: "合成客户", serviceArea: "本地" });
  assert.equal(added.restrictions.length, 0);
  const conflict = mergeKnowledge(original, make({ name: "合成客户", location: "洛阳", serviceArea: "本地" }));
  assert.equal(conflict.profile.fields.location, "郑州");
  assert.equal(conflict.profile.fields.serviceArea, "本地");
  assert.equal(conflict.restrictions.length, 1);
  assert.match(conflict.restrictions[0].description, /郑州/);
  assert.match(conflict.restrictions[0].description, /洛阳/);
  assert.doesNotMatch(conflict.restrictions[0].description, /serviceArea/);
});

test("two rounds use only cited discovery and preserve partial task failure", async () => {
  let count = 0;
  const client = { async request(input) {
    count++;
    if (count === 1) return { text: JSON.stringify({ tasks: [
      { type: "customer_entity", topic: "客户实体", queries: ["合成客户"] },
      { type: "generic_industry", topic: "选择因素", queries: ["行业"] },
    ] }) };
    if (count === 2) return {
      text: JSON.stringify({
        findings: [{ statement: "合成客户公开信息", category: "client_fact", urls: ["https://example.com", "https://invented.invalid"] }],
        discoveries: [
          { type: "alias", value: "已引用别名", urls: ["https://example.com"] },
          { type: "brand", value: "无引用品牌", urls: ["https://invented.invalid"] },
        ],
        unresolved: [],
      }),
      citations: [{ title: "合成来源", url: "https://EXAMPLE.com:443#part" }],
    };
    if (count === 3) throw Object.assign(new Error("private transport detail"), { code: "GEO_REQUEST_UNCERTAIN" });
    if (count === 4) {
      assert.match(input.prompt, /已引用别名/);
      assert.doesNotMatch(input.prompt, /无引用品牌/);
      return { text: JSON.stringify({ tasks: [] }) };
    }
    assert.equal(input.search, undefined);
    return { text: JSON.stringify({ profile: { fields: {} }, externalResearch: [{ name: "客户公开信息", basis: "research", sourceIds: [stableId("source", "https://example.com/")] }] }) };
  } };
  const result = await createGeoKnowledgeResearch({ client }).enrich(facts());
  assert.equal(count, 5);
  assert.equal(result.status.outcome, "partial");
  assert.equal(result.sources.length, 1);
  assert.equal(result.sources[0].url, "https://example.com/");
  assert.equal(result.externalResearch[0].basis, "research");
  assert.equal(JSON.stringify(result).includes("private transport detail"), false);
});

test("round validators enforce task and generic-industry limits", () => {
  const customer = { type: "customer_entity", topic: "客户", queries: ["客户"] };
  const industry = { type: "generic_industry", topic: "行业", queries: ["行业"] };
  assert.equal(validateTasks({ tasks: Array.from({ length: 6 }, () => customer) }, 1).length, 6);
  assert.throws(() => validateTasks({ tasks: [] }, 1), { code: "GEO_SCHEMA_INVALID" });
  assert.throws(() => validateTasks({ tasks: [customer, industry, industry] }, 1), { code: "GEO_SCHEMA_INVALID" });
  assert.throws(() => validateTasks({ tasks: Array.from({ length: 5 }, () => ({ type: "follow_up", topic: "跟进", queries: ["跟进"] })) }, 2), { code: "GEO_SCHEMA_INVALID" });
});

test("invalid round-one plan gets one budgeted repair and cannot launch search", async () => {
  let count = 0;
  const client = { async request(input) {
    count++;
    assert.equal(input.search, undefined);
    return { text: JSON.stringify({ tasks: Array.from({ length: 7 }, () => ({ type: "customer_entity", topic: "过量", queries: ["测试"] })) }) };
  } };
  await assert.rejects(createGeoKnowledgeResearch({ client }).enrich(facts()), { code: "GEO_SCHEMA_INVALID" });
  assert.equal(count, 2);
});

test("normal maximum two-round path uses fourteen transport requests", async () => {
  let calls = 0;
  const transport = async input => {
    calls++;
    if (calls === 1) return { text: JSON.stringify({ profile: { fields: {} } }) };
    if (calls === 2) return { text: JSON.stringify({ tasks: Array.from({ length: 6 }, (_, index) => ({ type: "customer_entity", topic: "客户" + index, queries: ["客户" + index] })) }) };
    if (calls >= 3 && calls <= 8) return { text: JSON.stringify(emptySearch), citations: [] };
    if (calls === 9) return { text: JSON.stringify({ tasks: Array.from({ length: 4 }, (_, index) => ({ type: "follow_up", topic: "跟进" + index, queries: ["跟进" + index] })) }) };
    if (calls >= 10 && calls <= 13) return { text: JSON.stringify(emptySearch), citations: [] };
    assert.equal(input.search, undefined);
    return { text: JSON.stringify({ profile: { fields: {} } }) };
  };
  const budget = createRequestBudget(transport);
  const research = createGeoKnowledgeResearch({ client: { request: transport } });
  const extracted = await research.extract({ clientId: "client-1", clientName: "合成客户", materials: [], budgetedRequest: budget.request });
  await research.enrich(extracted, { budgetedRequest: budget.request, budget });
  assert.equal(calls, 14);
  assert.equal(budget.snapshot().count, 14);
});

test("request budget preserves two synthesis attempts and uncertain calls are not retried", async () => {
  let calls = 0;
  const budget = createRequestBudget(async () => { calls++; return { text: "{}" }; });
  for (let index = 0; index < 16; index++) await budget.request({});
  await assert.rejects(budget.request({}), { code: "GEO_REQUEST_BUDGET_EXHAUSTED" });
  await budget.request({}, { useReserve: true });
  await budget.request({}, { useReserve: true });
  await assert.rejects(budget.request({}, { useReserve: true }), { code: "GEO_REQUEST_BUDGET_EXHAUSTED" });
  assert.equal(calls, 18);

  let uncertainCalls = 0;
  const research = createGeoKnowledgeResearch({ client: { async request() { uncertainCalls++; throw Object.assign(new Error(), { code: "GEO_REQUEST_UNCERTAIN" }); } } });
  await assert.rejects(research.extract({ clientId: "client-1", materials: [] }), { code: "GEO_REQUEST_UNCERTAIN" });
  assert.equal(uncertainCalls, 1);
});

test("cross-round exact query dedupe skips duplicate follow-up search", async () => {
  let count = 0;
  const client = { async request(input) {
    count++;
    if (count === 1) return { text: JSON.stringify({ tasks: [{ type: "customer_entity", topic: "客户", queries: [" 同一  查询 "] }] }) };
    if (count === 2) return { text: JSON.stringify(emptySearch), citations: [] };
    if (count === 3) return { text: JSON.stringify({ tasks: [{ type: "follow_up", topic: "跟进", queries: ["同一 查询"] }] }) };
    assert.equal(input.search, undefined);
    return { text: JSON.stringify({ profile: { fields: {} } }) };
  } };
  await createGeoKnowledgeResearch({ client }).enrich(facts());
  assert.equal(count, 4);
});

test("synthesis cannot drop extracted facts and config failure is not partial success", async () => {
  const existing = normalizeCandidate({ profile: { fields: { name: "合成店铺" }, basis: "fact", sourceIds: ["s"] }, offerings: [{ name: "产品", basis: "fact", sourceIds: ["s"] }] }, [{ id: "s", type: "client_input", title: "基本资料" }], "client-1");
  let calls = 0;
  const research = createGeoKnowledgeResearch({ client: { async request() {
    calls++;
    if (calls === 1) return { text: JSON.stringify({ tasks: [{ type: "customer_entity", topic: "客户", queries: ["客户"] }] }) };
    if (calls === 2) return { text: JSON.stringify(emptySearch), citations: [] };
    if (calls === 3) return { text: JSON.stringify({ tasks: [] }) };
    return { text: JSON.stringify({ profile: { fields: {} } }) };
  } } });
  const result = await research.enrich(existing);
  assert.equal(result.offerings.length, 1);
  assert.equal(result.profile.fields.name, "合成店铺");
  const broken = createGeoKnowledgeResearch({ client: { async request() { throw Object.assign(new Error(), { code: "GEO_CONFIG_REJECTED" }); } } });
  await assert.rejects(broken.enrich(facts()), { code: "GEO_CONFIG_REJECTED" });
});
