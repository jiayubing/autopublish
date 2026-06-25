const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktopConsole", {
  // --- Batch operations ---
  getState: function() {
    return ipcRenderer.invoke("desktop:get-state");
  },
  refreshQueue: function(options) {
    return ipcRenderer.invoke("desktop:refresh-queue", options || {});
  },
  startBatch: function(options) {
    return ipcRenderer.invoke("desktop:start-batch", options || {});
  },
  stopBatch: function() {
    return ipcRenderer.invoke("desktop:stop-batch");
  },
  onLog: function(listener) {
    var handler = function(event, payload) { listener(payload); };
    ipcRenderer.on("publish-log", handler);
    return function() { ipcRenderer.removeListener("publish-log", handler); };
  },
  onBatchState: function(listener) {
    var handler = function(event, payload) { listener(payload); };
    ipcRenderer.on("batch-state", handler);
    return function() { ipcRenderer.removeListener("batch-state", handler); };
  },
  onQueueUpdated: function(listener) {
    var handler = function(event, payload) { listener(payload); };
    ipcRenderer.on("queue-updated", handler);
    return function() { ipcRenderer.removeListener("queue-updated", handler); };
  },

  // --- Media resource library ---
  listResources: function(opts) {
    return ipcRenderer.invoke("media:list-resources", opts || {});
  },
  getCachedResources: function() {
    return ipcRenderer.invoke("media:get-cached-resources");
  },
  searchResources: function(keyword) {
    return ipcRenderer.invoke("media:search-resources", keyword);
  },
  filterResourcesByPrice: function(minPrice, maxPrice) {
    return ipcRenderer.invoke("media:filter-resources-by-price", minPrice, maxPrice);
  },
  getPool: function() {
    return ipcRenderer.invoke("media:get-pool");
  },
  addToPool: function(resource) {
    return ipcRenderer.invoke("media:add-to-pool", resource);
  },
  removeFromPool: function(resourceId) {
    return ipcRenderer.invoke("media:remove-from-pool", resourceId);
  },
  poolContains: function(resourceId) {
    return ipcRenderer.invoke("media:pool-contains", resourceId);
  },
  getBalance: function() {
    return ipcRenderer.invoke("media:get-balance");
  },

  // --- Media drafts ---
  getDrafts: function() {
    return ipcRenderer.invoke("media:get-drafts");
  },
  getDraft: function(filename) {
    return ipcRenderer.invoke("media:get-draft", filename);
  },
  setDraft: function(filename, draft) {
    return ipcRenderer.invoke("media:set-draft", filename, draft);
  },
  removeDraft: function(filename) {
    return ipcRenderer.invoke("media:remove-draft", filename);
  },
  setBulkResource: function(filenames, resourceId, resourceName) {
    return ipcRenderer.invoke("media:set-bulk-resource", filenames, resourceId, resourceName);
  },
  scanMediaArticles: function() {
    return ipcRenderer.invoke("media:scan-articles");
  },

  // --- Preflight ---
  runPreflight: function(articles, dryRun) {
    return ipcRenderer.invoke("media:preflight", articles, dryRun);
  },

  // --- Orders ---
  getOrders: function() {
    return ipcRenderer.invoke("media:get-orders");
  },
  syncOrder: function(orderNid) {
    return ipcRenderer.invoke("media:sync-order", orderNid);
  }
});
