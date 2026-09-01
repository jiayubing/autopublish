const assert = require("node:assert/strict");
const test = require("node:test");
const { closeRenderer, startRenderer } = require("./helpers/renderer-harness");

test("batch generation hydrates a selected non-current client on cold start", { concurrency: false }, async (t) => {
  let renderer;
  try {
    renderer = await startRenderer({ port: 4183 });
  } catch (error) {
    if (error && /executable|browser|chromium/i.test(String(error.message || error))) {
      await closeRenderer();
      return t.skip("Playwright Chromium executable is unavailable");
    }
    throw error;
  }
  const { browser, url } = renderer;
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  t.after(async () => {
    await page.close();
    await closeRenderer();
  });

  await page.addInitScript(() => {
    const ok = (data) => Promise.resolve({ ok: true, data });
    const clients = [{ id: "client-a", name: "客户 A" }, { id: "client-b", name: "客户 B" }];
    const details = {
      "client-a": { id: "client-a", name: "客户 A", knowledgeFiles: [{ id: "brand-a", name: "brand-a.txt", extension: ".txt", status: "ready", characterCount: 12 }] },
      "client-b": { id: "client-b", name: "客户 B", knowledgeFiles: [{ id: "brand-b", name: "brand-b.txt", extension: ".txt", status: "ready", characterCount: 12 }] },
    };
    const research = {
      "client-a": [{ id: "research-a", question: "问题 A", answerText: "有效回答", isAnswerComplete: true, answerLength: 4 }],
      "client-b": [{ id: "research-b", question: "问题 B", answerText: "有效回答", isAnswerComplete: true, answerLength: 4 }],
    };
    const calls = [];
    const content = {
      listClients: () => { calls.push("listClients"); return ok({ clients }); },
      getClientDetails: (clientId) => { calls.push(`getClientDetails:${clientId}`); return ok({ client: details[clientId], research: research[clientId] }); },
      listResearch: (clientId) => ok({ research: research[clientId] || [] }),
      listResearchMetadata: (clientId) => ok({ research: (research[clientId] || []).map(({ answerText, ...item }) => item) }),
      listQuestions: () => ok({ questions: [] }),
      listTemplateCatalog: () => ok({ revision: "catalog-1", platforms: [{ id: "fixture", displayName: "测试平台" }], templates: [{ id: "template-1", platform: "fixture", scenario: "测试场景", name: "测试模板", body: "body", bodyHash: "hash", source: "custom", enabled: true }], diagnostics: [] }),
      getArticleManagementSnapshot: () => ok({ clientId: "client-a", revision: 1, articles: [], trash: [], publicationRecords: [], submissionPlatforms: [], workflowItems: [] }),
      getDoubaoLoginState: () => ok({ loginState: { status: "unknown" } }),
      getDoubaoQueueState: () => ok({ queue: { status: "idle", currentTaskId: null, completed: 0, total: 0, waitRemainingMs: 0, tasks: [] } }),
      onDoubaoQueueState: () => () => {},
      listGenerationBatches: () => ok({ batches: [] }),
      getGenerationBatch: () => ok({ batch: null }),
      getGenerationBatchState: () => ok({ status: "idle", state: "idle", batchId: null }),
      getGenerationRuntimeSnapshot: () => ok({ runtimeId: "generation-runtime", sequence: 1, runtime: { status: "idle", state: "idle", batchId: null }, batch: null, capabilities: {} }),
      onGenerationBatchState: () => () => {},
      previewGenerationBatch: () => ok({}),
      createAndStartGenerationBatch: () => ok({}),
      pauseGenerationBatch: () => ok({}),
      abandonGenerationBatch: () => ok({}),
      continueGenerationBatch: () => ok({}),
      resumeGenerationBatch: () => ok({}),
      retryFailedGenerationBatch: () => ok({}),
      previewCancelPendingGenerationBatch: () => ok({ canCancel: false, pendingCount: 0, runningCount: 0 }),
      cancelPendingGenerationBatch: () => ok({}),
    };
    window.__batchHydrationCalls = calls;
    window.desktopConsole = {
      auth: { getState: () => ok({ authenticated: true, user: { loginName: "fixture" }, entitlements: [] }), onStateChanged: () => () => {}, login: () => ok({}), changePassword: () => ok({}), refresh: () => ok({}), logout: () => ok({}) },
      workspace: { getBootstrapState: () => ok({ state: "ready", workspacePath: "fixture", envOverride: false }), getCurrent: () => ok({ workspacePath: "fixture", envOverride: false, validation: { ok: true, errors: [], warnings: [] } }), openCurrent: () => ok(undefined), requestSwitch: () => ok({ state: "ready" }), chooseDirectory: () => ok({ state: "ready" }), confirmSelection: () => ok({ state: "ready" }), cancelSelection: () => ok({ state: "ready" }) },
      workspaceData: { getRuntimeIdentity: () => ok({ workspaceRuntimeId: "runtime-1", revision: 1 }), onInvalidated: () => () => {} },
      runtimeDiagnostics: { get: () => ok({ ok: true, buildInfo: { version: "1" }, browserChannel: { channel: "chromium", configured: true, state: "ready", probed: true }, capabilities: {}, errors: [], warnings: [] }) },
      media: { scanArticles: () => ok([]), getResourcePage: () => ok({ items: [], total: 0, page: 1, pageSize: 1 }), getPool: () => ok([]), getBalance: () => ok({ balance: "0" }) },
      orders: { getOrders: () => ok([]) },
      aiProvider: { getStatus: () => ok({ configured: false, source: "application", apiKeyMask: "", lastTest: null }) },
      platformSettings: { getStatus: () => ok({ configured: false, source: "application", baseUrl: "", timeoutMs: 30000, allowInsecure: false, transport: "未配置", apiKeyMask: "", lastTest: null }) },
      storageMaintenance: { getUsage: () => ok({ logs: { bytes: 0, files: 0 }, temporary: { bytes: 0, files: 0 }, docxCache: { bytes: 0, files: 0 }, profiles: { bytes: 0, files: 0 } }) },
      platforms: { getQueue: () => ok({ platforms: [], queue: [] }), listAccountProfiles: () => ok({ profiles: [] }), getState: () => ok({ isBatchRunning: false, isStopPending: false, isPlatformRunning: false }), onState: () => () => {} },
      publication: { listForArticles: () => ok([]) },
      articleAttention: { list: () => ok({ revision: 0, items: [], counts: { total: 0, actionable: 0 } }) },
      content,
    };
  });

  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.locator("#nav-item-content-production").click();
  await page.getByRole("button", { name: "文章生成" }).click();
  await page.getByRole("tab", { name: "批量生成" }).click();
  await page.getByRole("checkbox", { name: /客户 B/ }).check();
  await page.getByRole("button", { name: "下一步" }).click();
  await page.getByRole("checkbox", { name: /测试模板/ }).check();
  await page.getByRole("button", { name: "下一步" }).click();

  const sourceText = await page.locator(".batch-generation-view").innerText();
  assert.match(sourceText, /客户 B/);
  assert.match(sourceText, /brand-b\.txt/);
  assert.match(sourceText, /可生成/);
  assert.ok((await page.evaluate(() => window.__batchHydrationCalls)).includes("getClientDetails:client-b"));
});
