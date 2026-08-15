const assert = require("node:assert/strict");
const { after, before, describe, it } = require("node:test");
const { execFileSync, spawn } = require("node:child_process");
const { chromium } = require("playwright");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");

const rootDir = path.resolve(__dirname, "..");
const rendererDir = path.join(rootDir, "media-workbench");
const rendererUrl = "http://127.0.0.1:4176/";

let viteProcess;
let browser;
let buildDir;

function installDesktopFixture(page) {
  return page.addInitScript(() => {
    const workspaceRuntimeId = "fixture-runtime-1";
    const state = {
      workspaceRuntimeId,
      queueCalls: 0,
      groupCalls: 0,
      imageCountUpdates: [],
      imageUpdateFailure: false,
      pendingImageUpdate: null,
      queueRevision: 0,
      invalidationListeners: [],
      authStateListeners: [],
    };
    const queueData = () => ({
      revision: state.queueRevision,
      platforms: [],
      queue: [],
    });
    const groupData = () => [
      {
        queueGroupId: "regular-group-images",
        platformId: "toutiao",
        accountProfileId: "profile-toutiao",
        imageCount: 0,
        imagePublishingSupported: false,
        runState: "paused",
        pauseIntent: "manual",
        manuallyPaused: true,
        current: null,
        remaining: [],
        actions: { canStart: true, canPause: false, reasonCode: null },
        revision: state.queueRevision,
        createdAt: "2026-08-15T00:00:00.000Z",
        updatedAt: "2026-08-15T00:00:00.000Z",
      },
    ];
    const updateImageCount = (input) => {
      const update = () => {
        if (state.imageUpdateFailure) {
          return Promise.resolve({
            ok: false,
            error: {
              code: "OPERATIONAL_QUEUE_GROUP_REVISION_CONFLICT",
              userMessage: "保存图片数量失败。",
            },
          });
        }
        state.queueRevision += 1;
        state.imageCountUpdates.push(input.imageCount);
        const next = groupData();
        next[0].imageCount = input.imageCount;
        next[0].imagePublishingSupported =
          state.imagePublishingSupported === true;
        next[0].revision = state.queueRevision;
        state.currentGroup = next[0];
        return response({ items: next });
      };
      if (!state.imageUpdatePending) return update();
      return new Promise((resolve) => {
        state.pendingImageUpdate = () => update().then(resolve);
      });
    };
    const response = (data) => Promise.resolve({ ok: true, data });
    const authState = {
      authenticated: true,
      user: { id: "fixture-admin", loginName: "admin" },
      entitlements: [
        { product: "AutoPublish", enabled: true, expiresAt: null },
      ],
      errorCode: null,
    };
    const auth = {
      getState: () => response(authState),
      login: () => response(authState),
      refresh: () => response(authState),
      logout: () =>
        response({
          authenticated: false,
          user: null,
          entitlements: [],
          errorCode: null,
        }),
      onStateChanged: (listener) => {
        state.authStateListeners.push(listener);
        return () => {};
      },
    };

    const workspace = {
      getBootstrapState: () =>
        response({
          state: "ready",
          workspacePath: "fixture",
          envOverride: false,
        }),
      getCurrent: () =>
        response({
          workspacePath: "fixture",
          envOverride: false,
          validation: { ok: true, errors: [], warnings: [] },
        }),
      openCurrent: () => response(undefined),
      chooseDirectory: () =>
        response({
          state: "ready",
          workspacePath: "fixture",
          envOverride: false,
        }),
      confirmSelection: () => response({ state: "ready" }),
      cancelSelection: () =>
        response({
          state: "ready",
          workspacePath: "fixture",
          envOverride: false,
        }),
    };
    const workspaceData = {
      getRuntimeIdentity: () =>
        response({
          workspaceRuntimeId: state.workspaceRuntimeId,
          revision: state.queueRevision,
        }),
      onInvalidated: (listener) => {
        state.invalidationListeners.push(listener);
        return () => {
          state.invalidationListeners = state.invalidationListeners.filter(
            (item) => item !== listener,
          );
        };
      },
    };
    const platforms = {
      getQueue: () => {
        state.queueCalls += 1;
        return response(queueData());
      },
    };
    const content = {
      previewTrashedArticleQueueResidue: () =>
        response({
          items: [],
          cleanableItems: [],
          reportedItems: [],
          cleanableCount: 0,
          reportedCount: 0,
        }),
      listContentClients: () => response([]),
      listContentArticles: () => response([]),
      listRegularQueueGroups: () => {
        state.groupCalls += 1;
        const group = state.currentGroup || groupData()[0];
        group.imagePublishingSupported =
          state.imagePublishingSupported === true;
        group.revision = state.queueRevision;
        return response({ items: [group] });
      },
      updateRegularQueueGroupImageCount: updateImageCount,
      startRegularQueueGroup: () => response([]),
      pauseRegularQueueGroup: () => response([]),
      startAllRegularQueueGroups: () => response([]),
      pauseAllRegularQueueGroups: () => response([]),
      listSubmissionBatches: () => response([]),
      listArticleTrash: () => response([]),
      listResearch: () => response([]),
      listQuestions: () => response([]),
      listTemplates: () => response([]),
      listTemplateCatalog: () =>
        response({
          revision: "fixture",
          platforms: [],
          templates: [],
          diagnostics: [],
        }),
      getDoubaoLoginState: () => response({ status: "unknown" }),
      getDoubaoQueueState: () =>
        response({
          status: "idle",
          currentTaskId: null,
          completed: 0,
          total: 0,
          waitRemainingMs: 0,
          tasks: [],
        }),
      onDoubaoQueueState: () => () => {},
    };
    const media = {
      scanArticles: () => response([]),
      getResourcePage: () =>
        response({ items: [], total: 0, page: 1, pageSize: 99999 }),
      getPool: () => response([]),
      getBalance: () => response({ balance: "0" }),
    };
    const platformSettings = {
      getStatus: () =>
        response({
          source: "application",
          configured: false,
          pythonConfigured: false,
          cookieConfigured: false,
          categoryId: 0,
          vendorConfigured: false,
          siteOrigin: "",
          publishIntervalSeconds: 30,
          lastTest: null,
        }),
    };
    const orders = { getOrders: () => response([]) };
    const aiProvider = {
      getStatus: () =>
        response({
          configured: false,
          source: "application",
          apiKeyMask: "",
          lastTest: null,
        }),
    };
    const storageMaintenance = {
      getUsage: () =>
        response({
          logs: { bytes: 0, files: 0 },
          temporary: { bytes: 0, files: 0 },
          docxCache: { bytes: 0, files: 0 },
          profiles: { bytes: 0, files: 0 },
        }),
    };

    window.__platformQueueLifecycle = {
      state,
      emitWorkspaceInvalidated(revision) {
        state.queueRevision = revision;
        const event = {
          schemaVersion: 1,
          workspaceRuntimeId: state.workspaceRuntimeId,
          revision,
          scopes: ["platformQueue"],
          reasonCode: "FIXTURE_TERMINAL",
        };
        state.invalidationListeners
          .slice()
          .forEach((listener) => listener(event));
      },
      switchWorkspace(nextRuntimeId, revision) {
        state.workspaceRuntimeId = nextRuntimeId;
        state.queueRevision = revision;
        const event = {
          schemaVersion: 1,
          workspaceRuntimeId: nextRuntimeId,
          revision,
          scopes: ["platformQueue"],
          reasonCode: "FIXTURE_RUNTIME_SWITCH",
        };
        state.invalidationListeners
          .slice()
          .forEach((listener) => listener(event));
      },
      emitWorkspaceInvalidated(runtimeId, revision) {
        const event = {
          schemaVersion: 1,
          workspaceRuntimeId: runtimeId,
          revision,
          scopes: ["platformQueue"],
          reasonCode: "FIXTURE_DELAYED_INVALIDATION",
        };
        state.invalidationListeners
          .slice()
          .forEach((listener) => listener(event));
      },
      getQueueCalls() {
        return state.queueCalls;
      },
      getGroupCalls() {
        return state.groupCalls;
      },
      setImagePublishingSupported(supported) {
        state.imagePublishingSupported = supported === true;
        const event = {
          schemaVersion: 1,
          workspaceRuntimeId: state.workspaceRuntimeId,
          revision: state.queueRevision + 1,
          scopes: ["platformQueue"],
          reasonCode: "FIXTURE_IMAGE_CAPABILITY_CHANGED",
        };
        state.invalidationListeners
          .slice()
          .forEach((listener) => listener(event));
      },
      setImageUpdatePending(pending) {
        state.imageUpdatePending = pending === true;
      },
      releaseImageUpdate() {
        state.imageUpdatePending = false;
        state.pendingImageUpdate?.();
        state.pendingImageUpdate = null;
      },
      setImageUpdateFailure(failing) {
        state.imageUpdateFailure = failing === true;
      },
      getImageCountUpdates() {
        return state.imageCountUpdates;
      },
    };
    window.desktopConsole = {
      auth,
      workspace,
      workspaceData,
      aiProvider,
      platformSettings,
      storageMaintenance,
      media,
      orders,
      platforms,
      content,
    };
  });
}

async function waitForServer(url) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try {
      await new Promise((resolve, reject) => {
        const request = http.get(url, (response) => {
          response.resume();
          response.statusCode >= 200 && response.statusCode < 500
            ? resolve()
            : reject(new Error("server not ready"));
        });
        request.on("error", reject);
      });
      return;
    } catch (_) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw new Error("Vite renderer server did not start");
}

describe("renderer platform queue lifecycle", { concurrency: false }, () => {
  before(async () => {
    const viteEntry = path.join(
      rendererDir,
      "node_modules",
      "vite",
      "bin",
      "vite.js",
    );
    buildDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "auto-publish-platform-queue-"),
    );
    execFileSync(process.execPath, [viteEntry, "build", "--outDir", buildDir], {
      cwd: rendererDir,
      stdio: "inherit",
    });
    viteProcess = spawn(
      process.execPath,
      [
        viteEntry,
        "preview",
        "--host",
        "127.0.0.1",
        "--port",
        "4176",
        "--outDir",
        buildDir,
      ],
      {
        cwd: rendererDir,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    await waitForServer(rendererUrl);
    browser = await chromium.launch({ headless: true });
  });

  after(async () => {
    if (browser) await browser.close();
    if (viteProcess && !viteProcess.killed) viteProcess.kill();
    if (buildDir) fs.rmSync(buildDir, { recursive: true, force: true });
  });

  it("loads queue groups once and refreshes them only on explicit user intent", async () => {
    const page = await browser.newPage({
      viewport: { width: 1200, height: 800 },
    });
    page.setDefaultTimeout(10000);
    await installDesktopFixture(page);
    await page.goto(rendererUrl, { waitUntil: "domcontentloaded" });
    await page.getByText("数据已就绪").waitFor();
    const initialCalls = await page.evaluate(() =>
      window.__platformQueueLifecycle.getGroupCalls(),
    );
    assert.equal(
      initialCalls,
      1,
      "PlatformFeatureProvider owns the initial queue-group load",
    );

    await page.waitForTimeout(500);
    assert.equal(
      await page.evaluate(() =>
        window.__platformQueueLifecycle.getGroupCalls(),
      ),
      initialCalls,
      "initial idle does not trigger another group query",
    );

    await page.locator("#nav-item-submission-center").click();
    await page.getByRole("heading", { name: "普通平台队列" }).waitFor();
    await page.waitForTimeout(500);
    assert.equal(
      await page.evaluate(() =>
        window.__platformQueueLifecycle.getGroupCalls(),
      ),
      initialCalls,
      "mounting the page does not refresh again",
    );

    await page.getByRole("button", { name: "刷新", exact: true }).click();
    await page.waitForFunction(
      (expected) =>
        window.__platformQueueLifecycle.getGroupCalls() === expected + 1,
      initialCalls,
    );
    await page.close();
  });

  it("rejects stale workspace invalidations after the production runtime switches to B", async () => {
    const page = await browser.newPage({
      viewport: { width: 1200, height: 800 },
    });
    page.setDefaultTimeout(10000);
    await installDesktopFixture(page);
    await page.goto(rendererUrl, { waitUntil: "domcontentloaded" });
    await page.getByText("数据已就绪").waitFor();
    await page.locator("#nav-item-submission-center").click();
    await page.getByRole("heading", { name: "普通平台队列" }).waitFor();

    const beforeSwitch = await page.evaluate(() =>
      window.__platformQueueLifecycle.getQueueCalls(),
    );
    await page.evaluate(() =>
      window.__platformQueueLifecycle.switchWorkspace("fixture-runtime-2", 60),
    );
    await page.waitForFunction(
      (expected) => window.__platformQueueLifecycle.getQueueCalls() > expected,
      beforeSwitch,
    );
    const beforeDelayedA = await page.evaluate(() =>
      window.__platformQueueLifecycle.getQueueCalls(),
    );
    await page.evaluate(() => {
      window.__platformQueueLifecycle.emitWorkspaceInvalidated(
        "fixture-runtime-2",
        59,
      );
      window.__platformQueueLifecycle.emitWorkspaceInvalidated(
        "fixture-runtime-2",
        60,
      );
    });
    await page.waitForTimeout(400);
    assert.equal(
      await page.evaluate(() =>
        window.__platformQueueLifecycle.getQueueCalls(),
      ),
      beforeDelayedA,
      "A terminal event must not refresh B queue",
    );
    await page.close();
  });

  it("hides unsupported image controls and safely edits a supported queue group on a narrow viewport", async () => {
    const page = await browser.newPage({
      viewport: { width: 375, height: 800 },
    });
    page.setDefaultTimeout(10000);
    await installDesktopFixture(page);
    await page.goto(rendererUrl, { waitUntil: "domcontentloaded" });
    await page.getByText("数据已就绪").waitFor();
    await page.locator("#nav-item-submission-center").click();
    await page.getByRole("heading", { name: "普通平台队列" }).waitFor();
    const input = page.getByRole("spinbutton", {
      name: "头条 每篇图片数量",
    });
    assert.equal(
      await input.count(),
      0,
      "undeclared capability keeps the image editor hidden",
    );

    await page.evaluate(() =>
      window.__platformQueueLifecycle.setImagePublishingSupported(true),
    );
    assert.equal(
      await page.evaluate(async () => {
        const response = await window.desktopConsole.content.listRegularQueueGroups();
        return response.data.items[0].imagePublishingSupported;
      }),
      true,
    );
    await page.getByRole("button", { name: "刷新", exact: true }).click();
    await input.waitFor();
    assert.equal(await input.inputValue(), "0");
    const save = page.getByRole("button", { name: "保存图片数量" });
    const successFeedback = page
      .getByRole("status")
      .filter({ hasText: "图片数量已保存。" });
    assert.equal(
      await save.isDisabled(),
      true,
      "the unchanged zero configuration does not submit itself",
    );
    const inputBox = await input.boundingBox();
    const saveBox = await save.boundingBox();
    assert.ok(
      saveBox.y > inputBox.y,
      "the compact editor stacks controls on a narrow viewport",
    );

    await input.fill("6");
    assert.equal(await input.getAttribute("aria-invalid"), "true");
    assert.equal(
      await save.isDisabled(),
      true,
      "out-of-range input stays local and cannot call the bridge",
    );

    await input.fill("1");
    await save.click();
    await successFeedback.waitFor();
    await input.fill("5");
    await save.click();
    await successFeedback.waitFor();
    assert.deepEqual(
      await page.evaluate(() =>
        window.__platformQueueLifecycle.getImageCountUpdates(),
      ),
      [1, 5],
    );

    await input.fill("1");
    await page.evaluate(() =>
      window.__platformQueueLifecycle.setImageUpdatePending(true),
    );
    await save.click();
    await page.getByRole("button", { name: "保存中…" }).waitFor();
    assert.equal(
      await page.getByRole("button", { name: "保存中…" }).isDisabled(),
      true,
    );
    await page.evaluate(() =>
      window.__platformQueueLifecycle.releaseImageUpdate(),
    );
    await successFeedback.waitFor();

    await page.evaluate(() =>
      window.__platformQueueLifecycle.setImageUpdateFailure(true),
    );
    await input.fill("5");
    await save.click();
    await page
      .getByRole("alert")
      .filter({ hasText: "保存图片数量失败" })
      .waitFor();
    await page.close();
  });
});
