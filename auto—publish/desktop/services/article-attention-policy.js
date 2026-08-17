"use strict";

const ATTENTION_KINDS = Object.freeze({
  REGULAR_PLATFORM_FAILED: "regular_platform_failed",
  REGULAR_PLATFORM_UNCERTAIN: "regular_platform_uncertain",
  PAID_ORDER_CREATION_UNCERTAIN: "paid_order_creation_uncertain",
  ORDER_STATUS_ANOMALY: "order_status_anomaly",
  REMOVAL_NEEDS_REPAIR: "removal_needs_repair",
  PUBLISHED_ARCHIVE_FAILED: "published_archive_failed",
});

const OWNERS = Object.freeze({
  [ATTENTION_KINDS.REGULAR_PLATFORM_FAILED]: "regular-platform-outcome",
  [ATTENTION_KINDS.REGULAR_PLATFORM_UNCERTAIN]: "regular-platform-outcome",
  [ATTENTION_KINDS.PAID_ORDER_CREATION_UNCERTAIN]: "paid-order-creation",
  [ATTENTION_KINDS.ORDER_STATUS_ANOMALY]: "order-reconciliation",
  [ATTENTION_KINDS.REMOVAL_NEEDS_REPAIR]: "article-removal-recovery",
  [ATTENTION_KINDS.PUBLISHED_ARCHIVE_FAILED]: "publication-archive",
});

const ACTIONS = Object.freeze({
  OPEN_SUBMISSION: "open-submission",
  OPEN_ARTICLE: "open-article",
  OPEN_PUBLICATION: "open-publication",
  INSPECT: "inspect",
  CONFIRM_REGULAR_ACCEPTED: "confirm-regular-accepted",
  CONFIRM_REGULAR_NOT_ACCEPTED: "confirm-regular-not-accepted",
  BIND_PAID_ORDER_NUMBER: "bind-paid-order-number",
  CONFIRM_PAID_ORDER_ABSENT: "confirm-paid-order-absent",
  RESUME_ORDER_TRACKING: "resume-order-tracking",
  CONFIRM_ORDER_PUBLISHED: "confirm-order-published",
  CONFIRM_ORDER_NOT_PUBLISHED: "confirm-order-not-published",
  RETRY_REMOVAL: "retry-removal",
  RETRY_ARCHIVE: "retry-archive",
});

const MESSAGES = Object.freeze({
  [ATTENTION_KINDS.REGULAR_PLATFORM_FAILED]:
    "投稿明确失败，可重新编辑并从统一投稿入口发起",
  [ATTENTION_KINDS.REGULAR_PLATFORM_UNCERTAIN]:
    "普通平台远端结果待确认，只能记录已接受或未接受",
  [ATTENTION_KINDS.PAID_ORDER_CREATION_UNCERTAIN]:
    "付费订单创建结果待确认，只能绑定订单号或确认无订单",
  [ATTENTION_KINDS.ORDER_STATUS_ANOMALY]:
    "订单状态异常，需要重新核对订单状态",
  [ATTENTION_KINDS.REMOVAL_NEEDS_REPAIR]:
    "删除事务未完成，需要修复本地删除状态",
  [ATTENTION_KINDS.PUBLISHED_ARCHIVE_FAILED]:
    "远端已发布，但本地归档待处理",
});

const DEFAULT_PRIORITY = Object.freeze({
  [ATTENTION_KINDS.REGULAR_PLATFORM_UNCERTAIN]: 500,
  [ATTENTION_KINDS.PAID_ORDER_CREATION_UNCERTAIN]: 480,
  [ATTENTION_KINDS.ORDER_STATUS_ANOMALY]: 460,
  [ATTENTION_KINDS.REGULAR_PLATFORM_FAILED]: 300,
  [ATTENTION_KINDS.REMOVAL_NEEDS_REPAIR]: 220,
  [ATTENTION_KINDS.PUBLISHED_ARCHIVE_FAILED]: 200,
});

const DEFAULT_FREEZE = Object.freeze({
  [ATTENTION_KINDS.REGULAR_PLATFORM_FAILED]: false,
  [ATTENTION_KINDS.REGULAR_PLATFORM_UNCERTAIN]: true,
  [ATTENTION_KINDS.PAID_ORDER_CREATION_UNCERTAIN]: true,
  [ATTENTION_KINDS.ORDER_STATUS_ANOMALY]: true,
  [ATTENTION_KINDS.REMOVAL_NEEDS_REPAIR]: true,
  [ATTENTION_KINDS.PUBLISHED_ARCHIVE_FAILED]: true,
});

const NAVIGATION_ACTIONS = Object.freeze([
  ACTIONS.OPEN_SUBMISSION,
  ACTIONS.OPEN_ARTICLE,
  ACTIONS.OPEN_PUBLICATION,
  ACTIONS.INSPECT,
]);

function canInspect(facts, capabilities) {
  return capabilities.canInspect !== false && facts.canInspect !== false;
}

function canOpenPublication(facts, capabilities) {
  return (
    capabilities.canOpenPublication !== false &&
    facts.canOpenPublication !== false
  );
}

function actionList(facts, capabilities, actions) {
  const articleLookupUnavailable = facts.articleLookupStatus === "unavailable";
  return actions.filter(function (action) {
    if (action === ACTIONS.INSPECT) return canInspect(facts, capabilities);
    if (action === ACTIONS.OPEN_PUBLICATION)
      return canOpenPublication(facts, capabilities);
    if (action === ACTIONS.OPEN_SUBMISSION)
      return (
        facts.articleSubmissionEligible === true &&
        capabilities.canOpenSubmission !== false
      );
    if (action === ACTIONS.OPEN_ARTICLE)
      return (
        !articleLookupUnavailable &&
        capabilities.canOpenArticle !== false &&
        facts.articleExists === true
      );
    if (action === ACTIONS.RETRY_REMOVAL)
      return (
        capabilities.canRetryRemoval !== false &&
        facts.canRetryRemoval !== false
      );
    if (action === ACTIONS.RETRY_ARCHIVE)
      return (
        capabilities.canRetryArchive === true &&
        facts.canRetryArchive !== false
      );
    if (
      [
        ACTIONS.CONFIRM_REGULAR_ACCEPTED,
        ACTIONS.CONFIRM_REGULAR_NOT_ACCEPTED,
      ].includes(action)
    )
      return capabilities.canResolveRegularUncertain === true;
    if (
      [ACTIONS.BIND_PAID_ORDER_NUMBER, ACTIONS.CONFIRM_PAID_ORDER_ABSENT].includes(
        action,
      )
    )
      return capabilities.canResolvePaidOrderCreation === true;
    if (
      [
        ACTIONS.RESUME_ORDER_TRACKING,
        ACTIONS.CONFIRM_ORDER_PUBLISHED,
        ACTIONS.CONFIRM_ORDER_NOT_PUBLISHED,
      ].includes(action)
    )
      return capabilities.canResolveOrderStatusAnomaly === true;
    return false;
  });
}

function freezeFor(kind, facts) {
  const frozen =
    typeof facts.freezeArticle === "boolean"
      ? facts.freezeArticle
      : DEFAULT_FREEZE[kind] === true;
  return Object.freeze({
    article: frozen,
    reasonCode: frozen
      ? facts.freezeReasonCode || "ATTENTION_REQUIRES_RESOLUTION"
      : null,
  });
}

function policy(
  kind,
  facts,
  capabilities,
  actions,
  recommendedAction,
  exclusionReason,
) {
  const allowedActions = actionList(facts, capabilities, actions);
  const known = Object.prototype.hasOwnProperty.call(OWNERS, kind);
  return {
    included: known && allowedActions.length > 0 && !exclusionReason,
    kind,
    owner: OWNERS[kind] || null,
    message: MESSAGES[kind] || "需处理项需要进一步核对",
    freeze: freezeFor(kind, facts),
    resolutionPriority:
      Number.isSafeInteger(facts.resolutionPriority) &&
      facts.resolutionPriority >= 0
        ? facts.resolutionPriority
        : DEFAULT_PRIORITY[kind] || 0,
    recommendedAction: allowedActions.includes(recommendedAction)
      ? recommendedAction
      : allowedActions[0] || null,
    allowedActions,
    exclusionReason: exclusionReason || null,
  };
}

function deriveAttentionPolicy(input, capabilities) {
  const facts = input && typeof input === "object" ? input : {};
  const caps =
    capabilities && typeof capabilities === "object" ? capabilities : {};
  const kind = facts.kind || "unknown";

  if (kind === ATTENTION_KINDS.REGULAR_PLATFORM_FAILED) {
    const articleLookupUnavailable = facts.articleLookupStatus === "unavailable";
    const removed =
      !articleLookupUnavailable &&
      (facts.articleStatus === "removed" ||
        (facts.articleExists === false &&
          facts.hasResidue !== true &&
          facts.hasRemovalTransaction !== true));
    if (
      removed &&
      facts.hasResidue !== true &&
      facts.hasRemovalTransaction !== true
    )
      return policy(kind, facts, caps, [], null, "removed_failed_history");
    if (facts.articleExists === true && facts.articleStatus === "generated")
      return policy(
        kind,
        facts,
        caps,
        [
          ACTIONS.OPEN_SUBMISSION,
          ACTIONS.OPEN_ARTICLE,
          ACTIONS.OPEN_PUBLICATION,
          ACTIONS.INSPECT,
        ],
        ACTIONS.OPEN_SUBMISSION,
      );
    return policy(
      kind,
      facts,
      caps,
      [ACTIONS.OPEN_SUBMISSION, ACTIONS.OPEN_PUBLICATION, ACTIONS.INSPECT],
      ACTIONS.OPEN_SUBMISSION,
    );
  }

  if (kind === ATTENTION_KINDS.REGULAR_PLATFORM_UNCERTAIN)
    return policy(
      kind,
      facts,
      caps,
      [
        ACTIONS.CONFIRM_REGULAR_ACCEPTED,
        ACTIONS.CONFIRM_REGULAR_NOT_ACCEPTED,
        ACTIONS.OPEN_PUBLICATION,
        ACTIONS.INSPECT,
      ],
      ACTIONS.OPEN_PUBLICATION,
    );

  if (kind === ATTENTION_KINDS.PAID_ORDER_CREATION_UNCERTAIN) {
    const resolutionActions = Array.isArray(facts.resolutionActions)
      ? facts.resolutionActions.filter((action) =>
          [
            ACTIONS.BIND_PAID_ORDER_NUMBER,
            ACTIONS.CONFIRM_PAID_ORDER_ABSENT,
          ].includes(action),
        )
      : [ACTIONS.BIND_PAID_ORDER_NUMBER, ACTIONS.CONFIRM_PAID_ORDER_ABSENT];
    return policy(
      kind,
      facts,
      caps,
      [
        ...resolutionActions,
        ACTIONS.INSPECT,
      ],
      ACTIONS.INSPECT,
    );
  }

  if (kind === ATTENTION_KINDS.ORDER_STATUS_ANOMALY)
    return policy(
      kind,
      facts,
      caps,
      [
        ACTIONS.RESUME_ORDER_TRACKING,
        ACTIONS.CONFIRM_ORDER_PUBLISHED,
        ACTIONS.CONFIRM_ORDER_NOT_PUBLISHED,
        ACTIONS.INSPECT,
      ],
      ACTIONS.RESUME_ORDER_TRACKING,
    );

  if (kind === ATTENTION_KINDS.REMOVAL_NEEDS_REPAIR)
    return policy(
      kind,
      facts,
      caps,
      [ACTIONS.RETRY_REMOVAL, ACTIONS.INSPECT],
      ACTIONS.RETRY_REMOVAL,
    );

  if (kind === ATTENTION_KINDS.PUBLISHED_ARCHIVE_FAILED)
    return policy(
      kind,
      facts,
      caps,
      [ACTIONS.RETRY_ARCHIVE, ACTIONS.INSPECT],
      ACTIONS.RETRY_ARCHIVE,
    );

  return policy(kind, facts, caps, [ACTIONS.INSPECT], ACTIONS.INSPECT);
}

module.exports = {
  ACTIONS,
  ATTENTION_KINDS,
  DEFAULT_PRIORITY,
  MESSAGES,
  NAVIGATION_ACTIONS,
  OWNERS,
  deriveAttentionPolicy,
};
