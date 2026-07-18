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
    readers: { listArchiveFailures: options.archiveIssueReader }
  });
  const resolver = options.articleAttentionResolver || createArticleAttentionResolver({
    query,
    contentSubmissionService: options.contentSubmissionService,
    articleRemovalService: options.aiContentService,
    publicationLedger: publicationLedger,
    onDataInvalidated: options.invalidateData
  });

  options.ipcMain.handle("content:list-article-attention", function(event, input) { return wrap(function() { return query.list(input || {}); }); });
  options.ipcMain.handle("content:get-article-attention", function(event, input) { return wrap(function() { return query.get(input || {}); }); });
  options.ipcMain.handle("content:preview-article-attention", function(event, input) { return wrap(function() { return resolver.preview(input || {}); }); });
  options.ipcMain.handle("content:resolve-article-attention", function(event, input) { return wrap(function() { return resolver.resolve(input || {}); }); });

  return { query, resolver };
}

module.exports = { registerArticleAttentionIpc };
