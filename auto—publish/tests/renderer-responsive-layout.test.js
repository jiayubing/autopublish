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

  it("keeps expanded long-title history rows and row-end actions inside narrow viewports", async () => {
    const longTitle = "窄宽度长标题回归：这是一段足够长的历史文章标题，用来验证行尾发布详情动作不会越过 viewport";
    const articles = Array.from({ length: 8 }, (_, index) => ({
      id: `responsive-history-${index}`,
      clientId: "layout-smoke",
      researchQueryIds: [],
      platform: "fixture-responsive-platform",
      scenario: "响应式历史编辑",
      templateId: "fixture-responsive-template",
      title: `${longTitle} ${index}`,
      content: "responsive history fixture",
      status: "generated",
      source: { client_material: true, doubao_answer: true, references: false, template: true },
      createdAt: `2026-07-18T00:${String(index).padStart(2, "0")}:00.000Z`,
      updatedAt: `2026-07-18T00:${String(index).padStart(2, "0")}:00.000Z`,
      reviewedAt: null,
      version: 1,
      templateSnapshot: {
        platform: "fixture-responsive-platform",
        id: "fixture-responsive-template",
        name: "超长模板名称用于响应式历史列表边界回归",
        scenario: "响应式历史编辑",
        body: "responsive template body",
        bodyHash: "responsive-template-hash",
        source: "custom"
      }
    }));

    for (const [width, height] of [[1128, 527], [1424, 861]]) {
      const page = await openRenderer(width, height);
      try {
        await page.evaluate((items) => {
          const response = (data) => Promise.resolve({ ok: true, data });
          window.desktopConsole.content.listGeneratedArticles = () => response(items);
          window.desktopConsole.content.listTemplateCatalog = () => response({ revision: "responsive-fixture", platforms: [{ id: "fixture-responsive-platform", displayName: "响应式测试平台", description: "", order: 1 }], templates: [{ id: "fixture-responsive-template", platform: "fixture-responsive-platform", scenario: "响应式历史编辑", name: "超长模板名称用于响应式历史列表边界回归", body: "responsive template body", bodyHash: "responsive-template-hash", source: "custom" }], diagnostics: [] });
          window.desktopConsole.publication = { listForArticles: () => response([]) };
        }, articles);
        await page.getByRole("button", { name: "刷新客户与模板" }).click();
        await page.waitForFunction(() => document.querySelector("select[aria-label='当前客户（单篇/问题/历史）']")?.value === "layout-smoke");
        await page.getByRole("button", { name: "文章生成" }).click();
        await page.getByRole("button", { name: "历史文章" }).click();
        await page.getByRole("heading", { name: "历史文章" }).waitFor();
        assert.match(await page.locator("body").innerText(), /超长模板名称用于响应式历史列表边界回归/);
        await page.getByRole("button", { name: /fixture-responsive-platform.*超长模板名称/ }).click();
        await page.getByText(`${longTitle} 7`, { exact: true }).waitFor();

        const measured = await page.evaluate(() => {
          const visible = (element) => {
            const box = element.getBoundingClientRect();
            return box.width > 0 && box.height > 0 && getComputedStyle(element).visibility !== "hidden";
          };
          const actionButtons = Array.from(document.querySelectorAll("button")).filter((button) => button.textContent?.includes("发布详情") && visible(button));
          return {
            viewport: { width: window.innerWidth, height: window.innerHeight },
            documentScrollWidth: document.documentElement.scrollWidth,
            actions: actionButtons.map((button) => ({ box: button.getBoundingClientRect().toJSON(), row: button.parentElement?.getBoundingClientRect().toJSON() })),
            controls: Array.from(document.querySelectorAll("input, select, button, textarea")).filter(visible).map((element) => ({ text: element.textContent, box: element.getBoundingClientRect().toJSON() }))
          };
        });
        assert.equal(measured.viewport.width, width);
        assert.equal(measured.viewport.height, height);
        assert.ok(measured.documentScrollWidth <= width + 1, `HISTORY_PAGE_OVERFLOW_RED ${JSON.stringify(measured)}`);
        assert.ok(measured.actions.length > 0, `expected visible row-end actions ${JSON.stringify(measured)}`);
        measured.actions.forEach(({ box, row }) => {
          assertInsideViewport(box, measured.viewport);
          assertInsideViewport(row, measured.viewport);
          assert.ok(row.x + row.width <= measured.viewport.width + 1, `history row overflows right edge: ${JSON.stringify(row)}`);
        });
        measured.controls.forEach((control) => assertInsideViewport(control.box, measured.viewport));
      } finally {
        await page.close();
      }
    }

    const historySource = fs.readFileSync(path.join(rootDir, "media-workbench", "src", "components", "content", "GeneratedArticlesView.tsx"), "utf8");
    assert.match(historySource, /<div key=\{article\.id\} className="[^\"]*min-w-0[^\"]*flex-wrap[^\"]*items-start/);
  });
});
