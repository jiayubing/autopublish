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
});