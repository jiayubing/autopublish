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
  let identityIndex = null;

  function createIdentityIndex() {
    return createContentIdentityIndex({
      listClientIds: value.listClientIds,
      listArticles: function (clientId) { return articleStore.listArticles(clientId); },
      snapshot: snapshotArticle,
      resultFor: closedCardinalityResult,
    });
  }

  function getIdentityIndex() {
    if (!identityIndex) identityIndex = createIdentityIndex();
    return identityIndex;
  }

  function invalidateIdentityIndex() {
    identityIndex = null;
  }

  function resolveIdentities(input) {
    const request = input || {};
    const index = getIdentityIndex();
    return {
      articleIds: (request.articleIds || []).map(function(id) { return { id: id, result: index.findByArticleId(id) }; }),
      generationTaskIds: (request.generationTaskIds || []).map(function(id) { return { id: id, result: index.findByGenerationTaskId(id) }; })
    };
  }

  function findByGenerationTaskId(id) { return getIdentityIndex().findByGenerationTaskId(id); }
  function findByGenerationOperationId(id) { return getIdentityIndex().findByGenerationOperationId(id); }
  function findByArticleId(id) { return getIdentityIndex().findByArticleId(id); }

  const api = {
    snapshotArticle,
    fingerprintArticle,
    resolveIdentities,
    findByGenerationTaskId,
    findByGenerationOperationId,
    findByArticleId,
    createGenerationTaskIndex: createIdentityIndex,
    supportsIdempotentRemovalOperation: articleStore.supportsIdempotentRemovalOperation === true,
  };

  const readOnlyDelegated = ["getArticle", "listArticles", "listTrashedArticles", "getTrashedTombstone", "isArticleTrashed", "isArticleRemoved"];
  readOnlyDelegated.forEach(function(name) {
    if (typeof articleStore[name] === "function") api[name] = articleStore[name].bind(articleStore);
  });

  ["saveArticle", "createArticle"].forEach(function(name) {
    if (typeof articleStore[name] !== "function") return;
    api[name] = function() {
      const result = articleStore[name].apply(articleStore, arguments);
      if (identityIndex) identityIndex.upsert(result);
      return result;
    };
  });

  if (typeof articleStore.moveArticleToTrash === "function") {
    api.moveArticleToTrash = function(clientId, articleId) {
      const result = articleStore.moveArticleToTrash.apply(articleStore, arguments);
      if (identityIndex) identityIndex.remove(clientId, articleId);
      return result;
    };
  }

  ["restoreTrashedArticle", "permanentlyDeleteTrashedArticle"].forEach(function(name) {
    if (typeof articleStore[name] !== "function") return;
    api[name] = function() {
      const result = articleStore[name].apply(articleStore, arguments);
      invalidateIdentityIndex();
      return result;
    };
  });

  return api;
}

module.exports = { createContentStore, snapshotArticle, fingerprintArticle };