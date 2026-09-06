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
  const byOperation = new Map();

  function snapshot(rawArticle, fallbackClientId) {
    const article = opts.snapshot ? opts.snapshot(rawArticle) : clone(rawArticle);
    if (!article.clientId && fallbackClientId) article.clientId = fallbackClientId;
    return article;
  }

  function addTo(map, key, article) {
    if (!key) return;
    const matches = map.get(key) || [];
    matches.push(article);
    map.set(key, matches);
  }

  function removeFrom(map, key, clientId, articleId) {
    if (!key) return;
    const matches = (map.get(key) || []).filter(function (article) {
      return article.clientId !== clientId || article.id !== articleId;
    });
    if (matches.length) map.set(key, matches);
    else map.delete(key);
  }

  function add(rawArticle, fallbackClientId) {
    const article = snapshot(rawArticle, fallbackClientId);
    const identity = articleIdentity({ clientId: article.clientId, articleId: article.id });
    addTo(byArticle, identity.articleId, article);
    addTo(byTask, article.generationTaskId, article);
    addTo(byOperation, article.generationOperationId, article);
    return article;
  }

  function remove(clientId, articleId) {
    const matches = byArticle.get(articleId) || [];
    matches.filter(function (article) { return article.clientId === clientId; }).forEach(function (article) {
      removeFrom(byTask, article.generationTaskId, clientId, articleId);
      removeFrom(byOperation, article.generationOperationId, clientId, articleId);
    });
    removeFrom(byArticle, articleId, clientId, articleId);
  }

  function upsert(rawArticle) {
    const article = snapshot(rawArticle);
    const identity = articleIdentity({ clientId: article.clientId, articleId: article.id });
    remove(identity.clientId, identity.articleId);
    add(article);
  }

  opts.listClientIds().forEach(function (clientId) {
    opts.listArticles(clientId).forEach(function (rawArticle) {
      add(rawArticle, clientId);
    });
  });

  return {
    findByArticleId: function (articleId) {
      return resultFor(byArticle.get(articleId) || []);
    },
    findByGenerationTaskId: function (generationTaskId) {
      return resultFor(byTask.get(generationTaskId) || []);
    },
    findByGenerationOperationId: function (generationOperationId) {
      return resultFor(byOperation.get(generationOperationId) || []);
    },
    upsert: upsert,
    remove: remove,
    size: byArticle.size,
  };
}

module.exports = { createContentIdentityIndex };
