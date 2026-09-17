"use strict";

const domain = require("../../src/domain");
const {
  canonicalArticleRefs,
  canonicalArticleRefKey,
  normalizeArticleRef,
} = require("../../src/content/article-ref");
const { deriveArticleLifecycle } = require("../../src/content/article-lifecycle-projection");
const {
  evaluateRegularQueueAdmission,
} = require("../../src/content/regular-queue-admission-policy");
const {
  createRegularQueueGroupQuery,
} = require("./regular-queue-group-query");
const { reportDiagnostic } = require("../../src/diagnostics/diagnostic-producer");

function fail(code, message) {
  const error = new Error(message || code);
  error.code = code;
  return error;
}

function plainObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function createRegularQueueApplication(options) {
  const value = options || {};
  if (!value.contentStore || typeof value.contentStore.getArticle !== "function")
    throw fail("REGULAR_QUEUE_CONTENT_STORE_REQUIRED");
  if (!value.articleMutationCoordinator)
    throw fail("REGULAR_QUEUE_COORDINATOR_REQUIRED");
  if (!value.regularQueueTransitions || typeof value.regularQueueTransitions.listArticleLifecycleFacts !== "function")
    throw fail("REGULAR_QUEUE_TRANSITIONS_REQUIRED");
  if (typeof value.accountProfileResolver !== "function")
    throw fail("REGULAR_QUEUE_ACCOUNT_PROFILE_RESOLVER_REQUIRED");
  const contentStore = value.contentStore;
  const coordinator = value.articleMutationCoordinator;
  const transitions = value.regularQueueTransitions;
  const groupTransitions = value.regularQueueGroupTransitions || null;
  const groupImageCountTransitions =
    value.regularQueueGroupImageCountTransitions || null;
  const groupSubmissionIntervalTransitions =
    value.regularQueueGroupSubmissionIntervalTransitions || null;
  const accountProfileResolver = value.accountProfileResolver;
  const clientSnapshotResolver = typeof value.clientSnapshotResolver === "function"
    ? value.clientSnapshotResolver
    : function (clientId) {
        return { version: 1, clientId, displayName: clientId };
      };
  const configuredPlatforms = Array.isArray(value.platforms) ? value.platforms : null;
  const onDataInvalidated = typeof value.onDataInvalidated === "function"
    ? value.onDataInvalidated
    : null;

  function notifyDataInvalidated(reasonCode) {
    if (!onDataInvalidated) return;
    try {
      onDataInvalidated(reasonCode);
    } catch (error) {
      reportDiagnostic({
        code: "REGULAR_QUEUE_INVALIDATION_LISTENER_FAILED",
        module: "regular-queue-application",
        category: "internal",
        operationId: "regular-queue-invalidation",
        metadata: {
          operation: "data-invalidation-listener",
          phase: "notify",
          outcome: "listener-isolated",
          reasonCode: typeof reasonCode === "string" && /^[A-Za-z][A-Za-z0-9._:-]{0,127}$/.test(reasonCode)
            ? reasonCode
            : "UNSPECIFIED",
          errorCode: error && /^([A-Z][A-Z0-9_]{1,127})$/.test(error.code || "")
            ? error.code
            : "LISTENER_FAILED",
        },
      });
    }
  }

  function platformList() {
    return (configuredPlatforms || []).filter(function (platform) {
      return platform && platform.publicationTargetKind === "platform";
    });
  }

  function targetFrom(input) {
    const request = input || {};
    if (Object.prototype.hasOwnProperty.call(request, "batchId"))
      throw fail("REGULAR_QUEUE_INPUT_INVALID");
    if (request.targetPlatformIds !== undefined || request.accountProfiles !== undefined)
      throw fail("REGULAR_QUEUE_SINGLE_TARGET_REQUIRED");
    if (request.mediaResourceId !== undefined || (request.target && request.target.kind === "media"))
      throw fail("REGULAR_QUEUE_PLATFORM_REQUIRED");
    if (typeof request.platformId !== "string" || !request.platformId.trim())
      throw fail("REGULAR_QUEUE_PLATFORM_REQUIRED");
    if (typeof request.accountProfileId !== "string" || !request.accountProfileId.trim())
      throw fail("ACCOUNT_PROFILE_REQUIRED");
    const platformId = request.platformId.trim();
    const platform = platformList().find(function (candidate) { return candidate.id === platformId; });
    if (!platform) throw fail("REGULAR_QUEUE_PLATFORM_UNSUPPORTED");
    if (request.retargetFrom !== undefined && value.isTargetConfigured && !value.isTargetConfigured(platformId))
      throw fail("PLATFORM_CONFIG_NOT_SET");
    let target;
    try {
      target = domain.parsePublicationTarget({
        kind: "platform",
        platformId,
        accountProfileId: request.accountProfileId,
      });
    } catch (_) {
      throw fail("REGULAR_QUEUE_TARGET_INVALID");
    }
    try {
      const account = accountProfileResolver({
        accountProfileId: target.accountProfileId,
        platformId: target.platformId,
      });
      return { target, account };
    } catch (error) {
      throw fail(error && error.code ? error.code : "REGULAR_QUEUE_TARGET_INVALID");
    }
  }

  function refsFrom(input) {
    const request = input || {};
    const raw = Array.isArray(request.articleRefs)
      ? request.articleRefs
      : Array.isArray(request.selections)
        ? request.selections.map(function (item) { return item && item.articleRef ? item.articleRef : item; })
        : [];
    if (!raw.length) throw fail("REGULAR_QUEUE_ARTICLES_REQUIRED");
    try {
      const refs = canonicalArticleRefs(raw);
      if (new Set(refs.map(function (ref) { return ref.clientId; })).size > 1)
        throw fail("REGULAR_QUEUE_SINGLE_CLIENT_REQUIRED");
      return refs;
    } catch (_) {
      if (_ && _.code === "REGULAR_QUEUE_SINGLE_CLIENT_REQUIRED") throw _;
      throw fail("REGULAR_QUEUE_ARTICLE_IDENTITY_INVALID");
    }
  }

  function queueConfigFrom(input) {
    const queueConfig = input && input.queueConfig;
    if (queueConfig === undefined) return undefined;
    if (!plainObject(queueConfig) || Object.keys(queueConfig).some(function (key) {
      return (
        key !== "queueGroupId" &&
        key !== "imageCount" &&
        key !== "submissionIntervalSeconds"
      );
    }))
      throw fail("REGULAR_QUEUE_CONFIG_INVALID");
    if (queueConfig.queueGroupId !== undefined &&
        (typeof queueConfig.queueGroupId !== "string" || !queueConfig.queueGroupId.trim()))
      throw fail("REGULAR_QUEUE_CONFIG_INVALID");
    if (
      queueConfig.imageCount !== undefined &&
      (!Number.isInteger(queueConfig.imageCount) ||
        queueConfig.imageCount < 0 ||
        queueConfig.imageCount > 5)
    )
      throw fail("REGULAR_QUEUE_CONFIG_INVALID");
    if (
      queueConfig.submissionIntervalSeconds !== undefined &&
      (!Number.isInteger(queueConfig.submissionIntervalSeconds) ||
        queueConfig.submissionIntervalSeconds < 0 ||
        queueConfig.submissionIntervalSeconds > 3600)
    )
      throw fail("REGULAR_QUEUE_CONFIG_INVALID");
    return Object.freeze(Object.assign({}, queueConfig));
  }

  function imageCountUpdateFrom(input) {
    const request = input || {};
    if (
      !plainObject(request) ||
      Object.keys(request).some(function (key) {
        return (
          key !== "queueGroupId" &&
          key !== "imageCount" &&
          key !== "expectedRevision"
        );
      }) ||
      typeof request.queueGroupId !== "string" ||
      !request.queueGroupId.trim() ||
      !Number.isInteger(request.imageCount) ||
      request.imageCount < 0 ||
      request.imageCount > 5 ||
      !Number.isInteger(request.expectedRevision) ||
      request.expectedRevision < 0
    )
      throw fail("REGULAR_QUEUE_CONFIG_INVALID");
    return Object.freeze({
      queueGroupId: request.queueGroupId.trim(),
      imageCount: request.imageCount,
      expectedRevision: request.expectedRevision,
    });
  }

  function submissionIntervalUpdateFrom(input) {
    const request = input || {};
    if (
      !plainObject(request) ||
      Object.keys(request).some(function (key) {
        return (
          key !== "queueGroupId" &&
          key !== "submissionIntervalSeconds" &&
          key !== "expectedRevision"
        );
      }) ||
      typeof request.queueGroupId !== "string" ||
      !request.queueGroupId.trim() ||
      !Number.isInteger(request.submissionIntervalSeconds) ||
      request.submissionIntervalSeconds < 0 ||
      request.submissionIntervalSeconds > 3600 ||
      !Number.isInteger(request.expectedRevision) ||
      request.expectedRevision < 0
    )
      throw fail("REGULAR_QUEUE_CONFIG_INVALID");
    return Object.freeze({
      queueGroupId: request.queueGroupId.trim(),
      submissionIntervalSeconds: request.submissionIntervalSeconds,
      expectedRevision: request.expectedRevision,
    });
  }

  function groupImagePublishingSupported(platformId) {
    const platform = platformList().find(function (candidate) { return candidate.id === platformId; });
    return Boolean(platform && platform.imagePublishing);
  }

  const listRegularQueueGroups =
    createRegularQueueGroupQuery({
      groupTransitions,
      clientSnapshotResolver,
      groupImagePublishingSupported,
    }).listRegularQueueGroups;

  function queueConfigForTarget(input, target) {
    const queueConfig = queueConfigFrom(input);
    if (groupImagePublishingSupported(target.platformId)) return queueConfig;
    if (queueConfig && queueConfig.imageCount !== undefined && queueConfig.imageCount !== 0)
      throw fail("REGULAR_QUEUE_IMAGE_PUBLISHING_UNSUPPORTED");
    return Object.freeze({
      ...(queueConfig && queueConfig.queueGroupId
        ? { queueGroupId: queueConfig.queueGroupId }
        : {}),
      imageCount: 0,
      ...(queueConfig && queueConfig.submissionIntervalSeconds !== undefined
        ? { submissionIntervalSeconds: queueConfig.submissionIntervalSeconds }
        : {}),
    });
  }

  function factsFor(refs) {
    return transitions.listArticleLifecycleFacts({
      articleIds: [...new Set(refs.map(function (ref) { return ref.articleId; }))],
    }) || { publications: [], submissionItems: [], orders: [], attentionItems: [] };
  }

  function targetKey(target) {
    return domain.publicationTargetKey(target);
  }

  function queueGroupReasonCode(queueGroupId) {
    if (
      !queueGroupId ||
      !groupTransitions ||
      typeof groupTransitions.listRegularQueueGroupSnapshots !== "function"
    )
      return null;
    const groups = groupTransitions.listRegularQueueGroupSnapshots({
      queueGroupId,
    }) || [];
    if (!Array.isArray(groups)) return null;
    const group = groups.find(function (candidate) {
      return candidate && candidate.queueGroupId === queueGroupId;
    });
    const reasonCode = group && group.actions && group.actions.reasonCode;
    return typeof reasonCode === "string" && /^[A-Z][A-Z0-9_]{0,127}$/.test(reasonCode)
      ? reasonCode
      : null;
  }

  function previewRegularQueueAdmission(input) {
    const { target } = targetFrom(input);
    const refs = refsFrom(input);
    const retargetConflicts = retargetConflictsFor(input, refs, target);
    queueConfigForTarget(input, target);
    const facts = factsFor(refs);
    const key = targetKey(target);
    const groupReasons = new Map();
    const items = refs.map(function (ref) {
      const retargetReason = retargetConflicts.get(canonicalArticleRefKey(ref));
      if (retargetReason) return Object.freeze({ articleRef: ref, articleId: ref.articleId, status: "conflict", reasonCode: retargetReason });
      let article;
      try {
        article = contentStore.getArticle(ref.clientId, ref.articleId);
      } catch (_) {
        return Object.freeze({
          articleRef: ref,
          articleId: ref.articleId,
          status: "missing",
          reasonCode: "ARTICLE_NOT_FOUND",
        });
      }
      const workflow = deriveArticleLifecycle({
        article,
        publications: facts.publications,
        submissionItems: facts.submissionItems,
        orders: facts.orders,
        attentionItems: facts.attentionItems,
        removalTransactions: facts.removalTransactions || [],
      });
      const admission = evaluateRegularQueueAdmission({
        articleRef: ref,
        targetKey: key,
        workflow,
        submissionItems: facts.submissionItems,
      });
      if (admission.status !== "idempotent") return admission;
      if (!groupReasons.has(admission.queueGroupId))
        groupReasons.set(admission.queueGroupId, queueGroupReasonCode(admission.queueGroupId));
      const reasonCode = groupReasons.get(admission.queueGroupId);
      return reasonCode
        ? Object.freeze(Object.assign({}, admission, { reasonCode }))
        : admission;
    });
    return Object.freeze({
      target,
      articleRefs: Object.freeze(refs),
      items: Object.freeze(items),
      totalCount: items.length,
      queueableCount: items.filter(function (item) { return item.status === "queueable"; }).length,
      idempotentCount: items.filter(function (item) { return item.status === "idempotent"; }).length,
      missingCount: items.filter(function (item) { return item.status === "missing"; }).length,
      conflictCount: items.filter(function (item) { return item.status === "conflict"; }).length,
    });
  }

  function admitRegularQueueItems(input) {
    const { target, account } = targetFrom(input);
    const refs = refsFrom(input);
    const retargetConflicts = retargetConflictsFor(input, refs, target);
    const eligibleRefs = refs.filter((ref) => !retargetConflicts.has(canonicalArticleRefKey(ref)));
    const queueConfig = queueConfigForTarget(input, target);
    const platform = platformList().find(function (candidate) { return candidate.id === target.platformId; });
    const targetSnapshotV1 = domain.parseTargetSnapshotV1({
      version: 1,
      kind: "platform",
      platformId: target.platformId,
      platformName: (platform && platform.displayName) || target.platformId,
      accountProfileId: target.accountProfileId,
      accountLabel: account.displayName,
    });
    const customerSnapshotsV1 = Object.freeze(Object.fromEntries(
      [...new Set(refs.map(function (ref) { return ref.clientId; }))].map(function (clientId) {
        return [
          clientId,
          domain.parseCustomerSnapshotV1(clientSnapshotResolver(clientId)),
        ];
      }),
    ));
    const result = eligibleRefs.length ? coordinator.admitRegularQueueItems({
      articleRefs: eligibleRefs,
      target,
      targetSnapshotV1,
      customerSnapshotsV1,
      queueConfig,
    }) : { items: [], admittedCount: 0, idempotentCount: 0, missingCount: 0, conflictCount: 0 };
    const conflicts = refs.filter((ref) => retargetConflicts.has(canonicalArticleRefKey(ref))).map((ref) => ({
      articleRef: ref, articleId: ref.articleId, status: "conflict",
      reasonCode: retargetConflicts.get(canonicalArticleRefKey(ref)),
    }));
    if (result.admittedCount > 0)
      notifyDataInvalidated("SUBMISSION_BATCH_CREATED");
    return Object.freeze(Object.assign({}, result, {
      items: Object.freeze([...result.items, ...conflicts]),
      conflictCount: result.conflictCount + conflicts.length,
      target,
      articleRefs: Object.freeze(refs),
    }));
  }

  function retargetConflictsFor(input, refs, target) {
    const sources = input && input.retargetFrom;
    const conflicts = new Map();
    if (sources === undefined) return conflicts;
    if (!Array.isArray(sources) || sources.length !== refs.length || input.autoStart === true)
      throw fail("REGULAR_QUEUE_RETARGET_INPUT_INVALID");
    const byRef = new Map();
    for (const source of sources) {
      if (!source || typeof source.attentionId !== "string" || !source.attentionId.trim())
        throw fail("REGULAR_QUEUE_RETARGET_INPUT_INVALID");
      const key = canonicalArticleRefKey(source.articleRef);
      if (byRef.has(key)) throw fail("REGULAR_QUEUE_RETARGET_INPUT_INVALID");
      byRef.set(key, source.attentionId);
    }
    if (refs.some((ref) => !byRef.has(canonicalArticleRefKey(ref))))
      throw fail("REGULAR_QUEUE_RETARGET_INPUT_INVALID");
    if (typeof value.getAttentionItems !== "function")
      throw fail("ARTICLE_ATTENTION_DOMAIN_UNAVAILABLE");
    const attention = value.getAttentionItems(refs.map((ref) => byRef.get(canonicalArticleRefKey(ref))));
    refs.forEach((ref, index) => {
      const item = attention[index];
      const key = canonicalArticleRefKey(ref);
      if (!item || item.attentionId !== byRef.get(key) || item.clientId !== ref.clientId || item.articleId !== ref.articleId)
        conflicts.set(key, "ARTICLE_ATTENTION_STALE");
      else if (item.kind !== "regular_platform_failed" || item.freeze?.article || !item.allowedActions?.includes("open-submission"))
        conflicts.set(key, "ARTICLE_ATTENTION_ACTION_NOT_ALLOWED");
      else if (!item.platformId || item.platformId === target.platformId)
        conflicts.set(key, "REGULAR_QUEUE_DIFFERENT_PLATFORM_REQUIRED");
    });
    return conflicts;
  }

  function removePendingQueueItems(input) {
    const request = input || {};
    const entries = Array.isArray(request.items)
      ? request.items
      : Array.isArray(request.selections)
        ? request.selections
        : request.item || request.selection
          ? [request.item || request.selection]
          : [];
    if (!entries.length) throw fail("REGULAR_QUEUE_ITEMS_REQUIRED");
    const items = entries.map(function (item) {
      if (!plainObject(item)) throw fail("REGULAR_QUEUE_ITEM_INVALID");
      const ref = normalizeArticleRef(item.articleRef || item);
      if (typeof item.itemId !== "string" || !item.itemId.trim() || typeof item.batchId !== "string" || !item.batchId.trim())
        throw fail("REGULAR_QUEUE_ITEM_INVALID");
      return Object.assign({}, item, { articleRef: ref });
    });
    const result = coordinator.removePendingQueueItems({ items, operationId: request.operationId });
    if (result.removedCount > 0)
      notifyDataInvalidated("SUBMISSION_BATCH_CANCELLED");
    return Object.freeze(Object.assign({}, result, {
      items: Object.freeze(result.items || []),
    }));
  }

  function updateRegularQueueGroupImageCount(input) {
    if (
      !groupImageCountTransitions ||
      typeof groupImageCountTransitions.setRegularQueueGroupImageCount !==
        "function" ||
      !groupTransitions ||
      typeof groupTransitions.listRegularQueueGroupSnapshots !== "function"
    )
      throw fail("REGULAR_QUEUE_GROUP_IMAGE_COUNT_UNAVAILABLE");
    const request = imageCountUpdateFrom(input);
    const groups = groupTransitions.listRegularQueueGroupSnapshots({
      queueGroupId: request.queueGroupId,
      remainingLimit: 1,
    });
    const group = Array.isArray(groups) ? groups[0] : null;
    if (
      group &&
      !groupImagePublishingSupported(group.platformId) &&
      request.imageCount !== 0
    )
      throw fail("REGULAR_QUEUE_IMAGE_PUBLISHING_UNSUPPORTED");
    groupImageCountTransitions.setRegularQueueGroupImageCount(request);
    notifyDataInvalidated("REGULAR_QUEUE_GROUP_IMAGE_COUNT_UPDATED");
    return Object.freeze({ completed: true });
  }

  function updateRegularQueueGroupSubmissionInterval(input) {
    if (
      !groupSubmissionIntervalTransitions ||
      typeof groupSubmissionIntervalTransitions.setRegularQueueGroupSubmissionInterval !==
        "function"
    )
      throw fail("REGULAR_QUEUE_GROUP_SUBMISSION_INTERVAL_UNAVAILABLE");
    const request = submissionIntervalUpdateFrom(input);
    groupSubmissionIntervalTransitions.setRegularQueueGroupSubmissionInterval(
      request,
    );
    notifyDataInvalidated("REGULAR_QUEUE_GROUP_SUBMISSION_INTERVAL_UPDATED");
    return Object.freeze({ completed: true });
  }

  return Object.freeze({
    previewRegularQueueAdmission,
    admitRegularQueueItems,
    listRegularQueueGroups,
    removePendingQueueItems,
    updateRegularQueueGroupImageCount,
    updateRegularQueueGroupSubmissionInterval,
  });
}

module.exports = { createRegularQueueApplication };
