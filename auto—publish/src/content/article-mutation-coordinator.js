"use strict";

const {
  canonicalArticleRefKey,
  normalizeArticleRef,
} = require("./article-ref");
const {
  createArticleMutationKernel,
} = require("./internal/article-mutation-kernel");
const {
  createArticleMutationPublication,
} = require("./internal/article-mutation-publication");
const {
  createArticleMutationAdmission,
} = require("./internal/article-mutation-admission");
const {
  createArticleMutationRemoval,
} = require("./internal/article-mutation-removal");

function createArticleMutationCoordinator(options) {
  const kernel = createArticleMutationKernel(options);
  const publication = createArticleMutationPublication(kernel);
  const admission = createArticleMutationAdmission(kernel);
  const removal = createArticleMutationRemoval(kernel);

  return Object.freeze({
    canonicalArticleRefKey,
    readArticleForEdit: publication.readArticleForEdit,
    readArticleForRemoval: publication.readArticleForRemoval,
    readArticleForPublication: publication.readArticleForPublication,
    createArticle: publication.createArticle,
    saveExistingArticle: publication.saveExistingArticle,
    resolveTrustedArticleRef: publication.resolveTrustedArticleRef,
    reservePublicationTarget: publication.reservePublicationTarget,
    commitPublicationOutcome: publication.commitPublicationOutcome,
    markRecoveryUncertain: publication.markRecoveryUncertain,
    admitRegularQueueItems: admission.admitRegularQueueItems,
    admitPaidBatch: admission.admitPaidBatch,
    removePendingQueueItems: admission.removePendingQueueItems,
    executeArticleRemovalTransaction: removal.executeArticleRemovalTransaction,
    assertTrashedArticleMutationAllowed:
      removal.assertTrashedArticleMutationAllowed,
    restoreArticles: removal.restoreArticles,
    permanentlyDeleteArticles: removal.permanentlyDeleteArticles,
    restoreTrashedArticle: removal.restoreTrashedArticle,
    permanentlyDeleteTrashedArticle: removal.permanentlyDeleteTrashedArticle,
    supportsArticleRemovalTransaction:
      removal.supportsArticleRemovalTransaction,
  });
}

module.exports = {
  createArticleMutationCoordinator,
  canonicalArticleRefKey,
  normalizeArticleRef,
};
