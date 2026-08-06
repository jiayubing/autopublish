const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { after, before } = require("node:test");
const { closeRenderer, startRenderer } = require("./helpers/renderer-harness");


async function changeClientByKeyboard(page, select, key) {
  const box = await select.boundingBox();
  assert.ok(box, "客户选择器应有可点击的布局盒");
  const hit = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.tagName, {
    x: box.x + box.width / 2,
    y: box.y + box.height / 2,
  });
  assert.equal(hit, "SELECT", "客户选择器中心不能被内容区编辑器或忙碌遮罩覆盖");
  await select.focus();
  await page.keyboard.press(key);
  await page.keyboard.press("Enter");
}

describe("renderer content client switching", function() {
  let browser;

  before(async function() {
    ({ browser } = await startRenderer({ port: 4179 }));
  });

  after(closeRenderer);

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
        createdAt: "2026-07-20T00:00:00.000Z", updatedAt: "2026-07-20T00:00:00.000Z",
        version: 1, sourceArticleId: null,
        templateSnapshot: { platform: "fixture-platform", id: "fixture-template", name: "测试模板", scenario: "客户切换回归", body: "fixture", bodyHash: "fixture", source: "custom" },
      });
      const state = {
        articles: { "client-a": [article("client-a", "article-a", "客户 A 文章")], "client-b": [article("client-b", "article-b", "客户 B 文章")] },
        batches: { "client-a": [] },
        queueCalls: [],
        resolveQueue: null,
        regularQueueCalls: [],
        regularQueueBatchSequence: 0,
        resolveRegularQueue: null,
        cancellationCalls: [],
        resolveCancellation: null,
        cancelPreviewCalls: [],
        mediaExportCalls: [],
      };
      const generationBatch = {
        id: "generation-batch-a", status: "completed",
        clientSources: [{ clientId: "client-a", materialIds: [], researchQueryIds: [] }],
        templates: [{ platform: "fixture-platform", templateId: "fixture-template" }],
        tasks: [{ id: "generation-task-a", clientId: "client-a", platform: "fixture-platform", templateId: "fixture-template", materialIds: [], researchQueryIds: [], status: "succeeded", attempts: 1, error: null, articleId: "article-a" }],
        counts: { total: 1, succeeded: 1, failed: 0, pending: 0, interrupted: 0, cancelled: 0 },
      };
      const platforms = [{ id: "fixture-platform", displayName: "测试投稿平台", contentQueueImport: true }];
      const pendingWorkflow = (articleId) => ({
        articleId,
        workflow: {
          version: 1,
          stage: "pending_submission",
          label: "待投稿",
          primaryAction: "queue",
          allowedBulkActions: ["queue"],
          locks: { canEdit: true, canQueue: true, canCancel: false, canTrash: true },
          publicationSummary: { status: "not_submitted", label: "未投稿", records: 0, published: 0, uncertain: false },
          targetFacts: [],
        },
      });
      const content = {
        listClients: () => ok({ clients }),
        listGeneratedArticles: (clientId) => ok({ articles: state.articles[clientId] || [] }),
        getArticleManagementSnapshot: ({ clientId }) => {
          const batches = state.batches[clientId] || [];
          const workflowItems = (state.articles[clientId] || []).map((item) => pendingWorkflow(item.id));
          return ok({ clientId, revision: 1, articles: state.articles[clientId] || [], trash: [], submissionBatches: batches, cancellationPlans: batches.filter((batch) => batch.status === "queued").map((batch) => ({ batchId: batch.id, clientId, action: "cancel", planId: `plan-${batch.id}-${batch.status}`, fingerprint: batch.status, allowedCount: batch.items.length, blockedCount: 0, items: batch.items.map((item) => ({ articleId: item.articleId, targetPlatformId: item.targetPlatformId, action: "cancel", allowed: true })) })), publicationRecords: [], attention: { revision: 1, items: [], counts: { total: 0, actionable: 0 } }, submissionPlatforms: platforms, workflowItems, publicationSummaryItems: workflowItems.map((item) => ({ articleId: item.articleId, summary: item.workflow.publicationSummary })) });
        },
        listSubmissionPlatforms: () => ok({ platforms }),
        listSubmissionBatches: ({ clientId }) => ok({ batches: state.batches[clientId] || [] }),
        listArticleTrash: () => ok({ trash: [] }),
        listResearch: () => ok({ research: [] }),
        listQuestions: () => ok({ questions: [] }),
        listArticleAttention: () => ok({ revision: 0, items: [], counts: { total: 0, actionable: 0 } }),
        listTemplateCatalog: () => ok({ revision: "fixture", platforms: [{ id: "fixture-platform", displayName: "测试模板平台", description: "", order: 1 }], templates: [{ id: "fixture-template", platform: "fixture-platform", scenario: "客户切换回归", name: "测试模板", body: "fixture", bodyHash: "fixture", source: "custom" }], diagnostics: [] }),
        listGenerationBatches: () => ok({ batches: [generationBatch] }),
        getGenerationBatch: () => ok({ batch: generationBatch }),
        getGenerationBatchState: () => ok({ status: "idle", state: "idle", batchId: null }),
        getGenerationRuntimeSnapshot: () => ok({ runtimeId: "fixture-runtime", sequence: 0, runtime: { status: "idle", state: "idle", batchId: null }, batch: generationBatch, capabilities: {} }),
        onGenerationBatchState: () => () => {},
        previewGenerationSubmissionHandoff: () => ok({ generationBatchId: generationBatch.id, previewToken: "handoff-preview", articleCount: 1, clientCount: 1, targetPlatformIds: ["fixture-platform"], estimatedTaskCount: 1, queueableTaskCount: 1, idempotentCount: 0, blockedPublishedCount: 0, blockedUncertainCount: 0, blockedContentCount: 0, conflictCount: 0, unavailableArticleCount: 0, invalidArticles: [], clientGroups: [{ clientId: "client-a", articleCount: 1, queueableTaskCount: 1, idempotentCount: 0 }], items: [] }),
        commitGenerationSubmissionHandoff: () => ok({ generationBatchId: generationBatch.id, createdCount: 1, idempotentCount: 0, blockedCount: 0, conflictCount: 0, failedClientGroups: [], completedClientGroups: ["client-a"], clientGroups: [{ clientId: "client-a", articleCount: 1, queueableTaskCount: 1, idempotentCount: 0 }] }),
        previewRegularQueueAdmission: (input) => ok({ target: { platformId: input.platformId, accountProfileId: input.accountProfileId }, articleRefs: input.articleRefs, items: input.articleRefs.map((articleRef) => ({ articleRef, articleId: articleRef.articleId, status: "queueable" })), totalCount: input.articleRefs.length, queueableCount: input.articleRefs.length, idempotentCount: 0, missingCount: 0, conflictCount: 0 }),
        admitRegularQueueItems: (input) => {
          const clientId = input.articleRefs[0].clientId;
          const batchId = `regular-batch-${++state.regularQueueBatchSequence}`;
          const batch = { id: batchId, clientId, status: "queued", createdAt: "2026-07-20T00:00:01.000Z", updatedAt: "2026-07-20T00:00:01.000Z", items: input.articleRefs.map((articleRef, index) => ({ articleId: articleRef.articleId, itemId: `regular-item-${batchId}`, batchId, targetPlatformId: input.platformId, targetKey: `platform:${input.platformId}`, queueGroupId: `regular-group-${input.platformId}`, position: index + 1, status: "queued", canCancel: true })) };
          state.regularQueueCalls.push(input);
          state.batches[clientId] = [batch];
          return new Promise((resolve) => { state.resolveRegularQueue = () => resolve(ok({ batchId, target: { platformId: input.platformId, accountProfileId: input.accountProfileId }, articleRefs: input.articleRefs, items: batch.items.map((item, index) => ({ articleRef: input.articleRefs[index], articleId: item.articleId, itemId: item.itemId, batchId, targetKey: item.targetKey, queueGroupId: item.queueGroupId, position: item.position, status: "queued" })), admittedCount: batch.items.length, idempotentCount: 0, missingCount: 0, conflictCount: 0 })); });
        },
        previewSubmissionBatch: (input) => ok({ clientId: input.clientId, totalTaskCount: input.articleIds.length * input.targetPlatformIds.length, queueableTaskCount: input.articleIds.length * input.targetPlatformIds.length, idempotentCount: 0, conflictCount: 0, blockedContentCount: 0, missingArticleIds: [], unsupportedPlatformIds: [], items: [] }),
        createSubmissionBatch: (input) => {
          state.queueCalls.push(input);
          state.batches[input.clientId] = [{ id: "batch-a", clientId: input.clientId, status: "queued", createdAt: "2026-07-20T00:00:01.000Z", updatedAt: "2026-07-20T00:00:01.000Z", items: input.articleIds.map((articleId) => ({ articleId, targetPlatformId: input.targetPlatformIds[0], status: "queued", canCancel: true })) }];
          return new Promise((resolve) => { state.resolveQueue = () => resolve({ ok: true, data: state.batches[input.clientId][0] }); });
        },
        previewExport: (input) => ok({ filename: `${input.generatedArticleId}.md` }),
        exportArticle: (input) => { state.mediaExportCalls.push(input); return ok({ filename: `${input.generatedArticleId}.md` }); },
        previewCancelSubmissionBatch: ({ batchId }) => {
          state.cancelPreviewCalls.push(batchId);
          const batch = Object.values(state.batches).flat().find((item) => item.id === batchId);
          const items = (batch?.items || []).map((item) => ({ articleId: item.articleId, targetPlatformId: item.targetPlatformId, action: "cancel", allowed: item.status === "queued" }));
          return ok({ batchId, clientId: batch?.clientId || "", action: "cancel", planId: `plan-${batchId}-${batch?.status}`, fingerprint: batch?.status || "missing", allowedCount: items.filter((item) => item.allowed).length, blockedCount: items.filter((item) => !item.allowed).length, items });
        },
        cancelSubmissionBatch: ({ batchId, planId }) => {
          const batch = Object.values(state.batches).flat().find((item) => item.id === batchId);
          state.cancellationCalls.push({ batchId, planId });
          return new Promise((resolve) => {
            state.resolveCancellation = () => {
              batch.status = "cancelled";
              batch.updatedAt = "2026-07-20T00:00:02.000Z";
              batch.items.forEach((item) => { item.status = "cancelled"; item.canCancel = false; });
              resolve(ok({ batchId, planId, cancelledCount: 1, idempotentCount: 0, blockedItems: [], batchStatus: "cancelled", changedScopes: [], items: batch.items }));
            };
          });
        },
        getDoubaoLoginState: () => ok({ loginState: { status: "unknown" } }),
        getDoubaoQueueState: () => ok({ queue: { status: "idle", currentTaskId: null, completed: 0, total: 0, waitRemainingMs: 0, tasks: [] } }),
        onDoubaoQueueState: () => () => {},
      };
      window.__clientSwitchFlow = state;
      window.desktopConsole = {
        auth: { getState: () => ok({ authenticated: true, user: { loginName: "fixture" }, entitlements: [{ product: "AutoPublish", enabled: true, expiresAt: null }] }), login: () => ok({ authenticated: true }), changePassword: () => ok({ authenticated: true }), refresh: () => ok({ authenticated: true }), logout: () => ok({ authenticated: false, user: null }), onStateChanged: () => () => {} },
        workspace: { getBootstrapState: () => ok({ state: "ready", workspacePath: "fixture", envOverride: false }), getCurrent: () => ok({ workspacePath: "fixture", envOverride: false, validation: { ok: true, errors: [], warnings: [] } }), openCurrent: () => ok(undefined), requestSwitch: () => ok({ state: "ready", workspacePath: "fixture", envOverride: false }), chooseDirectory: () => ok({ state: "ready", workspacePath: "fixture", envOverride: false }), confirmSelection: () => ok({ state: "ready" }), cancelSelection: () => ok({ state: "ready", workspacePath: "fixture", envOverride: false }) },
        workspaceData: { getRuntimeIdentity: () => ok({ workspaceRuntimeId: "client-switch-runtime", revision: 1 }), onInvalidated: () => () => {} },
        runtimeDiagnostics: { get: () => ok({ ok: true, buildInfo: { version: "1.0.1" }, browserChannel: { channel: "chromium", configured: true, state: "ready", probed: true }, capabilities: {}, errors: [], warnings: [] }), browserSmoke: () => ok({ ok: true }) },
        media: { scanArticles: () => ok({ items: [] }), getResourcePage: () => ok({ items: [], total: 0, page: 1, pageSize: 1 }), getPool: () => ok({ items: [] }), getBalance: () => ok({ balance: "0" }) },
        orders: { getOrders: () => ok({ items: [] }) },
        aiProvider: { getStatus: () => ok({ configured: false, source: "application", apiKeyMask: "", lastTest: null }), save: () => ok({}), testConnection: () => ok({}), clear: () => ok({}) },
        platformSettings: { getStatus: () => ok({ configured: false, source: "application", baseUrl: "", timeoutMs: 30000, allowInsecure: false, transport: "未配置", apiKeyMask: "", lastTest: null }), save: () => ok({}), test: () => ok({}), clear: () => ok({}) },
        storageMaintenance: { getUsage: () => ok({ logs: { bytes: 0, files: 0 }, temporary: { bytes: 0, files: 0 }, docxCache: { bytes: 0, files: 0 }, profiles: { bytes: 0, files: 0 } }), cleanCaches: () => ok({ blocked: false }) },
        platforms: { getQueue: () => ok({ revision: 0, platforms: [], queue: [] }), listAccountProfiles: () => ok({ profiles: [{ accountProfileId: "account-fixture", platformId: "fixture-platform", displayName: "测试账号" }] }), confirmAccountProfile: (input) => ok({ profile: { accountProfileId: "account-confirmed", platformId: input.platformId, displayName: input.displayName } }), getState: () => ok({ isBatchRunning: false, isStopPending: false, isPlatformRunning: false }), onState: () => () => {} },
        publication: { listForArticles: () => ok({ records: [] }), reconcile: () => ok({ record: {} }) },
        content,
      };
    });
    try {
      await page.goto("http://127.0.0.1:4179/", { waitUntil: "domcontentloaded" });
      await page.locator("#nav-item-content").click();
      const clientSelect = page.getByRole("combobox", { name: "当前客户（单篇/问题/历史）" });
      await page.waitForFunction(() => document.querySelector('[aria-label="当前客户（单篇/问题/历史）"]')?.value === "client-a");
      await page.getByRole("button", { name: "历史文章" }).click();
      await page.getByRole("heading", { name: "历史文章" }).waitFor();
      await page.getByRole("button", { name: /fixture-platform.*测试模板/ }).click();
      await page.locator('input[type="checkbox"][aria-label="选择 客户 A 文章"]').check();
      await page.getByRole("button", { name: "加入付费媒体投稿" }).click();
      await page.getByRole("dialog", { name: "确认加入付费媒体投稿" }).waitFor();
      await page.getByRole("button", { name: "确认加入付费媒体投稿" }).click();
      await page.waitForFunction(() => window.__clientSwitchFlow.mediaExportCalls.length === 1);
      assert.deepEqual(await page.evaluate(() => window.__clientSwitchFlow.mediaExportCalls[0]), { clientId: "client-a", generatedArticleId: "article-a", targetPlatform: "media", confirmed: true });
      await page.locator('input[type="checkbox"][aria-label="选择 客户 A 文章"]').check();
      await page.getByRole("button", { name: "测试投稿平台" }).click();
      await page.getByRole("button", { name: "加入投稿队列" }).click();
      await page.getByRole("dialog", { name: "确认加入投稿队列" }).waitFor();
      assert.equal(await page.evaluate(() => window.__clientSwitchFlow.regularQueueCalls.length), 0);
      await page.getByRole("button", { name: "确认加入投稿队列" }).click();
      await page.waitForFunction(() => window.__clientSwitchFlow.regularQueueCalls.length === 1);
      await page.evaluate(() => window.__clientSwitchFlow.resolveRegularQueue());
      await page.getByText("已加入 1 项普通平台队列。", { exact: true }).waitFor();
      assert.equal(await page.locator('input[type="checkbox"][aria-label="选择 客户 A 文章"]').isChecked(), false);

      await page.locator('input[type="checkbox"][aria-label="选择 客户 A 文章"]').check();
      await page.getByRole("button", { name: "加入投稿队列" }).click();
      await page.getByRole("dialog", { name: "确认加入投稿队列" }).waitFor();
      await page.getByRole("button", { name: "确认加入投稿队列" }).click();
      await page.waitForFunction(() => window.__clientSwitchFlow.regularQueueCalls.length === 2);
      await changeClientByKeyboard(page, clientSelect, "ArrowDown");
      assert.equal(await clientSelect.inputValue(), "client-b");
      await page.evaluate(() => window.__clientSwitchFlow.resolveRegularQueue());
      assert.equal(await page.getByText("客户 B 文章", { exact: true }).count(), 1);
      assert.equal(await page.getByText("客户 A 文章", { exact: true }).count(), 0);
      assert.deepEqual(await page.evaluate(() => window.__clientSwitchFlow.regularQueueCalls.map((item) => item.articleRefs[0].clientId)), ["client-a", "client-a"]);
      assert.equal(await page.evaluate(() => window.__clientSwitchFlow.regularQueueCalls[0].accountProfileId), "account-fixture");
      assert.equal(await page.getByRole("button", { name: "加入投稿队列" }).isDisabled(), true);
      await changeClientByKeyboard(page, clientSelect, "ArrowUp");
      assert.equal(await clientSelect.inputValue(), "client-a");
      await page.getByRole("button", { name: /撤销未开始投稿/ }).waitFor();
      assert.deepEqual(await page.evaluate(() => window.__clientSwitchFlow.cancelPreviewCalls), []);
      await page.getByRole("button", { name: /撤销未开始投稿/ }).click();
      await page.getByRole("dialog", { name: "确认撤销未开始投稿" }).waitFor();
      assert.equal(await page.evaluate(() => window.__clientSwitchFlow.cancellationCalls.length), 0);
      await page.getByRole("button", { name: "确认撤销" }).click();
      await page.waitForFunction(() => window.__clientSwitchFlow.cancellationCalls.length === 1);
      assert.equal(await page.getByRole("button", { name: /正在撤销/ }).isDisabled(), true);
      await changeClientByKeyboard(page, clientSelect, "ArrowDown");
      assert.equal(await clientSelect.inputValue(), "client-b");
      await page.evaluate(() => window.__clientSwitchFlow.resolveCancellation());
      await changeClientByKeyboard(page, clientSelect, "ArrowUp");
      await page.waitForFunction(() => !document.body.innerText.includes("正在撤销"));
      assert.equal(await page.getByRole("button", { name: /撤销未开始投稿/ }).count(), 0);
      assert.equal(await page.getByRole("button", { name: /正在撤销/ }).count(), 0);
      assert.deepEqual(await page.evaluate(() => window.__clientSwitchFlow.cancellationCalls.map((item) => item.batchId)), ["regular-batch-2"]);
      await page.getByRole("button", { name: "文章生成" }).click();
      await page.getByRole("tab", { name: "批量生成" }).click();
      await page.getByRole("button", { name: "将成功文章加入投稿队列" }).waitFor();
      await page.getByRole("button", { name: "将成功文章加入投稿队列" }).click();
      await page.getByRole("checkbox", { name: "测试投稿平台" }).check();
      await page.getByRole("button", { name: "检查并确认" }).click();
      await page.getByRole("button", { name: "一次确认并加入投稿队列" }).click();
      await page.getByTestId("generation-handoff-summary").waitFor();
      await changeClientByKeyboard(page, clientSelect, "ArrowDown");
      assert.equal(await clientSelect.inputValue(), "client-b");
      assert.equal(await page.getByTestId("generation-handoff-summary").count(), 1);
    } finally {
      await page.close();
    }
  });
});
