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
    previews.push({ clientId: group.clientId, result });
  }

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

export async function admitBatchRegularSubmission(
  input,
  { admitRegularQueueItems },
) {
  if (typeof admitRegularQueueItems !== "function")
    throw new TypeError("admitRegularQueueItems is required");
  const groups = groupBatchArticleRefs(input?.articleRefs);
  if (!groups.length) throw new TypeError("At least one article is required");

  const results = [];
  const failures = [];
  for (const group of groups) {
    try {
      const result = await admitRegularQueueItems({
        articleRefs: group.articleRefs,
        platformId: input.platformId,
        accountProfileId: input.accountProfileId,
        autoStart: true,
      });
      if (unavailableResult(result))
        throw resultError("批量投稿提交结果已失效，请重试该客户。");
      results.push({ clientId: group.clientId, result });
    } catch (value) {
      failures.push(failureFrom(group.clientId, value));
    }
  }

  return Object.freeze({
    clientCount: groups.length,
    succeededClientIds: Object.freeze(results.map((item) => item.clientId)),
    failedClientIds: Object.freeze(failures.map((item) => item.clientId)),
    failures: Object.freeze(failures),
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
