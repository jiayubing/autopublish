"use strict";

const {
  projectArticleLifecycle,
} = require("../../src/content/article-lifecycle-projection");

function fail(code, message) {
  const error = new Error(message || code);
  error.code = code;
  return error;
}

function normalizeId(value) {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.length > 200 ||
    /[\\/\u0000-\u001F\u007F]/.test(value)
  )
    throw fail("REGULAR_SUBMISSION_PERMISSION_INPUT_INVALID");
  return value.trim();
}

function normalizeArticleIds(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 1000)
    throw fail("REGULAR_SUBMISSION_PERMISSION_INPUT_INVALID");
  const ids = [];
  const seen = new Set();
  value.forEach(function (articleId) {
    const normalized = normalizeId(articleId);
    if (seen.has(normalized)) return;
    seen.add(normalized);
    ids.push(normalized);
  });
  if (!ids.length) throw fail("REGULAR_SUBMISSION_PERMISSION_INPUT_INVALID");
  return ids;
}

function createRegularSubmissionPermissionQuery(options) {
  const opts = options || {};
  const contentStore = opts.contentStore;
  const operationalStore = opts.operationalStore;
  if (!contentStore || typeof contentStore.getArticle !== "function")
    throw fail("IPC_INTERNAL");
  if (
    !operationalStore ||
    typeof operationalStore.listArticleLifecycleFacts !== "function"
  )
    throw fail("IPC_INTERNAL");
  const getRevision =
    typeof opts.getRevision === "function"
      ? opts.getRevision
      : function () {
          return 0;
        };
  const attentionQuery = opts.articleAttentionQuery || null;
  const aiContentService = opts.aiContentService || null;

  async function read(input, retried) {
    const request = input || {};
    const clientId = normalizeId(request.clientId);
    const articleIds = normalizeArticleIds(request.articleIds);
    const revision = Number(getRevision()) || 0;
    const articles = [];
    const trash = [];
    const missing = new Set();

    for (const articleId of articleIds) {
      try {
        const article = await Promise.resolve(
          contentStore.getArticle(clientId, articleId),
        );
        articles.push(article);
      } catch (error) {
        if (!error || error.code !== "ARTICLE_NOT_FOUND") throw error;
        const isTrash =
          typeof contentStore.isArticleTrashed === "function" &&
          (await Promise.resolve(contentStore.isArticleTrashed(clientId, articleId)));
        if (isTrash) trash.push({ id: articleId, clientId });
        else missing.add(articleId);
      }
    }

    const facts =
      (await Promise.resolve(
        operationalStore.listArticleLifecycleFacts({ articleIds }),
      )) || {};
    const attentionResult =
      attentionQuery && typeof attentionQuery.list === "function"
        ? await Promise.resolve(attentionQuery.list({ clientId }))
        : { items: [] };
    const requestedIds = new Set(articleIds);
    const attentionItems = Array.isArray(attentionResult && attentionResult.items)
      ? attentionResult.items.filter(
          (item) => item && requestedIds.has(item.articleId),
        )
      : [];
    const removalTransactions =
      aiContentService &&
      typeof aiContentService.listArticleRemovalTransactions === "function"
        ? await Promise.resolve(aiContentService.listArticleRemovalTransactions())
        : [];

    const lifecycle = projectArticleLifecycle({
      articles,
      trash,
      submissionItems: Array.isArray(facts.submissionItems)
        ? facts.submissionItems
        : [],
      publications: Array.isArray(facts.publications) ? facts.publications : [],
      orders: Array.isArray(facts.orders) ? facts.orders : [],
      attentionItems,
      removalTransactions: Array.isArray(removalTransactions)
        ? removalTransactions.filter(
            (item) =>
              item &&
              requestedIds.has(item.articleId) &&
              (!item.clientId || item.clientId === clientId),
          )
        : [],
    });

    const finalRevision = Number(getRevision()) || 0;
    if (finalRevision !== revision) {
      if (retried) throw fail("REGULAR_SUBMISSION_PERMISSION_QUERY_STALE");
      return read(input, true);
    }

    return Object.freeze({
      clientId,
      revision,
      items: Object.freeze(
        articleIds.map(function (articleId) {
          const workflow = lifecycle.byArticle[articleId];
          const submit = workflow && workflow.operations && workflow.operations.submit;
          return Object.freeze({
            articleId,
            allowed: missing.has(articleId)
              ? false
              : Boolean(submit && submit.allowed === true),
            reasonCodes: Object.freeze(
              missing.has(articleId)
                ? ["ARTICLE_NOT_FOUND"]
                : Array.isArray(submit && submit.reasonCodes)
                  ? submit.reasonCodes.map(String)
                  : [],
            ),
          });
        }),
      ),
    });
  }

  return Object.freeze({ list: read });
}

module.exports = { createRegularSubmissionPermissionQuery };
