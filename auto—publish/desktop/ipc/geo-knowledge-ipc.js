"use strict";
function registerGeoKnowledgeIpc({ ipcMain, geoKnowledgeService }) {
  for (const method of [
    "load",
    "state",
    "generate",
    "cancel",
    "edit",
    "editDeliverable",
    "acceptDeliverable",
    "confirmSourceType",
    "resolveConflict",
    "promptSettings",
    "saveGlobalPrompt",
    "saveFinalKnowledgePrompt",
    "saveClientPrompt",
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
