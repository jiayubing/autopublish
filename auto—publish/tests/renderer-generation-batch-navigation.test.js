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

  async function checkBatch(batchStatus, endMixed = false) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    page.setDefaultTimeout(8000);
    await page.addInitScript(({ batchStatus, endMixed }) => {
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
      let batch = {
        id: "generation-batch-a",
        status: batchStatus,
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
            status: ["completed", "abandoned"].includes(batchStatus) ? "succeeded" : "failed",
            attempts: 1,
            error: null,
            articleId: ["completed", "abandoned"].includes(batchStatus) ? article.id : null,
            articleTitle: ["completed", "abandoned"].includes(batchStatus) ? article.title : undefined,
          },
        ],
        counts: {
          total: 1,
          succeeded: ["completed", "abandoned"].includes(batchStatus) ? 1 : 0,
          failed: ["completed", "abandoned"].includes(batchStatus) ? 0 : 1,
          pending: 0,
          interrupted: 0,
          cancelled: 0,
        },
      };
      if (endMixed) {
        const task = batch.tasks[0];
        batch.tasks = [
          ...Array.from({length:3}, (_,i) => ({...task, id:'success-'+i, status:'succeeded',articleId:article.id,articleTitle:article.title})),
          {...task,id:'failure'},
          ...Array.from({length:7}, (_,i) => ({...task,id:'pending-'+i,status:'pending'})),
        ];
        batch.counts = {total:11,succeeded:3,failed:1,pending:7,interrupted:0,cancelled:0};
      }
      const state = { sequence:1, abandonCalls:0, managementReads: 0, submissionMutations: 0, resumeCalls: 0, retryCalls: 0 };
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
        abandonGenerationBatch: () => {
          state.abandonCalls += 1;
          if (endMixed === 'error') return Promise.resolve({ok:false,error:{code:'GENERATION_BATCH_NOT_ENDABLE',category:'conflict',retryability:'never',userMessage:'合成结束失败提示'}});
          batch = {...batch,status:'abandoned'}; state.sequence += 1;
          return ok({batch});
        },
        resumeGenerationBatch: () => { state.resumeCalls += 1; return ok({ batch }); },
        retryFailedGenerationBatch: () => { state.retryCalls += 1; return ok({ batch }); },
        previewCancelPendingGenerationBatch: () => ok({ canCancel: !!endMixed, pendingCount: endMixed ? 7 : 0, runningCount: 0 }),
        cancelPendingGenerationBatch: () => {
          batch = {...batch,tasks:batch.tasks.map(task=>task.status==='pending'?{...task,status:'cancelled'}:task),counts:{...batch.counts,pending:0,cancelled:7}};
          state.sequence += 1;
          return ok({batch});
        },
        getGenerationRuntimeSnapshot: () =>
          ok({
            runtimeId: "generation-runtime",
            sequence: 1,
            runtime: { status: "idle", state: "idle", batchId: null },
            batch,
            capabilities: { canContinue: !["completed", "abandoned"].includes(batchStatus), canResume: !["completed", "abandoned"].includes(batchStatus), canRetry: batchStatus === "failed" },
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
    }, { batchStatus, endMixed });
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
      if (endMixed) {
        const detail = page.locator('.generation-batch-detail');
        await detail.getByTitle('永久取消待处理任务',{exact:true}).click();
        await page.getByRole('button',{name:'永久取消',exact:true}).click();
        await detail.getByText('取消 7',{exact:true}).waitFor();
        await detail.getByTitle('结束当前批次',{exact:true}).click();
        await page.getByRole('button',{name:'结束批次',exact:true}).click();
        if (endMixed === 'error') {
          await page.getByRole('alert').filter({hasText:'合成结束失败提示'}).waitFor();
          assert.equal(await page.getByRole('button',{name:'批量投稿',exact:true}).count(),0);
          return;
        }
        await detail.getByRole('heading',{name:'批次结果',exact:true}).waitFor();
        assert.equal(await detail.getByTitle('结束当前批次',{exact:true}).isDisabled(),true);
        assert.equal(await detail.getByTitle('继续批量生成',{exact:true}).isDisabled(),true);
        assert.equal(await detail.getByTitle('重试失败任务',{exact:true}).isDisabled(),true);
        assert.match(await detail.innerText(), /成功 3/);
        assert.match(await detail.innerText(), /失败 1/);
        assert.match(await detail.innerText(), /取消 7/);
        await detail.getByRole('button',{name:'批量投稿',exact:true}).click();
        await page.getByRole('dialog',{name:'批量投稿本批次文章'}).waitFor();
        assert.equal(await page.evaluate(()=>window.__generationBatchNavigation.abandonCalls),1);
        assert.equal(await page.evaluate(()=>window.__generationBatchNavigation.submissionMutations),0);
        return;
      }
      if (!["completed", "abandoned"].includes(batchStatus)) {
        const detail = page.locator(".generation-batch-detail");
        await detail.waitFor();
        assert.ok((await detail.textContent()).includes("状态 " + batchStatus));
        const resume = detail.getByTitle("继续批量生成", { exact: true });
        const retry = detail.getByTitle("重试失败任务", { exact: true });
        assert.equal(await resume.isEnabled(), true);
        assert.equal(await detail.getByTitle("暂停批量生成", { exact: true }).isDisabled(), true);
        assert.equal(await retry.isEnabled(), batchStatus === "failed");
        if (batchStatus === "paused_configuration") {
          await resume.click();
          await page.waitForFunction(() => window.__generationBatchNavigation.resumeCalls === 1);
          assert.equal(await page.evaluate(() => window.__generationBatchNavigation.retryCalls), 0);
        } else {
          await retry.click();
          await page.waitForFunction(() => window.__generationBatchNavigation.retryCalls === 1);
          assert.equal(await page.evaluate(() => window.__generationBatchNavigation.resumeCalls), 0);
        }
        assert.equal(await page.evaluate(() => window.__generationBatchNavigation.submissionMutations), 0);
        return;
      }
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
  }

  it("opens the article library with a batch filter without creating submission facts", async function () {
    await checkBatch("completed");
  });

  it("uses continue for configuration pause and reserves failed-only retry for ordinary failure", async function () {
    await checkBatch("paused_configuration");
    await checkBatch("failed");
  });
  it("ends a failed batch after cancelling pending tasks and opens successful articles for submission", async () => { await checkBatch('failed', true); });
  it("shows an end-command failure in monitoring without exposing a false terminal result", async () => { await checkBatch('failed', 'error'); });

  it("restores an ended batch with a submission entry after reopening", async () => { await checkBatch("abandoned"); });

});
