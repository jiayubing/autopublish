const assert = require("node:assert/strict");
const { after, before, describe, it } = require("node:test");
const { closeRenderer, startRenderer } = require("./helpers/renderer-harness");

describe("renderer generation submission handoff", { concurrency: false }, function() {
  let browser;
  let rendererUrl;

  before(async function() {
    ({ browser, url: rendererUrl } = await startRenderer({ port: 4180 }));
  });

  after(closeRenderer);

  it("closes the modal after a successful handoff and leaves a non-modal summary", async function() {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    page.setDefaultTimeout(8000);
    page.on("dialog", (dialog) => void dialog.accept());
    await page.addInitScript(() => {
      const ok = (data) => Promise.resolve({ ok: true, data });
      const client = { id: "client-a", name: "客户 A", knowledgeFiles: [] };
      const batch = {
        id: "generation-batch-a", status: "completed",
        clientSources: [{ clientId: "client-a", materialIds: [], researchQueryIds: [] }],
        templates: [{ platform: "fixture-platform", templateId: "fixture-template" }],
        tasks: [{ id: "generation-task-a", clientId: "client-a", platform: "fixture-platform", templateId: "fixture-template", materialIds: [], researchQueryIds: [], status: "succeeded", attempts: 1, error: null, articleId: "article-a" }],
        counts: { total: 1, succeeded: 1, failed: 0, pending: 0, interrupted: 0, cancelled: 0 },
      };
      const state = { profiles: [], previewInputs: [] };
      const content = {
        listClients: () => ok([client]), listResearch: () => ok([]), listQuestions: () => ok([]), listGeneratedArticles: () => ok([]), getArticleManagementSnapshot: () => ok({ clientId: client.id, revision: 1, articles: [], trash: [], submissionBatches: [], cancellationPlans: [], publicationRecords: [], attention: { revision: 1, items: [], counts: { total: 0, actionable: 0 } }, submissionPlatforms: [{ id: "fixture-platform", displayName: "测试投稿平台", contentQueueImport: true }], workflowByArticle: {}, publicationSummaries: {} }), listSubmissionBatches: () => ok([]), listArticleTrash: () => ok([]), getDoubaoLoginState: () => ok({ status: "unknown" }), getDoubaoQueueState: () => ok({ status: "idle", currentTaskId: null, completed: 0, total: 0, waitRemainingMs: 0, tasks: [] }), onDoubaoQueueState: () => () => {},
        listArticleAttention: () => ok({ revision: 0, items: [], counts: { total: 0, actionable: 0 } }),
        listSubmissionPlatforms: () => ok({ platforms: [{ id: "fixture-platform", displayName: "测试投稿平台", contentQueueImport: true }] }),
        listTemplateCatalog: () => ok({ revision: "fixture", platforms: [{ id: "fixture-platform", displayName: "测试模板平台", description: "", order: 1 }], templates: [{ id: "fixture-template", platform: "fixture-platform", scenario: "交接回归", name: "测试模板", body: "fixture", bodyHash: "fixture", source: "custom" }], diagnostics: [] }),
        listGenerationBatches: () => ok([batch]), getGenerationBatch: () => ok(batch), getGenerationBatchState: () => ok({ status: "idle", state: "idle", batchId: null }), getGenerationRuntimeSnapshot: () => ok({ runtimeId: "fixture-runtime", sequence: 0, runtime: { status: "idle", state: "idle", batchId: null }, batch, capabilities: {} }), onGenerationBatchState: () => () => {},
        previewGenerationSubmissionHandoff: (input) => { state.previewInputs.push(input); return ok({ generationBatchId: batch.id, previewToken: "preview", articleCount: 1, clientCount: 1, targetPlatformIds: ["fixture-platform"], estimatedTaskCount: 1, queueableTaskCount: 1, idempotentCount: 0, blockedPublishedCount: 0, blockedUncertainCount: 0, blockedContentCount: 0, conflictCount: 0, unavailableArticleCount: 0, invalidArticles: [], clientGroups: [{ clientId: "client-a", articleCount: 1, queueableTaskCount: 1, idempotentCount: 0 }], items: [] }); },
        commitGenerationSubmissionHandoff: () => ok({ generationBatchId: batch.id, createdCount: 1, idempotentCount: 0, blockedCount: 0, conflictCount: 0, failedClientGroups: [], completedClientGroups: ["client-a"], clientGroups: [{ clientId: "client-a", articleCount: 1, queueableTaskCount: 1, idempotentCount: 0 }] }),
      };
      window.desktopConsole = {
        auth: { getState: () => ok({ authenticated: true, user: { loginName: "fixture" }, entitlements: [] }), onStateChanged: () => () => {}, login: () => ok({}), changePassword: () => ok({}), refresh: () => ok({}), logout: () => ok({}) },
        workspace: { getBootstrapState: () => ok({ state: "ready", workspacePath: "fixture", envOverride: false }), getCurrent: () => ok({ workspacePath: "fixture", envOverride: false, validation: { ok: true, errors: [], warnings: [] } }), openCurrent: () => ok(undefined), requestSwitch: () => ok({ state: "ready", workspacePath: "fixture", envOverride: false }), chooseDirectory: () => ok({ state: "ready", workspacePath: "fixture", envOverride: false }), confirmSelection: () => ok({ state: "ready" }), cancelSelection: () => ok({ state: "ready", workspacePath: "fixture", envOverride: false }) }, workspaceData: { getRuntimeIdentity: () => ok({ workspaceRuntimeId: "handoff-runtime", revision: 1 }), onInvalidated: () => () => {} },
        runtimeDiagnostics: { get: () => ok({ ok: true, buildInfo: { version: "1.0.1" }, browserChannel: { channel: "chromium", configured: true, state: "ready", probed: true }, capabilities: {}, errors: [], warnings: [] }) },
        media: { scanArticles: () => ok([]), getResourcePage: () => ok({ items: [], total: 0, page: 1, pageSize: 1 }), getPool: () => ok([]), getBalance: () => ok({ balance: "0" }) }, orders: { getOrders: () => ok([]) },
        aiProvider: { getStatus: () => ok({ configured: false, source: "application", apiKeyMask: "", lastTest: null }) }, platformSettings: { getStatus: () => ok({ configured: false, source: "application", baseUrl: "", timeoutMs: 30000, allowInsecure: false, transport: "未配置", apiKeyMask: "", lastTest: null }) },
        storageMaintenance: { getUsage: () => ok({ logs: { bytes: 0, files: 0 }, temporary: { bytes: 0, files: 0 }, docxCache: { bytes: 0, files: 0 }, profiles: { bytes: 0, files: 0 } }) },
        platforms: { getQueue: () => ok({ platforms: [], queue: [] }), listAccountProfiles: () => ok({ profiles: state.profiles }), confirmAccountProfile: (input) => { const profile = { accountProfileId: "account-confirmed", platformId: input.platformId, displayName: input.displayName }; state.profiles.push(profile); return ok({ profile }); }, getState: () => ok({ isBatchRunning: false, isStopPending: false, isPlatformRunning: false }), onState: () => () => {} }, publication: { listForArticles: () => ok([]) }, articleAttention: { list: () => ok({ revision: 0, items: [], counts: { total: 0, actionable: 0 } }) }, content,
      };
      window.__handoffFlow = state;
    });
    try {
      await page.goto(rendererUrl, { waitUntil: "domcontentloaded" });
      await page.locator("#nav-item-content").click();
      await page.getByRole("button", { name: "文章生成" }).click();
      await page.getByRole("tab", { name: "批量生成" }).click();
      await page.getByRole("button", { name: "将成功文章加入投稿队列" }).click();
      await page.getByRole("checkbox", { name: "测试投稿平台" }).check();
      assert.equal(await page.getByRole("button", { name: "检查并确认" }).isDisabled(), true);
      await page.getByRole("textbox", { name: "测试投稿平台新账号名称" }).fill("测试登录账号");
      await page.getByRole("button", { name: "确认账号" }).click();
      await page.waitForFunction(() => !document.querySelector('button')?.disabled || window.__handoffFlow.profiles.length === 1);
      await page.getByRole("button", { name: "检查并确认" }).waitFor({ state: "visible" });
      await page.getByRole("button", { name: "检查并确认" }).click();
      assert.deepEqual(await page.evaluate(() => window.__handoffFlow.previewInputs[0].accountProfiles), { "fixture-platform": "account-confirmed" });
      await page.getByRole("button", { name: "一次确认并加入投稿队列" }).click();
      await page.getByTestId("generation-handoff-summary").waitFor();
      assert.equal(await page.getByRole("dialog", { name: "生成批次投稿交接" }).count(), 0);
      assert.match(await page.getByTestId("generation-handoff-summary").innerText(), /新增 1 项/);
    } finally {
      await page.close();
    }
  });

});
