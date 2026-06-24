const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktopConsole", {
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
    var handler = function(event, payload) {
      listener(payload);
    };
    ipcRenderer.on("publish-log", handler);
    return function() {
      ipcRenderer.removeListener("publish-log", handler);
    };
  },
  onBatchState: function(listener) {
    var handler = function(event, payload) {
      listener(payload);
    };
    ipcRenderer.on("batch-state", handler);
    return function() {
      ipcRenderer.removeListener("batch-state", handler);
    };
  },
  onQueueUpdated: function(listener) {
    var handler = function(event, payload) {
      listener(payload);
    };
    ipcRenderer.on("queue-updated", handler);
    return function() {
      ipcRenderer.removeListener("queue-updated", handler);
    };

  // Media submission APIs
  listResources: function() {
    return ipcRenderer.invoke("media:list-resources");
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
  }
});
