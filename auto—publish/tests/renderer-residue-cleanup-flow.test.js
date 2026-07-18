const { after, before, describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync, spawn } = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require("playwright");

const rootDir = path.resolve(__dirname, "..");
const rendererUrl = "http://127.0.0.1:4175/";

let viteProcess;
let browser;

function result(data) {
  return Promise.resolve({ ok: true, data });
}

function runtimeDiagnostics() {
  const capability = { state: "ready", source: "fixture", errorCode: null, lastCheckedAt: null };
  return {
    ok: true,
    buildInfo: { version: "1.0.1", commit: "renderer-residue-flow", dirty: false },
    browserChannel: { channel: "chromium", configured: true, state: "ready", probed: true, source: "fixture", errorCode: null, lastCheckedAt: null },
    capabilities: { playwrightNode: capability, playwrightCli: capability, browserChannel: { ...capability, channel: "chromium", configured: true, probed: true }, docx: capability, hepan: { state: "optional_unconfigured", source: "fixture", errorCode: "HEPAN_PYTHON_UNAVAILABLE", lastCheckedAt: null } },
    errors: [],
    warnings: []
  };
}

function installDesktopFixture(page, scenario) {
  return page.addInitScript((input) => {
    const state = { scenario: input.scenario, cleanupCalls: 0, previewCalls: 0 };
    const ok = (data) => Promise.resolve({ ok: true, data });
    const residue = (cleanableCount, reportedCount, reasonCode) => ({
      items: [],
      cleanableItems: cleanableCount ? [{ sourceArticleState: "trashed", repairAction: "cleanup", reasonCode: reasonCode || null }] : [],
      reportedItems: reportedCount ? [{ sourceArticleState: "trashed", repairAction: null, reasonCode: "PUBLICATION_ACTIVE" }] : [],
      cleanableCount,
      reportedCount
    });
    const content = {
      previewTrashedArticleQueueResidue: () => {
        state.previewCalls += 1;
        if (state.scenario === "success" && state.cleanupCalls > 0) return ok(residue(0, 0));
        if (state.scenario === "partial" && state.cleanupCalls > 0) return ok(residue(1, 0, "PUBLICATION_ATTEMPT_MISMATCH"));
        if (state.scenario === "zero" || state.scenario === "reject") return ok(residue(1, 0, "PUBLICATION_ATTEMPT_MISMATCH"));
        return ok(residue(2, 0, "PUBLICATION_ATTEMPT_MISMATCH"));
      },
      cleanupTrashedArticleQueueResidue: () => {
        state.cleanupCalls += 1;
        if (state.scenario === "reject") {
          const error = new Error("cleanup rejected");
          error.code = "PUBLICATION_ATTEMPT_MISMATCH";
          return Promise.reject(error);
        }
        if (state.scenario === "zero") return ok({ ...residue(1, 0, "PUBLICATION_ATTEMPT_MISMATCH"), cleanedCount: 0, failedCount: 1, remainingCount: 1, failedItems: [{ reasonCode: "PUBLICATION_ATTEMPT_MISMATCH" }] });
        if (state.scenario === "partial") return ok({ ...residue(1, 0, "PUBLICATION_ATTEMPT_MISMATCH"), cleanedCount: 1, failedCount: 1, remainingCount: 1, failedItems: [{ reasonCode: "PUBLICATION_ATTEMPT_MISMATCH" }] });
        return ok({ ...residue(0, 0), cleanedCount: 1, failedCount: 0, remainingCount: 0, failedItems: [] });
      },
      listContentArticles: () => ok([]),
      listSubmissionPlatforms: () => ok([]),
      listSubmissionBatches: () => ok([]),
      listArticleTrash: () => ok([]),
      listResearch: () => ok([]),
      listQuestions: () => ok([]),
      getDoubaoLoginState: () => ok({ status: "unknown" }),
      getDoubaoQueueState: () => ok({ status: "idle", currentTaskId: null, completed: 0, total: 0, waitRemainingMs: 0, tasks: [] }),
      onDoubaoQueueState: () => () => {},
      listTemplates: () => ok([]),
      listTemplateCatalog: () => ok({ revision: "fixture", platforms: [], templates: [], diagnostics: [] })
    };
    const workspace = {
      getBootstrapState: () => ok({ state: "ready", workspacePath: "fixture", envOverride: false }),
      getCurrent: () => ok({ workspacePath: "fixture", envOverride: false, validation: { ok: true, errors: [], warnings: [] } }),
      openCurrent: () => ok(undefined),
      requestSwitch: () => ok({ state: "ready", workspacePath: "fixture", envOverride: false }),
      chooseDirectory: () => ok({ state: "ready", workspacePath: "fixture", envOverride: false }),
      confirmSelection: () => ok({ state: "ready" }),
      cancelSelection: () => ok({ state: "ready", workspacePath: "fixture", envOverride: false })
    };
    const media = { scanArticles: () => ok([]), getResourcePage: () => ok({ items: [], total: 0, page: 1, pageSize: 100 }), getPool: () => ok([]), getBalance: () => ok({ balance: "0" }) };
    const platformStatus = { isBatchRunning: false, isStopPending: false, isPlatformRunning: false };
    const platforms = { getQueue: () => ok({ platforms: [], queue: [] }), getState: () => ok(platformStatus), onState: () => () => {} };
    const orders = { getOrders: () => ok([]) };
    const aiProvider = { getStatus: () => ok({ configured: false, source: "application", apiKeyMask: "", lastTest: null }), save: () => ok({}), testConnection: () => ok({}), clear: () => ok({ cleared: true }) };
    const platformSettings = { getStatus: () => ok({ configured: false, source: "application", baseUrl: "", timeoutMs: 30000, allowInsecure: false, transport: "未配置", apiKeyMask: "", lastTest: null }), save: () => ok({}), test: () => ok({ testedAt: "", ok: true, code: "OK" }), clear: () => ok({ cleared: true }) };
    const storageMaintenance = { getUsage: () => ok({ logs: { bytes: 0, files: 0 }, temporary: { bytes: 0, files: 0 }, docxCache: { bytes: 0, files: 0 }, profiles: { bytes: 0, files: 0 } }), cleanCaches: () => ok({ blocked: false }) };
    window.__residueFlow = state;
    window.desktopConsole = { workspace, runtimeDiagnostics: { get: () => ok(runtimeDiagnostics()) }, aiProvider, platformSettings, storageMaintenance, media, orders, platforms, content };
    window.confirm = () => true;
  }, { scenario });
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

async function openPlatformPage(scenario) {
  const page = await browser.newPage({ viewport: { width: 1128, height: 700 } });
  page.setDefaultTimeout(5000);
  await installDesktopFixture(page, scenario);
  await page.goto(rendererUrl, { waitUntil: "domcontentloaded" });
  await page.locator("#nav-item-platforms").waitFor();
  await page.locator("#nav-item-platforms").click();
  await page.getByRole("heading", { name: "其他平台投稿" }).waitFor();
  await page.getByRole("button", { name: /检查并清理已删除文章残留/ }).waitFor();
  return page;
}

describe("renderer residue cleanup flow", { concurrency: false }, () => {
  before(async () => {
    execFileSync(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", "npm --prefix media-workbench run build"], { cwd: rootDir, stdio: "inherit" });
    viteProcess = spawn(process.execPath, [path.join(rootDir, "media-workbench", "node_modules", "vite", "bin", "vite.js"), "preview", "--host", "127.0.0.1", "--port", "4175"], { cwd: path.join(rootDir, "media-workbench"), stdio: ["ignore", "pipe", "pipe"] });
    await waitForServer(rendererUrl);
    browser = await chromium.launch({ headless: true });
  });

  after(async () => {
    if (browser) await browser.close();
    if (viteProcess && !viteProcess.killed) viteProcess.kill();
  });

  for (const scenario of ["zero", "reject", "partial", "success"]) {
    it(`reports ${scenario} cleanup without leaving the residue action busy`, async () => {
      const page = await openPlatformPage(scenario);
      try {
        const action = page.getByRole("button", { name: /检查并清理已删除文章残留/ });
        await action.click();
        await page.waitForFunction(() => !document.body.innerText.includes("清理中…"));
        const alerts = page.getByRole("alert");
        const statuses = page.getByRole("status");
        if (scenario === "success") {
          await statuses.filter({ hasText: "已清理 1 项" }).waitFor();
          assert.equal(await alerts.filter({ hasText: "未清理" }).count(), 0);
        } else {
          assert.equal(await action.isDisabled(), false, `RESIDUE_BUSY_RED ${scenario}`);
          await alerts.waitFor();
          const text = await alerts.first().innerText();
          assert.match(text, /PUBLICATION_ATTEMPT_MISMATCH|cleanup rejected|失败|未清理/);
          assert.equal(await statuses.filter({ hasText: "已清理 0 项" }).count(), 0, `RESIDUE_FALSE_SUCCESS_RED ${scenario}`);
        }
      } finally {
        await page.close();
      }
    });
  }

  it("declares the transaction lifecycle contract at the renderer boundary", () => {
    const platform = fs.readFileSync(path.join(rootDir, "media-workbench/src/components/PlatformWorkbench.tsx"), "utf8");
    const history = fs.readFileSync(path.join(rootDir, "media-workbench/src/components/content/GeneratedArticlesView.tsx"), "utf8");
    const api = fs.readFileSync(path.join(rootDir, "media-workbench/src/electron-api.ts"), "utf8");
    const types = fs.readFileSync(path.join(rootDir, "media-workbench/src/types.ts"), "utf8");
    assert.match(platform, /repairingResidue/);
    assert.match(platform, /finally/);
    assert.match(history, /pending_auto_recovery/);
    assert.match(history, /needs_repair/);
    assert.match(history, /retry.*Removal|retry.*removal/i);
    assert.match(history, /openTransaction/);
    assert.match(history, /removalSubmitDisabled/);
    assert.match(history, /clearTimeout/);
    assert.match(api, /getArticleRemovalTransaction/);
    assert.match(api, /onArticleRemovalTransaction/);
    assert.match(types, /ArticleRemovalTransaction/);
  });
});
