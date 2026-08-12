"use strict";

const domain = require("../../src/domain");
const {
  canonicalArticleRefs,
  normalizeArticleRef,
} = require("../../src/content/article-ref");
const { deriveArticleLifecycle } = require("../../src/content/article-lifecycle-projection");

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
  const paidStagingTransitions = value.paidStagingTransitions || null;
  const accountProfileResolver = value.accountProfileResolver;
  const clientSnapshotResolver = typeof value.clientSnapshotResolver === "function"
    ? value.clientSnapshotResolver
    : function (clientId) {
        return { version: 1, clientId, displayName: clientId };
      };
  const configuredPlatforms = Array.isArray(value.platforms) ? value.platforms : null;

  function platformList() {
    return (configuredPlatforms || []).filter(function (platform) {
      return platform && platform.contentQueueImport === true &&
        (!platform.publicationTarget || platform.publicationTarget.kind === "platform");
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
      accountProfileResolver({
        accountProfileId: target.accountProfileId,
        platformId: target.platformId,
      });
      return target;
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
    if (!plainObject(queueConfig) || Object.keys(queueConfig).some(function (key) { return key !== "queueGroupId"; }))
      throw fail("REGULAR_QUEUE_CONFIG_INVALID");
    if (queueConfig.queueGroupId !== undefined &&
        (typeof queueConfig.queueGroupId !== "string" || !queueConfig.queueGroupId.trim()))
      throw fail("REGULAR_QUEUE_CONFIG_INVALID");
    return Object.freeze(Object.assign({}, queueConfig));
  }

  function factsFor(refs) {
    return transitions.listArticleLifecycleFacts({
      articleIds: [...new Set(refs.map(function (ref) { return ref.articleId; }))],
    }) || { publications: [], submissionItems: [], orders: [], attentionItems: [] };
  }

  function isPaidStaged(ref) {
    if (
      !paidStagingTransitions ||
      typeof paidStagingTransitions.hasPaidStagingItem !== "function"
    )
      return false;
    try {
      return paidStagingTransitions.hasPaidStagingItem({ articleRef: ref }) === true;
    } catch (error) {
      const mapped = fail(
        error && error.code === "STAGING_PERSISTENCE_FAILED"
          ? error.code
          : "STAGING_PERSISTENCE_FAILED",
      );
      throw mapped;
    }
  }

  function targetKey(target) {
    return domain.publicationTargetKey(target);
  }

  function itemForTarget(facts, ref, key) {
    return (facts.submissionItems || []).find(function (item) {
      return item.articleId === ref.articleId && item.targetKey === key;
    }) || null;
  }

  function previewRegularQueueAdmission(input) {
    const target = targetFrom(input);
    const refs = refsFrom(input);
    queueConfigFrom(input);
    const facts = factsFor(refs);
    const key = targetKey(target);
    const items = refs.map(function (ref) {
      let article;
      try { article = contentStore.getArticle(ref.clientId, ref.articleId); }
      catch (_) {
        return Object.freeze({ articleRef: ref, articleId: ref.articleId, status: "missing", reasonCode: "ARTICLE_NOT_FOUND" });
      }
      if (isPaidStaged(ref)) {
        return Object.freeze({
          articleRef: ref,
          articleId: ref.articleId,
          targetKey: key,
          status: "conflict",
          reasonCode: "PAID_STAGING_REGULAR_QUEUE_CONFLICT",
          reasonCodes: Object.freeze(["PAID_STAGING_REGULAR_QUEUE_CONFLICT"]),
        });
      }
      const existing = itemForTarget(facts, ref, key);
      if (existing && existing.status === "queued" && existing.queueGroupId) {
        return Object.freeze({
          articleRef: ref,
          articleId: ref.articleId,
          itemId: existing.itemId,
          batchId: existing.batchId,
          targetKey: key,
          status: "idempotent",
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
      const activeTargetKeys = Object.keys(workflow.targetFacts || {});
      if (activeTargetKeys.some(function (activeTargetKey) { return activeTargetKey !== key; })) {
        return Object.freeze({
          articleRef: ref,
          articleId: ref.articleId,
          targetKey: key,
          status: "conflict",
          reasonCode: "ARTICLE_ACTIVE_TARGET_CONFLICT",
        });
      }
      if (!workflow.operations.queue.allowed) {
        return Object.freeze({
          articleRef: ref,
          articleId: ref.articleId,
          targetKey: key,
          status: "conflict",
          reasonCode: workflow.operations.queue.reasonCodes[0] || "ARTICLE_OPERATION_FROZEN",
        });
      }
      return Object.freeze({ articleRef: ref, articleId: ref.articleId, targetKey: key, status: "queueable" });
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
    const target = targetFrom(input);
    const refs = refsFrom(input);
    const queueConfig = queueConfigFrom(input);
    const platform = platformList().find(function (candidate) { return candidate.id === target.platformId; });
    const account = accountProfileResolver({
      accountProfileId: target.accountProfileId,
      platformId: target.platformId,
    });
    const targetSnapshotV1 = domain.parseTargetSnapshotV1({
      version: 1,
      kind: "platform",
      platformId: target.platformId,
      platformName: (platform && platform.displayName) || target.platformId,
      accountProfileId: target.accountProfileId,
      accountLabel: account.displayName,
    });
    const customerSnapshotsV1 = Object.freeze(Object.fromEntries(
      refs.map(function (ref) {
        return [
          ref.clientId,
          domain.parseCustomerSnapshotV1(clientSnapshotResolver(ref.clientId)),
        ];
      }),
    ));
    const result = coordinator.admitRegularQueueItems({
      articleRefs: refs,
      target,
      targetSnapshotV1,
      customerSnapshotsV1,
      queueConfig,
    });
    return Object.freeze(Object.assign({}, result, {
      target,
      articleRefs: Object.freeze(refs),
    }));
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
    return Object.freeze(Object.assign({}, result, {
      items: Object.freeze(result.items || []),
    }));
  }

  return Object.freeze({
    previewRegularQueueAdmission,
    admitRegularQueueItems,
    removePendingQueueItems,
  });
}

module.exports = { createRegularQueueApplication };
