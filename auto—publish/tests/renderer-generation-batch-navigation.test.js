const assert = require("node:assert/strict");
const { after, before, describe, it } = require("node:test");
const { closeRenderer, startRenderer } = require("./helpers/renderer-harness");

describe("renderer generation batch navigation", { concurrency: false }, function () {
  let browser;
  let rendererUrl;

  before(async function () {
    ({ browser, url: rendererUrl } = await startRenderer({ port: 4180 }));
  });

  after(closeRenderer);

  it("opens the article library with a batch filter without creating submission facts", async function () {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    page.setDefaultTimeout(8000);
    await page.addInitScript(() => {
      const ok = (data) => Promise.resolve({ ok: true, data });
      const client = { id: "client-a", name: "客户 A", knowledgeFiles: [] };
      const article = {
        id: "article-a",
        clientId: client.id,
        generationBatchId: "generation-batch-a",
        generationTaskId: "generation-task-a",
        researchQueryIds: [],
        platform: "fixture-platform",
        scenario: "批次导航回归",
        templateId: "fixture-template",
        title: "本批次文章",
        content: "本批次文章正文",
        status: "generated",
        source: {
          client_material: true,
          doubao_answer: true,
          references: false,
          template: true,
        },
        createdAt: "2026-08-14T00:00:00.000Z",
        updatedAt: "2026-08-14T00:00:00.000Z",
        templateSnapshot: {
          platform: "fixture-platform",
          id: "fixture-template",
          name: "测试模板",
          scenario: "批次导航回归",
          body: "fixture",
          bodyHash: "fixture",
          source: "custom",
        },
      };
      const workflow = {
        articleId: article.id,
        workflow: {
          version: 1,
          stage: "pending_submission",
          label: "待投稿",
          primaryAction: "submit",
          allowedBulkActions: ["submit"],
          locks: {
            canEdit: true,
            canSubmit: true,
            canCancel: false,
            canTrash: true,
          },
          operations: {
            edit: { allowed: true, reasonCodes: [] },
            submit: { allowed: true, reasonCodes: [] },
            trash: { allowed: true, reasonCodes: [] },
            restore: { allowed: false, reasonCodes: [] },
            purge: { allowed: false, reasonCodes: [] },
          },
          publicationSummary: {
            status: "not_submitted",
            label: "未投稿",
            records: 0,
            published: 0,
            uncertain: false,
          },
          attentionCount: 0,
          orderSummary: { total: 0, pending: 0, unresolved: 0 },
        },
      };
      const batch = {
        id: "generation-batch-a",
        status: "completed",
        clientSources: [
          { clientId: client.id, materialIds: [], researchQueryIds: [] },
        ],
        templates: [
          { platform: "fixture-platform", templateId: "fixture-template" },
        ],
        tasks: [
          {
            id: "generation-task-a",
            clientId: client.id,
            platform: "fixture-platform",
            templateId: "fixture-template",
            materialIds: [],
            researchQueryIds: [],
            status: "succeeded",
            attempts: 1,
            error: null,
            articleId: article.id,
            articleTitle: article.title,
          },
        ],
        counts: {
          total: 1,
          succeeded: 1,
          failed: 0,
          pending: 0,
          interrupted: 0,
          cancelled: 0,
        },
      };
      const state = { managementReads: 0, submissionMutations: 0 };
      const managementSnapshot = () => {
        state.managementReads += 1;
        return ok({
          clientId: client.id,
          revision: state.managementReads,
          articles: [article],
          trash: [],
          publicationRecords: [],
          submissionPlatforms: [
            {
              id: "fixture-platform",
              displayName: "测试投稿平台",
              contentQueueImport: true,
            },
          ],
          workflowItems: [workflow],
        });
      };
      const content = {
        listClients: () => ok({ clients: [client] }),
        listResearch: () => ok({ research: [] }),
        listQuestions: () => ok({ questions: [] }),
        listTemplateCatalog: () =>
          ok({
            revision: "fixture",
            platforms: [
              {
                id: "fixture-platform",
                displayName: "测试模板平台",
                description: "",
                order: 1,
              },
            ],
            templates: [
              {
                id: "fixture-template",
                platform: "fixture-platform",
                scenario: "批次导航回归",
                name: "测试模板",
                body: "fixture",
                bodyHash: "fixture",
                source: "custom",
              },
            ],
            diagnostics: [],
          }),
        getArticleManagementSnapshot: managementSnapshot,
        getArticleEditor: () =>
          ok({ article, editFingerprint: "article-fingerprint" }),
        getDoubaoLoginState: () => ok({ loginState: { status: "unknown" } }),
        getDoubaoQueueState: () =>
          ok({
            queue: {
              status: "idle",
              currentTaskId: null,
              completed: 0,
              total: 0,
              waitRemainingMs: 0,
              tasks: [],
            },
          }),
        onDoubaoQueueState: () => () => {},
        listArticleAttention: () =>
          ok({ revision: 0, items: [], counts: { total: 0, actionable: 0 } }),
        previewRegularQueueAdmission: () => {
          state.submissionMutations += 1;
          return ok({});
        },
        admitRegularQueueItems: () => {
          state.submissionMutations += 1;
          return ok({});
        },
        listPaidMediaBatches: () => ok({ items: [] }),
        previewGenerationBatch: () => ok({}),
        createAndStartGenerationBatch: () => ok({ batch }),
        pauseGenerationBatch: () => ok({ batch }),
        abandonGenerationBatch: () => ok({ batch }),
        resumeGenerationBatch: () => ok({ batch }),
        retryFailedGenerationBatch: () => ok({ batch }),
        previewCancelPendingGenerationBatch: () => ok({ canCancel: false, pendingCount: 0, runningCount: 0 }),
        cancelPendingGenerationBatch: () => ok({ batch }),
        getGenerationRuntimeSnapshot: () =>
          ok({
            runtimeId: "generation-runtime",
            sequence: 1,
            runtime: { status: "idle", state: "idle", batchId: null },
            batch,
            capabilities: {},
          }),
        onGenerationBatchState: () => () => {},
      };
      window.desktopConsole = {
        auth: {
          getState: () =>
            ok({ authenticated: true, user: { loginName: "fixture" }, entitlements: [] }),
          onStateChanged: () => () => {},
          login: () => ok({}),
          changePassword: () => ok({}),
          refresh: () => ok({}),
          logout: () => ok({}),
        },
        workspace: {
          getBootstrapState: () => ok({ state: "ready", workspacePath: "fixture", envOverride: false }),
          getCurrent: () => ok({ workspacePath: "fixture", envOverride: false, validation: { ok: true, errors: [], warnings: [] } }),
          openCurrent: () => ok(undefined),
          requestSwitch: () => ok({ state: "ready", workspacePath: "fixture", envOverride: false }),
          chooseDirectory: () => ok({ state: "ready", workspacePath: "fixture", envOverride: false }),
          confirmSelection: () => ok({ state: "ready" }),
          cancelSelection: () => ok({ state: "ready", workspacePath: "fixture", envOverride: false }),
        },
        workspaceData: {
          getRuntimeIdentity: () => ok({ workspaceRuntimeId: "generation-runtime", revision: 1 }),
          onInvalidated: () => () => {},
        },
        runtimeDiagnostics: {
          get: () =>
            ok({
              ok: true,
              buildInfo: { version: "1.0.1" },
              browserChannel: { channel: "chromium", configured: true, state: "ready", probed: true },
              capabilities: {},
              errors: [],
              warnings: [],
            }),
        },
        media: {
          scanArticles: () => ok([]),
          getResourcePage: () => ok({ items: [], total: 0, page: 1, pageSize: 1 }),
          getPool: () => ok([]),
          getBalance: () => ok({ balance: "0" }),
        },
        orders: { getOrders: () => ok([]) },
        aiProvider: { getStatus: () => ok({ configured: false, source: "application", apiKeyMask: "", lastTest: null }) },
        platformSettings: { getStatus: () => ok({ configured: false, source: "application", baseUrl: "", timeoutMs: 30000, allowInsecure: false, transport: "未配置", apiKeyMask: "", lastTest: null }) },
        storageMaintenance: { getUsage: () => ok({ logs: { bytes: 0, files: 0 }, temporary: { bytes: 0, files: 0 }, docxCache: { bytes: 0, files: 0 }, profiles: { bytes: 0, files: 0 } }) },
        platforms: {
          getQueue: () => ok({ platforms: [], queue: [] }),
          listAccountProfiles: () => ok({ profiles: [] }),
          getState: () => ok({ isBatchRunning: false, isStopPending: false, isPlatformRunning: false }),
          onState: () => () => {},
        },
        publication: { listForArticles: () => ok([]) },
        articleAttention: { list: () => ok({ revision: 0, items: [], counts: { total: 0, actionable: 0 } }) },
        content,
      };
      window.__generationBatchNavigation = state;
    });
    try {
      await page.goto(rendererUrl, { waitUntil: "domcontentloaded" });
      assert.deepEqual(
        await page.locator("[data-sidebar-navigation-item='true']").evaluateAll((buttons) => buttons.map((button) => button.id)),
        [
          "nav-item-content-production",
          "nav-item-article-library",
          "nav-item-submission-center",
          "nav-item-orders",
          "nav-item-resources",
          "nav-item-settings",
        ],
      );
      assert.equal(await page.locator("#nav-item-article-library .sidebar-badge").count(), 0);
      assert.equal(await page.locator("#nav-item-platforms").count(), 0);
      assert.equal(await page.locator("#nav-item-workbench").count(), 0);
      await page.locator("#nav-item-content-production").click();
      await page.getByRole("button", { name: "批量生成", exact: true }).click();
      const bulkSubmit = page.getByRole("button", { name: "批量投稿", exact: true });
      await bulkSubmit.waitFor();
      await bulkSubmit.click();
      await page.getByRole("dialog", { name: "批量投稿本批次文章" }).waitFor();
      assert.equal(
        await page.evaluate(() => window.__generationBatchNavigation.submissionMutations),
        0,
      );
    } finally {
      await page.close();
    }
  });
});
