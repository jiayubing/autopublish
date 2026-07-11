const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const MW = path.resolve(__dirname, "..", "media-workbench", "src");

function readApp(file) {
  return fs.readFileSync(path.join(MW, file), "utf8");
}

function readComponent(name) {
  return fs.readFileSync(path.join(MW, "components", name), "utf8");
}

function fileExists(file) {
  return fs.existsSync(path.join(MW, file));
}

function componentExists(name) {
  return fs.existsSync(path.join(MW, "components", name));
}

describe("react workbench regression", function() {
  it("gates renderer localStorage fixtures behind an explicit development flag", function() {
    const source = readApp("electron-api.ts");
    assert.ok(source.includes("VITE_ENABLE_FIXTURES === \"true\""));
    assert.ok(source.includes("import.meta.env.DEV"));
  });
  it("has PlatformWorkbench component", function() {
    assert.ok(componentExists("PlatformWorkbench.tsx"),
      "PlatformWorkbench.tsx must be present for other-platform posting");
  });

  it("has platforms nav item in Sidebar", function() {
    const sidebar = readComponent("Sidebar.tsx");
    assert.ok(sidebar.includes("platforms") || sidebar.includes("其他平台"),
      "Sidebar must include platforms navigation");
  });

  it("electron-api.ts does not import mockData", function() {
    const api = readApp("electron-api.ts");
    assert.equal(api.includes("mockData"), false,
      "electron-api.ts must not import mockData");
    assert.equal(api.includes("INITIAL_ARTICLES"), false,
      "electron-api.ts must not reference INITIAL_ARTICLES");
  });

  it("electron-api.ts has platform API wrappers", function() {
    const api = readApp("electron-api.ts");
    assert.ok(api.includes("getPlatformQueue"),
      "electron-api.ts must export getPlatformQueue");
    assert.ok(api.includes("submitPlatformPlan") || api.includes("buildPlatformPlan"),
      "electron-api.ts must export platform plan helpers");
  });

  it("App.tsx does not use mock article creation", function() {
    const app = readApp("App.tsx");
    assert.equal(app.includes("handleAddNewMockArticle"), false,
      "App.tsx must not have mock article creation");
    assert.equal(app.includes("persistArticles"), false,
      "App.tsx must not use local persistence fallback");
    assert.equal(app.includes("INITIAL_ARTICLES"), false,
      "App.tsx must not reference INITIAL_ARTICLES");
  });

  it("App.tsx renders PlatformWorkbench for platforms view", function() {
    const app = readApp("App.tsx");
    assert.ok(app.includes("PlatformWorkbench") || app.includes("platforms"),
      "App.tsx must render PlatformWorkbench for platforms view");
  });

  it("balance API shape matches service return", function() {
    const api = readApp("electron-api.ts");
    assert.ok(api.includes("Number(") && api.includes(".balance"),
      "electron-api.ts getBalance must convert balance to Number");
  });

  it("preload.js exposes platforms API surface", function() {
    const preload = fs.readFileSync(path.resolve(__dirname, "..", "desktop", "preload.js"), "utf8");
    assert.ok(preload.includes("platforms:") || preload.includes('"platforms"'),
      "preload must expose platforms namespace");
    assert.ok(preload.includes("getQueue"),
      "preload must expose getQueue");
  });

  it("shares the IPC response envelope with structured errors", function() {
    const types = readApp("types.ts");
    const api = readApp("electron-api.ts");
    const ipcResponse = fs.readFileSync(path.resolve(__dirname, "..", "desktop", "services", "ipc-response.js"), "utf8");

    assert.ok(types.includes("interface IpcError") && types.includes("code: string") && types.includes("message: string"),
      "renderer IPC errors must expose code and message");
    assert.ok(types.includes("IpcResponse<T>"),
      "renderer must use a reusable IPC response envelope");
    assert.ok(api.includes("IpcResponse<"),
      "preload API declarations must use the shared IPC response envelope");
    assert.ok(ipcResponse.includes("ok: true") && ipcResponse.includes("data: data") && ipcResponse.includes("ok: false") && ipcResponse.includes("code:") && ipcResponse.includes("message:"),
      "main-process IPC must return the shared ok/data/error envelope");
  });

  it("uses the main-process platform status shape without a paused flag", function() {
    const types = readApp("types.ts");
    const api = readApp("electron-api.ts");
    const taskService = fs.readFileSync(path.resolve(__dirname, "..", "desktop", "services", "desktop-task-service.js"), "utf8");

    assert.ok(types.includes("interface PlatformStatus") && types.includes("isBatchRunning: boolean") && types.includes("isStopPending: boolean") && types.includes("isPlatformRunning: boolean"),
      "platform status must model every maintained main-process state field");
    assert.ok(taskService.includes("isBatchRunning: isBatchRunning") && taskService.includes("isStopPending: isStopPending") && taskService.includes("isPlatformRunning: isPlatformRunning"),
      "platform status must match the task service payload");
    assert.equal(types.includes("isPlatformPaused"), false,
      "platform status must not invent an unmaintained paused field");
    assert.equal(api.includes("isPlatformPaused"), false,
      "electron API must not expose an unmaintained paused field");
  });

  it("emits the complete platform status payload to preload listeners", function() {
    const taskService = fs.readFileSync(path.resolve(__dirname, "..", "desktop", "services", "desktop-task-service.js"), "utf8");
    const emitStart = taskService.indexOf('sendToRenderer("platform-state", {');
    const emitEnd = taskService.indexOf("\n    });", emitStart);
    const payload = taskService.slice(emitStart, emitEnd);

    assert.ok(payload.includes("isBatchRunning: isBatchRunning") && payload.includes("isStopPending: isStopPending") && payload.includes("isPlatformRunning: isPlatformRunning"),
      "platform-state events must use the complete PlatformStatus wire shape");
  });

  it("type-checks before building the renderer and provides a root verifier", function() {
    const packageJson = JSON.parse(fs.readFileSync(path.resolve(__dirname, "..", "package.json"), "utf8"));
    const rendererPackageJson = JSON.parse(fs.readFileSync(path.resolve(__dirname, "..", "media-workbench", "package.json"), "utf8"));
    const verifyScript = path.resolve(__dirname, "..", "scripts", "verify.js");

    assert.ok(packageJson.scripts["build:renderer"].includes("--prefix media-workbench run lint"),
      "root renderer build must type-check before invoking Vite");
    assert.equal(packageJson.scripts["build:renderer"].includes("build.cmd"), false,
      "root renderer build must not depend on Windows command files");
    assert.equal(rendererPackageJson.scripts.build.includes("build.cmd"), false,
      "renderer build script must be shell-portable");
    assert.equal(packageJson.scripts.verify, "node scripts/verify.js",
      "root verify script must delegate to the verification runner");
    assert.ok(fs.existsSync(verifyScript), "verification runner must exist");
    const runner = fs.readFileSync(verifyScript, "utf8");
    assert.ok(runner.includes("media-workbench") && runner.includes("verify-alpha-package.js"),
      "verification runner must check renderer quality gates and optional alpha packages");
    assert.ok(runner.includes("process.env.ComSpec"),
      "verification runner must invoke npm through the Windows command shell without shell argument warnings");
  });
});
