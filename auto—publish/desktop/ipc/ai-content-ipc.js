const { wrap } = require("../services/ipc-response");

function contentInputError(message) {
  const error = new Error(message);
  error.code = "CONTENT_INPUT_INVALID";
  return error;
}

function generationInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw contentInputError("Generation input must be an object");
  }
  return Object.assign({}, input);
}

function registerAiContentIpc(deps) {
  const ipcMain = deps.ipcMain;
  const service = deps.aiContentService;
  if (!ipcMain || !service) throw new Error("AI content IPC requires the workspace content service");

  ipcMain.handle("content:list-clients", function() { return wrap(function() { return service.listClients(); }); });
  ipcMain.handle("content:get-client", function(event, clientId) { return wrap(function() { return service.getClient(clientId); }); });
  ipcMain.handle("content:list-research", function(event, clientId) { return wrap(function() { return service.listResearch(clientId); }); });
  ipcMain.handle("content:get-research", function(event, input) {
    return wrap(function() { return service.getResearch(input && input.clientId, input && input.researchId); });
  });
  ipcMain.handle("content:list-templates", function(event, platform) { return wrap(function() { return service.listTemplates(platform); }); });
  ipcMain.handle("content:list-template-catalog", function() { return wrap(function() { return service.listTemplateCatalog(); }); });
  ipcMain.handle("content:retry-material", function(event, input) {
    return wrap(function() { return service.retryMaterial(input && input.clientId, input && input.materialId); });
  });
  ipcMain.handle("content:generate-article", function(event, input) { return wrap(function() { return service.generateArticle(generationInput(input)); }); });
  ipcMain.handle("content:save-article", function(event, article) { return wrap(function() { return service.saveArticle(article); }); });
  ipcMain.handle("content:list-generated-articles", function(event, clientId) { return wrap(function() { return service.listGeneratedArticles(clientId); }); });
  ipcMain.handle("content:get-generated-article", function(event, input) {
    return wrap(function() { return service.getGeneratedArticle(input && input.clientId, input && input.articleId); });
  });
  ipcMain.handle("content:copy-article-version", function(event, input) {
    return wrap(function() { return service.copyArticleVersion(input); });
  });
  ipcMain.handle("content:review-articles", function(event, input) {
    return wrap(function() {
      const selections = Array.isArray(input) ? input : input && input.articles;
      return service.reviewArticles(selections);
    });
  });
  ipcMain.handle("content:list-article-trash", function(event, clientId) {
    return wrap(function() { return service.listTrashedArticles(clientId); });
  });
  ipcMain.handle("content:preview-trash-articles", function(event, input) {
    return wrap(function() { return service.previewTrashArticles(input); });
  });
  ipcMain.handle("content:preview-article-removal-impact", function(event, input) {
    return wrap(function() { return service.previewArticleRemovalImpact(input); });
  });
  ipcMain.handle("content:trash-articles", function(event, input) {
    return wrap(function() { return service.trashArticles(input); });
  });
  ipcMain.handle("content:restore-article", function(event, input) {
    return wrap(function() { return service.restoreArticle(input); });
  });
  ipcMain.handle("content:prepare-permanent-delete-article", function(event, input) {
    return wrap(function() { return service.preparePermanentDelete(input); });
  });
  ipcMain.handle("content:permanently-delete-article", function(event, input) {
    return wrap(function() { return service.permanentlyDeleteArticle(input); });
  });
  ipcMain.handle("content:recover-article-removals", function() {
    return wrap(function() { return service.recoverPendingArticleRemovals(); });
  });
  ipcMain.handle("content:get-article-removal-transaction", function(event, input) {
    return wrap(function() {
      if (!input || typeof input.transactionId !== "string" || !input.transactionId.trim()) throw contentInputError("Removal transaction id is required");
      return service.getArticleRemovalTransaction(input.transactionId);
    });
  });
  ipcMain.handle("content:list-article-removal-transactions", function() {
    return wrap(function() { return service.listArticleRemovalTransactions(); });
  });
  ipcMain.handle("content:retry-article-removal-transaction", function(event, input) {
    return wrap(function() {
      if (!input || typeof input.transactionId !== "string" || !input.transactionId.trim() || input.confirmed !== true) throw contentInputError("Removal transaction confirmation is required");
      return service.retryArticleRemovalTransaction(input);
    });
  });
}

module.exports = { registerAiContentIpc };
