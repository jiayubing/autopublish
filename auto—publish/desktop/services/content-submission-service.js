const { createArticleStore } = require("../../src/content/article-store");
const { createSubmissionExportService } = require("../../src/content/submission-export-service");
function createContentSubmissionService(opts) {
  const options = opts || {}; const store = options.articleStore || createArticleStore(options.workspaceRoot);
  function input(value) { if (!value || value.confirmed !== true || !value.clientId) { const e = new Error("Manual confirmation is required"); e.code = "CONTENT_EXPORT_CONFIRMATION_REQUIRED"; throw e; } return value; }
  function exporterFor(value) { return options.exporter || createSubmissionExportService({ rootDir: options.workspaceRoot, getArticle: function(id) { return store.getArticle(value.clientId, id); } }); }
  return { previewExport: function(value) { value = input(value); return exporterFor(value).previewExport(value); }, exportArticle: function(value) { value = input(value); return exporterFor(value).exportArticle(value); } };
}
module.exports = { createContentSubmissionService };
