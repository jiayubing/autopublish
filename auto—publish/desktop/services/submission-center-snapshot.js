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
      return !item.articleRef || item.articleRef.clientId !== clientId;
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
    return {
      queueGroupId: group.queueGroupId,
      platformId: group.platformId,
      accountProfileId: group.accountProfileId,
      imageCount: group.imageCount,
      imagePublishingSupported: group.imagePublishingSupported,
      runState: group.runState,
      pauseIntent: group.pauseIntent,
      current: projectItem(current, "current"),
      remaining: remaining.map(function (item) { return projectItem(item, "remaining"); }),
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
      return !item.articleRef || item.articleRef.clientId !== clientId;
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

function projectAttention(raw, clientId) {
  if (!raw || !Array.isArray(raw.items))
    throw fail("SUBMISSION_CENTER_SNAPSHOT_INVALID");
  return raw.items.map(function (item) {
    if (item.clientId !== clientId)
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

  async function attempt(clientId, knownRevision) {
    const revisionBefore = knownRevision === undefined
      ? Number(opts.getRevision())
      : knownRevision;
    if (!Number.isSafeInteger(revisionBefore) || revisionBefore < 0)
      throw fail("SUBMISSION_CENTER_SNAPSHOT_INVALID");
    const [regularRaw, paidRaw, attentionRaw] = await Promise.all([
      opts.listRegularQueueGroups({ clientId }),
      opts.listPaidMediaBatches({ clientId }),
      opts.listAttention({ clientId }),
    ]);
    const revisionAfter = Number(opts.getRevision());
    const regularGroups = projectRegular(regularRaw, clientId);
    const paidBatches = projectPaid(paidRaw, clientId);
    const attentionItems = projectAttention(attentionRaw, clientId);
    const regularItems = regularGroups.reduce(function (total, group) {
      return total + (group.current ? 1 : 0) + group.remaining.length;
    }, 0);
    const paidBatchesCount = paidBatches.filter(function (batch) {
      return batch.status === "needs_attention" ||
        batch.actions.canStart === true ||
        batch.actions.canPause === true ||
        batch.actions.canCancelRemaining === true;
    }).length;
    const counts = {
      regularItems,
      paidBatches: paidBatchesCount,
      attentionItems: attentionItems.length,
      total: regularItems + paidBatchesCount + attentionItems.length,
    };
    return {
      revisionBefore,
      revisionAfter,
      snapshot: {
        schemaVersion: 1,
        clientId,
        revision: revisionBefore,
        regular: { groups: regularGroups },
        paid: { batches: paidBatches },
        attention: { items: attentionItems },
        counts,
      },
    };
  }

  async function get(input) {
    const clientId = clientIdFrom(input);
    try {
      await opts.validateClient(clientId);
    } catch (error) {
      if (error && error.code === "CLIENT_NOT_FOUND")
        throw fail("SUBMISSION_CENTER_CLIENT_INVALID");
      throw fail("SUBMISSION_CENTER_QUERY_FAILED");
    }
    const revision = Number(opts.getRevision());
    const key = `${opts.getWorkspaceRuntimeId()}\u0000${clientId}\u0000${revision}`;
    if (cache.has(key)) return frozenClone(cache.get(key));
    try {
      let result = await attempt(clientId, revision);
      if (result.revisionBefore !== result.revisionAfter) result = await attempt(clientId);
      if (result.revisionBefore !== result.revisionAfter)
        throw fail("SUBMISSION_CENTER_SNAPSHOT_STALE");
      const finalKey = `${opts.getWorkspaceRuntimeId()}\u0000${clientId}\u0000${result.revisionBefore}`;
      cache.clear();
      cache.set(finalKey, frozenClone(result.snapshot));
      return frozenClone(result.snapshot);
    } catch (error) {
      if (error && [
        "SUBMISSION_CENTER_SNAPSHOT_STALE",
        "SUBMISSION_CENTER_SNAPSHOT_INVALID",
      ].includes(error.code)) throw error;
      throw fail("SUBMISSION_CENTER_QUERY_FAILED");
    }
  }

  return Object.freeze({ get, clear: function () { cache.clear(); } });
}

module.exports = { createSubmissionCenterSnapshot };
