"use strict";
const { geoKnowledgeContracts } = require("./contracts/geo-knowledge-contracts");
function registerGeoKnowledgeIpc({ ipcMain, geoKnowledgeService }) {
  for (const { channel } of geoKnowledgeContracts) {
    const method = channel.slice("geo-knowledge:".length);
    ipcMain.handle(channel, (_event, input) => geoKnowledgeService[method](input));
  }
}
module.exports = { registerGeoKnowledgeIpc };
