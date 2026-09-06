"use strict";

function validArticleRef(value) {
  return Boolean(
    value &&
      typeof value.clientId === "string" &&
      value.clientId &&
      typeof value.articleId === "string" &&
      value.articleId,
  );
}

function canonicalRef(value) {
  if (!validArticleRef(value)) return null;
  return { clientId: value.clientId, articleId: value.articleId };
}

export function groupBatchArticleRefs(articleRefs = []) {
  const groups = new Map();
  const seen = new Set();
  for (const ref of articleRefs) {
    if (!validArticleRef(ref)) continue;
    const key = `${ref.clientId}:${ref.articleId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (!groups.has(ref.clientId))
      groups.set(ref.clientId, { clientId: ref.clientId, articleRefs: [] });
    groups.get(ref.clientId).articleRefs.push({
      clientId: ref.clientId,
      articleId: ref.articleId,
    });
  }
  return [...groups.values()];
}

function unavailableResult(value) {
  return !value || value.ignored === true || value.status === "stale";
}

function resultError(fallback) {
  const error = new Error(fallback);
  error.code = "BATCH_REGULAR_SUBMISSION_STALE";
  return error;
}

const COUNT_BY_STATUS = Object.freeze({
  queueable: "queueableCount",
  idempotent: "idempotentCount",
  missing: "missingCount",
  conflict: "conflictCount",
});

function refsForPreviewStatus(group, result, status) {
  const items = Array.isArray(result?.items) ? result.items : [];
  const refs = items
    .filter((item) => item && item.status === status)
    .map((item) => canonicalRef(item.articleRef) || canonicalRef({
      clientId: group.clientId,
      articleId: item?.articleId,
    }))
    .filter(Boolean);
  if (refs.length) return Object.freeze(refs);

  const countKey = COUNT_BY_STATUS[status];
  const count = countKey ? Number(result?.[countKey]) || 0 : 0;
  if (count === group.articleRefs.length)
    return Object.freeze(group.articleRefs.map((ref) => ({ ...ref })));
  return Object.freeze([]);
}

export async function previewBatchRegularSubmission(
  input,
  { previewRegularQueueAdmission },
) {
  if (typeof previewRegularQueueAdmission !== "function")
    throw new TypeError("previewRegularQueueAdmission is required");
  const groups = groupBatchArticleRefs(input?.articleRefs);
  if (!groups.length) throw new TypeError("At least one article is required");

  const previews = [];
  for (const group of groups) {
    const result = await previewRegularQueueAdmission({
      articleRefs: group.articleRefs,
      platformId: input.platformId,
      accountProfileId: input.accountProfileId,
    });
    if (unavailableResult(result))
      throw resultError("批量投稿预检结果已失效，请重试。");
    previews.push(Object.freeze({
      clientId: group.clientId,
      result,
      queueableArticleRefs: refsForPreviewStatus(group, result, "queueable"),
      idempotentArticleRefs: refsForPreviewStatus(group, result, "idempotent"),
      missingArticleRefs: refsForPreviewStatus(group, result, "missing"),
      conflictArticleRefs: refsForPreviewStatus(group, result, "conflict"),
    }));
  }

  const queueableArticleRefs = previews.flatMap((item) => item.queueableArticleRefs);
  const idempotentArticleRefs = previews.flatMap((item) => item.idempotentArticleRefs);
  const missingArticleRefs = previews.flatMap((item) => item.missingArticleRefs);
  const conflictArticleRefs = previews.flatMap((item) => item.conflictArticleRefs);
  const actionableClientIds = previews
    .filter((item) =>
      (Number(item.result.queueableCount) || 0) +
        (Number(item.result.idempotentCount) || 0) >
      0,
    )
    .map((item) => item.clientId);

  return Object.freeze({
    clientCount: groups.length,
    articleCount: groups.reduce((total, group) => total + group.articleRefs.length, 0),
    queueableCount: previews.reduce(
      (total, item) => total + (Number(item.result.queueableCount) || 0),
      0,
    ),
    idempotentCount: previews.reduce(
      (total, item) => total + (Number(item.result.idempotentCount) || 0),
      0,
    ),
    missingCount: previews.reduce(
      (total, item) => total + (Number(item.result.missingCount) || 0),
      0,
    ),
    conflictCount: previews.reduce(
      (total, item) => total + (Number(item.result.conflictCount) || 0),
      0,
    ),
    actionableClientIds: Object.freeze(actionableClientIds),
    queueableArticleRefs: Object.freeze(queueableArticleRefs),
    idempotentArticleRefs: Object.freeze(idempotentArticleRefs),
    missingArticleRefs: Object.freeze(missingArticleRefs),
    conflictArticleRefs: Object.freeze(conflictArticleRefs),
    previews: Object.freeze(previews),
  });
}

function failureFrom(clientId, value) {
  return Object.freeze({
    clientId,
    code:
      value && typeof value.code === "string"
        ? value.code
        : "BATCH_REGULAR_ADMISSION_FAILED",
    message:
      value instanceof Error && value.message
        ? value.message
        : "该客户投稿加入队列失败。",
  });
}

function uncertainFrom(clientId) {
  return Object.freeze({
    clientId,
    code: "BATCH_REGULAR_ADMISSION_UNCERTAIN",
    message: "该客户投稿提交结果未知，请先重新查询当前投稿事实。",
  });
}

function invalidationFrom(clientId, result) {
  return Object.freeze({
    clientId,
    missingCount: Number(result?.missingCount) || 0,
    conflictCount: Number(result?.conflictCount) || 0,
    message: "该客户文章在预检后发生变化，请重新预检当前投稿事实。",
  });
}

export async function admitBatchRegularSubmission(
  input,
  { admitRegularQueueItems },
) {
  if (typeof admitRegularQueueItems !== "function")
    throw new TypeError("admitRegularQueueItems is required");
  const groups = groupBatchArticleRefs(input?.articleRefs);
  if (!groups.length) throw new TypeError("At least one article is required");

  const results = [];
  const succeededClientIds = [];
  const failures = [];
  const uncertain = [];
  const invalidations = [];
  for (const group of groups) {
    try {
      const result = await admitRegularQueueItems({
        articleRefs: group.articleRefs,
        platformId: input.platformId,
        accountProfileId: input.accountProfileId,
        autoStart: true,
      });
      if (unavailableResult(result)) {
        uncertain.push(uncertainFrom(group.clientId));
        continue;
      }
      results.push({ clientId: group.clientId, result });
      if (
        (Number(result.missingCount) || 0) > 0 ||
        (Number(result.conflictCount) || 0) > 0
      ) {
        invalidations.push(invalidationFrom(group.clientId, result));
        continue;
      }
      succeededClientIds.push(group.clientId);
    } catch (value) {
      failures.push(failureFrom(group.clientId, value));
    }
  }

  return Object.freeze({
    clientCount: groups.length,
    succeededClientIds: Object.freeze(succeededClientIds),
    failedClientIds: Object.freeze(failures.map((item) => item.clientId)),
    uncertainClientIds: Object.freeze(uncertain.map((item) => item.clientId)),
    invalidatedClientIds: Object.freeze(invalidations.map((item) => item.clientId)),
    failures: Object.freeze(failures),
    uncertain: Object.freeze(uncertain),
    invalidations: Object.freeze(invalidations),
    admittedCount: results.reduce(
      (total, item) => total + (Number(item.result.admittedCount) || 0),
      0,
    ),
    idempotentCount: results.reduce(
      (total, item) => total + (Number(item.result.idempotentCount) || 0),
      0,
    ),
    missingCount: results.reduce(
      (total, item) => total + (Number(item.result.missingCount) || 0),
      0,
    ),
    conflictCount: results.reduce(
      (total, item) => total + (Number(item.result.conflictCount) || 0),
      0,
    ),
    results: Object.freeze(results),
  });
}
