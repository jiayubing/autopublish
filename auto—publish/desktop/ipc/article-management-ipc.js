const { wrap } = require("../services/ipc-response");
const { createArticleManagementSnapshot } = require("../services/article-management-snapshot");

function validateInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).some(function(key) { return key !== "clientId"; }) || typeof input.clientId !== "string" || !input.clientId.trim()) {
    const error = new Error("Article management client is invalid");
    error.code = "ARTICLE_MANAGEMENT_CLIENT_INVALID";
    throw error;
  }
  return { clientId: input.clientId.trim() };
}

function registerArticleManagementIpc(deps) {
  const values = deps || {};
  const snapshot = values.articleManagementSnapshot || createArticleManagementSnapshot({
    workspaceRoot: values.rootDir,
    workspaceIdentity: values.paths && (values.paths.contentLibrary || values.paths.workspaceRoot) || values.rootDir,
    getRevision: values.getWorkspaceDataRevision,
    aiContentService: values.aiContentService,
    contentSubmissionService: values.contentSubmissionService,
    publicationLedger: values.publicationLedger,
    articleAttentionQuery: values.articleAttentionQuery
  });
  values.ipcMain.handle("content:get-article-management-snapshot", function(event, input) {
    return wrap(function() { return snapshot.get(validateInput(input)); });
  });
  return snapshot;
}

module.exports = { registerArticleManagementIpc, validateInput };
