const { createContentSubmissionService } = require("../services/content-submission-service");
const { wrap } = require("../services/ipc-response");
function registerContentSubmissionIpc(deps) {
  const service = deps.contentSubmissionService || createContentSubmissionService({ workspaceRoot: deps.rootDir });
  deps.ipcMain.handle("content:preview-export", function(event, input) { return wrap(function() { return service.previewExport(input); }); });
  deps.ipcMain.handle("content:export-article", function(event, input) { return wrap(function() { return service.exportArticle(input); }); });
}
module.exports = { registerContentSubmissionIpc };
