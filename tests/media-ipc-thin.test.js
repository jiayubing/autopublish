const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

function read(file) {
  return fs.readFileSync(path.resolve(__dirname, "..", file), "utf-8");
}

describe("media ipc boundary", function() {
  it("keeps media-ipc transport only", function() {
    const source = read("auto—publish/desktop/ipc/media-ipc.js");

    [
      'const { createMediaOrderService } = require("../services/media-order-service");',
      'const { createMediaWorkbenchService } = require("../services/media-workbench-service");',
      'const { createMediaResourceService } = require("../services/media-resource-service");',
      'const { wrap } = require("../services/ipc-response");'
    ].forEach(function(snippet) {
      assert.ok(source.includes(snippet), "missing service boundary import: " + snippet);
    });

    [
      "mammoth.extractRawText",
      "detectDocxImages",
      "fs.readdirSync",
      "fs.readFileSync",
      "MediaClient",
      "resolveApiKey",
      "normalizeResourceShape",
      "toOrderView"
    ].forEach(function(snippet) {
      assert.equal(source.includes(snippet), false, "IPC still owns logic: " + snippet);
    });

    [
      "mediaResourceService.refreshResources",
      "mediaResourceService.getCachedResourcePage",
      "mediaResourceService.searchResourcePage",
      "mediaResourceService.getPool",
      "mediaResourceService.addToPool",
      "mediaResourceService.removeFromPool",
      "mediaResourceService.getBalance",
      "mediaWorkbenchService.scanArticles",
      "mediaWorkbenchService.previewArticle",
      "mediaWorkbenchService.buildConfirmationSummary",
      "mediaWorkbenchService.submitTasksSerially",
      "mediaWorkbenchService.requestStop",
      "mediaOrderService.listOrderViews",
      "mediaOrderService.syncOrder"
    ].forEach(function(snippet) {
      assert.ok(source.includes(snippet), "missing delegation: " + snippet);
    });
  });
});
