const { createContentSubmissionService } = require("../services/content-submission-service");
const { wrap } = require("../services/ipc-response");
function registerContentSubmissionIpc(deps) {
  const service = deps.contentSubmissionService || createContentSubmissionService({ workspaceRoot: deps.rootDir });
  function checked(input) { if (!input || input.confirmed !== true || Object.keys(input).some(function(key) { return ["clientId", "generatedArticleId", "targetPlatform", "confirmed"].indexOf(key) === -1; })) { const e = new Error("Manual confirmation is required"); e.code = "CONTENT_EXPORT_CONFIRMATION_REQUIRED"; throw e; } return input; }
  deps.ipcMain.handle("content:preview-export", function(event, input) { return wrap(function() { return service.previewExport(checked(input)); }); });
  deps.ipcMain.handle("content:export-article", function(event, input) { return wrap(function() { return service.exportArticle(checked(input)); }); });
}
module.exports = { registerContentSubmissionIpc };
