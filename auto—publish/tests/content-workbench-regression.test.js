const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

function read(file) {
  return fs.readFileSync(path.resolve(__dirname, "..", file), "utf8");
}

describe("content workbench regression", function() {
  it("exposes the content IPC API to the React renderer", function() {
    const preload = read("desktop/preload.js");
    const api = read("media-workbench/src/electron-api.ts");
    [
      'ipcRenderer.invoke("content:list-clients")',
      'ipcRenderer.invoke("content:generate-article", input)',
      'ipcRenderer.invoke("content:save-article", article)',
      "export async function listContentClients",
      "export async function generateContentArticle",
      "export async function saveContentArticle"
    ].forEach(function(value) { assert.equal((preload + api).includes(value), true, "missing " + value); });
  });

  it("keeps the AI content workspace reachable from navigation", function() {
    const app = read("media-workbench/src/App.tsx");
    const sidebar = read("media-workbench/src/components/Sidebar.tsx");
    const workbench = read("media-workbench/src/components/ContentWorkbench.tsx");
    assert.equal(app.includes("ContentWorkbench"), true);
    assert.equal(app.includes("currentView === 'content'"), true);
    assert.equal(sidebar.includes("id: 'content' as ViewMode"), true);
    assert.equal(workbench.includes("listContentResearch"), true);
    assert.equal(workbench.includes("generateContentArticle"), true);
    assert.equal(workbench.includes("saveContentArticle"), true);
  });

  it("keeps existing renderer IPC errors readable after structured responses", function() {
    const api = read("media-workbench/src/electron-api.ts");
    assert.equal(api.includes("function getIpcError"), true);
    assert.equal(api.includes("new Error(result.error ||"), false);
  });
});
