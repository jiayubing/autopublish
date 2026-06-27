const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

function read(file) {
  return fs.readFileSync(path.resolve(__dirname, "..", "auto—publish", file), "utf-8");
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

  it("routes media resource handlers through the resource service", function() {
    const source = read("desktop/ipc/media-ipc.js");

    [
      'ipcMain.handle("media:refresh-resources"',
      'ipcMain.handle("media:get-resource-page"',
      'ipcMain.handle("media:search-resource-page"',
      'ipcMain.handle("media:get-pool"',
      'ipcMain.handle("media:add-to-pool"',
      'ipcMain.handle("media:remove-from-pool"',
      'ipcMain.handle("media:get-balance"'
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
      "require(\"fs\")",
      "MediaClient",
      "resolveApiKey",
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
});
