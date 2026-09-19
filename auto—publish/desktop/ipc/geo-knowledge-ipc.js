"use strict";
function registerGeoKnowledgeIpc({ ipcMain, geoKnowledgeService }) {
  for (const method of [
    "load",
    "state",
    "generate",
    "cancel",
    "edit",
    "exportMarkdown",
    "configStatus",
    "saveConfig",
    "linkQuestions",
    "questionDetails",
  ]) {
    ipcMain.handle("geo-knowledge:" + method, (_event, input) =>
      geoKnowledgeService[method](input),
    );
  }
}
module.exports = { registerGeoKnowledgeIpc };
