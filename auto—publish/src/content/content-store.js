const crypto = require("node:crypto");
const { clone, canonical } = require("./content-identity");
const { createContentIdentityIndex } = require("./content-identity-index");

// Application-facing content seam. It exposes logical identities and closed
// cardinality results, never a path, journal, or directory ordering.
function snapshotArticle(article) {
  if (!article || typeof article !== "object" || Array.isArray(article)) throw new Error("CONTENT_ARTICLE_INVALID");
  return clone(article);
}

function fingerprintArticle(article) {
  return crypto.createHash("sha256").update(canonical(snapshotArticle(article)), "utf8").digest("hex");
}

function closedCardinalityResult(matches) {
  if (!matches.length) return { kind: "none" };
  if (matches.length !== 1) {
    return {
      kind: "many",
      matches: matches.map(function (article) { return { clientId: article.clientId, articleId: article.id }; }),
    };
  }
  return { kind: "one", article: snapshotArticle(matches[0]) };
}

function createContentStore(options) {
  const value = options || {};
  if (!value.articleStore || typeof value.articleStore.listArticles !== "function" || typeof value.listClientIds !== "function") throw new Error("CONTENT_STORE_INVALID");
  const articleStore = value.articleStore;

  function createIdentityIndex() {
    return createContentIdentityIndex({
      listClientIds: value.listClientIds,
      listArticles: function (clientId) { return articleStore.listArticles(clientId); },
      snapshot: snapshotArticle,
      resultFor: closedCardinalityResult,
    });
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
