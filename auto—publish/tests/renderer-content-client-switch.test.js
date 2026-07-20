const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { after, before } = require("node:test");
const { closeRenderer, startRenderer } = require("./helpers/renderer-harness");

function read(file) { return fs.readFileSync(path.resolve(__dirname, "..", file), "utf8"); }

async function changeClientByPointer(page, select, key) {
  const box = await select.boundingBox();
  assert.ok(box, "客户选择器应有可点击的布局盒");
  const hit = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.tagName, {
    x: box.x + box.width / 2,
    y: box.y + box.height / 2,
  });
  assert.equal(hit, "SELECT", "客户选择器中心不能被内容区编辑器或忙碌遮罩覆盖");
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.keyboard.press(key);
  await page.keyboard.press("Enter");
}

describe("renderer content client switching", function() {
  let browser;

  before(async function() {
    ({ browser } = await startRenderer({ port: 4179 }));
  });

  after(closeRenderer);

  it("keeps ordinary queueing scoped to the current client", function() {
    const view = read("media-workbench/src/components/content/GeneratedArticlesView.tsx");
    const queueSelected = view.slice(view.indexOf("async function queueSelected"), view.indexOf("\n  function openArticle", view.indexOf("async function queueSelected")));
    assert.match(queueSelected, /createContentSubmissionBatch/);
    assert.match(queueSelected, /setSelected\(\[\]\)/);
    assert.match(queueSelected, /refreshHistoryData\(\)/);
    assert.doesNotMatch(queueSelected, /setClientId/);
  });

  it("guards client-scoped article, queue, trash, and publication responses", function() {
    const view = read("media-workbench/src/components/content/GeneratedArticlesView.tsx");
    assert.match(view, /clientRequestIdRef/);
    assert.match(view, /requestId === clientRequestIdRef\.current/);
    assert.match(view, /listContentArticles\(clientId\).*listContentSubmissionBatches\(clientId\).*listContentTrash\(clientId\)/s);
    assert.match(view, /listPublicationHistory\(clientId, nextArticles\.map/);
  });

  it("uses one-way history refreshes and keeps the editor inside the content host", function() {
    const view = read("media-workbench/src/components/content/GeneratedArticlesView.tsx");
    const workbench = read("media-workbench/src/components/ContentWorkbench.tsx");
    const editor = read("media-workbench/src/components/content/GeneratedArticleEditorPanel.tsx");
    assert.doesNotMatch(view, /onRefreshArticles/);
    assert.doesNotMatch(workbench.slice(workbench.indexOf("<GeneratedArticlesView")), /onRefreshArticles=/);
    assert.match(workbench, /relative flex min-h-0 min-w-0 flex-1 flex-col/);
    assert.doesNotMatch(editor, /fixed inset-0 z-30/);
    assert.doesNotMatch(editor, /aria-modal/);
  });

  it("clears client-local UI state while retaining workspace preferences", function() {
    const view = read("media-workbench/src/components/content/GeneratedArticlesView.tsx");
    const reset = view.slice(view.indexOf("useEffect(() => {\n    setRemovalTransaction(null)"), view.indexOf("\n  }, [clientId, stopRemovalTransactionWatch]"));
    for (const state of ["setSelected([])", "setBatchFeedback(null)", "setTrashFeedback(null)", "setTrashPreview(null)", "setDrawerArticle(null)", "setAttentionDetail(null)"]) {
      assert.match(reset, new RegExp(state.replace(/[()[\]]/g, "\\$&")));
    }
    assert.match(view, /const \[targetPlatformIds, setTargetPlatformIds\]/);
    assert.doesNotMatch(reset, /setTargetPlatformIds/);
  });

  it("does not use client changes as a signal to stop generation work", function() {
    const workbench = read("media-workbench/src/components/ContentWorkbench.tsx");
    const change = workbench.slice(workbench.indexOf("function handleClientChange"), workbench.indexOf("\n  function changeTab", workbench.indexOf("function handleClientChange")));
    assert.match(change, /setClientId\(nextClientId\)/);
    assert.doesNotMatch(change, /stop|cancel|abort|terminate/i);
  });

  it("resets a real client switch to the pending-submission stage", function() {
    const workbench = read("media-workbench/src/components/ContentWorkbench.tsx");
    const change = workbench.slice(workbench.indexOf("function handleClientChange"), workbench.indexOf("\n  function changeTab", workbench.indexOf("function handleClientChange")));
    assert.match(change, /setArticleStageFilter\('pending_submission'\)/);
    assert.doesNotMatch(change, /setArticleStageFilter\('all'\)/);
  });

  it("switches from a queued client to another client through the real Renderer", async function() {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    page.setDefaultTimeout(8000);
    await page.addInitScript(() => {
      const ok = (data) => Promise.resolve({ ok: true, data });
      const clients = [
        { id: "client-a", name: "客户 A", knowledgeFiles: [] },
        { id: "client-b", name: "客户 B", knowledgeFiles: [] },
      ];
      const article = (clientId, id, title) => ({
        id, clientId, researchQueryIds: [], platform: "fixture-platform", scenario: "客户切换回归",
        templateId: "fixture-template", title, content: `${title} 正文`, status: "generated",
        source: { client_material: true, doubao_answer: true, references: false, template: true },
        createdAt: "2026-07-20T00:00:00.000Z", updatedAt: "2026-07-20T00:00:00.000Z", reviewedAt: null,
        version: 1, sourceArticleId: null,
        templateSnapshot: { platform: "fixture-platform", id: "fixture-template", name: "测试模板", scenario: "客户切换回归", body: "fixture", bodyHash: "fixture", source: "custom" },
      });
      const state = {
        articles: { "client-a": [article("client-a", "article-a", "客户 A 文章")], "client-b": [article("client-b", "article-b", "客户 B 文章")] },
        batches: { "client-a": [] },
        queueCalls: [],
        resolveQueue: null,
      };
      const generationBatch = {
        id: "generation-batch-a", status: "completed",
        clientSources: [{ clientId: "client-a", materialIds: [], researchQueryIds: [] }],
        templates: [{ platform: "fixture-platform", templateId: "fixture-template" }],
        tasks: [{ id: "generation-task-a", clientId: "client-a", platform: "fixture-platform", templateId: "fixture-template", materialIds: [], researchQueryIds: [], status: "succeeded", attempts: 1, error: null, articleId: "article-a" }],
        counts: { total: 1, succeeded: 1, failed: 0, pending: 0, interrupted: 0, cancelled: 0 },
      };
      const platforms = [{ id: "fixture-platform", displayName: "测试投稿平台", contentQueueImport: true }];
      const content = {
        listClients: () => ok(clients),
        listGeneratedArticles: (clientId) => ok(state.articles[clientId] || []),
        listSubmissionPlatforms: () => ok(platforms),
        listSubmissionBatches: (clientId) => ok(state.batches[clientId] || []),
        listArticleTrash: () => ok([]),
        listResearch: () => ok([]),
        listQuestions: () => ok([]),
        listArticleAttention: () => ok({ revision: 0, items: [], counts: { total: 0, actionable: 0 } }),
        listTemplateCatalog: () => ok({ revision: "fixture", platforms: [{ id: "fixture-platform", displayName: "测试模板平台", description: "", order: 1 }], templates: [{ id: "fixture-template", platform: "fixture-platform", scenario: "客户切换回归", name: "测试模板", body: "fixture", bodyHash: "fixture", source: "custom" }], diagnostics: [] }),
        listGenerationBatches: () => ok([generationBatch]),
        getGenerationBatch: () => ok(generationBatch),
        getGenerationBatchState: () => ok({ status: "idle", state: "idle", batchId: null }),
        onGenerationBatchState: () => () => {},
        previewGenerationSubmissionHandoff: () => ok({ generationBatchId: generationBatch.id, previewToken: "handoff-preview", articleCount: 1, clientCount: 1, targetPlatformIds: ["fixture-platform"], estimatedTaskCount: 1, queueableTaskCount: 1, idempotentCount: 0, blockedPublishedCount: 0, blockedUncertainCount: 0, blockedContentCount: 0, conflictCount: 0, unavailableArticleCount: 0, invalidArticles: [], clientGroups: [{ clientId: "client-a", articleCount: 1, queueableTaskCount: 1, idempotentCount: 0 }], items: [] }),
        commitGenerationSubmissionHandoff: () => ok({ generationBatchId: generationBatch.id, createdCount: 1, idempotentCount: 0, blockedCount: 0, conflictCount: 0, failedClientGroups: [], completedClientGroups: ["client-a"], clientGroups: [{ clientId: "client-a", articleCount: 1, queueableTaskCount: 1, idempotentCount: 0 }] }),
        previewSubmissionBatch: (input) => ok({ clientId: input.clientId, totalTaskCount: input.articleIds.length * input.targetPlatformIds.length, queueableTaskCount: input.articleIds.length * input.targetPlatformIds.length, idempotentCount: 0, conflictCount: 0, blockedContentCount: 0, unreviewedArticleIds: [], missingArticleIds: [], unsupportedPlatformIds: [], items: [] }),
        createSubmissionBatch: (input) => {
          state.queueCalls.push(input);
          state.batches[input.clientId] = [{ id: "batch-a", clientId: input.clientId, status: "queued", createdAt: "2026-07-20T00:00:01.000Z", updatedAt: "2026-07-20T00:00:01.000Z", items: input.articleIds.map((articleId) => ({ articleId, targetPlatformId: input.targetPlatformIds[0], status: "queued", canCancel: true })) }];
          return new Promise((resolve) => { state.resolveQueue = () => resolve({ ok: true, data: state.batches[input.clientId][0] }); });
        },
        getDoubaoLoginState: () => ok({ status: "unknown" }),
        getDoubaoQueueState: () => ok({ status: "idle", currentTaskId: null, completed: 0, total: 0, waitRemainingMs: 0, tasks: [] }),
        onDoubaoQueueState: () => () => {},
      };
      window.__clientSwitchFlow = state;
      window.desktopConsole = {
        auth: { getState: () => ok({ authenticated: true, user: { loginName: "fixture" }, entitlements: [{ product: "AutoPublish", enabled: true, expiresAt: null }] }), login: () => ok({ authenticated: true }), changePassword: () => ok({ authenticated: true }), refresh: () => ok({ authenticated: true }), logout: () => ok({ authenticated: false, user: null }), onStateChanged: () => () => {} },
        workspace: { getBootstrapState: () => ok({ state: "ready", workspacePath: "fixture", envOverride: false }), getCurrent: () => ok({ workspacePath: "fixture", envOverride: false, validation: { ok: true, errors: [], warnings: [] } }), openCurrent: () => ok(undefined), requestSwitch: () => ok({ state: "ready", workspacePath: "fixture", envOverride: false }), chooseDirectory: () => ok({ state: "ready", workspacePath: "fixture", envOverride: false }), confirmSelection: () => ok({ state: "ready" }), cancelSelection: () => ok({ state: "ready", workspacePath: "fixture", envOverride: false }) },
        workspaceData: { onInvalidated: () => () => {} },
        runtimeDiagnostics: { get: () => ok({ ok: true, buildInfo: { version: "1.0.1" }, browserChannel: { channel: "chromium", configured: true, state: "ready", probed: true }, capabilities: {}, errors: [], warnings: [] }), browserSmoke: () => ok({ ok: true }) },
        media: { scanArticles: () => ok([]), getResourcePage: () => ok({ items: [], total: 0, page: 1, pageSize: 1 }), getPool: () => ok([]), getBalance: () => ok({ balance: "0" }), getOrders: () => ok([]) },
        orders: { getOrders: () => ok([]) },
        aiProvider: { getStatus: () => ok({ configured: false, source: "application", apiKeyMask: "", lastTest: null }), save: () => ok({}), testConnection: () => ok({}), clear: () => ok({}) },
        platformSettings: { getStatus: () => ok({ configured: false, source: "application", baseUrl: "", timeoutMs: 30000, allowInsecure: false, transport: "未配置", apiKeyMask: "", lastTest: null }), save: () => ok({}), test: () => ok({}), clear: () => ok({}) },
        storageMaintenance: { getUsage: () => ok({ logs: { bytes: 0, files: 0 }, temporary: { bytes: 0, files: 0 }, docxCache: { bytes: 0, files: 0 }, profiles: { bytes: 0, files: 0 } }), cleanCaches: () => ok({ blocked: false }) },
        platforms: { getQueue: () => ok({ platforms: [], queue: [] }), getState: () => ok({ isBatchRunning: false, isStopPending: false, isPlatformRunning: false }), onState: () => () => {} },
        publication: { listForArticles: () => ok([]), reconcile: () => ok({}) },
        articleAttention: { list: () => ok({ revision: 0, items: [], counts: { total: 0, actionable: 0 } }) },
        content,
      };
    });
    try {
      page.on("dialog", (dialog) => void dialog.accept());
      await page.goto("http://127.0.0.1:4179/", { waitUntil: "domcontentloaded" });
      await page.locator("#nav-item-content").click();
      const clientSelect = page.getByRole("combobox", { name: "当前客户（单篇/问题/历史）" });
      await page.waitForFunction(() => document.querySelector('[aria-label="当前客户（单篇/问题/历史）"]')?.value === "client-a");
      await page.getByRole("button", { name: "历史文章" }).click();
      await page.getByRole("heading", { name: "历史文章" }).waitFor();
      await page.getByRole("button", { name: /fixture-platform.*测试模板/ }).click();
      await page.locator('input[type="checkbox"][aria-label="选择 客户 A 文章"]').check();
      await page.getByRole("button", { name: "测试投稿平台" }).click();
      await page.getByRole("button", { name: "加入投稿队列" }).click();
      await page.waitForFunction(() => window.__clientSwitchFlow.queueCalls.length === 1);
      await changeClientByPointer(page, clientSelect, "ArrowDown");
      assert.equal(await clientSelect.inputValue(), "client-b");
      await page.evaluate(() => window.__clientSwitchFlow.resolveQueue());
      assert.equal(await page.getByText("客户 B 文章", { exact: true }).count(), 1);
      assert.equal(await page.getByText("客户 A 文章", { exact: true }).count(), 0);
      assert.deepEqual(await page.evaluate(() => window.__clientSwitchFlow.queueCalls.map((item) => item.clientId)), ["client-a"]);
      assert.equal(await page.getByRole("button", { name: "加入投稿队列" }).isDisabled(), true);
      await changeClientByPointer(page, clientSelect, "ArrowUp");
      await page.getByRole("button", { name: "文章生成" }).click();
      await page.getByRole("tab", { name: "批量生成" }).click();
      await page.getByRole("button", { name: "将成功文章加入投稿队列" }).waitFor();
      await page.getByRole("button", { name: "将成功文章加入投稿队列" }).click();
      await page.getByRole("checkbox", { name: "测试投稿平台" }).check();
      await page.getByRole("button", { name: "检查并确认" }).click();
      await page.getByRole("button", { name: "一次确认并加入投稿队列" }).click();
      await page.getByTestId("generation-handoff-summary").waitFor();
      await changeClientByPointer(page, clientSelect, "ArrowDown");
      assert.equal(await clientSelect.inputValue(), "client-b");
      assert.equal(await page.getByTestId("generation-handoff-summary").count(), 1);
    } finally {
      await page.close();
    }
  });
});
