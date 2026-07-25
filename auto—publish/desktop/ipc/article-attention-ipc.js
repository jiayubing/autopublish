const { wrap } = require("../services/ipc-response");

function registerArticleAttentionIpc(deps) {
  const options = deps || {};
  if (!options.articleAttentionQuery || !options.articleAttentionResolver) throw new Error("Article attention ports are required from composition");
  const query = options.articleAttentionQuery;
  const resolver = options.articleAttentionResolver;

  options.ipcMain.handle("content:list-article-attention", function(event, input) { return wrap(function() { return query.list(input || {}); }); });
  options.ipcMain.handle("content:get-article-attention", function(event, input) { return wrap(function() { return query.get(input || {}); }); });
  options.ipcMain.handle("content:preview-article-attention", function(event, input) { return wrap(function() { return resolver.preview(input || {}); }); });
  options.ipcMain.handle("content:resolve-article-attention", function(event, input) { return wrap(function() { return resolver.resolve(input || {}); }); });

  return { query, resolver };
}

module.exports = { registerArticleAttentionIpc };
