const assert = require("node:assert/strict");
const { _electron: electron } = require("playwright");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { describe, it } = require("node:test");

const root = path.resolve(__dirname, "..");
const rendererEntry = path.join(root, "media-workbench", "dist", "index.html");
const electronBinary = require("electron");
const enabled = process.platform === "win32" && process.env.RUN_ELECTRON_FOCUS_TESTS === "1";
const suite = enabled ? describe : describe.skip;

function writeFixture(directory) {
  const preload = path.join(directory, "preload.cjs");
  const main = path.join(directory, "main.cjs");
  const preloadSource = [
    'const { contextBridge } = require("electron");',
    "let configured = true; let lastTest = null; let testCalls = 0; let saves = 0; let clears = 0;",
    'const data = (value) => Promise.resolve({ ok: true, data: value });',
    'const auth = { authenticated: true, user: { loginName: "fixture-user" }, entitlements: [{ product: "AutoPublish", enabled: true, expiresAt: null }], device: { deviceCount: 1, maxDevices: 5 }, errorCode: null, sessionStatus: "authenticated" };',
    'const hepanStatus = () => ({ source: "application", configured, pythonConfigured: configured, cookieConfigured: configured, categoryId: 121, vendorConfigured: false, bundledVendorAvailable: true, siteOrigin: "https://www.hepan.com", publishIntervalSeconds: 30, lastTest });',
    'const platformSettings = {',
    '  getStatus: (platformId) => data(platformId === "hepan" ? hepanStatus() : { source: "application", configured: false, baseUrl: "", timeoutMs: 30000, allowInsecure: false, transport: "未配置", apiKeyMask: "", lastTest: null }),',
    '  save: () => { saves += 1; return data(hepanStatus()); },',
    '  test: () => { testCalls += 1; if (testCalls === 2) { lastTest = { testedAt: "2026-07-21T05:00:00.000Z", ok: false, code: "HEPAN_REMOTE_TIMEOUT" }; return Promise.reject({ code: "HEPAN_REMOTE_TIMEOUT", message: "fixture timeout" }); } lastTest = { testedAt: "2026-07-21T05:00:00.000Z", ok: true, code: "HEPAN_AUTH_OK", authenticated: true, publishAccess: true, uploadContext: "changed", stage: "upload_context", warnings: ["HEPAN_UPLOAD_CONTEXT_CHANGED"], account: { displayName: "fixture-user", uid: "2093208" } }; return data(lastTest); },',
    '  clear: () => { configured = false; lastTest = null; clears += 1; return data({ cleared: true }); },',
    '  getLegacyStatus: () => data({ discover: { media: { available: false, sources: [] }, hepan: { available: false, sources: [], cookiePathAvailable: false }, sources: [], importable: false }, record: null }),',
    '  importLegacy: () => data({})',
    '};',
    'contextBridge.exposeInMainWorld("desktopConsole", {',
    '  auth: { getState: () => data(auth), refresh: () => data(auth), logout: () => data({ authenticated: false }), login: () => data(auth), onStateChanged: () => () => {} },',
    '  workspace: { getBootstrapState: () => data({ state: "ready", workspacePath: "fixture", envOverride: false }), getCurrent: () => data({ workspacePath: "fixture", envOverride: false, validation: { ok: true, kind: "existing_workspace", errors: [], warnings: [] } }), openCurrent: () => data(undefined), requestSwitch: () => data({ state: "ready" }), chooseDirectory: () => data({ state: "ready" }), confirmSelection: () => data({ state: "ready" }), cancelSelection: () => data({ state: "ready" }) },',
    '  workspaceData: { onInvalidated: () => () => {} },',
    '  media: { scanArticles: () => data([]), getResourcePage: () => data({ items: [], total: 0, page: 1, pageSize: 100 }), getPool: () => data([]), getBalance: () => data({ balance: "0" }) },',
    '  orders: { getOrders: () => data([]) },',
    '  platforms: { getQueue: () => data({ platforms: [], queue: [] }), getState: () => data({ isPlatformRunning: false, isBatchRunning: false, isStopPending: false }), onState: () => () => {} },',
    '  aiProvider: { getStatus: () => data({ source: "application", configured: false, baseUrl: "", model: "", timeoutMs: 60000, hasApiKey: false, apiKeyMask: "", lastTest: null }), save: () => data({}), testConnection: () => data({}), clear: () => data({ cleared: true }) },',
    '  platformSettings,',
    '  runtimeDiagnostics: { get: () => data({ ok: true, buildInfo: { version: "fixture", commit: "fixture", dirty: false }, capabilities: {}, errors: [], warnings: [] }) },',
    '  content: { getGenerationBatchState: () => data({ state: "idle", status: "idle", isBatchRunning: false, isStopPending: false }), onGenerationBatchState: () => () => {}, listClients: () => data([]), listResearch: () => data([]), listQuestions: () => data([]), listTemplates: () => data([]), listTemplateCatalog: () => data({ revision: "fixture", platforms: [], templates: [], diagnostics: [] }) }',
    '});',
    'contextBridge.exposeInMainWorld("__focusTest", { getState: () => ({ saves, clears }) });'
  ].join("\n");
  const mainSource = [
    'const { app, BrowserWindow } = require("electron");',
    "app.disableHardwareAcceleration();",
    "app.whenReady().then(async () => {",
    '  const window = new BrowserWindow({ width: 1200, height: 800, show: true, webPreferences: { preload: ' + JSON.stringify(preload) + ', contextIsolation: true, sandbox: false } });',
    "  await window.loadFile(" + JSON.stringify(rendererEntry) + ");",
    "});"
  ].join("\n");
  fs.writeFileSync(preload, preloadSource, "utf8");
  fs.writeFileSync(main, mainSource, "utf8");
  return main;
}

suite("Electron renderer settings focus regression", { concurrency: false }, () => {
  it("keeps first save, confirmation cancel, success, failure, and clear immediately interactive", async () => {
    assert.equal(fs.existsSync(rendererEntry), true, "build the renderer before running Electron focus tests");
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "auto-publish-electron-focus-"));
    const main = writeFixture(directory);
    let app;
    try {
      app = await electron.launch({ executablePath: electronBinary, args: [main], env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined } });
      const page = await app.firstWindow();
      page.setDefaultTimeout(10000);
      page.on("dialog", (dialog) => { throw new Error("native dialog opened: " + dialog.message()); });
      await page.waitForSelector("#nav-item-settings");
      await page.getByRole("button", { name: "配置中心" }).click();
      await page.getByRole("button", { name: "蓝色河畔", exact: true }).click();
      const python = page.getByLabel("Python 可执行文件");
      const interval = page.getByLabel("河畔发布间隔预设");
      const save = page.getByRole("button", { name: "保存配置" });
      const test = page.getByRole("button", { name: "测试登录" });
      const clear = page.getByRole("button", { name: "清除配置" });

      await save.click();
      await page.waitForFunction(() => window.__focusTest?.getState().saves === 1);
      await python.click();
      assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("aria-label")), "Python 可执行文件");
      await interval.click();
      assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("aria-label")), "河畔发布间隔预设");

      await test.click();
      await page.getByRole("dialog").waitFor();
      assert.equal((await app.windows()).length, 1);
      await page.getByRole("button", { name: "取消" }).click();
      await page.waitForFunction(() => document.activeElement?.textContent?.includes("测试登录"));
      assert.equal((await app.windows()).length, 1);

      await test.click();
      await page.getByRole("dialog").getByRole("button", { name: "开始测试" }).click();
      await page.getByText(/登录账号：fixture-user/).waitFor();
      await python.click();
      assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("aria-label")), "Python 可执行文件");

      await test.click();
      await page.getByRole("dialog").getByRole("button", { name: "开始测试" }).click();
      await page.getByRole("alert").filter({ hasText: "网络请求超时" }).waitFor();
      await interval.click();
      assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("aria-label")), "河畔发布间隔预设");

      await clear.click();
      await page.getByRole("dialog").getByRole("button", { name: "取消" }).click();
      await page.waitForFunction(() => document.activeElement?.textContent?.includes("清除配置"));
      await clear.click();
      await page.getByRole("dialog").getByRole("button", { name: "清除配置" }).click();
      await page.waitForFunction(() => window.__focusTest?.getState().clears === 1);
      await python.click();
      assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("aria-label")), "Python 可执行文件");
    } finally {
      if (app) await app.close();
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });
});
