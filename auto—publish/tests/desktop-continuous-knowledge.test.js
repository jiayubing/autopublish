"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createTypedIpcMain } = require("../desktop/ipc/register");
const { registerGeoKnowledgeIpc } = require("../desktop/ipc/geo-knowledge-ipc");
const { loadPreloadHarness } = require("./helpers/preload-harness");
const {
  createGeoKnowledgeService,
} = require("../desktop/services/geo-knowledge-service");
const { SECTIONS } = require("../src/content/geo-knowledge-schema");
const {
  createGeoKnowledgeStore,
} = require("../src/content/geo-knowledge-store");
const {
  createGeoKnowledgePromptStore,
} = require("../desktop/geo-knowledge-prompt-store");
const source = "合成客户提供配镜服务，店员耐心，价格清楚。";
const entry = (name, basis = "fact") => ({
  identity: name,
  name,
  description: source,
  basis,
  sourceIds: ["M1"],
  relatedOfferingNames: [],
  relatedScenarioNames: [],
});
function finalResponse() {
  return {
    webEvidence: [],
    summary: { text: source, inputRefs: ["M1"] },
    sections: [
      {
        key: "products_services",
        items: [{ text: source, kind: "derived", inputRefs: ["M1"] }],
      },
    ],
    realCases: [],
    customerReviews: [],
    recommendationAngles: [],
    geoThemes: [],
    missingInformation: [],
    cautions: [],
    canonical: {
      businessType: "retail",
      profile: {
        fields: { name: "合成客户" },
        basis: "fact",
        sourceIds: ["M1"],
      },
      ...Object.fromEntries(SECTIONS.map((section) => [section, []])),
      offerings: [entry("配镜服务")],
      geoQuestions: [
        {
          ...entry("如何选择配镜服务？", "derived"),
          intent: "selection",
          knowledgeCoverage: "partial",
          relatedOfferingNames: ["配镜服务"],
        },
      ],
    },
  };
}
function setup(
  t,
  {
    mutateFinal = (value) => value,
    mutateResearch = (value) => value,
    serializeFinal = JSON.stringify,
    materialText = source,
    hold = null,
    fail = null,
    atomicWriter,
    publicEvidence = false,
    researchLimits,
  } = {},
) {
  const workspaceRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "desktop-continuous-"),
  );
  t.after(() => fs.rmSync(workspaceRoot, { recursive: true, force: true }));
  const prompts = createGeoKnowledgePromptStore({
    userDataPath: path.join(workspaceRoot, "config"),
  });
  prompts.save("冻结的全局要求");
  prompts.saveFinalKnowledgePrompt("冻结的成稿要求");
  const store = createGeoKnowledgeStore({ workspaceRoot, atomicWriter });
  const calls = [];
  const client = {
    async request(request) {
      calls.push(request);
      if (hold) await hold(calls.length, request);
      if (fail) fail(calls.length);
      const contextText = request.prompt.split("[RUN_CONTEXT]\n")[1];
      if (!contextText)
        return {
          text: serializeFinal(mutateFinal(finalResponse())),
          citations: [],
        };
      const context = JSON.parse(contextText);
      if (context.mode === "search") return publicEvidence ? {
        text: JSON.stringify({ findings: [{ evidenceQuote: source }], unresolved: [] }),
        citations: [{ title: "合成官网", url: "https://example.com/client", summary: source }],
      } : { text: '{"findings":[],"unresolved":[]}', citations: [] };
      const response = Object.fromEntries(
        Object.keys(request.jsonSchema.properties)
          .filter((key) => key !== "researchNeed")
          .map((key) => [key, []]),
      );
      response.researchNeed = {
        needed: false,
        scope: "entity",
        query: "",
        reason: "",
      };
      return { text: JSON.stringify(mutateResearch(response, context)), citations: [] };
    },
  };
  const service = createGeoKnowledgeService({
    researchLimits,
    workspaceRoot,
    store,
    promptStore: prompts,
    client,
    getClient: () => ({ name: "合成客户" }),
    materialStore: {
      listMaterials: async () => [
        { name: "合成.txt", status: "ready", content: materialText },
      ],
    },
  });
  t.after(() => service.dispose());
  return { service, store, calls, prompts, workspaceRoot };
}
test("saved prose survives regeneration and restart until explicit candidate replacement", async t => {
  const { service, store, calls, workspaceRoot } = setup(t);
  const first = (await service.generate({ clientId: "client-1" })).knowledge;
  const manual = "# 九板块知识库\n\n## 产品或服务描述\n\n人工保留的配镜介绍。";
  const beforeEdit = calls.length;
  const edited = service.editDeliverable({ clientId: "client-1", revision: first.revision, markdown: manual }).knowledge;
  assert.equal(calls.length, beforeEdit, "manual save never calls a model");
  assert.equal(edited.deliverable.contentRevision, 2);
  assert.equal(edited.deliverable.indexStatus, "stale");
  assert.deepEqual(edited.sources, first.sources);
  assert.deepEqual(edited.profile, first.profile);
  const next = (await service.generate({ clientId: "client-1" })).knowledge;
  assert.equal(next.deliverable.markdown, manual);
  assert.equal(next.deliverable.contentRevision, 2);
  assert.match(next.pendingDeliverable.markdown, /店员耐心/);
  const restarted = createGeoKnowledgeStore({ workspaceRoot });
  assert.deepEqual(restarted.load("client-1"), next);
  assert.throws(() => restarted.acceptDeliverable("client-1", next.revision, "wrong-candidate"), { code: "GEO_REVISION_CONFLICT" });
  const accepted = service.acceptDeliverable({ clientId: "client-1", revision: next.revision, candidateId: next.pendingDeliverable.candidateId }).knowledge;
  assert.equal(accepted.deliverable.contentRevision, 3);
  assert.equal(accepted.deliverable.markdown, next.pendingDeliverable.markdown);
  assert.equal(accepted.pendingDeliverable, undefined);
  assert.deepEqual(store.load("client-1"), accepted);
  assert.throws(() => service.acceptDeliverable({ clientId: "client-1", revision: next.revision, candidateId: next.pendingDeliverable.candidateId }), { code: "GEO_REVISION_CONFLICT" });
});

test("prose commands reject stale saves and atomic failure preserves both current and candidate", async t => {
  const { service, store, workspaceRoot } = setup(t);
  const first = (await service.generate({ clientId: "client-1" })).knowledge;
  const next = (await service.generate({ clientId: "client-1" })).knowledge;
  assert.throws(() => service.editDeliverable({ clientId: "client-1", revision: first.revision, markdown: "迟到编辑" }), { code: "GEO_REVISION_CONFLICT" });
  assert.throws(() => service.editDeliverable({ clientId: "client-1", revision: next.revision, markdown: "  " }), { code: "GEO_KNOWLEDGE_INVALID" });
  const broken = createGeoKnowledgeStore({ workspaceRoot, atomicWriter: { write: () => false } });
  assert.throws(() => broken.editDeliverable("client-1", next.revision, "未落盘修改"), { code: "GEO_SAVE_FAILED" });
  assert.throws(() => broken.acceptDeliverable("client-1", next.revision, next.pendingDeliverable.candidateId), { code: "GEO_SAVE_FAILED" });
  assert.deepEqual(store.load("client-1"), next);
  const unchanged = store.editDeliverable("client-1", next.revision, next.deliverable.markdown);
  assert.deepEqual(unchanged, next, "same prose is an idempotent no-op");
});

test("prose commands cross authenticated IPC with version and candidate identity", async t => {
  const { service } = setup(t);
  const handlers = new Map();
  registerGeoKnowledgeIpc({
    ipcMain: createTypedIpcMain({ handle: (channel, handler) => handlers.set(channel, handler) }, async () => {}),
    geoKnowledgeService: service,
  });
  const harness = loadPreloadHarness({ invoke: (channel, input) => handlers.get(channel)(null, input) });
  const api = harness.api.geoKnowledge;
  await api.generate({ clientId: "client-1" });
  const edited = await api.editDeliverable({ clientId: "client-1", revision: 1, markdown: "# 人工正文" });
  assert.equal(edited.ok, true);
  assert.equal(edited.data.knowledge.deliverable.contentRevision, 2);
  const generated = await api.generate({ clientId: "client-1" });
  assert.equal(generated.ok, true);
  const candidateId = generated.data.knowledge.pendingDeliverable.candidateId;
  const accepted = await api.acceptDeliverable({ clientId: "client-1", revision: 3, candidateId });
  assert.equal(accepted.ok, true);
  assert.equal(accepted.data.knowledge.pendingDeliverable, undefined);
});
test("continuous progress and final draft roundtrip authenticated IPC and preload", async (t) => {
  let api;
  const phases = [];
  const { service, calls } = setup(t, { hold: async () => {
    const reply = await api.state({ clientId: "client-1" });
    assert.equal(reply.ok, true, reply.error?.code);
    const state = reply.data.state;
    assert.equal(state.running, true);
    assert.equal(state.total, 6);
    assert.equal(state.completed, state.phase === "K" ? 5 : Number(state.phase.slice(1)) - 1);
    phases.push(state.phase);
    const loaded = await api.load({ clientId: "client-1" });
    assert.equal(loaded.ok, true, loaded.error?.code);
    assert.deepEqual(loaded.data.state, state);
  } });
  const handlers = new Map();
  registerGeoKnowledgeIpc({
    ipcMain: createTypedIpcMain({ handle: (channel, fn) => handlers.set(channel, fn) }, async () => {}),
    geoKnowledgeService: service,
  });
  api = loadPreloadHarness({ invoke: (channel, value) => handlers.get(channel)(null, value) }).api.geoKnowledge;
  const result = await api.generate({ clientId: "client-1" });
  assert.equal(result.ok, true, result.error?.code);
  assert.equal(calls.length, 10);
  assert.deepEqual(phases, ["R1", "R1", "R1", "R2", "R2", "R2", "R3", "R4", "R5", "K"]);
  const loaded = await api.load({ clientId: "client-1" });
  assert.equal(loaded.ok, true, loaded.error?.code);
  assert.match(loaded.data.knowledge.deliverable.markdown, /店员耐心/);
});

test("format typos and sourced case paraphrases persist without another model request", async (t) => {
  const caseText = "来访者在合成客户处获得配镜服务。";
  const { service, store, calls } = setup(t, {
    materialText: source + "服务案例：合成客户为来访者提供配镜服务。",
    serializeFinal: value => '```json\n' + JSON.stringify(value).replace('"inputRefs":', 'inputRefs":') + '\n```',
    mutateFinal(value) {
      value.realCases = [{ text: caseText, inputRefs: ["M1"] }];
      value.canonical.cases = [{ ...entry("配镜服务案例"), description: caseText }];
      value.sections[0].items[0].text = source + "\n" + "客户可咨询配镜服务。";
      return value;
    },
  });
  const result = await service.generate({ clientId: "client-1" });
  assert.equal(calls.length, 10);
  assert.equal(result.knowledge.cases[0].description, caseText);
  assert.match(store.load("client-1").deliverable.markdown, /来访者在合成客户处获得配镜服务/);
});

test("continuous output accepts source excerpts, cross-field cases and unsupported gaps without losing knowledge", async (t) => {
  const { service, store, calls } = setup(t, {
    materialText: source + "门店资质资料可供核对。",
    mutateResearch(value, context) {
      if (context.stage === 1) value.customerCharacteristics = [
        { text: source, provenance: "client_input", refs: ["M1"] },
      ];
      return value;
    },
    mutateFinal(value) {
      const refs = ["R2a-customerCharacteristics-1"];
      value.realCases = [{ text: source, inputRefs: refs }];
      value.customerReviews = [{ text: "店员耐心", inputRefs: ["M1"] }];
      value.missingInformation = [{ text: "缺少负责人信息", inputRefs: [] }];
      value.canonical.cases = [{ ...entry("配镜案例"), sourceIds: refs }];
      value.canonical.geoQuestions[0].description = "如何核对门店资质？";
      value.canonical.geoQuestions[0].sourceIds = refs;
      value.canonical.recommendationAngles = [entry("品牌角度", "derived")];
      return value;
    },
  });
  const result = await service.generate({ clientId: "client-1" });
  assert.equal(calls.length, 10);
  assert.equal(result.knowledge.cases.length, 1);
  assert.equal(result.knowledge.recommendationAngles.length, 0);
  assert.ok(result.knowledge.status.warnings.some(text => text.includes("缺少产品或场景关联")));
  assert.match(store.load("client-1").deliverable.markdown, /店员耐心/);
});

test("invalid auxiliary relationships save validated prose with a stale index", async (t) => {
  const { service, store, calls, workspaceRoot } = setup(t, { mutateFinal(value) {
    value.canonical.geoQuestions[0].relatedOfferingNames = ["不存在的服务"];
    return value;
  } });
  const result = await service.generate({ clientId: "client-1" });
  assert.equal(calls.length, 10);
  assert.equal(result.knowledge.deliverable.indexStatus, "stale");
  assert.match(result.knowledge.deliverable.warnings.join(" "), /辅助索引/);
  assert.match(store.load("client-1").deliverable.markdown, /店员耐心/);
  assert.deepEqual(createGeoKnowledgeStore({ workspaceRoot }).load("client-1"), result.knowledge);
});

test("desktop single action generates canonical and full short draft in one final response and revision", async (t) => {
  const { service, calls, workspaceRoot } = setup(t);
  const { knowledge } = await service.generate({
    clientId: "client-1",
    temporaryPrompt: "本次要求",
  });
  assert.equal(calls.length, 10);
  assert.equal(calls.filter((call) => call.search).length, 2);
  assert.equal(calls.at(-1).search, false);
  assert.equal(calls.at(-1).timeoutMs, 600000);
  assert.ok(calls.slice(0, -1).every(call => call.timeoutMs === undefined));
  assert.ok(calls.at(-1).jsonSchema.required.includes("canonical"));
  function checkStrictObject(schema) {
    if (schema.type === "object") {
      assert.equal(schema.additionalProperties, false);
      assert.deepEqual([...schema.required].sort(), Object.keys(schema.properties).sort());
      Object.values(schema.properties).forEach(checkStrictObject);
    } else if (schema.items) checkStrictObject(schema.items);
  }
  checkStrictObject(calls.at(-1).jsonSchema);
  assert.match(calls.at(-1).prompt, /冻结的成稿要求/);
  assert.equal(knowledge.profile.fields.name, "合成客户");
  assert.equal(knowledge.offerings.length, 1);
  assert.equal(knowledge.geoQuestions.length, 1);
  assert.equal(knowledge.revision, 1);
  assert.equal(knowledge.deliverable.knowledgeRevision, 1);
  assert.equal(knowledge.deliverable.status, "draft");
  assert.match(knowledge.deliverable.markdown, /店员耐心/);
  const restarted = createGeoKnowledgeStore({ workspaceRoot }).load("client-1");
  assert.deepEqual(restarted, knowledge);
  assert.equal(service.exportMarkdown({ clientId: "client-1", revision: 1 }).markdown, knowledge.deliverable.markdown);
});
test("re-research keeps a manually confirmed source classification", async t => {
  const { service } = setup(t, { publicEvidence: true });
  const first = (await service.generate({ clientId: "client-1" })).knowledge;
  const publicSource = first.sources.find(item => item.type === "third_party");
  assert.ok(publicSource);
  service.confirmSourceType({ clientId: "client-1", revision: 1, sourceId: publicSource.id, targetType: "official_web" });
  const next = (await service.generate({ clientId: "client-1" })).knowledge;
  assert.equal(next.sources.find(item => item.id === publicSource.id).type, "official_web");
});
test("capacity refusal is visible before dispatch and does not change canonical state", async t => {
  const { service, calls, store } = setup(t, { researchLimits: { maxPromptCharacters: 1000, analysisOutputTokens: 6000, finalOutputTokens: 16000 } });
  await assert.rejects(service.generate({ clientId: "client-1" }), { code: "GEO_CONTEXT_TOO_LARGE" });
  assert.equal(calls.length, 0); assert.equal(store.load("client-1"), null);
  assert.equal(service.state({ clientId: "client-1" }).state.failedPhase, "R1");
});
test("invalid auxiliary index preserves current prose and retains the new candidate after restart", async (t) => {
  let corrupt = false;
  const { service, store, workspaceRoot } = setup(t, {
    mutateFinal: (value) => {
      if (corrupt) value.canonical.profile.sourceIds = ["invented"];
      return value;
    },
  });
  const first = (await service.generate({ clientId: "client-1" })).knowledge;
  corrupt = true;
  const result = (await service.generate({ clientId: "client-1" })).knowledge;
  assert.deepEqual(result.profile, first.profile);
  assert.equal(result.deliverable.markdown, first.deliverable.markdown);
  assert.match(result.pendingDeliverable.markdown, /店员耐心/);
  assert.match(result.pendingDeliverable.warnings.join(" "), /辅助索引/);
  assert.deepEqual(createGeoKnowledgeStore({ workspaceRoot }).load("client-1"), store.load("client-1"));
});
test("re-research preserves locked facts and linked question identity and marks mismatching draft stale", async (t) => {
  const { service, store } = setup(t);
  const first = (await service.generate({ clientId: "client-1" })).knowledge;
  const linked = structuredClone(first);
  linked.geoQuestions[0].questionId = "collection-1";
  store.save(linked, first.revision);
  const edited = service.edit({
    clientId: "client-1",
    revision: 2,
    section: "profile",
    id: first.profile.id,
    changes: { fields: { name: "人工名称" } },
  }).knowledge;
  assert.equal(edited.deliverable.status, "stale");
  const next = (await service.generate({ clientId: "client-1" })).knowledge;
  assert.equal(next.profile.fields.name, "人工名称");
  assert.equal(next.profile.locked, true);
  assert.equal(next.geoQuestions[0].id, first.geoQuestions[0].id);
  assert.equal(next.geoQuestions[0].questionId, "collection-1");
  assert.equal(next.deliverable.status, "stale");
  assert.equal(next.deliverable.knowledgeRevision, 4);
  assert.ok(next.restrictions.some((item) => item.type === "conflict"));
});
test("repeated rejected observations preserve an explicit conflict resolution", async t => {
  const { service } = setup(t);
  const first = (await service.generate({ clientId: "client-1" })).knowledge;
  service.edit({ clientId: "client-1", revision: 1, section: "profile", id: first.profile.id, changes: { fields: { name: "人工名称" } } });
  const conflicting = (await service.generate({ clientId: "client-1" })).knowledge;
  const conflict = conflicting.restrictions.find(item => item.type === "conflict");
  assert.equal(conflict.conflictStatus, "open");
  const claim = conflicting.profile.claims.find(item => item.status === "accepted");
  service.resolveConflict({ clientId: "client-1", revision: 3, conflictId: conflict.id, claimId: claim.id });
  const repeated = (await service.generate({ clientId: "client-1" })).knowledge;
  assert.equal(repeated.profile.fields.name, "人工名称");
  assert.equal(repeated.restrictions.find(item => item.id === conflict.id).conflictStatus, "resolved");
  assert.equal(repeated.deliverable.status, "stale");
});
test("progress and frozen prompt settings survive edits and cancellation prevents late save", async (t) => {
  let release;
  let entered;
  const arrived = new Promise((resolve) => {
    entered = resolve;
  });
  const held = new Promise((resolve) => {
    release = resolve;
  });
  const { service, calls, prompts, store } = setup(t, {
    hold: async (count) => {
      if (count === 4) {
        entered();
        await held;
      }
    },
  });
  const pending = service.generate({ clientId: "client-1" });
  await arrived;
  assert.equal(service.state({ clientId: "client-1" }).state.phase, "R2");
  await assert.rejects(service.generate({ clientId: "client-1" }), {
    code: "GEO_ALREADY_RUNNING",
  });
  prompts.save("后来修改");
  prompts.saveFinalKnowledgePrompt("后来写稿");
  service.cancel({ clientId: "client-1" });
  release();
  await assert.rejects(pending, { code: "GEO_CANCELLED" });
  assert.equal(store.load("client-1"), null);
  assert.equal(calls.length, 4);
  assert.ok(calls.every((call) => !call.prompt.includes("后来修改")));
});
test("uncertain request stops once and does not auto resume on service restart", async (t) => {
  const { service, calls, workspaceRoot } = setup(t, {
    fail: (count) => {
      if (count === 1)
        throw Object.assign(new Error("private provider error"), {
          code: "GEO_REQUEST_UNCERTAIN",
        });
    },
  });
  await assert.rejects(service.generate({ clientId: "client-1" }), {
    code: "GEO_REQUEST_UNCERTAIN",
  });
  const state = service.state({ clientId: "client-1" }).state;
  assert.equal(state.outcome, "uncertain");
  assert.equal(state.failedPhase, "R1");
  assert.equal(calls.length, 1);
  const restarted = createGeoKnowledgeService({
    workspaceRoot,
    getClient: () => ({ name: "合成客户" }),
  });
  assert.equal(restarted.load({ clientId: "client-1" }).knowledge, null);
  assert.equal(
    restarted.state({ clientId: "client-1" }).state.outcome,
    "uncertain",
  );
  restarted.dispose();
  assert.equal(calls.length, 1);
});
test("final timeout survives authenticated IPC and restart as uncertain without a retry", async (t) => {
  const { service, calls, workspaceRoot } = setup(t, { fail(count) {
    if (count === 10) throw Object.assign(new Error("private provider detail"), { code: "GEO_REQUEST_TIMEOUT" });
  } });
  const handlers = new Map();
  registerGeoKnowledgeIpc({
    ipcMain: createTypedIpcMain({ handle: (channel, fn) => handlers.set(channel, fn) }, async () => {}),
    geoKnowledgeService: service,
  });
  const api = loadPreloadHarness({ invoke: (channel, value) => handlers.get(channel)(null, value) }).api.geoKnowledge;
  const result = await api.generate({ clientId: "client-1" });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "GEO_REQUEST_TIMEOUT");
  assert.match(result.error.userMessage, /等待超时/);
  assert.ok(!result.error.userMessage.includes("private provider detail"));
  const loaded = await api.load({ clientId: "client-1" });
  assert.equal(loaded.ok, true, loaded.error?.code);
  assert.equal(loaded.data.knowledge, null);
  assert.equal(loaded.data.modelDraft, undefined);
  assert.deepEqual(loaded.data.state, { phase: "failed", running: false, failedPhase: "K", outcome: "uncertain", errorCode: "GEO_REQUEST_TIMEOUT" });
  const restarted = createGeoKnowledgeService({ workspaceRoot, getClient: () => ({ name: "合成客户" }) });
  t.after(() => restarted.dispose());
  assert.deepEqual(restarted.load({ clientId: "client-1" }).state, loaded.data.state);
  assert.equal(calls.length, 10);
  assert.equal(calls.at(-1).timeoutMs, 600000);
});

test("article context uses saved prose and excludes competing structured facts", async (t) => {
  const { service, store } = setup(t);
  const first = (await service.generate({ clientId: "client-1" })).knowledge;
  first.geoQuestions[0].questionId = "collection-1";
  store.save(first, 1);
  const context = service.getGenerationContext(
    "client-1",
    [
      {
        question: first.geoQuestions[0].name,
        answerText: "按需选择服务。",
        references: [],
      },
    ],
    ["collection-1"],
  );
  const selected = JSON.parse(context.context);
  assert.deepEqual(selected.offerings, []);
  assert.equal(selected.profile, null);
  assert.match(selected.knowledgeProse.markdown, /配镜服务/);
  assert.equal(selected.knowledgeProse.contentRevision, 1);
  assert.equal(Object.hasOwn(selected, "deliverable"), false);
});
test("edits to prompt owners during a successful run do not change final K input", async (t) => {
  let release;
  let entered;
  const arrived = new Promise((resolve) => {
    entered = resolve;
  });
  const held = new Promise((resolve) => {
    release = resolve;
  });
  const { service, prompts, calls } = setup(t, {
    hold: async (count) => {
      if (count === 4) {
        entered();
        await held;
      }
    },
  });
  const pending = service.generate({ clientId: "client-1" });
  await arrived;
  prompts.save("新的研究要求");
  prompts.saveFinalKnowledgePrompt("新的成稿要求");
  release();
  await pending;
  assert.match(calls.at(-1).prompt, /冻结的成稿要求/);
  assert.equal(calls.at(-1).prompt.includes("新的成稿要求"), false);
  assert.equal(calls.at(-1).prompt.includes("新的研究要求"), false);
});
test("final concurrent edit wins over delayed K response", async (t) => {
  let release;
  let entered;
  let block = false;
  const arrived = new Promise((resolve) => {
    entered = resolve;
  });
  const held = new Promise((resolve) => {
    release = resolve;
  });
  const { service, store } = setup(t, {
    hold: async (_count, request) => {
      if (block && !request.prompt.includes("[RUN_CONTEXT]")) {
        entered();
        await held;
      }
    },
  });
  const first = (await service.generate({ clientId: "client-1" })).knowledge;
  block = true;
  const pending = service.generate({ clientId: "client-1" });
  await arrived;
  const edit = service.edit({
    clientId: "client-1",
    revision: 1,
    section: "profile",
    id: first.profile.id,
    changes: { fields: { name: "并发修改" } },
  }).knowledge;
  release();
  await assert.rejects(pending, { code: "GEO_REVISION_CONFLICT" });
  assert.deepEqual(store.load("client-1"), edit);
});
test("failed atomic save leaves canonical untouched and retains draft for editing", async (t) => {
  const { service, store } = setup(t, { atomicWriter: { write: () => false } });
  await assert.rejects(service.generate({ clientId: "client-1" }), {
    code: "GEO_SAVE_FAILED",
  });
  assert.equal(store.load("client-1"), null);
  assert.match(
    service.load({ clientId: "client-1" }).modelDraft.markdown,
    /店员耐心/,
  );
});
