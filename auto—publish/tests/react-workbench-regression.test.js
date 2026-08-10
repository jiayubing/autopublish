const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { describe, it } = require("node:test");

const MW = path.resolve(__dirname, "..", "media-workbench", "src");
const readApp = (file) => fs.readFileSync(path.join(MW, file), "utf8");

describe("react workbench regression", function () {
  it("gates renderer localStorage fixtures behind an explicit development flag", function () {
    const source = readApp("bridge/media.ts");
    assert.equal(source.includes("localStorage"), false);
    assert.equal(source.includes("VITE_ENABLE_FIXTURES"), false);
  });

  it("keeps renderer APIs free of mock article persistence", function () {
    const api = readApp("bridge/platform.ts");
    const sharedApi = readApp("bridge/transport.ts");
    const app = readApp("App.tsx");
    assert.equal(sharedApi.includes("mockData"), false);
    assert.equal(sharedApi.includes("INITIAL_ARTICLES"), false);
    assert.equal(app.includes("handleAddNewMockArticle"), false);
    assert.equal(app.includes("persistArticles"), false);
    assert.equal(app.includes("INITIAL_ARTICLES"), false);
    assert.ok(api.includes("getPlatformQueue"));
    assert.equal(api.includes("submitPlatformSelection"), false);
  });

  it("exposes platform commands through preload", function () {
    const preload = fs.readFileSync(
      path.resolve(__dirname, "..", "desktop", "preload.js"),
      "utf8",
    );
    assert.ok(preload.includes("platforms:") && preload.includes("getQueue"));
    assert.ok(
      preload.includes("platforms:open-login") &&
        preload.includes("platforms:check-login"),
    );
  });

  it("shares the structured IPC response envelope", function () {
    const types = readApp("types/ipc.ts");
    const api = readApp("bridge/content.ts");
    assert.ok(
      types.includes("interface IpcError") && types.includes("IpcResponse<T>"),
    );
    assert.ok(api.includes("IpcResponse<"));
  });

  it("keeps the public platform status contract free of retired pause state", function () {
    const types = readApp("types/platform.ts");
    const api = readApp("bridge/platform.ts");
    assert.ok(
      types.includes("interface PlatformStatus") &&
        types.includes("isBatchRunning: boolean") &&
        types.includes("isStopPending: boolean") &&
        types.includes("isPlatformRunning: boolean"),
    );
    assert.equal(types.includes("isPlatformPaused"), false);
    assert.equal(api.includes("isPlatformPaused"), false);
  });
});
