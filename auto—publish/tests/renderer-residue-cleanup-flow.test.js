const { after, before, describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { closeRenderer, startRenderer } = require("./helpers/renderer-harness");

const rendererUrl = "http://127.0.0.1:4175/";

let browser;

function result(data) {
  return Promise.resolve({ ok: true, data });
}

function runtimeDiagnostics() {
  const capability = {
    state: "ready",
    source: "fixture",
    errorCode: null,
    lastCheckedAt: null,
  };
  return {
    ok: true,
    buildInfo: {
      version: "1.0.1",
      commit: "renderer-residue-flow",
      dirty: false,
    },
    browserChannel: {
      channel: "chromium",
      configured: true,
      state: "ready",
      probed: true,
      source: "fixture",
      errorCode: null,
      lastCheckedAt: null,
    },
    capabilities: {
      playwrightNode: capability,
      playwrightCli: capability,
      browserChannel: {
        ...capability,
        channel: "chromium",
        configured: true,
        probed: true,
      },
      docx: capability,
      hepan: {
        state: "optional_unconfigured",
        source: "fixture",
        errorCode: "HEPAN_PYTHON_UNAVAILABLE",
        lastCheckedAt: null,
      },
    },
    errors: [],
    warnings: [],
  };
}

function installDesktopFixture(page, scenario) {
  return page.addInitScript(
    (input) => {
      const state = {
        scenario: input.scenario,
        cleanupCalls: 0,
        previewCalls: 0,
      };
      const ok = (data) => Promise.resolve({ ok: true, data });
      const residue = (cleanableCount, reportedCount, reasonCode) => ({
        items: [],
        cleanableItems: cleanableCount
          ? [
              {
                sourceArticleState: "trashed",
                repairAction: "cleanup",
                reasonCode: reasonCode || null,
              },
            ]
          : [],
        reportedItems: reportedCount
          ? [
              {
                sourceArticleState: "trashed",
                repairAction: null,
                reasonCode: "PUBLICATION_ACTIVE",
              },
            ]
          : [],
        cleanableCount,
        reportedCount,
      });
      const content = {
        previewTrashedArticleQueueResidue: () => {
          state.previewCalls += 1;
          if (state.scenario === "success" && state.cleanupCalls > 0)
            return ok(residue(0, 0));
          if (state.scenario === "partial" && state.cleanupCalls > 0)
            return ok(residue(1, 0, "PUBLICATION_ATTEMPT_MISMATCH"));
          if (state.scenario === "zero" || state.scenario === "reject")
            return ok(residue(1, 0, "PUBLICATION_ATTEMPT_MISMATCH"));
          return ok(residue(2, 0, "PUBLICATION_ATTEMPT_MISMATCH"));
        },
        cleanupTrashedArticleQueueResidue: () => {
          state.cleanupCalls += 1;
          if (state.scenario === "reject") {
            return Promise.resolve({
              ok: false,
              error: {
                code: "PUBLICATION_ATTEMPT_MISMATCH",
                category: "conflict",
                retryability: "manual-check",
                userMessage: "清理服务拒绝该残留项。",
              },
            });
          }
          if (state.scenario === "zero")
            return ok({
              ...residue(1, 0, "PUBLICATION_ATTEMPT_MISMATCH"),
              cleanedCount: 0,
              failedCount: 1,
              remainingCount: 1,
              failedItems: [{ reasonCode: "PUBLICATION_ATTEMPT_MISMATCH" }],
            });
          if (state.scenario === "partial")
            return ok({
              ...residue(1, 0, "PUBLICATION_ATTEMPT_MISMATCH"),
              cleanedCount: 1,
              failedCount: 1,
              remainingCount: 1,
              failedItems: [{ reasonCode: "PUBLICATION_ATTEMPT_MISMATCH" }],
            });
          return ok({
            ...residue(0, 0),
            cleanedCount: 1,
            failedCount: 0,
            remainingCount: 0,
            failedItems: [],
          });
        },
        listContentArticles: () => ok([]),
        getArticleManagementSnapshot: ({ clientId }) =>
          ok({
            clientId,
            revision: 1,
            articles: [],
            trash: [],
            submissionBatches: [],
            cancellationPlans: [],
            publicationRecords: [],
            attention: {
              revision: 1,
              items: [],
              counts: { total: 0, actionable: 0 },
            },
            submissionPlatforms: [],
            workflowByArticle: {},
            publicationSummaries: {},
          }),
        listRegularQueueGroups: () => ok({ items: [] }),
        listSubmissionBatches: () => ok([]),
        listArticleTrash: () => ok([]),
        listResearch: () => ok([]),
        listQuestions: () => ok([]),
        getDoubaoLoginState: () => ok({ status: "unknown" }),
        getDoubaoQueueState: () =>
          ok({
            status: "idle",
            currentTaskId: null,
            completed: 0,
            total: 0,
            waitRemainingMs: 0,
            tasks: [],
          }),
        onDoubaoQueueState: () => () => {},
        listTemplates: () => ok([]),
        listTemplateCatalog: () =>
          ok({
            revision: "fixture",
            platforms: [],
            templates: [],
            diagnostics: [],
          }),
      };
      const workspace = {
        getBootstrapState: () =>
          ok({ state: "ready", workspacePath: "fixture", envOverride: false }),
        getCurrent: () =>
          ok({
            workspacePath: "fixture",
            envOverride: false,
            validation: { ok: true, errors: [], warnings: [] },
          }),
        openCurrent: () => ok(undefined),
        requestSwitch: () =>
          ok({ state: "ready", workspacePath: "fixture", envOverride: false }),
        chooseDirectory: () =>
          ok({ state: "ready", workspacePath: "fixture", envOverride: false }),
        confirmSelection: () => ok({ state: "ready" }),
        cancelSelection: () =>
          ok({ state: "ready", workspacePath: "fixture", envOverride: false }),
      };
      const media = {
        scanArticles: () => ok({ items: [] }),
        previewArticle: () =>
          ok({
            article: {
              filename: "fixture.md",
              title: "Fixture",
              content: "",
              selectedResources: [],
            },
          }),
        getDrafts: () => ok({ items: [] }),
        getDraft: () => ok({ draft: null }),
        setDraft: () => ok({ completed: true }),
        buildConfirmation: () =>
          ok({
            articleCount: 0,
            resourceCount: 0,
            submitableResourceCount: 0,
            blockedResourceCount: 0,
            estimatedTotalPrice: 0,
            actualPrice: 0,
            blockers: [],
            blockedResources: [],
            submitableResources: [],
          }),
        stopSubmit: () => ok({ stopped: true }),
        refreshResources: () =>
          ok({
            status: "complete",
            complete: true,
            truncated: false,
            truncationReason: null,
            pageCount: 0,
            resourceCount: 0,
            diagnostics: [],
            refreshedAt: "2026-07-27T00:00:00.000Z",
          }),
        getResourcePage: () =>
          ok({
            items: [],
            total: 0,
            page: 1,
            pageSize: 50,
            totalPages: 0,
            hasPrev: false,
            hasNext: false,
          }),
        searchResourcePage: () =>
          ok({
            items: [],
            total: 0,
            page: 1,
            pageSize: 50,
            totalPages: 0,
            hasPrev: false,
            hasNext: false,
          }),
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
        addToPool: () =>
          ok({
            resource: { resourceId: "fixture", name: "Fixture", price: 0 },
          }),
        removeFromPool: () => ok({ completed: true }),
        getBalance: () => ok({ balance: "0" }),
      };
      const platformStatus = {
        isBatchRunning: false,
        isStopPending: false,
        isPlatformRunning: false,
      };
      const platforms = {
        getQueue: () => ok({ platforms: [], queue: [] }),
        getState: () => ok(platformStatus),
        onState: () => () => {},
      };
      const orders = {
        getOrders: () => ok({ items: [] }),
        syncOrder: () =>
          ok({
            order: {
              title: "",
              filename: "",
              orderNid: "fixture",
              statusCode: "",
              statusLabel: "",
              submittedAt: "",
              publishedAt: "",
              resourceId: "",
              resourceName: "",
              price: "0",
              orderUrl: "",
            },
          }),
        openPublishedUrl: () => ok({ completed: true }),
      };
      const aiProvider = {
        getStatus: () =>
          ok({
            configured: false,
            source: "application",
            apiKeyMask: "",
            lastTest: null,
          }),
        save: () => ok({}),
        testConnection: () => ok({}),
        clear: () => ok({ cleared: true }),
      };
      const platformSettings = {
        getStatus: () =>
          ok({
            configured: false,
            source: "application",
            baseUrl: "",
            timeoutMs: 30000,
            allowInsecure: false,
            transport: "未配置",
            apiKeyMask: "",
            lastTest: null,
          }),
        save: () => ok({}),
        test: () => ok({ testedAt: "", ok: true, code: "OK" }),
        clear: () => ok({ cleared: true }),
      };
      const storageMaintenance = {
        getUsage: () =>
          ok({
            logs: { bytes: 0, files: 0 },
            temporary: { bytes: 0, files: 0 },
            docxCache: { bytes: 0, files: 0 },
            profiles: { bytes: 0, files: 0 },
          }),
        cleanCaches: () => ok({ blocked: false }),
      };
      window.__residueFlow = state;
      const workspaceData = {
        getRuntimeIdentity: () =>
          ok({ workspaceRuntimeId: "renderer-residue-fixture", revision: 0 }),
        onInvalidated: () => () => {},
      };
      window.desktopConsole = {
        auth: {
          getState: () =>
            ok({
              authenticated: true,
              user: { loginName: "admin" },
              entitlements: [
                { product: "AutoPublish", enabled: true, expiresAt: null },
              ],
            }),
          login: () => ok({ authenticated: true }),
          refresh: () => ok({ authenticated: true }),
          logout: () => ok({ authenticated: false }),
          onStateChanged: () => () => {},
        },
        workspace,
        workspaceData,
        runtimeDiagnostics: { get: () => ok(runtimeDiagnostics()) },
        aiProvider,
        platformSettings,
        storageMaintenance,
        media,
        orders,
        platforms,
        content,
      };
    },
    { scenario },
  );
}

async function openPlatformPage(scenario) {
  const page = await browser.newPage({
    viewport: { width: 1128, height: 700 },
  });
  page.setDefaultTimeout(5000);
  await installDesktopFixture(page, scenario);
  await page.goto(rendererUrl, { waitUntil: "domcontentloaded" });
  await page.locator("#nav-item-platforms").waitFor();
  await page.locator("#nav-item-platforms").click();
  await page.getByRole("heading", { name: "普通平台队列" }).waitFor();
  await page
    .getByRole("button", { name: "检查残留" })
    .waitFor();
  return page;
}

describe("renderer residue cleanup flow", { concurrency: false }, () => {
  before(async () => {
    ({ browser } = await startRenderer({ port: 4175 }));
  });
  after(closeRenderer);

  for (const scenario of ["zero", "reject", "partial", "success"]) {
    it(`reports ${scenario} cleanup without leaving the residue action busy`, async () => {
      const page = await openPlatformPage(scenario);
      try {
        const action = page.getByRole("button", {
          name: "检查残留",
        });
        await action.click();
        await page.getByRole("button", { name: "确认清理本地残留" }).click();
        await page.waitForFunction(
          () => !document.body.innerText.includes("清理中…"),
        );
        const alerts = page.getByRole("alert");
        const statuses = page.getByRole("status");
        if (scenario === "success") {
          await statuses.filter({ hasText: "已清理 1 项" }).waitFor();
          assert.equal(await alerts.filter({ hasText: "未清理" }).count(), 0);
        } else {
          assert.equal(
            await action.isDisabled(),
            false,
            `RESIDUE_BUSY_RED ${scenario}`,
          );
          const cleanupAlert = alerts.filter({
            hasText: /PUBLICATION_ATTEMPT_MISMATCH|清理服务拒绝|失败|未清理/,
          });
          await cleanupAlert.waitFor();
          const text = await cleanupAlert.first().innerText();
          assert.match(
            text,
            /PUBLICATION_ATTEMPT_MISMATCH|cleanup rejected|失败|未清理/,
          );
          assert.equal(
            await statuses.filter({ hasText: "已清理 0 项" }).count(),
            0,
            `RESIDUE_FALSE_SUCCESS_RED ${scenario}`,
          );
        }
      } finally {
        await page.close();
      }
    });
  }
});
