const assert = require("node:assert/strict");
const test = require("node:test");
const { closeRenderer, startRenderer } = require("./helpers/renderer-harness");

function fixture(options = {}) {
  const ok = (data) => Promise.resolve({ ok: true, data });
  const clients = [{ id: "client-a", name: "客户 A" }, { id: "client-b", name: "客户 B" }];
  const calls = { preview: [], create: [], start: [] };
  let batch = null;
  const content = {
    listClients: () => ok({ clients }),
    getClientDetails: (clientId) => ok({ client: clients.find((item) => item.id === clientId), research: [] }),
    listResearch: () => ok({ research: [] }), listResearchMetadata: () => ok({ research: [] }), listQuestions: () => ok({ questions: [] }),
    listTemplateCatalog: () => ok({ revision: "catalog-1", platforms: [{ id: "fixture", displayName: "测试平台" }], templates: [{ id: "template-1", platform: "fixture", scenario: "测试场景", name: "测试模板", body: "body", bodyHash: "hash", source: "custom", enabled: true }], diagnostics: [] }),
    getArticleManagementSnapshot: ({ clientId }) => ok({ clientId, revision: 1, articles: [], trash: [], publicationRecords: [], submissionPlatforms: [], workflowItems: [] }),
    getDoubaoLoginState: () => ok({ loginState: { status: "unknown" } }), getDoubaoQueueState: () => ok({ queue: { status: "idle", currentTaskId: null, completed: 0, total: 0, waitRemainingMs: 0, tasks: [] } }), onDoubaoQueueState: () => () => {},
    getGenerationRuntimeSnapshot: () => ok({ runtimeId: "generation-runtime", sequence: batch ? 2 : 1, runtime: { status: batch ? batch.status : "idle", state: batch ? batch.status : "idle", batchId: batch?.id || null }, batch, capabilities: {} }), onGenerationBatchState: () => () => {},
    previewGenerationBatch: (input) => { calls.preview.push(structuredClone(input)); return ok({ version: 2, questionCount: input.selectedQuestions.length, taskCount: input.selectedQuestions.length * input.templates.length, executableTaskCount: input.selectedQuestions.length * input.templates.length, excludedTaskCount: 0, excludedQuestions: [], questionSources: [], templates: input.templates, tasks: [] }); },
    createGenerationBatchV2: (input) => { calls.create.push(structuredClone(input)); batch = { version: 2, id: "batch-1", status: "pending", startState: "not_started", clientSources: [], questionSources: [], templates: input.templates, tasks: [], counts: { total: input.selectedQuestions.length, succeeded: 0, failed: 0, pending: input.selectedQuestions.length, uncertain: 0, interrupted: 0, cancelled: 0 } }; return ok({ batch }); },
    startGenerationBatchV2: (input) => { calls.start.push(structuredClone(input)); batch = { ...batch, status: "running", startState: "started" }; return ok({ batch }); },
    pauseGenerationBatch: () => ok({}), abandonGenerationBatch: () => ok({}), resumeGenerationBatch: () => ok({}), retryFailedGenerationBatch: () => ok({}), previewCancelPendingGenerationBatch: () => ok({ canCancel: false, pendingCount: 0, runningCount: 0 }), cancelPendingGenerationBatch: () => ok({}),
  };
  window.__concurrencyCalls = calls;
  window.desktopConsole = {
    auth: { getState: () => ok({ authenticated: true, user: { loginName: "fixture" }, entitlements: [] }), onStateChanged: () => () => {}, login: () => ok({}), changePassword: () => ok({}), refresh: () => ok({}), logout: () => ok({}) },
    workspace: { getBootstrapState: () => ok({ state: "ready", workspacePath: "fixture", envOverride: false }), getCurrent: () => ok({ workspacePath: "fixture", envOverride: false, validation: { ok: true, errors: [], warnings: [] } }), openCurrent: () => ok(undefined), requestSwitch: () => ok({ state: "ready" }), chooseDirectory: () => ok({ state: "ready" }), confirmSelection: () => ok({ state: "ready" }), cancelSelection: () => ok({ state: "ready" }) },
    workspaceData: { getRuntimeIdentity: () => ok({ workspaceRuntimeId: "runtime-1", revision: 1 }), onInvalidated: () => () => {} }, runtimeDiagnostics: { get: () => ok({ ok: true, buildInfo: { version: "1" }, browserChannel: { channel: "chromium", configured: true, state: "ready", probed: true }, capabilities: {}, errors: [], warnings: [] }) },
    media: { getResourcePage: () => ok({ items: [], total: 0, page: 1, pageSize: 1 }), getPool: () => ok([]), getBalance: () => ok({ balance: "0" }) }, orders: { getOrders: () => ok([]) }, aiProvider: { getStatus: () => ok({ configured: false, source: "application", apiKeyMask: "", lastTest: null }) }, platformSettings: { getStatus: () => ok({ configured: false, source: "application", baseUrl: "", timeoutMs: 30000, allowInsecure: false, transport: "未配置", apiKeyMask: "", lastTest: null }) }, storageMaintenance: { getUsage: () => ok({ logs: { bytes: 0, files: 0 }, temporary: { bytes: 0, files: 0 }, docxCache: { bytes: 0, files: 0 }, profiles: { bytes: 0, files: 0 } }) }, platforms: { getQueue: () => ok({ platforms: [], queue: [] }), listAccountProfiles: () => ok({ profiles: [] }), getState: () => ok({ isBatchRunning: false, isStopPending: false, isPlatformRunning: false }), onState: () => () => {} }, publication: { listForArticles: () => ok([]) }, articleAttention: { list: () => ok({ revision: 0, items: [], counts: { total: 0, actionable: 0 } }) }, content,
    geoKnowledge: { questionWorkflow: ({ clientId }) => options.fail && clientId === "client-b" ? Promise.reject(new Error("问题状态读取失败")) : ok({ clientId, knowledgeRevision: 1, items: [{ id: `geo-${clientId}`, name: `问题 ${clientId.slice(-1).toUpperCase()}`, intent: "comparison", knowledgeCoverage: "enough", linkStatus: "linked", questionId: `research-${clientId}`, collectionEnabled: true, research: { collectedAt: "2026-09-22T00:00:00.000Z", answerLength: 10, referenceCount: 0 }, articles: { total: 0, publishedCount: 0 }, generation: { ready: clientId === "client-a", code: clientId === "client-a" ? "GEO_GENERATION_READY" : "GEO_RESEARCH_MISSING" } }] }) },
  };
}

async function open(t, options) {
  t.after(() => closeRenderer());
  const { browser, url } = await startRenderer({ port: 4183 });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  t.after(() => page.close());
  await page.addInitScript(fixture, options || {});
  await page.goto(url); await page.locator("#nav-item-content-production").click(); await page.getByRole("button", { name: "批量生成", exact: true }).click();
  return page;
}

test("question-driven generation sends selected concurrency through preview, create and start", { concurrency: false }, async (t) => {
  const page = await open(t);
  await page.getByRole("button", { name: "选择部分客户…", exact: true }).click();
  const picker = page.getByRole("dialog", { name: "选择批次客户" });
  await picker.getByRole("checkbox", { name: "客户 A", exact: true }).check(); await picker.getByRole("button", { name: "完成选择", exact: true }).click();
  await page.getByRole("button", { name: "下一步" }).click(); await page.getByRole("checkbox", { name: /测试模板/ }).check();
  const chooser = page.getByRole("combobox", { name: "生成并发数" }); assert.equal(await chooser.inputValue(), "2"); await chooser.selectOption("3");
  await page.getByRole("button", { name: "下一步" }).click(); await page.getByRole("button", { name: "检查并确认" }).click(); await page.getByRole("button", { name: "确认并启动批量生成" }).click();
  const calls = await page.evaluate(() => window.__concurrencyCalls);
  assert.equal(calls.preview[0].concurrency, 3); assert.equal(calls.create[0].concurrency, 3); assert.deepEqual(calls.create[0].selectedQuestions, [{ clientId: "client-a", geoQuestionId: "geo-client-a" }]); assert.deepEqual(calls.start, [{ batchId: "batch-1" }]);
});

test("only ready GEO questions can be selected and workflow errors preserve the client selection", { concurrency: false }, async (t) => {
  const page = await open(t, { fail: true });
  await page.getByRole("button", { name: "选择部分客户…", exact: true }).click(); const picker = page.getByRole("dialog", { name: "选择批次客户" });
  await picker.getByRole("checkbox", { name: "客户 A", exact: true }).check(); await picker.getByRole("checkbox", { name: "客户 B", exact: true }).check(); await picker.getByRole("button", { name: "完成选择", exact: true }).click();
  await page.getByRole("alert").filter({ hasText: "问题状态读取失败" }).waitFor();
  await page.getByRole("button", { name: "选择部分客户…", exact: true }).click();
  assert.equal(await picker.getByRole("checkbox", { name: "客户 B", exact: true }).isChecked(), true);
});
