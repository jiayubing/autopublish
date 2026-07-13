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
    refreshResources: function(opts) { return ipcRenderer.invoke("media:refresh-resources", opts || {}); },
    getResourcePage: function(opts) { return ipcRenderer.invoke("media:get-resource-page", opts || {}); },
    searchResourcePage: function(opts) { return ipcRenderer.invoke("media:search-resource-page", opts || {}); },
    getPool: function() { return ipcRenderer.invoke("media:get-pool"); },
    addToPool: function(resource) { return ipcRenderer.invoke("media:add-to-pool", resource); },
    removeFromPool: function(resourceId) { return ipcRenderer.invoke("media:remove-from-pool", resourceId); },
    getBalance: function() { return ipcRenderer.invoke("media:get-balance"); }
  },
  platforms: {
    getQueue: function() { return ipcRenderer.invoke("platforms:get-queue"); },
    buildSelectedPlan: function(input) { return ipcRenderer.invoke("platforms:build-selected-plan", input); },
    submitSelectedPlan: function(plan) { return ipcRenderer.invoke("platforms:submit-selected-plan", plan); },
    pauseSubmit: function() { return ipcRenderer.invoke("platforms:pause-submit"); },
    stopSubmit: function() { return ipcRenderer.invoke("platforms:stop-submit"); },
    getState: function() { return ipcRenderer.invoke("platforms:get-state"); },
    onState: function(listener) {
      var handler = function(event, payload) { listener(payload); };
      ipcRenderer.on("platform-state", handler);
      return function() { ipcRenderer.removeListener("platform-state", handler); };
    }
  },
  content: {
    listClients: function() { return ipcRenderer.invoke("content:list-clients"); },
    getClient: function(clientId) { return ipcRenderer.invoke("content:get-client", clientId); },
    listResearch: function(clientId) { return ipcRenderer.invoke("content:list-research", clientId); },
    getResearch: function(input) { return ipcRenderer.invoke("content:get-research", input); },
    listTemplates: function(platform) { return ipcRenderer.invoke("content:list-templates", platform); },
    generateArticle: function(input) { return ipcRenderer.invoke("content:generate-article", input); },
    saveArticle: function(article) { return ipcRenderer.invoke("content:save-article", article); },
    listGeneratedArticles: function(clientId) { return ipcRenderer.invoke("content:list-generated-articles", clientId); },
    getGeneratedArticle: function(input) { return ipcRenderer.invoke("content:get-generated-article", input); },
    previewExport: function(input) { return ipcRenderer.invoke("content:preview-export", input); },
    exportArticle: function(input) { return ipcRenderer.invoke("content:export-article", input); },
    listQuestions: function(clientId) { return ipcRenderer.invoke("content:list-questions", { clientId: clientId }); },
    createQuestion: function(input) { return ipcRenderer.invoke("content:create-question", input); },
    updateQuestion: function(input) { return ipcRenderer.invoke("content:update-question", input); },
    deleteQuestion: function(input) { return ipcRenderer.invoke("content:delete-question", input); },
    getDoubaoLoginState: function() { return ipcRenderer.invoke("content:get-doubao-login-state"); },
    openDoubaoLogin: function() { return ipcRenderer.invoke("content:open-doubao-login"); },
    collectDoubaoOne: function(input) { return ipcRenderer.invoke("content:collect-doubao-one", input); },
    startDoubaoBatch: function(tasks) { return ipcRenderer.invoke("content:start-doubao-batch", { tasks: tasks }); },
    pauseDoubaoBatch: function() { return ipcRenderer.invoke("content:pause-doubao-batch"); },
    resumeDoubaoBatch: function() { return ipcRenderer.invoke("content:resume-doubao-batch"); },
    stopDoubaoBatch: function() { return ipcRenderer.invoke("content:stop-doubao-batch"); },
    retryFailedDoubao: function() { return ipcRenderer.invoke("content:retry-failed-doubao"); },
    getDoubaoQueueState: function() { return ipcRenderer.invoke("content:get-doubao-queue-state"); },
    saveManualResearch: function(input) { return ipcRenderer.invoke("content:save-manual-research", input); },
    onDoubaoQueueState: function(listener) {
      const handler = function(event, payload) { listener(payload); };
      ipcRenderer.on("content:doubao-queue-state", handler);
      return function() { ipcRenderer.removeListener("content:doubao-queue-state", handler); };
    }
  },
  orders: {
    getOrders: function() { return ipcRenderer.invoke("media:get-orders"); },
    syncOrder: function(orderNid) { return ipcRenderer.invoke("media:sync-order", orderNid); }
  }
};

contextBridge.exposeInMainWorld("desktopConsole", api);
