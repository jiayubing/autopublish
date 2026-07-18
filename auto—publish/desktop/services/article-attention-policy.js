const ACTIONS = Object.freeze({
  FINALIZE: "finalize",
  CLEANUP: "cleanup",
  RETRY_REMOVAL: "retry-removal",
  RETRY_PUBLICATION: "retry-publication",
  OPEN_ARTICLE: "open-article",
  OPEN_PUBLICATION: "open-publication",
  INSPECT: "inspect",
  RECONCILE_PUBLISHED: "reconcile-published",
  RECONCILE_FAILED: "reconcile-failed",
  RETRY_ARCHIVE: "retry-archive"
});

const MESSAGES = Object.freeze({
  missing_pair_finalize: "队列文件已不存在，只差完成记录收尾",
  queue_pair_conflict: "队列文件与原投稿记录不一致",
  removal_needs_repair: "删除事务未完成，需要重新预检并继续",
  publication_uncertain: "远端结果待确认，请先核对发布详情",
  published_archive_failed: "远端已发布，但本地归档待处理",
  failed_submission: "投稿明确失败，可查看原因或执行允许的后续动作"
});

function bool(value) { return value === true; }

function canInspect(facts, capabilities) {
  return capabilities.canInspect !== false && facts.canInspect !== false;
}

function canOpenPublication(facts, capabilities) {
  return capabilities.canOpenPublication !== false && facts.canOpenPublication !== false;
}

function actionList(facts, capabilities, actions) {
  return actions.filter(function(action) {
    if (action === ACTIONS.INSPECT) return canInspect(facts, capabilities);
    if (action === ACTIONS.OPEN_PUBLICATION) return canOpenPublication(facts, capabilities);
    if (action === ACTIONS.OPEN_ARTICLE) return capabilities.canOpenArticle !== false && facts.articleExists === true;
    if (action === ACTIONS.FINALIZE) return capabilities.canFinalize !== false && facts.canFinalize !== false;
    if (action === ACTIONS.CLEANUP) return capabilities.canCleanup !== false && facts.canCleanup === true;
    if (action === ACTIONS.RETRY_REMOVAL) return capabilities.canRetryRemoval !== false && facts.canRetryRemoval !== false;
    if (action === ACTIONS.RETRY_PUBLICATION) return capabilities.canRetryFailedPublication === true && facts.canRetryFailedPublication !== false;
    if (action === ACTIONS.RECONCILE_PUBLISHED || action === ACTIONS.RECONCILE_FAILED) return capabilities.canReconcile !== false && facts.canReconcile !== false;
    if (action === ACTIONS.RETRY_ARCHIVE) return capabilities.canRetryArchive === true && facts.canRetryArchive !== false;
    return false;
  });
}

function policy(kind, facts, capabilities, actions, recommendedAction, exclusionReason) {
  const allowedActions = actionList(facts, capabilities, actions);
  return {
    included: allowedActions.length > 0 && !exclusionReason,
    kind,
    message: MESSAGES[kind] || "需处理项需要进一步核对",
    recommendedAction: allowedActions.includes(recommendedAction) ? recommendedAction : allowedActions[0] || null,
    allowedActions,
    exclusionReason: exclusionReason || null
  };
}

function deriveAttentionPolicy(input, capabilities) {
  const facts = input && typeof input === "object" ? input : {};
  const caps = capabilities && typeof capabilities === "object" ? capabilities : {};
  const kind = facts.kind || "queue_pair_conflict";

  if (kind === "failed_submission") {
    const removed = facts.articleStatus === "removed" || facts.articleExists === false && facts.hasResidue !== true && facts.hasRemovalTransaction !== true;
    if (removed && facts.hasResidue !== true && facts.hasRemovalTransaction !== true) {
      return policy(kind, facts, caps, [], null, "removed_failed_history");
    }
    if (facts.hasQueueBinding === true && facts.canCleanup === true) {
      return policy(kind, facts, caps, [ACTIONS.CLEANUP, ACTIONS.OPEN_PUBLICATION], ACTIONS.CLEANUP);
    }
    if (facts.articleExists === true && facts.articleStatus === "saved" && facts.targetSupportsContentQueueImport === true && facts.canRetryFailedPublication !== false) {
      return policy(kind, facts, caps, [ACTIONS.RETRY_PUBLICATION, ACTIONS.OPEN_PUBLICATION], ACTIONS.RETRY_PUBLICATION);
    }
    if (facts.articleExists === true && facts.articleStatus === "generated") {
      return policy(kind, facts, caps, [ACTIONS.OPEN_ARTICLE, ACTIONS.OPEN_PUBLICATION], ACTIONS.OPEN_ARTICLE);
    }
    return policy(kind, facts, caps, [ACTIONS.OPEN_PUBLICATION, ACTIONS.INSPECT], ACTIONS.OPEN_PUBLICATION);
  }

  if (kind === "missing_pair_finalize") {
    return policy(kind, facts, caps, [ACTIONS.FINALIZE], ACTIONS.FINALIZE);
  }
  if (kind === "removal_needs_repair") {
    return policy(kind, facts, caps, [ACTIONS.RETRY_REMOVAL, ACTIONS.INSPECT], ACTIONS.RETRY_REMOVAL);
  }
  if (kind === "publication_uncertain") {
    return policy(kind, facts, caps, [ACTIONS.OPEN_PUBLICATION, ACTIONS.RECONCILE_PUBLISHED, ACTIONS.RECONCILE_FAILED], ACTIONS.OPEN_PUBLICATION);
  }
  if (kind === "published_archive_failed") {
    return policy(kind, facts, caps, [ACTIONS.RETRY_ARCHIVE, ACTIONS.OPEN_PUBLICATION], ACTIONS.RETRY_ARCHIVE);
  }
  return policy(kind, facts, caps, [ACTIONS.INSPECT], ACTIONS.INSPECT);
}

module.exports = { ACTIONS, deriveAttentionPolicy, MESSAGES };
