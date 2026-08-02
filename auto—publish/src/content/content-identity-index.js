const { clone, articleIdentity } = require("./content-identity");

function createContentIdentityIndex(options) {
  const opts = options || {};
  if (
    typeof opts.listClientIds !== "function" ||
    typeof opts.listArticles !== "function"
  ) {
    throw new Error("CONTENT_IDENTITY_INDEX_INVALID");
  }
  const resultFor =
    typeof opts.resultFor === "function"
      ? opts.resultFor
      : function (matches) {
          if (!matches.length) return { kind: "none" };
          if (matches.length !== 1) {
            return {
              kind: "many",
              matches: matches.map(function (article) {
                return { clientId: article.clientId, articleId: article.id };
              }),
            };
          }
          return { kind: "one", article: clone(matches[0]) };
        };
  const byArticle = new Map();
  const byTask = new Map();
  opts.listClientIds().forEach(function (clientId) {
    opts.listArticles(clientId).forEach(function (rawArticle) {
      const article = opts.snapshot
        ? opts.snapshot(rawArticle)
        : clone(rawArticle);
      const identity = articleIdentity({
        clientId: article.clientId || clientId,
        articleId: article.id,
      });
      const articleMatches = byArticle.get(identity.articleId) || [];
      articleMatches.push(article);
      byArticle.set(identity.articleId, articleMatches);
      if (article.generationTaskId) {
        const taskMatches = byTask.get(article.generationTaskId) || [];
        taskMatches.push(article);
        byTask.set(article.generationTaskId, taskMatches);
      }
    });
  });

  return {
    findByArticleId: function (articleId) {
      return resultFor(byArticle.get(articleId) || []);
    },
    findByGenerationTaskId: function (generationTaskId) {
      return resultFor(byTask.get(generationTaskId) || []);
    },
    size: byArticle.size,
  };
}

module.exports = { createContentIdentityIndex };
