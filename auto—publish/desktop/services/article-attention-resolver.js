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

  function assertFresh(input) {
    const expected = Number(input && input.expectedRevision);
    if (!Number.isSafeInteger(expected) || expected !== query.getRevision()) throw attentionError("ARTICLE_ATTENTION_STALE", "需处理项已发生变化，请重新检查");
  }

  function find(input) {
    const item = query.get(input || {});
    if (!item) throw attentionError("ARTICLE_ATTENTION_NOT_FOUND", "需处理项不存在或已处理");
    return item;
  }

  function preview(input) {
    const item = find(input);
    const action = input && input.action;
    if (typeof action !== "string" || !item.allowedActions.includes(action)) throw attentionError("ARTICLE_ATTENTION_ACTION_NOT_ALLOWED", "当前状态不允许此操作");
    return {
      attentionId: item.attentionId,
      revision: query.getRevision(),
      action,
      requiresConfirmation: !["inspect", "open-publication"].includes(action),
      message: item.message,
      changedScopes: action === "open-publication" || action === "inspect" ? [] : ["articleAttention", "platformQueue", "navigationSummary"]
    };
  }

  function resolve(input) {
    const value = input || {};
    const item = find(value);
    const action = value.action;
    if (typeof action !== "string" || !item.allowedActions.includes(action)) throw attentionError("ARTICLE_ATTENTION_ACTION_NOT_ALLOWED", "当前状态不允许此操作");
    assertFresh(value);
    if (!["inspect", "open-publication"].includes(action) && value.confirmed !== true) throw attentionError("ARTICLE_ATTENTION_CONFIRMATION_REQUIRED", "需处理动作需要确认");

    if (action === "inspect" || action === "open-publication") {
      return { outcome: action === "inspect" ? "inspection_required" : "open_publication", attentionId: item.attentionId, changedScopes: [] };
    }

    let result;
    if (action === "finalize" || action === "cleanup" || action === "cancel" || action === "detach" || action === "keep") {
      const service = opts.contentSubmissionService;
      if (!service) throw attentionError("ARTICLE_ATTENTION_DOMAIN_UNAVAILABLE", "投稿队列处理服务不可用");
      const command = Object.assign({}, item, { action: action === "finalize" ? (item.pairState === "both_absent" ? "cleanup" : "cleanup") : action });
      if (command.action === "cancel") {
        if (typeof service.cancelArticleSubmissionItem !== "function") throw attentionError("ARTICLE_ATTENTION_DOMAIN_UNAVAILABLE", "投稿撤销服务不可用");
        result = service.cancelArticleSubmissionItem(command);
      } else {
        if (typeof service.cleanupArticleSubmissionItem !== "function") throw attentionError("ARTICLE_ATTENTION_DOMAIN_UNAVAILABLE", "投稿清理服务不可用");
        result = service.cleanupArticleSubmissionItem(command);
      }
    } else if (action === "retry") {
      if (item.kind !== "removal_needs_repair" || !opts.articleRemovalService || typeof opts.articleRemovalService.retryArticleRemovalTransaction !== "function") throw attentionError("ARTICLE_ATTENTION_DOMAIN_UNAVAILABLE", "删除事务修复服务不可用");
      result = opts.articleRemovalService.retryArticleRemovalTransaction({ transactionId: item.transactionId, confirmed: true });
    } else if (action === "reconcile-published" || action === "reconcile-failed") {
      if (!opts.publicationLedger || typeof opts.publicationLedger.reconcile !== "function") throw attentionError("ARTICLE_ATTENTION_DOMAIN_UNAVAILABLE", "发布核对服务不可用");
      result = opts.publicationLedger.reconcile(item.publicationId, { status: action === "reconcile-published" ? "published" : "failed", reasonCode: action === "reconcile-published" ? "CONFIRMED_PUBLISHED" : "CONFIRMED_NOT_PUBLISHED" });
    } else if (action === "retry-archive") {
      if (!opts.archiveService || typeof opts.archiveService.retry !== "function") throw attentionError("ARTICLE_ARCHIVE_RETRY_UNAVAILABLE", "本地归档重试服务不可用");
      result = opts.archiveService.retry(item);
    } else {
      throw attentionError("ARTICLE_ATTENTION_ACTION_INVALID", "需处理动作无效");
    }

    query.invalidate();
    const changedScopes = ["articleAttention", "platformQueue", "navigationSummary"];
    invalidate(changedScopes, "ARTICLE_ATTENTION_RESOLVED");
    return { outcome: "resolved", attentionId: item.attentionId, result: result || null, changedScopes };
  }

  return { preview, resolve };
}

module.exports = { createArticleAttentionResolver };
