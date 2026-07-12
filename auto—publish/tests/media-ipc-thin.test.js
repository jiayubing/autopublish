const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

function read(file) {
  return fs.readFileSync(path.resolve(__dirname, "..", file), "utf-8");
}

describe("media ipc boundary", function() {
  it("exposes the new resource preload api surface", function() {
    const source = read("desktop/preload.js");

    [
      'refreshResources: function(opts) { return ipcRenderer.invoke("media:refresh-resources", opts || {}); }',
      'getResourcePage: function(opts) { return ipcRenderer.invoke("media:get-resource-page", opts || {}); }',
      'searchResourcePage: function(opts) { return ipcRenderer.invoke("media:search-resource-page", opts || {}); }'
    ].forEach(function(snippet) {
      assert.ok(source.includes(snippet), "missing preload snippet: " + snippet);
    });
  });

  it("delegates scan and preview workbench calls to the service", function() {
    const source = read("desktop/ipc/media-ipc.js");

    [
      'ipcMain.handle("media:scan-articles"',
      'ipcMain.handle("media:preview-article"',
      "mediaWorkbenchService.scanArticles()",
      "mediaWorkbenchService.previewArticle(filename)"
    ].forEach(function(snippet) {
      assert.ok(source.includes(snippet), "missing workbench delegation: " + snippet);
    });

    [
      "mammoth.extractRawText",
      "detectDocxImages",
      "fs.readdirSync",
      "fs.readFileSync"
    ].forEach(function(snippet) {
      assert.equal(source.includes(snippet), false, "heavy preview logic still present in IPC: " + snippet);
    });
  });

  it("routes media resource handlers through the resource service", function() {
    const source = read("desktop/ipc/media-ipc.js");

    [
      'ipcMain.handle("media:refresh-resources"',
      'ipcMain.handle("media:get-resource-page"',
      'ipcMain.handle("media:search-resource-page"',
      'ipcMain.handle("media:get-pool"',
      'ipcMain.handle("media:add-to-pool"',
      'ipcMain.handle("media:remove-from-pool"',
      'ipcMain.handle("media:get-balance"',
      "apiKey: resolveApiKey(null)"
    ].forEach(function(snippet) {
      assert.ok(source.includes(snippet), "missing handler: " + snippet);
    });

    [
      "createMediaResourceService",
      "mediaResourceService.refreshResources",
      "mediaResourceService.getCachedResourcePage",
      "mediaResourceService.searchResourcePage",
      "mediaResourceService.getPool",
      "mediaResourceService.addToPool",
      "mediaResourceService.removeFromPool",
      "mediaResourceService.getBalance"
    ].forEach(function(snippet) {
      assert.ok(source.includes(snippet), "missing service delegation: " + snippet);
    });

    [
      'require("fs")',
      "MediaClient",
      "detectDocxImages",
      "fs.readdirSync",
      "fs.readFileSync",
      "media:list-resources",
      "media:get-cached-resources",
      "media:search-resources"
    ].forEach(function(snippet) {
      assert.equal(source.includes(snippet), false, "heavy media concern still present: " + snippet);
    });
  });

  it("wraps draft store failures in the shared IPC error envelope", async function() {
    const { registerMediaIpc } = require("../desktop/ipc/media-ipc");
    const { MediaDraftStore } = require("../src/platforms/media/media-draft-store");
    const handlers = new Map();
    const originalGetAll = MediaDraftStore.prototype.getAll;
    const error = new Error("draft store unavailable");
    error.code = "DRAFT_STORE_UNAVAILABLE";

    MediaDraftStore.prototype.getAll = function() { throw error; };
    try {
      registerMediaIpc({
        ipcMain: { handle: function(channel, handler) { handlers.set(channel, handler); } },
        rootDir: path.resolve(__dirname, "..")
      });
      assert.deepStrictEqual(await handlers.get("media:get-drafts")(), {
        ok: false,
        error: { code: "DRAFT_STORE_UNAVAILABLE", message: "draft store unavailable" }
      });
    } finally {
      MediaDraftStore.prototype.getAll = originalGetAll;
    }
  });
});
