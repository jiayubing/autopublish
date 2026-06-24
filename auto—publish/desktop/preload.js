const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktopConsole", {
  getState: function() {
    return ipcRenderer.invoke("desktop:get-state");
  },
  refreshQueue: function() {
    return ipcRenderer.invoke("desktop:refresh-queue");
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
  }
});
