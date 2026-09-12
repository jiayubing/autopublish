const { wrap } = require("../services/ipc-response");
const { createArticleManagementSnapshot } = require("../services/article-management-snapshot");
const { createPublicationLinkService } = require("../services/publication-link-service");
const { createSubmissionTargetCatalog } = require("../services/submission-target-catalog");
const {
  createRegularSubmissionPermissionQuery,
} = require("../services/regular-submission-permission-query");
const { projectManagementSnapshot } = require("./contracts/article-management-contracts");
const {
  projectRegularSubmissionPermissions,
} = require("./contracts/regular-submission-permission-contracts");

function validateInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).some(function(key) { return !["clientId", "search"].includes(key); }) || typeof input.clientId !== "string" || !input.clientId.trim() || (input.search !== undefined && (typeof input.search !== "string" || input.search.length > 1000))) {
    const error = new Error("Article management client is invalid");
    error.code = "ARTICLE_MANAGEMENT_CLIENT_INVALID";
    throw error;
  }
  return { clientId: input.clientId.trim(), ...(input.search === undefined ? {} : { search: input.search }) };
}

function registerArticleManagementIpc(deps) {
  const values = deps || {};
  const snapshot = values.articleManagementSnapshot || createArticleManagementSnapshot({
    workspaceRoot: values.rootDir,
    workspaceIdentity: values.paths && (values.paths.contentLibrary || values.paths.workspaceRoot) || values.rootDir,
    getRevision: values.getWorkspaceDataRevision,
    getCacheRevision: values.getArticleReadRevision,
    aiContentService: values.aiContentService,
    listArticles: values.contentStore && values.contentStore.listArticleSummaries,
    searchArticleIds: values.contentStore && values.contentStore.searchArticleIds,
    submissionPlatformDirectory: values.submissionPlatformDirectory || createSubmissionTargetCatalog({
      directoryEntries: values.directoryEntries,
    }),
    operationalStore: values.operationalStore,
    publishedArchiveQueries: values.publishedArchiveQueries,
    articleAttentionQuery: values.articleAttentionQuery
  });
  let regularSubmissionPermissions = values.regularSubmissionPermissionQuery || null;
  function getRegularSubmissionPermissions() {
    if (!regularSubmissionPermissions) {
      regularSubmissionPermissions = createRegularSubmissionPermissionQuery({
        contentStore: values.contentStore,
        operationalStore: values.operationalStore,
        aiContentService: values.aiContentService,
        articleAttentionQuery: values.articleAttentionQuery,
        getRevision: values.getWorkspaceDataRevision,
      });
    }
    return regularSubmissionPermissions;
  }
  const publicationLinks = values.publicationLinkService || createPublicationLinkService({
    operationalStore: values.operationalStore,
    openExternal: values.openExternal,
  });
  values.ipcMain.handle("content:get-article-management-snapshot", function(event, input) {
    return wrap(async function() { return projectManagementSnapshot(await snapshot.get(validateInput(input))); });
  });
  values.ipcMain.handle("content:list-regular-submission-permissions", function(event, input) {
    return wrap(async function() {
      return projectRegularSubmissionPermissions(
        await getRegularSubmissionPermissions().list(input || {}),
      );
    });
  });
  values.ipcMain.handle("content:open-publication-url", function(event, input) {
    return wrap(async function() { return publicationLinks.openPublicationUrl(input || {}); });
  });
  return snapshot;
}

module.exports = { registerArticleManagementIpc, validateInput };
