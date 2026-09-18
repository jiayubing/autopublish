const { after, before, describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { closeRenderer, startRenderer } = require("./helpers/renderer-harness");

describe("renderer page navigation", { concurrency: false }, function () {
  let browser;
  let rendererUrl;

  before(async function () {
    ({ browser, url: rendererUrl } = await startRenderer({ port: 4183 }));
  });

  after(closeRenderer);

  it("switches pages without coordinator crashes or reloading hydrated content pages", async function () {
    const page = await browser.newPage();
    const pageErrors = [];
    page.on("pageerror", (error) => {
      pageErrors.push(String(error && error.message ? error.message : error));
    });
    await page.addInitScript(() => {
      const ok = (data) => Promise.resolve({ ok: true, data });
      const emptyQueue = {
        status: "idle",
        currentTaskId: null,
        completed: 0,
        total: 0,
        waitRemainingMs: 0,
        tasks: [],
      };
      const readyWorkspace = {
        state: "ready",
        configured: true,
        environmentManaged: false,
        label: "工作区已配置",
        selection: null,
        errorCode: null,
        changed: null,
      };
      const handler = {
        apply(_target, _thisArg, _args) {
          return ok({});
        },
        get(target, prop) {
          if (prop in target) return target[prop];
          if (prop === "then") return undefined;
          return new Proxy(function () {}, handler);
        },
      };
      const stub = (value) => new Proxy(value, handler);
      localStorage.setItem("auto-publish:last-main-view", "article-library");
      window.__contentReadCounts = {
        listClients: 0,
        management: 0,
      };
      window.__platformReads = { queue: 0, profiles: 0 };
      window.__resourceReads = 0;
      window.__resourcePending = [];
      window.__holdResources = false;
      window.__workspaceRevision = 1;
      window.desktopConsole = {
        auth: {
          getState: () =>
            ok({
              authenticated: true,
              user: { loginName: "nav-fixture" },
              entitlements: [],
              errorCode: null,
              sessionStatus: "authenticated",
            }),
          login: () => ok({ authenticated: true }),
          changePassword: () => ok({ authenticated: true }),
          refresh: () => ok({ authenticated: true }),
          logout: () =>
            ok({
              authenticated: false,
              sessionStatus: "signed_out",
              errorCode: null,
            }),
          onStateChanged: () => () => {},
        },
        workspace: {
          getBootstrapState: () => ok(readyWorkspace),
          getCurrent: () => ok(readyWorkspace),
          chooseDirectory: () => ok(readyWorkspace),
          confirmSelection: () => ok(readyWorkspace),
          cancelSelection: () => ok(readyWorkspace),
          openCurrent: () => ok({ opened: true }),
          requestSwitch: () => ok(readyWorkspace),
        },
        workspaceData: {
          getRuntimeIdentity: () =>
            ok({ workspaceRuntimeId: "nav-runtime", revision: 1 }),
          onInvalidated: (listener) => {
            window.__invalidateWorkspace = (scopes) => listener({ schemaVersion: 1, workspaceRuntimeId: "nav-runtime", revision: ++window.__workspaceRevision, scopes, reasonCode: "WORKSPACE_DATA_CHANGED" });
            return () => {};
          },
          onInvalidationDiagnostic: () => () => {},
        },
        content: stub({
          listClients: () => {
            window.__contentReadCounts.listClients += 1;
            return ok({ clients: [] });
          },
          listTemplateCatalog: () =>
            ok({
              revision: "nav",
              platforms: [],
              templates: [],
              diagnostics: [],
            }),
          getClientGroups: () =>
            ok({ revision: 0, groups: [], memberships: [] }),
          getArticleManagementSnapshot: () => {
            window.__contentReadCounts.management += 1;
            return ok({
              clientId: "",
              revision: 0,
              articles: [],
              trash: [],
              publicationRecords: [],
              submissionPlatforms: [],
              workflowByArticle: {},
              lifecycleCounts: {},
            });
          },
          getSubmissionCenterSnapshot: () =>
            ok({
              schemaVersion: 1,
              clientId: null,
              revision: 0,
              regular: { groups: [] },
              paid: { batches: [] },
              attention: { items: [] },
              counts: {
                regularItems: 0,
                paidBatches: 0,
                attentionItems: 0,
                total: 0,
              },
              page: 1,
              pageSize: 100,
              hasMore: false,
              failures: [],
            }),
          listQuestions: () => ok({ questions: [] }),
          listResearch: () => ok({ research: [] }),
          listResearchMetadata: () => ok({ items: [] }),
          getDoubaoQueueState: () => ok({ queue: emptyQueue }),
          onDoubaoQueueState: () => () => {},
          listPaidMediaBatches: () => ok({ items: [] }),
          listRegularQueueGroups: () => ok({ items: [] }),
        }),
        media: stub({
          getResourcePage: () => {
            window.__resourceReads++;
            if (window.__holdResources) return new Promise(resolve => window.__resourcePending.push(() => resolve({ ok: true, data: { items: [], total: 0, page: 1, pageSize: 50 } })));
            return ok({ items: [], total: 0, page: 1, pageSize: 50 });
          },
          searchResourcePage: () =>
            ok({ items: [], total: 0, page: 1, pageSize: 50 }),
          getPool: () =>
            ok({
              items: [],
              memberResourceIds: [],
              total: 0,
              page: 1,
              pageSize: 50,
              totalPages: 0,
              hasPrev: false,
              hasNext: false,
            }),
          getBalance: () => ok({ balance: "12.5" }),
        }),
        orders: stub({
          getOrders: () => ok({ items: [] }),
        }),
        platforms: stub({
          getQueue: () => { window.__platformReads.queue++; return ok({ platforms: [{ id: "hepan", displayName: "蓝色河畔", loginAvailable: true, queueConfigured: true }], queue: [] }); },
          listAccountProfiles: () => { window.__platformReads.profiles++; return ok({ profiles: [] }); },
          getState: () =>
            ok({
              isPlatformRunning: false,
              isBatchRunning: false,
              isStopPending: false,
            }),
          onState: () => () => {},
        }),
        aiProvider: stub({
          getStatus: () =>
            ok({
              source: "application",
              configured: false,
              baseUrl: "",
              model: "",
              timeoutMs: 60000,
              hasApiKey: false,
              apiKeyMask: "",
              lastTest: null,
            }),
        }),
        platformSettings: stub({
          getStatus: () =>
            ok({
              source: "application",
              configured: false,
              baseUrl: "",
              timeoutMs: 30000,
              allowInsecure: false,
              transport: "未配置",
              apiKeyMask: "",
              lastTest: null,
            }),
          getLegacyStatus: () =>
            ok({
              discover: {
                media: { available: false, sources: [] },
                hepan: {
                  available: false,
                  sources: [],
                  cookiePathAvailable: false,
                },
                sources: [],
                importable: false,
              },
              record: null,
            }),
        }),
        runtimeDiagnostics: stub({
          get: () =>
            ok({
              ok: true,
              buildInfo: { version: "nav", commit: "nav", dirty: false },
              browserChannel: {
                channel: "chromium",
                configured: true,
                state: "ready",
                probed: true,
              },
              capabilities: {},
              errors: [],
              warnings: [],
            }),
        }),
        storageMaintenance: stub({
          getUsage: () =>
            ok({
              logs: { bytes: 0, files: 0 },
              temporary: { bytes: 0, files: 0 },
              docxCache: { bytes: 0, files: 0 },
              profiles: { bytes: 0, files: 0 },
            }),
        }),
        publication: stub({
          listForArticles: () => ok([]),
        }),
        articleAttention: stub({
          list: () =>
            ok({
              revision: 0,
              items: [],
              counts: { total: 0, actionable: 0 },
            }),
        }),
        generation: stub({}),
        clientGeneration: stub({
          getState: () => ok({ status: "idle" }),
          onState: () => () => {},
        }),
      };
    });
    await page.goto(rendererUrl, { waitUntil: "domcontentloaded" });
    await page.getByText("文章库", { exact: true }).first().waitFor({
      timeout: 15000,
    });
    await page.waitForFunction(
      () => window.__contentReadCounts.listClients > 0,
      null,
      { timeout: 15000 },
    );

    const initialCounts = await page.evaluate(() => ({
      ...window.__contentReadCounts,
    }));
    assert.equal(
      initialCounts.listClients,
      1,
      "article-library should hydrate content sources exactly once on first visit",
    );
    assert.equal(
      initialCounts.management,
      0,
      "article management should stay lazy when there is no selected client",
    );
    assert.equal(await page.evaluate(() => window.__platformReads.queue), 0);

    await page.locator("#nav-item-content-production").click();
    await page.getByText("内容生产", { exact: true }).first().waitFor({
      timeout: 15000,
    });
    await page.waitForFunction(
      (count) => window.__contentReadCounts.listClients > count,
      initialCounts.listClients,
      { timeout: 15000 },
    );
    const afterProductionCounts = await page.evaluate(() => ({
      ...window.__contentReadCounts,
    }));
    assert.equal(
      afterProductionCounts.listClients,
      initialCounts.listClients + 1,
      "content-production should hydrate content sources exactly once on first visit",
    );

    await page.locator("#nav-item-article-library").click();
    await page.getByText("文章库", { exact: true }).first().waitFor({
      timeout: 15000,
    });
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
    const afterLibraryReturnCounts = await page.evaluate(() => ({
      ...window.__contentReadCounts,
    }));
    assert.deepEqual(afterLibraryReturnCounts, afterProductionCounts);
    assert.equal(await page.evaluate(() => window.__platformReads.queue), 0);

    const views = [
      ["submission-center", "投稿中心"],
      ["resources", "媒体资源"],
      ["orders", "订单"],
      ["settings", "设置"],
      ["content-production", "内容生产"],
      ["article-library", "文章库"],
    ];
    for (const [view, label] of views) {
      await page.locator(`#nav-item-${view}`).click();
      await page.getByText(label, { exact: true }).first().waitFor({
        timeout: 15000,
      });
      if (view === "resources" || view === "orders") {
        await page.waitForFunction(() => document.querySelector('[role="status"]')?.textContent?.includes("数据已就绪"));
        const before = await page.evaluate(() => ({ ...window.__platformReads }));
        await page.evaluate(() => window.__invalidateWorkspace(["platformQueue"]));
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        assert.deepEqual(await page.evaluate(() => window.__platformReads), before, `${view} must not load platform queue/accounts`);
      }
      if (view === "resources") {
        const count = await page.evaluate(() => {
          window.__holdResources = true;
          const count = window.__resourceReads;
          for (let index = 0; index < 20; index++) window.__invalidateWorkspace(["mediaWorkbench"]);
          return count;
        });
        await page.waitForFunction(count => window.__resourceReads === count + 1, count);
        await page.evaluate(() => window.__resourcePending.shift()());
        await page.waitForFunction(count => window.__resourceReads === count + 2, count);
        await page.evaluate(() => { window.__holdResources = false; window.__resourcePending.shift()(); });
        await page.waitForFunction(() => document.querySelector('[role="status"]')?.textContent?.includes("数据已就绪"));
        assert.equal(await page.evaluate(() => window.__resourceReads), count + 2);
      }
      if (view === "settings") {
        await page.getByRole("button", { name: "平台账号", exact: true }).click();
        const select = page.getByLabel("平台账号投稿平台");
        await select.waitFor();
        assert.equal(await select.inputValue(), "hepan");
        assert.equal(await select.isEnabled(), true);
      }
    }
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
    const finalCounts = await page.evaluate(() => ({
      ...window.__contentReadCounts,
    }));
    assert.equal(finalCounts.management, afterProductionCounts.management);
    assert.equal(
      finalCounts.listClients,
      afterProductionCounts.listClients + 1,
      "submission-center should hydrate once; revisiting production/library must not reload",
    );

    const ownerCrash = pageErrors.filter((message) =>
      message.includes("already has an owner"),
    );
    assert.deepEqual(ownerCrash, []);
    assert.deepEqual(pageErrors, []);
    await page.close();
  });
});
