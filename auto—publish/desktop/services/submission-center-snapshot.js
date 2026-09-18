"use strict";

function fail(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

function frozenClone(value) {
  return deepFreeze(clone(value));
}

function queryFrom(input) {
  const value = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  if (Object.keys(value).some((key) => !["clientId", "page", "pageSize"].includes(key)))
    throw fail("SUBMISSION_CENTER_QUERY_INVALID");
  const clientId = value.clientId === undefined ? null : value.clientId;
  if (clientId !== null && (typeof clientId !== "string" || !clientId.trim() || /[\\/\x00-\x1f\x7f]/.test(clientId)))
    throw fail("SUBMISSION_CENTER_CLIENT_INVALID");
  const page = value.page === undefined ? 1 : value.page;
  const pageSize = value.pageSize === undefined ? 100 : value.pageSize;
  if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 500)
    throw fail("SUBMISSION_CENTER_QUERY_INVALID");
  return { clientId: clientId === null ? null : clientId.trim(), page, pageSize };
}

function clientIdFrom(input) {
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    Object.keys(input).length !== 1 ||
    typeof input.clientId !== "string" ||
    !input.clientId.trim() ||
    /[\\/\x00-\x1f\x7f]/.test(input.clientId)
  )
    throw fail("SUBMISSION_CENTER_CLIENT_INVALID");
  return input.clientId.trim();
}

function targetLabel(item) {
  const platform = item.displayName || item.platformId || "未指定平台";
  let account = item.accountProfileId || null;
  if (!account && typeof item.targetKey === "string") {
    const match = /(?:^|:)account:([^:]+)$/.exec(item.targetKey);
    account = match ? match[1] : null;
  }
  return `${platform} / ${account || "账号未记录"}`;
}

function pick(value, fields) {
  const source = value && typeof value === "object" ? value : {};
  return Object.fromEntries(
    fields
      .filter(function (field) {
        return Object.prototype.hasOwnProperty.call(source, field);
      })
      .map(function (field) {
        return [field, source[field]];
      }),
  );
}

function projectAttentionItem(value) {
  return pick(value, [
    "attentionId", "kind", "owner", "freeze", "resolutionPriority",
    "safeFacts", "articleId", "titleSnapshot", "clientId", "platformId",
    "displayName", "batchId", "publicationId", "attemptId",
    "orderCreationAttemptId", "orderId", "accountProfileId", "targetKey",
    "jobId", "remoteId", "remoteUrl", "transactionId", "status",
    "reasonCode", "pairState", "recommendedAction", "allowedActions",
    "updatedAt", "message",
  ]);
}

function projectPaidItem(value) {
  const source = value && typeof value === "object" ? value : {};
  const article = source.articleIdentityV1 || source.articleRef || {};
  const result = {
    itemId: source.itemId,
    articleRef: {
      clientId: article.clientId,
      articleId: article.articleId,
    },
    status: source.status,
    phase: source.phase,
  };
  if (typeof source.title === "string") result.title = source.title;
  return result;
}

function projectPaidBatch(value) {
  const source = value && typeof value === "object" ? value : {};
  const actions = source.actions || {};
  const result = {
    batchId: source.batchId,
    mediaResourceId: source.mediaResourceId,
    status: source.status,
    pauseIntent: source.pauseIntent,
    runState: source.runState,
    actions: {
      canStart: actions.canStart === true,
      canPause: actions.canPause === true,
      ...(Object.prototype.hasOwnProperty.call(actions, "canCancelRemaining")
        ? { canCancelRemaining: actions.canCancelRemaining === true }
        : {}),
    },
    articleCount: source.articleCount,
    quotedPrice: source.quotedPrice,
    estimatedTotal: source.estimatedTotal,
    createdAt: source.createdAt,
    updatedAt: source.updatedAt,
    items: Array.isArray(source.items) ? source.items.map(projectPaidItem) : [],
  };
  if (typeof source.mediaName === "string") result.mediaName = source.mediaName;
  if (Number.isInteger(source.createdOrderCount))
    result.createdOrderCount = source.createdOrderCount;
  if (Number.isInteger(source.remainingCount))
    result.remainingCount = source.remainingCount;
  if (source.currentItem !== undefined)
    result.currentItem = source.currentItem
      ? projectPaidItem(source.currentItem)
      : null;
  if (source.pauseReason !== undefined) result.pauseReason = source.pauseReason;
  return result;
}

function projectRegular(groups, clientId) {
  if (!Array.isArray(groups)) throw fail("SUBMISSION_CENTER_SNAPSHOT_INVALID");
  return groups.map(function (group) {
    const current = group && group.current;
    const remaining = group && group.remaining;
    if (!group || !Array.isArray(remaining))
      throw fail("SUBMISSION_CENTER_SNAPSHOT_INVALID");
    const allItems = [current].concat(remaining).filter(Boolean);
    if (allItems.some(function (item) {
      return !item.articleRef || (clientId && item.articleRef.clientId !== clientId);
    }))
      throw fail("SUBMISSION_CENTER_SNAPSHOT_INVALID");
    function projectItem(item, kind) {
      if (!item) return null;
      const projected = {
        itemId: item.itemId,
        batchId: item.batchId,
        articleId: item.articleId,
        articleRef: item.articleRef,
        articleSummary: item.articleSummary,
        regularPublicationAttemptId: item.regularPublicationAttemptId,
      };
      if (kind === "current") projected.phase = item.phase;
      else projected.position = item.position;
      return projected;
    }
    const remainingCount = Number.isInteger(group.remainingCount)
      ? group.remainingCount
      : remaining.length;
    return {
      queueGroupId: group.queueGroupId,
      platformId: group.platformId,
      accountProfileId: group.accountProfileId,
      imageCount: group.imageCount,
      submissionIntervalSeconds: group.submissionIntervalSeconds,
      imagePublishingSupported: group.imagePublishingSupported,
      runState: group.runState,
      pauseIntent: group.pauseIntent,
      current: projectItem(current, "current"),
      remaining: remaining.map(function (item) { return projectItem(item, "remaining"); }),
      remainingCount,
      actions: group.actions,
      revision: group.revision,
      createdAt: group.createdAt,
      updatedAt: group.updatedAt,
    };
  });
}

function projectPaid(raw, clientId) {
  const values = raw && Array.isArray(raw.items) ? raw.items : raw;
  if (!Array.isArray(values)) throw fail("SUBMISSION_CENTER_SNAPSHOT_INVALID");
  return values.map(projectPaidBatch).map(function (batch) {
    const items = [batch.currentItem].concat(batch.items || []).filter(Boolean);
    if (items.some(function (item) {
      return !item.articleRef || (clientId && item.articleRef.clientId !== clientId);
    }))
      throw fail("SUBMISSION_CENTER_SNAPSHOT_INVALID");
    function item(value) {
      if (!value) return null;
      const result = {
        itemId: value.itemId,
        articleRef: value.articleRef,
        status: value.status,
        phase: value.phase,
      };
      if (value.title !== undefined) result.title = value.title;
      return result;
    }
    const result = {
      batchId: batch.batchId,
      mediaResourceId: batch.mediaResourceId,
      status: batch.status,
      pauseIntent: batch.pauseIntent,
      runState: batch.runState,
      actions: batch.actions,
      articleCount: batch.articleCount,
      createdOrderCount: batch.createdOrderCount,
      remainingCount: batch.remainingCount,
      currentItem: item(batch.currentItem),
      pauseReason: batch.pauseReason,
      quotedPrice: batch.quotedPrice,
      estimatedTotal: batch.estimatedTotal,
      createdAt: batch.createdAt,
      updatedAt: batch.updatedAt,
      items: (batch.items || []).map(item),
    };
    if (batch.mediaName !== undefined) result.mediaName = batch.mediaName;
    return result;
  });
}

function isPaidWorkbenchBatch(batch) {
  return batch.status === "needs_attention" ||
    batch.actions.canStart === true ||
    batch.actions.canPause === true ||
    batch.actions.canCancelRemaining === true;
}

function projectAttention(raw, clientId) {
  if (!raw || !Array.isArray(raw.items))
    throw fail("SUBMISSION_CENTER_SNAPSHOT_INVALID");
  return raw.items.map(function (item) {
    if (clientId && item.clientId !== clientId)
      throw fail("SUBMISSION_CENTER_SNAPSHOT_INVALID");
    return Object.assign(projectAttentionItem(item), {
      targetLabel: targetLabel(item),
    });
  });
}

function createSubmissionCenterSnapshot(options) {
  const opts = options || {};
  for (const name of [
    "getRevision",
    "getWorkspaceRuntimeId",
    "validateClient",
    "listRegularQueueGroups",
    "listPaidMediaBatches",
    "listAttention",
  ]) {
    if (typeof opts[name] !== "function")
      throw fail("SUBMISSION_CENTER_DEPENDENCY_REQUIRED");
  }
  const cache = new Map();
  const inFlight = new Map();
  let generation = 0;
  const cacheRevision = (clientId, revision) => Number(
    typeof opts.getCacheRevision === "function" ? opts.getCacheRevision(clientId) : revision,
  );

  async function attempt(clientId, knownRevision, queryPage) {
    const revisionBefore = knownRevision === undefined
      ? Number(opts.getRevision())
      : knownRevision;
    if (!Number.isSafeInteger(revisionBefore) || revisionBefore < 0)
      throw fail("SUBMISSION_CENTER_SNAPSHOT_INVALID");
    const versionBefore = cacheRevision(clientId, revisionBefore);
    const settled = await Promise.allSettled([
      Promise.resolve().then(() => opts.listRegularQueueGroups({ page: queryPage.page, pageSize: queryPage.pageSize, ...(clientId ? { clientId } : {}) })),
      Promise.resolve().then(() => opts.listPaidMediaBatches({ page: queryPage.page, pageSize: queryPage.pageSize, ...(clientId ? { clientId } : {}) })),
      Promise.resolve().then(() => opts.listAttention({ ...(clientId ? { clientId } : {}) })),
    ]);
    const failures = [];
    const valueFor = (index, section, fallback) => {
      const result = settled[index];
      if (result.status === "fulfilled") return result.value;
      failures.push({ section, code: result.reason && result.reason.code ? result.reason.code : "SUBMISSION_CENTER_QUERY_FAILED" });
      return fallback;
    };
    const regularRaw = valueFor(0, "regular", []);
    const paidRaw = valueFor(1, "paid", { items: [] });
    const attentionRaw = valueFor(2, "attention", { items: [] });
    const revisionAfter = Number(opts.getRevision());
    const regularIsPage = Boolean(regularRaw && !Array.isArray(regularRaw) && Object.prototype.hasOwnProperty.call(regularRaw, "total"));
    const regularGroups = projectRegular(regularIsPage ? regularRaw.items : regularRaw, clientId);
    const paidBatches = projectPaid(paidRaw, clientId).filter(
      isPaidWorkbenchBatch,
    );
    const attentionItems = projectAttention(attentionRaw, clientId);
    if (regularIsPage && (!Number.isSafeInteger(regularRaw.total) || regularRaw.total < regularGroups.length || regularGroups.length > queryPage.pageSize || regularRaw.page !== queryPage.page || regularRaw.pageSize !== queryPage.pageSize))
      throw fail("SUBMISSION_CENTER_SNAPSHOT_INVALID");
    const regularItems = regularIsPage && Number.isInteger(regularRaw.regularItems)
      ? regularRaw.regularItems
      : regularGroups.reduce(function (total, group) {
          return total + (group.current ? 1 : 0) + (Number.isInteger(group.remainingCount) ? group.remainingCount : group.remaining.length);
        }, 0);
    const paidIsPage = paidRaw && Object.prototype.hasOwnProperty.call(paidRaw, "total");
    if (paidIsPage && (!Number.isSafeInteger(paidRaw.total) || paidRaw.total < paidBatches.length || paidBatches.length > queryPage.pageSize || paidRaw.page !== queryPage.page || paidRaw.pageSize !== queryPage.pageSize))
      throw fail("SUBMISSION_CENTER_SNAPSHOT_INVALID");
    const paidBatchesCount = paidIsPage ? paidRaw.total : paidBatches.length;
    const regularGroupCount = regularIsPage ? regularRaw.total : regularGroups.length;
    const totalCounts = {
      regularItems,
      paidBatches: paidBatchesCount,
      attentionItems: attentionItems.length,
      total: regularItems + paidBatchesCount + attentionItems.length,
    };
    const start = (queryPage.page - 1) * queryPage.pageSize;
    const end = start + queryPage.pageSize;
    const regularPage = regularIsPage ? regularGroups : regularGroups.slice(start, end);
    const paidPage = paidIsPage ? paidBatches : paidBatches.slice(start, end);
    const attentionPage = attentionItems.slice(start, end);
    return {
      revisionBefore,
      revisionAfter,
      versionBefore,
      versionAfter: cacheRevision(clientId, revisionAfter),
      snapshot: {
        schemaVersion: 1,
        clientId,
        revision: revisionBefore,
        regular: { groups: regularPage },
        paid: { batches: paidPage },
        attention: { items: attentionPage },
        counts: totalCounts,
        page: queryPage.page,
        pageSize: queryPage.pageSize,
        hasMore: end < Math.max(regularGroupCount, paidBatchesCount, attentionItems.length),
        failures,
      },
    };
  }

  async function get(input) {
    const query = queryFrom(input);
    const clientId = query.clientId;
    try {
      if (clientId) await opts.validateClient(clientId);
    } catch (error) {
      if (error && error.code === "CLIENT_NOT_FOUND")
        throw fail("SUBMISSION_CENTER_CLIENT_INVALID");
      throw fail("SUBMISSION_CENTER_QUERY_FAILED");
    }
    const revision = Number(opts.getRevision());
    const version = cacheRevision(clientId, revision);
    const key = JSON.stringify([opts.getWorkspaceRuntimeId(), clientId, query.page, query.pageSize]);
    const cached = cache.get(key);
    if (cached && cached.version === version) return frozenClone({ ...cached.snapshot, revision });
    const pendingKey = JSON.stringify([key, version, generation]);
    let pending = inFlight.get(pendingKey);
    if (!pending) {
      const startedGeneration = generation;
      pending = Promise.resolve().then(async () => {
        try {
          let result = await attempt(clientId, revision, query);
          if (result.versionBefore !== result.versionAfter) result = await attempt(clientId, undefined, query);
          if (result.versionBefore !== result.versionAfter || generation !== startedGeneration)
            throw fail("SUBMISSION_CENTER_SNAPSHOT_STALE");
          const snapshot = frozenClone({ ...result.snapshot, revision: result.revisionAfter });
          if (!snapshot.failures.length) {
            cache.delete(key);
            cache.set(key, { version: result.versionAfter, snapshot });
            if (cache.size > 64) cache.delete(cache.keys().next().value);
          }
          return snapshot;
        } catch (error) {
          if (error && [
            "SUBMISSION_CENTER_SNAPSHOT_STALE",
            "SUBMISSION_CENTER_SNAPSHOT_INVALID",
          ].includes(error.code)) throw error;
          throw fail("SUBMISSION_CENTER_QUERY_FAILED");
        }
      }).finally(() => {
        if (inFlight.get(pendingKey) === pending) inFlight.delete(pendingKey);
      });
      inFlight.set(pendingKey, pending);
    }
    return frozenClone(await pending);
  }

  return Object.freeze({ get, clear: function () { generation += 1; cache.clear(); inFlight.clear(); } });
}

module.exports = { createSubmissionCenterSnapshot };
