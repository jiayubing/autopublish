const crypto = require("node:crypto");

// Application-facing content seam. It exposes logical identities and closed
// cardinality results, never a path, journal, or directory ordering.
function clone(value) { return value === undefined ? value : JSON.parse(JSON.stringify(value)); }

function canonical(value) {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object") return "{" + Object.keys(value).sort().map(function(key) { return JSON.stringify(key) + ":" + canonical(value[key]); }).join(",") + "}";
  return JSON.stringify(value);
}

function snapshotArticle(article) {
  if (!article || typeof article !== "object" || Array.isArray(article)) throw new Error("CONTENT_ARTICLE_INVALID");
  return clone(article);
}

function fingerprintArticle(article) {
  return crypto.createHash("sha256").update(canonical(snapshotArticle(article)), "utf8").digest("hex");
}

function createContentStore(options) {
  const value = options || {};
  if (!value.articleStore || typeof value.articleStore.listArticles !== "function" || typeof value.listClientIds !== "function") throw new Error("CONTENT_STORE_INVALID");
  const articleStore = value.articleStore;

  function createIdentityIndex() {
    const byTask = new Map();
    const byArticle = new Map();
    value.listClientIds().forEach(function(clientId) {
      articleStore.listArticles(clientId).forEach(function(rawArticle) {
        const article = snapshotArticle(rawArticle);
        const articleMatches = byArticle.get(article.id) || [];
        articleMatches.push(article);
        byArticle.set(article.id, articleMatches);
        if (article.generationTaskId) {
          const matches = byTask.get(article.generationTaskId) || [];
          matches.push(article);
          byTask.set(article.generationTaskId, matches);
        }
      });
    });
    return {
      findByGenerationTaskId: function(id) { return resultFor(byTask.get(id) || []); },
      findByArticleId: function(id) { return resultFor(byArticle.get(id) || []); }
    };
  }

  function resultFor(matches) {
    if (!matches.length) return { kind: "none" };
    if (matches.length !== 1) return { kind: "many", matches: matches.map(function(article) { return { clientId: article.clientId, articleId: article.id }; }) };
    return { kind: "one", article: clone(matches[0]) };
  }

  function resolveIdentities(input) {
    const request = input || {};
    const index = createIdentityIndex();
    return {
      articleIds: (request.articleIds || []).map(function(id) { return { id: id, result: index.findByArticleId(id) }; }),
      generationTaskIds: (request.generationTaskIds || []).map(function(id) { return { id: id, result: index.findByGenerationTaskId(id) }; })
    };
  }

  function findByGenerationTaskId(id) { return createIdentityIndex().findByGenerationTaskId(id); }
  function findByArticleId(id) { return createIdentityIndex().findByArticleId(id); }
  const delegated = ["getArticle", "saveArticle", "listArticles", "reviewArticle", "moveArticleToTrash", "restoreTrashedArticle", "listTrashedArticles", "getTrashedTombstone", "permanentlyDeleteTrashedArticle", "isArticleTrashed", "isArticleRemoved"];
  const api = { snapshotArticle, fingerprintArticle, resolveIdentities, findByGenerationTaskId, findByArticleId, createGenerationTaskIndex: createIdentityIndex, supportsIdempotentRemovalOperation: articleStore.supportsIdempotentRemovalOperation === true };
  delegated.forEach(function(name) {
    if (typeof articleStore[name] === "function") api[name] = articleStore[name].bind(articleStore);
  });
  return api;
}

module.exports = { createContentStore, snapshotArticle, fingerprintArticle };
