const assert = require("node:assert/strict");
const { _electron: electron } = require("playwright");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { ensureBuild } = require("./helpers/renderer-harness");

const root = path.resolve(__dirname, "..");
const rendererEntry = path.join(root, "media-workbench", "dist", "index.html");
const electronBinary = require("electron");
const navigationDelayMs = 180;
const convergenceTimeoutMs = 1000;
const unpackedSmoke = process.env.RUN_UNPACKED_NAVIGATION_SMOKE === "1";
const unpackedExecutable = unpackedSmoke
  ? path.resolve(process.env.AUTO_PUBLISH_UNPACKED_EXECUTABLE || "")
  : null;
const viewHeadings = {
  "content-production": "内容生产",
  "article-library": "文章库",
  "submission-center": "投稿中心",
  orders: "订单",
  resources: "媒体资源",
  settings: "设置",
};
const scenarios = [
  {
    name: "resources-to-orders",
    firstView: "resources",
    firstHeading: "媒体资源",
    finalView: "orders",
    finalHeading: "订单",
  },
  {
    name: "orders-to-settings",
    firstView: "orders",
    firstHeading: "订单",
    finalView: "settings",
    finalHeading: "设置",
  },
];

function writeFixture(directory, responseDelayMs = 0) {
  const preload = path.join(directory, "preload.cjs");
  const main = path.join(directory, "main.cjs");
  const preloadSource = `
const { contextBridge } = require("electron");
const mutationCalls = [];
let orderSyncCalls = 0;
const responseDelayMs = ${JSON.stringify(responseDelayMs)};
const ok = (data) => responseDelayMs > 0
  ? new Promise((resolve) => setTimeout(() => resolve({ ok: true, data }), responseDelayMs))
  : Promise.resolve({ ok: true, data });
const mutation = (data) => () => { mutationCalls.push(new Error("synthetic mutation invoked").stack); return ok(data); };
const emptyQueue = { status: "idle", currentTaskId: null, completed: 0, total: 0, waitRemainingMs: 0, tasks: [] };
const emptyUsage = { logs: { bytes: 0, files: 0 }, temporary: { bytes: 0, files: 0 }, docxCache: { bytes: 0, files: 0 }, profiles: { bytes: 0, files: 0 } };
const providerStatus = { source: "application", configured: false, baseUrl: "", timeoutMs: 30000, allowInsecure: false, transport: "未配置", apiKeyMask: "", lastTest: null };
const content = {
  listClients: () => ok({ clients: [] }),
  listResearch: () => ok({ research: [] }),
  listQuestions: () => ok({ questions: [] }),
  listTemplateCatalog: () => ok({ revision: "navigation-fixture", platforms: [], templates: [], diagnostics: [] }),
  getDoubaoLoginState: () => ok({ loginState: { status: "unknown" } }),
  getDoubaoQueueState: () => ok({ queue: emptyQueue }),
  onDoubaoQueueState: () => () => {},
  listPaidMediaBatches: () => ok({ items: [] }),
  listRegularQueueGroups: () => ok({ items: [] }),
  getArticleManagementSnapshot: () => ok({ clientId: "", revision: 0, articles: [], trash: [], publicationRecords: [], submissionPlatforms: [], workflowItems: [] }),
  getSubmissionCenterSnapshot: () => ok({ counts: { total: 0 }, groups: [], attention: [] }),
  retryMaterial: mutation({}),
  saveClientLiejuPublicationProfile: mutation({}),
  createQuestion: mutation({}),
  updateQuestion: mutation({}),
  deleteQuestion: mutation({}),
  saveManualResearch: mutation({}),
  collectDoubaoOne: mutation({}),
  previewRegularQueueAdmission: mutation({}),
  admitRegularQueueItems: mutation({}),
  previewPaidMediaPreflight: mutation({}),
  confirmPaidMediaBatch: mutation({}),
  updateRegularQueueGroupImageCount: mutation({ items: [] }),
  removePendingQueueItems: mutation({}),
  startRegularQueueGroup: mutation({ items: [] }),
  pauseRegularQueueGroup: mutation({ items: [] }),
  startAllRegularQueueGroups: mutation({ items: [] }),
  pauseAllRegularQueueGroups: mutation({ items: [] }),
};
contextBridge.exposeInMainWorld("desktopConsole", {
  auth: {
    getState: () => ok({ authenticated: true, user: { loginName: "navigation-fixture" }, entitlements: [{ product: "AutoPublish", enabled: true, expiresAt: null }], device: { deviceCount: 1, maxDevices: 5 }, errorCode: null, sessionStatus: "authenticated" }),
    onStateChanged: () => () => {},
    login: mutation({}), refresh: mutation({}), logout: mutation({}), changePassword: mutation({}),
  },
  workspace: {
    getBootstrapState: () => ok({ state: "ready", workspacePath: "navigation-fixture", envOverride: false }),
    getCurrent: () => ok({ state: "ready", label: "navigation-fixture", workspacePath: "navigation-fixture", envOverride: false, validation: { ok: true, kind: "existing_workspace", errors: [], warnings: [] } }),
    openCurrent: mutation(undefined), requestSwitch: mutation({ state: "ready" }), chooseDirectory: mutation({ state: "ready" }), confirmSelection: mutation({ state: "ready" }), cancelSelection: mutation({ state: "ready" }),
  },
  workspaceData: { getRuntimeIdentity: () => ok({ workspaceRuntimeId: "navigation-fixture", revision: 1 }), onInvalidated: () => () => {} },
  media: {
    scanArticles: () => ok({ items: [] }),
    getDrafts: () => ok({ items: [] }),
    getResourcePage: () => ok({ items: [], total: 0, page: 1, pageSize: 50 }),
    searchResourcePage: () => ok({ items: [], total: 0, page: 1, pageSize: 50 }),
    getPool: () => ok({ items: [], memberResourceIds: [], total: 0, page: 1, pageSize: 50, totalPages: 0, hasPrev: false, hasNext: false }),
    getBalance: () => ok({ balance: "0" }),
    refreshResources: mutation({ status: "complete", complete: true, truncated: false, truncationReason: null, pageCount: 0, resourceCount: 0, diagnostics: [], refreshedAt: "2026-08-17T00:00:00.000Z" }),
    addToPool: mutation({}), removeFromPool: mutation({ completed: true }),
  },
  orders: {
    getOrders: () => ok({ items: [] }),
    syncOrder: mutation({}),
    syncAllOrders: () => { orderSyncCalls += 1; return ok({ items: [], succeeded: 0, failed: 0 }); },
    prepareOrderCancellation: mutation({}), cancelOrder: mutation({}), prepareCancellationResolution: mutation({}),
    confirmCancellationSucceeded: mutation({}), confirmCancellationNotApplied: mutation({}),
    prepareOrderStatusAnomalyResolution: mutation({}), resumeOrderTracking: mutation({}),
    confirmOrderPublished: mutation({}), confirmOrderNotPublished: mutation({}), openPublishedUrl: mutation({ completed: true }),
  },
  platforms: {
    getQueue: () => ok({ platforms: [], queue: [] }), listAccountProfiles: () => ok({ profiles: [] }),
    getState: () => ok({ isPlatformRunning: false, isBatchRunning: false, isStopPending: false }), onState: () => () => {},
    confirmAccountProfile: mutation({}), bindAccountProfile: mutation({}), deleteAccountProfile: mutation({ accountProfileId: "fixture-account" }), openLogin: mutation({}), checkLogin: mutation({}),
  },
  aiProvider: {
    getStatus: () => ok({ source: "application", configured: false, baseUrl: "", model: "", timeoutMs: 60000, hasApiKey: false, apiKeyMask: "", lastTest: null }),
    save: mutation({}), testConnection: mutation({}), clear: mutation({ cleared: true }),
  },
  platformSettings: {
    getStatus: () => ok(providerStatus), getLegacyStatus: () => ok({ discover: { media: { available: false, sources: [] }, hepan: { available: false, sources: [], cookiePathAvailable: false }, sources: [], importable: false }, record: null }),
    save: mutation({}), test: mutation({}), clear: mutation({ cleared: true }), importLegacy: mutation({}),
  },
  runtimeDiagnostics: {
    get: () => ok({ ok: true, buildInfo: { version: "navigation-fixture", commit: "fixture", dirty: false }, browserChannel: { channel: "chromium", configured: true, state: "ready", probed: true }, capabilities: {}, errors: [], warnings: [] }),
    browserSmoke: mutation({}),
  },
  storageMaintenance: { getUsage: () => ok(emptyUsage), clean: mutation(emptyUsage) },
  publication: { listForArticles: () => ok([]) },
  articleAttention: { list: () => ok({ revision: 0, items: [], counts: { total: 0, actionable: 0 } }) },
  content,
});
contextBridge.exposeInMainWorld("__navigationTest", {
  getMutationCalls: () => mutationCalls.slice(),
  getOrderSyncCalls: () => orderSyncCalls,
});
`;
  const mainSource = `
const { app, BrowserWindow } = require("electron");
app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const window = new BrowserWindow({ width: 1280, height: 800, show: true, webPreferences: { preload: ${JSON.stringify(preload)}, contextIsolation: true, nodeIntegration: false, sandbox: false } });
  await window.loadFile(${JSON.stringify(rendererEntry)});
});
`;
  fs.writeFileSync(preload, preloadSource, "utf8");
  fs.writeFileSync(main, mainSource, "utf8");
  return main;
}

function packagedFixtureResults() {
  const { productionIpcContractFixtures } = require("./fixtures/phase-06-production-ipc-contract-fixtures");
  const { productionIpcRegistry } = require("../desktop/ipc/contracts/production-registry");
  const readyWorkspace = {
    state: "ready",
    configured: true,
    environmentManaged: true,
    label: "navigation-fixture",
    selection: null,
    errorCode: null,
    changed: false,
  };
  const envelopes = {};
  const commandChannels = [];
  for (const fixture of productionIpcContractFixtures) {
    if (fixture.result === undefined) continue;
    const contract = productionIpcRegistry.byChannel(fixture.channel);
    if (!contract) continue;
    if (contract.kind === "command") commandChannels.push(fixture.channel);
    const result = [
      "workspace:get-bootstrap-state",
      "workspace:get-current",
    ].includes(fixture.channel)
      ? readyWorkspace
      : fixture.result;
    envelopes[fixture.channel] = productionIpcRegistry.success(
      contract,
      result,
    );
  }
  return { envelopes, commandChannels };
}

async function installPackagedFixture(application, responseDelayMs) {
  const fixture = packagedFixtureResults();
  await application.evaluate(
    async ({ BrowserWindow, ipcMain }, input) => {
      const metrics = { commandChannels: [] };
      globalThis.__navigationSmokeMetrics = metrics;
      const delay = (value) =>
        input.responseDelayMs > 0
          ? new Promise((resolve) =>
              setTimeout(() => resolve(value), input.responseDelayMs),
            )
          : value;
      const authState = {
        authenticated: true,
        user: { loginName: "navigation-fixture" },
        entitlements: [
          { product: "AutoPublish", enabled: true, expiresAt: null },
        ],
        device: { deviceCount: 1, maxDevices: 5 },
        errorCode: null,
        passwordChangeRequired: false,
        pendingLoginName: null,
        sessionStatus: "authenticated",
      };
      ipcMain.removeHandler("auth:get-state");
      ipcMain.handle("auth:get-state", () =>
        delay({ ok: true, data: authState }),
      );
      for (const [channel, result] of Object.entries(input.fixture.envelopes)) {
        ipcMain.removeHandler(channel);
        ipcMain.handle(channel, () => {
          if (input.fixture.commandChannels.includes(channel))
            metrics.commandChannels.push(channel);
          return delay(result);
        });
      }
      const window = BrowserWindow.getAllWindows()[0];
      if (!window || window.isDestroyed()) throw new Error("packaged window unavailable");
      await window.webContents.reloadIgnoringCache();
    },
    { fixture, responseDelayMs },
  );
}

async function mouseClickView(page, view) {
  const button = page.locator(`#nav-item-${view}`);
  const box = await button.boundingBox();
  assert.ok(box, `navigation button ${view} must have a clickable box`);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

async function clickAtFallbackOrBoundary(page, view) {
  const fallback = page
    .getByText("正在加载工作台…", { exact: true })
    .waitFor({ state: "visible", timeout: navigationDelayMs })
    .then(() => "fallback")
    .catch(() => "boundary");
  const boundary = new Promise((resolve) =>
    setTimeout(() => resolve("boundary"), navigationDelayMs),
  );
  const trigger = await Promise.race([fallback, boundary]);
  await mouseClickView(page, view);
  return trigger;
}

async function readObservation(page, scenario, round, trigger, pageErrors) {
  await page
    .waitForFunction(
      ({ finalView, finalHeading, staleHeadings }) => {
        const visible = (element) => {
          for (let node = element; node; node = node.parentElement) {
            const style = getComputedStyle(node);
            if (
              style.display === "none" ||
              style.visibility === "hidden" ||
              Number(style.opacity) <= 0.01
            )
              return false;
          }
          return element.getClientRects().length > 0;
        };
        const headingVisible = [...document.querySelectorAll("h1, h2")].some(
          (element) =>
            element.textContent.trim() === finalHeading && visible(element),
        );
        const current = [
          ...document.querySelectorAll(
            '#app-sidebar [aria-current="page"]',
          ),
        ];
        const staleHeadingVisible = [...document.querySelectorAll("h1, h2")]
          .some(
            (element) =>
              staleHeadings.includes(element.textContent.trim()) &&
              visible(element),
          );
        return (
          headingVisible &&
          !staleHeadingVisible &&
          current.length === 1 &&
          current[0].id === `nav-item-${finalView}`
        );
      },
      {
        finalView: scenario.finalView,
        finalHeading: scenario.finalHeading,
        staleHeadings: scenario.staleHeadings || [scenario.firstHeading],
      },
      { timeout: convergenceTimeoutMs },
    )
    .catch(() => {});

  return page.evaluate(
    ({ scenarioValue, roundValue, triggerValue, errors }) => {
      const visible = (element) => {
        for (let node = element; node; node = node.parentElement) {
          const style = getComputedStyle(node);
          if (
            style.display === "none" ||
            style.visibility === "hidden" ||
            Number(style.opacity) <= 0.01
          )
            return false;
        }
        return element.getClientRects().length > 0;
      };
      const visibleHeadings = [...document.querySelectorAll("h1, h2")]
        .filter(visible)
        .map((element) => element.textContent.trim());
      const currentViewIds = [
        ...document.querySelectorAll('#app-sidebar [aria-current="page"]'),
      ].map((element) => element.id);
      const finalHeadingVisible = visibleHeadings.includes(
        scenarioValue.finalHeading,
      );
      const staleHeadings = scenarioValue.staleHeadings || [
        scenarioValue.firstHeading,
      ];
      const staleHeadingVisible = staleHeadings.some((heading) =>
        visibleHeadings.includes(heading),
      );
      const fixture = window.__navigationTest;
      return {
        scenario: scenarioValue.name,
        round: roundValue,
        trigger: triggerValue,
        visibleHeadings,
        currentViewIds,
        mutationCalls: fixture ? fixture.getMutationCalls() : [],
        orderSyncCalls: fixture ? fixture.getOrderSyncCalls() : 0,
        expectedOrderSyncCalls: scenarioValue.expectedOrderSyncCalls,
        pageErrors: errors,
        staleDivergence: staleHeadingVisible && !finalHeadingVisible,
        converged:
          finalHeadingVisible &&
          !staleHeadingVisible &&
          currentViewIds.length === 1 &&
          currentViewIds[0] === `nav-item-${scenarioValue.finalView}`,
      };
    },
    {
      scenarioValue: scenario,
      roundValue: round,
      triggerValue: trigger,
      errors: pageErrors,
    },
  );
}

async function runRound(scenario, round) {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "auto-publish-navigation-convergence-"),
  );
  const main = unpackedSmoke
    ? null
    : writeFixture(directory, scenario.responseDelayMs || 0);
  let application;
  try {
    application = await electron.launch({
      executablePath: unpackedSmoke ? unpackedExecutable : electronBinary,
      args: unpackedSmoke
        ? ["--disable-gpu", `--user-data-dir=${path.join(directory, "user-data")}`]
        : [main],
      env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined },
    });
    const page = await application.firstWindow();
    page.setDefaultTimeout(10000);
    const pageErrors = [];
    page.on("pageerror", (error) =>
      pageErrors.push(error.stack || error.message),
    );
    if (unpackedSmoke) {
      await installPackagedFixture(
        application,
        scenario.responseDelayMs || 0,
      );
    }
    await page.waitForSelector("#nav-item-settings");
    if (scenario.warmViews) {
      for (const view of scenario.warmViews) {
        await mouseClickView(page, view);
        if (view === "content-production") {
          await page.locator("#questions").waitFor({ state: "visible" });
        } else {
          await page
            .getByRole("heading", { name: viewHeadings[view], exact: true })
            .waitFor({ state: "visible" });
        }
      }
    }
    const views = scenario.views || [scenario.firstView, scenario.finalView];
    await mouseClickView(page, views[0]);
    let trigger = "boundary";
    for (let index = 1; index < views.length; index += 1) {
      const delay = scenario.delays?.[index - 1] ?? navigationDelayMs;
      if (views.length === 2 && delay === navigationDelayMs) {
        trigger = await clickAtFallbackOrBoundary(page, views[index]);
      } else {
        await new Promise((resolve) => setTimeout(resolve, delay));
        await mouseClickView(page, views[index]);
        trigger = `${delay}ms`;
      }
    }
    const observation = await readObservation(
      page,
      scenario,
      round,
      trigger,
      pageErrors,
    );
    if (unpackedSmoke) {
      const metrics = await application.evaluate(() =>
        globalThis.__navigationSmokeMetrics,
      );
      observation.mutationCalls = metrics.commandChannels.filter(
        (channel) => channel !== "media:sync-all-orders",
      );
      observation.orderSyncCalls = metrics.commandChannels.filter(
        (channel) => channel === "media:sync-all-orders",
      ).length;
    }
    return observation;
  } finally {
    if (application) await application.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

test(
  unpackedSmoke
    ? "unpacked renderer navigation smoke converges across the N4 matrix"
    : "cold-start navigation converges to the final intent without external mutations",
  { timeout: unpackedSmoke ? 300000 : 120000 },
  async () => {
    if (!unpackedSmoke) await ensureBuild();
    assert.equal(
      fs.existsSync(unpackedSmoke ? unpackedExecutable : rendererEntry),
      true,
    );
    const observations = [];
    const activeScenarios = unpackedSmoke
      ? [
          { name: "cold-resources-orders", views: ["resources", "orders"], rounds: 4, expectedOrderSyncCalls: 1 },
          { name: "cold-orders-settings", views: ["orders", "settings"], rounds: 4, expectedOrderSyncCalls: 1 },
          { name: "cold-triple", views: ["content-production", "submission-center", "resources"], delays: [40, 40], rounds: 3, expectedOrderSyncCalls: 0 },
          { name: "cold-six-entry", views: ["content-production", "article-library", "submission-center", "orders", "resources", "settings"], delays: [30, 30, 30, 30, 30], rounds: 3, expectedOrderSyncCalls: 1 },
          { name: "warmed-orders-resources", warmViews: Object.keys(viewHeadings), views: ["orders", "resources"], delays: [40], rounds: 3, expectedOrderSyncCalls: 1 },
          { name: "query-completion-resources-orders", responseDelayMs: 160, views: ["resources", "orders"], rounds: 3, expectedOrderSyncCalls: 1 },
        ].map((scenario) => ({
          ...scenario,
          firstView: scenario.views[0],
          firstHeading: viewHeadings[scenario.views[0]],
          finalView: scenario.views.at(-1),
          finalHeading: viewHeadings[scenario.views.at(-1)],
          staleHeadings: Object.values(viewHeadings).filter(
            (heading) => heading !== viewHeadings[scenario.views.at(-1)],
          ),
        }))
      : scenarios.map((scenario) => ({ ...scenario, rounds: 3 }));
    for (const scenario of activeScenarios) {
      for (let round = 1; round <= scenario.rounds; round += 1)
        observations.push(await runRound(scenario, round));
    }

    assert.equal(
      observations.every(
        (observation) =>
          observation.mutationCalls.length === 0 &&
          observation.orderSyncCalls ===
            (unpackedSmoke ? observation.expectedOrderSyncCalls : 1) &&
          observation.pageErrors.length === 0,
      ),
      true,
      `fixture safety failure:\n${JSON.stringify(observations, null, 2)}`,
    );
    assert.deepEqual(
      observations.filter((observation) => !observation.converged),
      [],
      `navigation did not converge:\n${JSON.stringify(observations, null, 2)}`,
    );
    if (unpackedSmoke) {
      const matrix = Object.fromEntries(
        activeScenarios.map((scenario) => [
          scenario.name,
          observations.filter((item) => item.scenario === scenario.name).length,
        ]),
      );
      console.log(JSON.stringify({ unpackedExecutable, rounds: observations.length, converged: observations.filter((item) => item.converged).length, mutationCalls: observations.reduce((total, item) => total + item.mutationCalls.length, 0), pageErrors: observations.reduce((total, item) => total + item.pageErrors.length, 0), matrix }));
    }
  },
);
