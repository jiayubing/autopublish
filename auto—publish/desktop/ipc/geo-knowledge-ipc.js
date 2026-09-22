"use strict";
function registerGeoKnowledgeIpc({ ipcMain, geoKnowledgeService }) {
  for (const method of [
    "load",
    "state",
    "generate",
    "cancel",
    "edit",
    "confirmSourceType",
    "resolveConflict",
    "promptSettings",
    "saveGlobalPrompt",
    "saveClientPrompt",
    "previewConfirmation",
    "exportMarkdown",
    "configStatus",
    "saveConfig",
    "testConnection",
    "linkQuestions",
    "questionDetails",
    "questionArticles",
    "questionWorkflow",
  ]) {
    ipcMain.handle("geo-knowledge:" + method, (_event, input) =>
      geoKnowledgeService[method](input),
    );
  }
}
module.exports = { registerGeoKnowledgeIpc };
