const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { describe, it } = require("node:test");

const MW = path.resolve(__dirname, "..", "media-workbench", "src");
const readApp = (file) => fs.readFileSync(path.join(MW, file), "utf8");
const readComponent = (file) => fs.readFileSync(path.join(MW, "components", file), "utf8");

describe("react workbench regression", function() {
  it("gates renderer localStorage fixtures behind an explicit development flag", function() {
    const source = readApp("bridge/media.ts");
    assert.equal(source.includes("localStorage"), false);
    assert.equal(source.includes("VITE_ENABLE_FIXTURES"), false);
  });

  it("keeps Settings limited to manual workflow features", function() {
    const source = readComponent("SettingsView.tsx");
    ["AES-256", "LocalStorage", "clearAll"].forEach((claim) => assert.equal(source.includes(claim), false));
    assert.ok(source.includes("Workspace switching does not copy, move, or delete the original data"));
  });

  it("keeps the platforms workbench reachable", function() {
    assert.ok(fs.existsSync(path.join(MW, "components", "PlatformWorkbench.tsx")));
    assert.ok(readComponent("Sidebar.tsx").includes("platforms"));
    assert.ok(readApp("App.tsx").includes("PlatformWorkbench"));
  });

  it("keeps renderer APIs free of mock article persistence", function() {
    const api = readApp("bridge/platform.ts");
    const media = readApp("bridge/media.ts");
    const sharedApi = readApp("bridge/transport.ts");
    const app = readApp("App.tsx");
    assert.equal(sharedApi.includes("mockData"), false);
    assert.equal(sharedApi.includes("INITIAL_ARTICLES"), false);
    assert.equal(app.includes("handleAddNewMockArticle"), false);
    assert.equal(app.includes("persistArticles"), false);
    assert.equal(app.includes("INITIAL_ARTICLES"), false);
    assert.ok(api.includes("getPlatformQueue") && api.includes("submitPlatformSelection"));
    assert.ok(media.includes("Number(") && media.includes("balance"));
  });

  it("exposes platform commands through preload", function() {
    const preload = fs.readFileSync(path.resolve(__dirname, "..", "desktop", "preload.js"), "utf8");
    assert.ok(preload.includes("platforms:") && preload.includes("getQueue"));
  });

  it("shares the structured IPC response envelope", function() {
    const types = readApp("types.ts");
    const api = readApp("bridge/content.ts");
    const response = fs.readFileSync(path.resolve(__dirname, "..", "desktop", "services", "ipc-response.js"), "utf8");
    assert.ok(types.includes("interface IpcError") && types.includes("IpcResponse<T>"));
    assert.ok(api.includes("IpcResponse<"));
    assert.ok(response.includes("ok: true") && response.includes("data: data") && response.includes("ok: false"));
  });

  it("uses the complete main-process platform status shape", function() {
    const types = readApp("types.ts");
    const api = readApp("bridge/platform.ts");
    const taskService = fs.readFileSync(path.resolve(__dirname, "..", "desktop", "services", "desktop-task-service.js"), "utf8");
    assert.ok(types.includes("interface PlatformStatus") && types.includes("isBatchRunning: boolean") && types.includes("isStopPending: boolean") && types.includes("isPlatformRunning: boolean"));
    assert.match(taskService, /isBatchRunning:\s*false/);
    assert.match(taskService, /isStopPending:\s*(?:false|snapshot\.isStopPending)/);
    assert.match(taskService, /isPlatformRunning:\s*(?:isPlatformRunning|isPlatformRunning \|\| snapshot\.isPlatformRunning)/);
    assert.match(taskService, /platformTaskStateStore/);
    assert.match(taskService, /activePlatformRunId/);
    assert.equal(types.includes("isPlatformPaused"), false);
    assert.equal(api.includes("isPlatformPaused"), false);
  });

  it("type-checks before building the renderer", function() {
    const packageJson = JSON.parse(fs.readFileSync(path.resolve(__dirname, "..", "package.json"), "utf8"));
    const rendererPackage = JSON.parse(fs.readFileSync(path.resolve(__dirname, "..", "media-workbench", "package.json"), "utf8"));
    const runner = fs.readFileSync(path.resolve(__dirname, "..", "scripts", "verify.js"), "utf8");
    assert.ok(packageJson.scripts["build:renderer"].includes("--prefix media-workbench run lint"));
    assert.equal(packageJson.scripts["build:renderer"].includes("build.cmd"), false);
    assert.equal(rendererPackage.scripts.build.includes("build.cmd"), false);
    assert.equal(packageJson.scripts.verify, "node scripts/verify.js");
    assert.ok(runner.includes("media-workbench") && runner.includes("verify-alpha-package.js") && runner.includes("process.env.ComSpec"));
  });
});
