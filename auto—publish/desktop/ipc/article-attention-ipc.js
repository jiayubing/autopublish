const { wrap } = require("../services/ipc-response");
const {
  projectArticleAttentionItem,
  projectArticleAttentionList,
  projectArticleAttentionPreview,
  projectArticleAttentionResolution,
} = require("./contracts/content-core-contracts");

function registerArticleAttentionIpc(deps) {
  const options = deps || {};
  if (!options.articleAttentionQuery || !options.articleAttentionResolver) throw new Error("Article attention ports are required from composition");
  const query = options.articleAttentionQuery;
  const resolver = options.articleAttentionResolver;

  options.ipcMain.handle("content:list-article-attention", function(event, input) { return wrap(function() { return projectArticleAttentionList(query.list(input || {})); }); });
  options.ipcMain.handle("content:preview-article-attention", function(event, input) { return wrap(function() { return projectArticleAttentionPreview(resolver.preview(input || {})); }); });
  options.ipcMain.handle("content:resolve-article-attention", function(event, input) { return wrap(async function() { return projectArticleAttentionResolution(await resolver.resolve(input || {})); }); });

  return { query, resolver };
}

module.exports = { registerArticleAttentionIpc };
