const { wrap } = require("../services/ipc-response");
const { createArticleAttentionQuery } = require("../services/article-attention-query");
const { createArticleAttentionResolver } = require("../services/article-attention-resolver");
const { createPublicationLedger } = require("../../src/publication/publication-ledger");

function registerArticleAttentionIpc(deps) {
  const options = deps || {};
  const publicationLedger = options.publicationLedger || createPublicationLedger({ workspaceRoot: options.rootDir, paths: options.paths });
  const query = options.articleAttentionQuery || createArticleAttentionQuery({
    contentSubmissionService: options.contentSubmissionService,
    articleRemovalService: options.aiContentService,
    publicationLedger: publicationLedger,
    getRevision: options.getWorkspaceDataRevision,
    readers: {
      listTransactions: options.aiContentService && options.aiContentService.listArticleRemovalTransactions,
      getArticle: options.aiContentService && options.aiContentService.getGeneratedArticle,
      platformCapabilities: options.contentSubmissionService && options.contentSubmissionService.listPlatforms,
      getTrashedArticle: function(clientId, articleId) {
        if (!options.aiContentService || typeof options.aiContentService.listTrashedArticles !== "function") return null;
        const record = options.aiContentService.listTrashedArticles(clientId).find(function(item) { return item && item.articleId === articleId; });
        return record || null;
      }
    }
  });
  const resolver = options.articleAttentionResolver || createArticleAttentionResolver({
    query,
    contentSubmissionService: options.contentSubmissionService,
    articleRemovalService: options.aiContentService,
    publicationLedger: publicationLedger,
    archiveService: options.archiveService,
    onDataInvalidated: options.invalidateData
  });

  options.ipcMain.handle("content:list-article-attention", function(event, input) { return wrap(function() { return query.list(input || {}); }); });
  options.ipcMain.handle("content:get-article-attention", function(event, input) { return wrap(function() { return query.get(input || {}); }); });
  options.ipcMain.handle("content:preview-article-attention", function(event, input) { return wrap(function() { return resolver.preview(input || {}); }); });
  options.ipcMain.handle("content:resolve-article-attention", function(event, input) { return wrap(function() { return resolver.resolve(input || {}); }); });

  return { query, resolver };
}

module.exports = { registerArticleAttentionIpc };
