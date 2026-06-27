const path = require("path");
const { MediaResourceStore } = require("../../src/platforms/media/media-resource-store");
const { MediaPoolStore } = require("../../src/platforms/media/media-pool-store");
const { MediaDraftStore } = require("../../src/platforms/media/media-draft-store");
const { createMediaOrderService } = require("../services/media-order-service");
const { createMediaWorkbenchService } = require("../services/media-workbench-service");
const { createMediaResourceService } = require("../services/media-resource-service");
const { wrap } = require("../services/ipc-response");

function registerMediaIpc(deps) {
  var ipcMain = deps.ipcMain;
  var mediaResourceStore = new MediaResourceStore();
  var mediaPoolStore = new MediaPoolStore();
  var mediaDraftStore = new MediaDraftStore();
  var mediaResourceService = createMediaResourceService({
    resourceStore: mediaResourceStore,
    poolStore: mediaPoolStore
  });
  var mediaOrderService = createMediaOrderService({});
  var mediaWorkbenchService = createMediaWorkbenchService({
    inputDir: path.resolve(__dirname, "..", "..", "input", "media"),
    draftStore: mediaDraftStore
  });

  ipcMain.handle("media:refresh-resources", function(event, opts) {
    return wrap(function() {
      return mediaResourceService.refreshResources(opts || {});
    });
  });

  ipcMain.handle("media:get-resource-page", function(event, opts) {
    return wrap(function() {
      return mediaResourceService.getCachedResourcePage(opts || {});
    });
  });

  ipcMain.handle("media:search-resource-page", function(event, opts) {
    return wrap(function() {
      return mediaResourceService.searchResourcePage(opts || {});
    });
  });

  ipcMain.handle("media:get-pool", function() {
    return wrap(function() {
      return mediaResourceService.getPool();
    });
  });

  ipcMain.handle("media:add-to-pool", function(event, resource) {
    return wrap(function() {
      return mediaResourceService.addToPool(resource);
    });
  });

  ipcMain.handle("media:remove-from-pool", function(event, resourceId) {
    return wrap(function() {
      return mediaResourceService.removeFromPool(resourceId);
    });
  });

  ipcMain.handle("media:get-balance", function() {
    return wrap(function() {
      return mediaResourceService.getBalance();
    });
  });

  ipcMain.handle("media:get-drafts", function() {
    return { ok: true, data: mediaDraftStore.getAll() };
  });

  ipcMain.handle("media:get-draft", function(event, filename) {
    var draft = mediaDraftStore.get(filename);
    return { ok: true, data: draft };
  });

  ipcMain.handle("media:set-draft", function(event, filename, draft) {
    mediaDraftStore.set(filename, draft);
    return { ok: true };
  });

  ipcMain.handle("media:remove-draft", function(event, filename) {
    mediaDraftStore.remove(filename);
    return { ok: true };
  });

  ipcMain.handle("media:scan-articles", function() {
    return wrap(function() {
      return mediaWorkbenchService.scanArticles();
    });
  });

  ipcMain.handle("media:preview-article", function(event, filename) {
    return wrap(function() {
      return mediaWorkbenchService.previewArticle(filename);
    });
  });

  ipcMain.handle("media:build-confirmation", function(event, articles) {
    return wrap(function() {
      return mediaWorkbenchService.buildConfirmationSummary(articles || []);
    });
  });

  ipcMain.handle("media:submit-selected", function(event, articles) {
    return wrap(function() {
      return mediaWorkbenchService.submitTasksSerially(articles || []);
    });
  });

  ipcMain.handle("media:stop-submit", function() {
    return wrap(function() {
      mediaWorkbenchService.requestStop();
      return { stopped: true };
    });
  });

  ipcMain.handle("media:get-orders", function() {
    return wrap(function() {
      return mediaOrderService.listOrderViews();
    });
  });

  ipcMain.handle("media:sync-order", function(event, orderNid) {
    return wrap(function() {
      return mediaOrderService.syncOrder(orderNid);
    });
  });
}

module.exports = { registerMediaIpc };
