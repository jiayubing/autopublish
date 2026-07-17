const { after, before, describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require("playwright");

const rootDir = path.resolve(__dirname, "..");
const fixtureWorkspace = path.join(__dirname, "fixtures", "workspaces", "layout-smoke");
const rendererUrl = "http://127.0.0.1:4173/";

let viteProcess;
let browser;

function ok(data) {
  return Promise.resolve({ ok: true, data });
}

function runtimeDiagnostics() {
  const capability = { state: "ready", source: "fixture", errorCode: null, lastCheckedAt: null };
  return {
    ok: true,
    buildInfo: { version: "1.0.1", commit: "layout-smoke", dirty: false },
    browserChannel: { channel: "chromium", configured: true, state: "ready", probed: true, source: "fixture", errorCode: null, lastCheckedAt: null },
    capabilities: { playwrightNode: capability, playwrightCli: capability, browserChannel: capability, docx: capability, hepan: { state: "optional_unconfigured", source: "fixture", errorCode: "HEPAN_PYTHON_UNAVAILABLE", lastCheckedAt: null } },
    errors: [],
    warnings: []
  };
}

function installDesktopFixture(page) {
  return page.addInitScript((workspacePath) => {
    const result = (data) => Promise.resolve({ ok: true, data });
    const client = { id: "layout-smoke", name: "布局测试客户", knowledgeFiles: [] };
    const submissionPlatforms = Array.from({ length: 10 }, (_, index) => ({
      id: `fixture-${index}`,
      displayName: index === 0 ? "超长投稿平台名称示例" : `投稿平台${index + 1}`,
      scanDir: "published",
      contentQueueImport: true
    }));
    const runtime = {
      get: () => result({
        ok: true,
        buildInfo: { version: "1.0.1", commit: "layout-smoke", dirty: false },
        browserChannel: { channel: "chromium", configured: true, state: "ready", probed: true, source: "fixture", errorCode: null, lastCheckedAt: null },
        capabilities: { playwrightNode: { state: "ready", source: "fixture", errorCode: null, lastCheckedAt: null }, playwrightCli: { state: "ready", source: "fixture", errorCode: null, lastCheckedAt: null }, browserChannel: { state: "ready", source: "fixture", errorCode: null, lastCheckedAt: null }, docx: { state: "ready", source: "fixture", errorCode: null, lastCheckedAt: null }, hepan: { state: "optional_unconfigured", source: "fixture", errorCode: "HEPAN_PYTHON_UNAVAILABLE", lastCheckedAt: null } },
        errors: [],
        warnings: []
      }),
      browserSmoke: () => result({ ok: true, browserChannel: "chromium", session: "fixture" })
    };
    const workspace = {
      getBootstrapState: () => result({ state: "ready", workspacePath, envOverride: false }),
      getCurrent: () => result({ workspacePath, envOverride: false, validation: { ok: true, errors: [], warnings: [] } }),
      openCurrent: () => result(undefined),
      requestSwitch: () => result({ state: "ready", workspacePath, envOverride: false }),
      chooseDirectory: () => result({ state: "ready", workspacePath, envOverride: false }),
      confirmSelection: () => result({ state: "ready" }),
      cancelSelection: () => result({ state: "ready", workspacePath, envOverride: false })
    };
    const content = {
      listClients: () => result([client]),
      listGeneratedArticles: () => result([]),
      listSubmissionPlatforms: () => result(submissionPlatforms),
      listSubmissionBatches: () => result([]),
      listArticleTrash: () => result([]),
      listResearch: () => result([]),
      listQuestions: () => result([]),
      getDoubaoLoginState: () => result({ status: "unknown" }),
      getDoubaoQueueState: () => result({ status: "idle", currentTaskId: null, completed: 0, total: 0, waitRemainingMs: 0, tasks: [] }),
      onDoubaoQueueState: () => () => {},
      listTemplates: () => result([]),
      listGenerationBatches: () => result([]),
      getGenerationBatchState: () => result({ state: "idle", currentBatchId: null, completed: 0, total: 0, tasks: [] }),
      previewGenerationBatch: () => result({}),
      previewSubmissionBatch: () => result({ queueableTaskCount: 0, idempotentCount: 0, conflictCount: 0 }),
      previewCancelSubmissionBatch: () => result({ cancelableCount: 0 }),
      getPlatformQueue: () => result({ platforms: [], queue: [] })
    };
    const media = {
      scanArticles: () => result([]),
      getResourcePage: () => result({ items: [], total: 0, page: 1, pageSize: 100 }),
      getPool: () => result([]),
      getBalance: () => result({ balance: "0" })
    };
    const orders = { getOrders: () => result([]) };
    const aiProvider = { getStatus: () => result({ configured: false, source: "application", apiKeyMask: "", lastTest: null }), save: () => result({}), testConnection: () => result({}), clear: () => result({ cleared: true }) };
    const platformSettings = { getStatus: (platformId) => result(platformId === "media" ? { configured: false, source: "application", baseUrl: "", timeoutMs: 30000, allowInsecure: false, transport: "未配置", apiKeyMask: "", lastTest: null } : { configured: false, source: "application", pythonConfigured: false, cookieConfigured: false, categoryId: 121, vendorConfigured: false, siteOrigin: "https://www.hepan.com", lastTest: null }), save: () => result({}), test: () => result({ testedAt: "", ok: true, code: "OK" }), clear: () => result({ cleared: true }) };
    const storageMaintenance = { getUsage: () => result({ logs: { bytes: 0, files: 0 }, temporary: { bytes: 0, files: 0 }, docxCache: { bytes: 0, files: 0 }, profiles: { bytes: 0, files: 0 } }), cleanCaches: () => result({ blocked: false }) };
    window.desktopConsole = { workspace, runtimeDiagnostics: runtime, aiProvider, platformSettings, storageMaintenance, media, orders, platforms: { getQueue: () => result({ platforms: [], queue: [] }), getState: () => result({ isBatchRunning: false, isStopPending: false, isPlatformRunning: false }), onState: () => () => {} }, content };
  }, fixtureWorkspace);
}

async function waitForServer(url) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try {
      await new Promise((resolve, reject) => {
        const request = http.get(url, (response) => { response.resume(); response.statusCode >= 200 && response.statusCode < 500 ? resolve() : reject(new Error("server not ready")); });
        request.on("error", reject);
      });
      return;
    } catch (_) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw new Error("Vite renderer server did not start");
}

async function openRenderer(width, height) {
  const page = await browser.newPage({ viewport: { width, height } });
  page.setDefaultTimeout(5000);
  page.on("pageerror", (error) => process.stderr.write(`renderer page error: ${error.message}\n`));
  await installDesktopFixture(page);
  await page.goto(rendererUrl, { waitUntil: "domcontentloaded" });
  await page.locator("#nav-item-content").waitFor();
  await page.locator("#nav-item-content").click();
  await page.getByRole("button", { name: "历史文章" }).click();
  await page.getByRole("heading", { name: "历史文章" }).waitFor();
  return page;
}

function assertInsideViewport(box, viewport) {
  assert.ok(box, "expected a visible layout box");
  assert.ok(box.x >= 0 && box.y >= 0, `box starts outside viewport: ${JSON.stringify(box)}`);
  assert.ok(box.x + box.width <= viewport.width + 1, `box overflows right edge: ${JSON.stringify(box)}`);
}

async function assertHistoryLayout(width, height) {
  const page = await openRenderer(width, height);
  try {
    const measured = await page.evaluate(() => {
      const heading = document.querySelector("h2");
      const note = heading?.nextElementSibling;
      const toolbar = heading?.closest("div.mb-4") || heading?.parentElement?.parentElement;
      const controls = Array.from(document.querySelectorAll("input, select, button"));
      return {
        viewport: { width: window.innerWidth, height: window.innerHeight },
        heading: heading?.getBoundingClientRect().toJSON(),
        note: note?.getBoundingClientRect().toJSON(),
        toolbar: toolbar?.getBoundingClientRect().toJSON(),
        controls: controls.map((element) => ({ text: element.textContent, box: element.getBoundingClientRect().toJSON() }))
      };
    });
    assert.equal(measured.viewport.width, width);
    assert.equal(measured.viewport.height, height);
    assert.ok(measured.heading.width >= 120, `HISTORY_LAYOUT_RED ${JSON.stringify(measured)}`);
    assert.ok(measured.note.width >= 120, `HISTORY_LAYOUT_RED ${JSON.stringify(measured)}`);
    assertInsideViewport(measured.toolbar, measured.viewport);
    measured.controls.filter((control) => control.box.width > 0 && control.box.height > 0).forEach((control) => assertInsideViewport(control.box, measured.viewport));
  } finally {
    await page.close();
  }
}

describe("real renderer responsive layout", { concurrency: false }, () => {
  before(async () => {
    assert.ok(fs.existsSync(path.join(fixtureWorkspace, "clients", "layout-smoke", "profile.md")));
    if (process.platform === "win32") {
      execFileSync(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", "npm --prefix media-workbench run build"], { cwd: rootDir, stdio: "inherit" });
    } else {
      execFileSync("npm", ["--prefix", "media-workbench", "run", "build"], { cwd: rootDir, stdio: "inherit" });
    }
    viteProcess = spawn(process.execPath, [path.join(rootDir, "media-workbench", "node_modules", "vite", "bin", "vite.js"), "preview", "--host", "127.0.0.1", "--port", "4173"], { cwd: path.join(rootDir, "media-workbench"), stdio: ["ignore", "pipe", "pipe"] });
    await waitForServer(rendererUrl);
    browser = await chromium.launch({ headless: true });
  });

  after(async () => {
    if (browser) await browser.close();
    if (viteProcess && !viteProcess.killed) viteProcess.kill();
  });

  it("measures the history toolbar at the medium viewport", async () => {
    await assertHistoryLayout(1128, 527);
  });

  it("measures the history toolbar at the desktop viewport", async () => {
    await assertHistoryLayout(1424, 861);
  });

  it("exposes the settings page content at the desktop viewport", async () => {
    const page = await browser.newPage({ viewport: { width: 1424, height: 861 } });
    try {
      page.setDefaultTimeout(5000);
      page.on("pageerror", (error) => process.stderr.write(`renderer page error: ${error.message}\n`));
      await installDesktopFixture(page);
      await page.goto(rendererUrl, { waitUntil: "domcontentloaded" });
      await page.locator("#nav-item-settings").waitFor();
      await page.locator("#nav-item-settings").click();
      await page.getByText("AI 生成", { exact: true }).first().waitFor();
      const measured = await page.evaluate(() => ({
        main: document.querySelector("main")?.getBoundingClientRect().toJSON(),
        settings: document.querySelector("main > div")?.getBoundingClientRect().toJSON(),
        text: document.body.innerText
      }));
      assert.ok(measured.main.width >= 1100, JSON.stringify(measured));
      assert.match(measured.text, /AI 生成/);
      assert.match(measured.text, /付费媒体/);
      assert.match(measured.text, /蓝色河畔/);
      assert.match(measured.text, /工作区/);
      assert.match(measured.text, /运行环境/);
      assert.match(measured.text, /存储与清理/);
    } finally {
      await page.close();
    }
  });
});
