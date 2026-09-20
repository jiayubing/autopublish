"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  adaptModelCandidate,
  createGeoKnowledgeResearch,
  createRequestBudget,
  normalizePlannerTasks,
  parseJsonObject,
  validateTasks,
} = require("../src/content/geo-knowledge-research");
const { normalizeCandidate, mergeKnowledge } = require("../src/content/geo-knowledge-merge");
const { stableId } = require("../src/content/geo-knowledge-schema");
const facts = () => normalizeCandidate({ profile: { fields: {} } }, [], "client-1");
const emptySearch = { findings: [], discoveries: [], unresolved: [] };

test("JSON parser accepts one object in common model wrappers without weakening validation", () => {
  assert.deepEqual(parseJsonObject("```JSON\n{\"tasks\":[]}\n```"), {
    tasks: [],
  });
  assert.deepEqual(parseJsonObject("以下是结果：\n{\"tasks\":[]}"), {
    tasks: [],
  });
  assert.throws(() => parseJsonObject("[1,2,3]"), {
    code: "GEO_SCHEMA_INVALID",
  });
  assert.throws(() => parseJsonObject("{not-json}"), {
    code: "GEO_SCHEMA_INVALID",
  });
});

test("model adapter keeps only registered evidence and resolvable relations", () => {
  const sources = [
    {
      id: "source-file",
      type: "client_file",
      title: "客户资料",
      materialId: "material-1",
      fileName: "资料.docx",
      contentHash: "abc123",
    },
  ];
  const adapted = adaptModelCandidate(
    {
      businessType: "service",
      profile: {
        客户名称: "合成牙科",
        fields: { 主营品类: "口腔诊疗" },
        basis: "fact",
        sourceIds: ["资料.docx", "invented-source"],
      },
      offerings: [
        {
          identity: "implant",
          name: "种植牙",
          basis: "fact",
          sourceIds: ["客户资料"],
        },
      ],
      cases: [
        {
          name: "有效案例",
          basis: "fact",
          sourceIds: ["客户资料"],
          relatedOfferingIds: [stableId("offerings", "implant")],
        },
      ],
      history: [{ name: "无来源历史", basis: "research" }],
      onlinePresence: [
        {
          name: "错误网址",
          basis: "research",
          sourceIds: ["客户资料"],
          platform: "官网",
          url: "javascript:alert(1)",
        },
      ],
      recommendationAngles: [
        {
          name: "悬空角度",
          basis: "derived",
          relatedOfferingNames: ["不存在的服务"],
        },
      ],
      competitors: [
        {
          name: "伪造来源竞对",
          basis: "research",
          sourceIds: ["invented-source"],
        },
      ],
      geoQuestions: [
        {
          name: "如何选择种植牙？",
          intent: "selection",
          knowledgeCoverage: "未知",
          relatedOfferingNames: ["种植牙"],
        },
      ],
    },
    sources,
  );
  const normalized = normalizeCandidate(adapted, sources, "client-1");
  assert.deepEqual(normalized.profile.fields, {
    name: "合成牙科",
    category: "口腔诊疗",
  });
  assert.deepEqual(normalized.profile.sourceIds, ["source-file"]);
  assert.deepEqual(normalized.cases.map((item) => item.name), ["有效案例"]);
  assert.equal(
    normalized.cases[0].relatedOfferingIds[0],
    normalized.offerings[0].id,
  );
  assert.equal(normalized.geoQuestions[0].knowledgeCoverage, "insufficient");
  assert.deepEqual(normalized.history, []);
  assert.deepEqual(normalized.onlinePresence, []);
  assert.deepEqual(normalized.recommendationAngles, []);
  assert.deepEqual(normalized.competitors, []);
});

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

test("detailed research directions normalize and compress a natural round-one plan", () => {
  const plan = normalizePlannerTasks(
    {
      tasks: [
        ["identity", "名称与别名"],
        ["online_presence", "官网与公开账号"],
        ["people", "公开负责人"],
        ["address", "经营地址"],
        ["service", "产品与服务"],
        ["history", "历史与搬迁"],
        ["cases", "公开案例"],
        ["brand", "品牌合作"],
        ["competitor", "本地竞对"],
        ["industry", "行业背景"],
      ].map(([type, topic], index) => ({
        type,
        topic,
        queries: ["查询 " + index, "查询  " + index, "验证 " + index, "超量 " + index],
      })),
    },
    1,
  );
  assert.ok(plan.length <= 6);
  assert.ok(plan.every(task => ["customer_entity", "generic_industry"].includes(task.type)));
  assert.ok(plan.every(task => task.queries.length >= 1 && task.queries.length <= 3));
  assert.ok(plan.filter(task => task.type === "generic_industry").length <= 1);
});

test("natural planner types map only through the bounded round aliases", () => {
  const round1 = normalizePlannerTasks({ tasks: ["identity", "online_presence", "history", "cases"].map(type => ({ type, topic: type, queries: [type] })) }, 1);
  assert.ok(round1.every(task => task.type === "customer_entity"));
  const round2 = normalizePlannerTasks({ tasks: ["identity", "history", "competitor", "market"].map(type => ({ type, topic: type, queries: [type] })) }, 2);
  assert.ok(round2.some(task => task.type === "follow_up"));
  assert.equal(round2.filter(task => task.type === "generic_industry").length, 1);
  assert.throws(() => normalizePlannerTasks({ tasks: [{ type: "anything_goes", topic: "未知", queries: ["未知"] }] }, 1), { code: "GEO_SCHEMA_INVALID" });
});

test("detailed global prompt survives round-one planning without repair", async () => {
  const searches = [];
  let count = 0;
  const detailedPrompt = "详细全局要求：" + "名称别名、线上账号、负责人、地址、历史、案例、竞对、行业背景。".repeat(40);
  const client = { async request(input) {
    count++;
    if (count === 1) {
      assert.match(input.prompt, /研究维度不等于独立任务/);
      assert.match(input.prompt, /详细全局要求/);
      return { text: JSON.stringify({ tasks: [
        ["identity", "名称与别名"], ["online_presence", "线上账号"],
        ["people", "负责人"], ["address", "地址"], ["service", "产品服务"],
        ["history", "历史"], ["cases", "案例"], ["competitor", "竞对"], ["industry", "行业"],
      ].map(([type, topic], index) => ({ type, topic, queries: ["查询" + index, "验证" + index, "补充" + index, "超量" + index] })) }) };
    }
    if (input.search) {
      const match = input.prompt.match(/\{"round":1,"task":(\{.*\})\}\s*$/s);
      assert.ok(match);
      searches.push(JSON.parse(match[1]));
      return { text: JSON.stringify(emptySearch), citations: [] };
    }
    if (input.prompt.includes("第二轮")) return { text: JSON.stringify({ tasks: [] }) };
    return { text: JSON.stringify({ profile: { fields: {} } }) };
  } };
  await createGeoKnowledgeResearch({ client }).enrich(facts(), { promptSnapshot: { globalPrompt: detailedPrompt } });
  assert.ok(searches.length <= 6);
  assert.ok(searches.every(task => task.queries.length <= 3));
  assert.equal(count, searches.length + 3);
});

test("unknown planner type gets one structure-only repair without replanning", async () => {
  let count = 0;
  const detailedMarker = "DO_NOT_REPEAT_LONG_GLOBAL_PROMPT".repeat(50);
  const client = { async request(input) {
    count++;
    if (count === 1) return { text: JSON.stringify({ tasks: [{ type: "mystery", topic: "保留的研究意图", queries: ["客户查询"] }] }) };
    if (count === 2) {
      assert.equal(input.search, undefined);
      assert.match(input.prompt, /只修复上一次输出的结构/);
      assert.match(input.prompt, /mystery/);
      assert.doesNotMatch(input.prompt, /DO_NOT_REPEAT_LONG_GLOBAL_PROMPT/);
      return { text: JSON.stringify({ tasks: [{ type: "customer_entity", topic: "保留的研究意图", queries: ["客户查询"] }] }) };
    }
    if (count === 3) {
      assert.equal(input.search, true);
      return { text: JSON.stringify(emptySearch), citations: [] };
    }
    if (count === 4) return { text: JSON.stringify({ tasks: [] }) };
    return { text: JSON.stringify({ profile: { fields: {} } }) };
  } };
  await createGeoKnowledgeResearch({ client }).enrich(facts(), { promptSnapshot: { globalPrompt: detailedMarker } });
  assert.equal(count, 5);
});

test("a truly unknown planner type fails closed after one controlled repair", async () => {
  let count = 0;
  const client = { async request() {
    count++;
    return { text: JSON.stringify({ tasks: [{ type: "anything_goes", topic: "未知", queries: ["未知"] }] }) };
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
