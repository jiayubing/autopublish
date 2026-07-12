const { createAiContentService } = require("../services/ai-content-service");
const { wrap } = require("../services/ipc-response");

function registerAiContentIpc(deps) {
  const ipcMain = deps.ipcMain;
  const service = deps.aiContentService || createAiContentService({ workspaceRoot: deps.rootDir });

  ipcMain.handle("content:list-clients", function() { return wrap(function() { return service.listClients(); }); });
  ipcMain.handle("content:get-client", function(event, clientId) { return wrap(function() { return service.getClient(clientId); }); });
  ipcMain.handle("content:list-research", function(event, clientId) { return wrap(function() { return service.listResearch(clientId); }); });
  ipcMain.handle("content:get-research", function(event, input) {
    return wrap(function() { return service.getResearch(input && input.clientId, input && input.researchId); });
  });
  ipcMain.handle("content:list-templates", function(event, platform) { return wrap(function() { return service.listTemplates(platform); }); });
  ipcMain.handle("content:generate-article", function(event, input) { return wrap(function() { return service.generateArticle(input || {}); }); });
  ipcMain.handle("content:save-article", function(event, article) { return wrap(function() { return service.saveArticle(article); }); });
  ipcMain.handle("content:list-generated-articles", function(event, clientId) { return wrap(function() { return service.listGeneratedArticles(clientId); }); });
  ipcMain.handle("content:get-generated-article", function(event, input) {
    return wrap(function() { return service.getGeneratedArticle(input && input.clientId, input && input.articleId); });
  });
}

module.exports = { registerAiContentIpc };
