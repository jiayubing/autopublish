const { wrap } = require("../services/ipc-response");
const {
  projectArticleRemovalTransaction,
  projectArticle,
  projectClient,
  projectImpactPreview,
  projectMaterial,
  projectPermanentDeleteConfirmation,
  projectPermanentDeleteResult,
  projectResearch,
  projectTemplate,
  projectTemplateCatalog,
  projectTrashCommitResult,
  projectTrashRecord,
} = require("./contracts/content-core-contracts");

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

  ipcMain.handle("content:list-clients", function() { return wrap(async function() { return { clients: (await service.listClients()).map(projectClient) }; }); });
  ipcMain.handle("content:list-research", function(event, clientId) { return wrap(function() { return { research: service.listResearch(clientId).map(projectResearch) }; }); });
  ipcMain.handle("content:list-template-catalog", function() { return wrap(function() { return projectTemplateCatalog(service.listTemplateCatalog()); }); });
  ipcMain.handle("content:retry-material", function(event, input) {
    return wrap(async function() { return { material: projectMaterial(await service.retryMaterial(input && input.clientId, input && input.materialId)) }; });
  });
  ipcMain.handle("content:generate-article", function(event, input) { return wrap(async function() { return { article: projectArticle(await service.generateArticle(generationInput(input))) }; }); });
  ipcMain.handle("content:save-article", function(event, article) { return wrap(function() { return { article: projectArticle(service.saveArticle(article)) }; }); });
  ipcMain.handle("content:copy-article-version", function(event, input) {
    return wrap(function() { return { article: projectArticle(service.copyArticleVersion(input)) }; });
  });
  ipcMain.handle("content:preview-article-removal-impact", function(event, input) {
    return wrap(function() { return projectImpactPreview(service.previewArticleRemovalImpact(input)); });
  });
  ipcMain.handle("content:trash-articles", function(event, input) {
    return wrap(function() { return projectTrashCommitResult(service.trashArticles(input)); });
  });
  ipcMain.handle("content:restore-article", function(event, input) {
    return wrap(function() {
      const result = service.restoreArticle(input);
      const article = result && result.article ? result.article : result;
      return { article: projectArticle(article), restored: result && result.restored !== undefined ? result.restored : true, queueRestored: result && result.queueRestored === true, message: result && result.message || "文章已恢复，投稿队列不会自动恢复" };
    });
  });
  ipcMain.handle("content:prepare-permanent-delete-article", function(event, input) {
    return wrap(function() { return projectPermanentDeleteConfirmation(service.preparePermanentDelete(input)); });
  });
  ipcMain.handle("content:permanently-delete-article", function(event, input) {
    return wrap(function() { return projectPermanentDeleteResult(service.permanentlyDeleteArticle(input)); });
  });
  ipcMain.handle("content:get-article-removal-transaction", function(event, input) {
    return wrap(function() {
      if (!input || typeof input.transactionId !== "string" || !input.transactionId.trim()) throw contentInputError("Removal transaction id is required");
      return { transaction: projectArticleRemovalTransaction(service.getArticleRemovalTransaction(input.transactionId)) };
    });
  });
  ipcMain.handle("content:retry-article-removal-transaction", function(event, input) {
    return wrap(function() {
      if (!input || typeof input.transactionId !== "string" || !input.transactionId.trim() || input.confirmed !== true) throw contentInputError("Removal transaction confirmation is required");
      return { transaction: projectArticleRemovalTransaction(service.retryArticleRemovalTransaction(input)) };
    });
  });
}

module.exports = { registerAiContentIpc };
