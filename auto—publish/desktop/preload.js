const { contextBridge, ipcRenderer } = require("electron");

const api = {
  batch: {
    getState: function() { return ipcRenderer.invoke("desktop:get-state"); },
    refreshQueue: function(options) { return ipcRenderer.invoke("desktop:refresh-queue", options || {}); },
    startBatch: function(options) { return ipcRenderer.invoke("desktop:start-batch", options || {}); },
    stopBatch: function() { return ipcRenderer.invoke("desktop:stop-batch"); },
    onLog: function(listener) {
      var handler = function(event, payload) { listener(payload); };
      ipcRenderer.on("publish-log", handler);
      return function() { ipcRenderer.removeListener("publish-log", handler); };
    },
    onState: function(listener) {
      var handler = function(event, payload) { listener(payload); };
      ipcRenderer.on("batch-state", handler);
      return function() { ipcRenderer.removeListener("batch-state", handler); };
    },
    onQueueUpdated: function(listener) {
      var handler = function(event, payload) { listener(payload); };
      ipcRenderer.on("queue-updated", handler);
      return function() { ipcRenderer.removeListener("queue-updated", handler); };
    }
  },
  media: {
    scanArticles: function() { return ipcRenderer.invoke("media:scan-articles"); },
    previewArticle: function(filename) { return ipcRenderer.invoke("media:preview-article", filename); },
    getDrafts: function() { return ipcRenderer.invoke("media:get-drafts"); },
    getDraft: function(filename) { return ipcRenderer.invoke("media:get-draft", filename); },
    setDraft: function(filename, draft) { return ipcRenderer.invoke("media:set-draft", filename, draft); },
    removeDraft: function(filename) { return ipcRenderer.invoke("media:remove-draft", filename); },
    buildConfirmation: function(articles) { return ipcRenderer.invoke("media:build-confirmation", articles); },
    submitSelected: function(articles) { return ipcRenderer.invoke("media:submit-selected", articles); },
    stopSubmit: function() { return ipcRenderer.invoke("media:stop-submit"); },
    listResources: function(opts) { return ipcRenderer.invoke("media:list-resources", opts || {}); },
    getCachedResources: function() { return ipcRenderer.invoke("media:get-cached-resources"); },
    searchResources: function(keyword) { return ipcRenderer.invoke("media:search-resources", keyword); },
    getPool: function() { return ipcRenderer.invoke("media:get-pool"); },
    addToPool: function(resource) { return ipcRenderer.invoke("media:add-to-pool", resource); },
    removeFromPool: function(resourceId) { return ipcRenderer.invoke("media:remove-from-pool", resourceId); },
    getBalance: function() { return ipcRenderer.invoke("media:get-balance"); }
  },
  platforms: {
    getQueue: function() { return ipcRenderer.invoke("platforms:get-queue"); },
    buildSelectedPlan: function(input) { return ipcRenderer.invoke("platforms:build-selected-plan", input); },
    submitSelectedPlan: function(plan) { return ipcRenderer.invoke("platforms:submit-selected-plan", plan); }
  },
  orders: {
    getOrders: function() { return ipcRenderer.invoke("media:get-orders"); },
    syncOrder: function(orderNid) { return ipcRenderer.invoke("media:sync-order", orderNid); }
  }
};

// Temporary compatibility aliases for old renderer (remove in Task 9)
api.getState = api.batch.getState;
api.refreshQueue = api.batch.refreshQueue;
api.startBatch = api.batch.startBatch;
api.stopBatch = api.batch.stopBatch;
api.onLog = api.batch.onLog;
api.onBatchState = api.batch.onState;
api.onQueueUpdated = api.batch.onQueueUpdated;
api.listResources = api.media.listResources;
api.getCachedResources = api.media.getCachedResources;
api.searchResources = api.media.searchResources;
api.filterResourcesByPrice = function(minPrice, maxPrice) {
  return ipcRenderer.invoke("media:filter-resources-by-price", minPrice, maxPrice);
};
api.getPool = api.media.getPool;
api.addToPool = api.media.addToPool;
api.removeFromPool = api.media.removeFromPool;
api.poolContains = function(resourceId) {
  return ipcRenderer.invoke("media:pool-contains", resourceId);
};
api.getBalance = api.media.getBalance;
api.getDrafts = api.media.getDrafts;
api.getDraft = api.media.getDraft;
api.setDraft = api.media.setDraft;
api.removeDraft = api.media.removeDraft;
api.setBulkResource = function(filenames, resourceId, resourceName) {
  return ipcRenderer.invoke("media:set-bulk-resource", filenames, resourceId, resourceName);
};
api.scanMediaArticles = api.media.scanArticles;
api.previewArticle = api.media.previewArticle;
api.runPreflight = function(articles, dryRun) {
  return ipcRenderer.invoke("media:preflight", articles, dryRun);
};
api.getOrders = api.orders.getOrders;
api.syncOrder = api.orders.syncOrder;

contextBridge.exposeInMainWorld("desktopConsole", api);
