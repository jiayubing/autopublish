const { deriveAttentionPolicy } = require("./article-attention-policy");

function attentionError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function createArticleAttentionResolver(options) {
  const opts = options || {};
  if (!opts.query || typeof opts.query.get !== "function") throw attentionError("ARTICLE_ATTENTION_INVALID", "Attention query is required");
  const query = opts.query;
  const invalidate = typeof opts.onDataInvalidated === "function" ? opts.onDataInvalidated : function() {};
  const readPolicy = typeof query.getPolicy === "function" ? query.getPolicy.bind(query) : function(input) { return deriveAttentionPolicy(query.get(input || {}), {}); };

  function assertFresh(input) {
    const expected = Number(input && input.expectedRevision);
    if (!Number.isSafeInteger(expected) || expected !== query.getRevision()) throw attentionError("ARTICLE_ATTENTION_STALE", "需处理项已发生变化，请重新检查");
  }

  function find(input) {
    const item = query.get(input || {});
    if (!item) throw attentionError("ARTICLE_ATTENTION_NOT_FOUND", "需处理项不存在或已处理");
    const policy = readPolicy(input || {});
    if (!policy || policy.included !== true) throw attentionError("ARTICLE_ATTENTION_NOT_FOUND", "需处理项不存在或已处理");
    return { item, policy };
  }

  function assertAllowed(entry, action) {
    if (typeof action !== "string" || !entry.policy.allowedActions.includes(action)) {
      throw attentionError("ARTICLE_ATTENTION_ACTION_NOT_ALLOWED", "当前状态不允许此操作");
    }
  }

  function retryPreview(item) {
    const service = opts.contentSubmissionService;
    if (!service || typeof service.previewRetryFailedPublication !== "function") throw attentionError("ARTICLE_ATTENTION_DOMAIN_UNAVAILABLE", "失败投稿重试服务不可用");
    try { return service.previewRetryFailedPublication({ publicationId: item.publicationId }); }
    catch (error) {
      if (error && error.code) throw error;
      throw attentionError("ARTICLE_ATTENTION_DOMAIN_UNAVAILABLE", "失败投稿重试预检失败");
    }
  }

  function preview(input) {
    const entry = find(input);
    const action = input && input.action;
    assertAllowed(entry, action);
    const retry = action === "retry-publication" ? retryPreview(entry.item) : null;
    return {
      attentionId: entry.item.attentionId,
      revision: query.getRevision(),
      action,
      requiresConfirmation: retry && retry.requiresConfirmation !== undefined ? retry.requiresConfirmation === true : !["inspect", "open-publication", "open-article"].includes(action),
      message: retry && retry.message || entry.item.message,
      details: retry && retry.details || undefined,
      changedScopes: ["inspect", "open-publication", "open-article"].includes(action) ? [] : ["articleManagement", "articleAttention", "platformQueue", "navigationSummary"]
    };
  }

  function resolve(input) {
    const value = input || {};
    const entry = find(value);
    const action = value.action;
    assertAllowed(entry, action);
    assertFresh(value);
    if (!["inspect", "open-publication", "open-article"].includes(action) && value.confirmed !== true) {
      throw attentionError("ARTICLE_ATTENTION_CONFIRMATION_REQUIRED", "需处理动作需要确认");
    }

    if (action === "inspect" || action === "open-publication" || action === "open-article") {
      return {
        outcome: action === "inspect" ? "inspection_required" : action,
        attentionId: entry.item.attentionId,
        item: entry.item,
        changedScopes: []
      };
    }

    let result;
    if (action === "finalize" || action === "cleanup") {
      const service = opts.contentSubmissionService;
      if (!service || typeof service.cleanupArticleSubmissionItem !== "function") throw attentionError("ARTICLE_ATTENTION_DOMAIN_UNAVAILABLE", "投稿队列处理服务不可用");
      result = service.cleanupArticleSubmissionItem(Object.assign({}, entry.item, {
        action: "cleanup",
        evaluationFingerprint: entry.item.evaluationFingerprint
      }));
    } else if (action === "retry-removal") {
      if (!opts.articleRemovalService || typeof opts.articleRemovalService.retryArticleRemovalTransaction !== "function") throw attentionError("ARTICLE_ATTENTION_DOMAIN_UNAVAILABLE", "删除事务修复服务不可用");
      result = opts.articleRemovalService.retryArticleRemovalTransaction({ transactionId: entry.item.transactionId, confirmed: true });
    } else if (action === "retry-publication") {
      const service = opts.contentSubmissionService;
      if (!service || typeof service.retryFailedPublication !== "function") throw attentionError("ARTICLE_ATTENTION_DOMAIN_UNAVAILABLE", "失败投稿重试服务不可用");
      result = service.retryFailedPublication({ publicationId: entry.item.publicationId, expectedRevision: value.expectedRevision, confirmed: true });
    } else if (action === "reconcile-published" || action === "reconcile-failed") {
      if (!opts.publicationLedger || typeof opts.publicationLedger.reconcile !== "function") throw attentionError("ARTICLE_ATTENTION_DOMAIN_UNAVAILABLE", "发布核对服务不可用");
      result = opts.publicationLedger.reconcile(entry.item.publicationId, { status: action === "reconcile-published" ? "published" : "failed", reasonCode: action === "reconcile-published" ? "CONFIRMED_PUBLISHED" : "CONFIRMED_NOT_PUBLISHED" });
    } else if (action === "retry-archive") {
      if (!opts.archiveService || typeof opts.archiveService.retryArchive !== "function") throw attentionError("ARTICLE_ARCHIVE_RETRY_UNAVAILABLE", "本地归档重试服务不可用");
      result = opts.archiveService.retryArchive(entry.item);
    } else {
      throw attentionError("ARTICLE_ATTENTION_ACTION_INVALID", "需处理动作无效");
    }

    const changedScopes = ["articleManagement", "articleAttention", "platformQueue", "navigationSummary"];
    if (!result || result.domainHandled !== true && (!Array.isArray(result.changedScopes) || result.changedScopes.length === 0)) invalidate("ARTICLE_ATTENTION_RESOLVED");
    if (typeof opts.getRevision !== "function" && query && typeof query.invalidate === "function") query.invalidate();
    return { outcome: "resolved", attentionId: entry.item.attentionId, result: result || null, changedScopes };
  }

  return { preview, resolve };
}

module.exports = { createArticleAttentionResolver, attentionError };
