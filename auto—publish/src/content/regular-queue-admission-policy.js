"use strict";

const {
  ACTIVE_TARGET_STATUSES,
} = require("./article-lifecycle-facts");

function evaluateRegularQueueAdmission(input) {
  const value = input || {};
  const articleRef = value.articleRef || {};
  const articleId = articleRef.articleId;
  const targetKey = value.targetKey;
  const workflow = value.workflow || {};
  const submissionItems = Array.isArray(value.submissionItems)
    ? value.submissionItems
    : [];

  const existing =
    submissionItems.find(function (item) {
      return (
        item &&
        item.articleId === articleId &&
        item.targetKey === targetKey &&
        item.status === "queued" &&
        item.queueGroupId
      );
    }) || null;

  const activeTargetKeys = Object.entries(workflow.targetFacts || {})
    .filter(function (entry) {
      const fact = entry[1];
      return ACTIVE_TARGET_STATUSES.has(fact && fact.status);
    })
    .map(function (entry) {
      return entry[0];
    });

  if (
    activeTargetKeys.some(function (activeTargetKey) {
      return activeTargetKey !== targetKey;
    })
  ) {
    return Object.freeze({
      articleRef,
      articleId,
      targetKey,
      status: "conflict",
      reasonCode: "ARTICLE_ACTIVE_TARGET_CONFLICT",
    });
  }

  if (existing) {
    return Object.freeze({
      articleRef,
      articleId,
      itemId: existing.itemId,
      batchId: existing.batchId,
      targetKey,
      queueGroupId: existing.queueGroupId,
      status: "idempotent",
    });
  }

  const queueOperation =
    workflow.operations && workflow.operations.queue
      ? workflow.operations.queue
      : null;
  if (!queueOperation || queueOperation.allowed !== true) {
    const reasonCodes =
      queueOperation && Array.isArray(queueOperation.reasonCodes)
        ? queueOperation.reasonCodes
        : [];
    return Object.freeze({
      articleRef,
      articleId,
      targetKey,
      status: "conflict",
      reasonCode: reasonCodes[0] || "ARTICLE_OPERATION_FROZEN",
    });
  }

  return Object.freeze({
    articleRef,
    articleId,
    targetKey,
    status: "queueable",
  });
}

module.exports = { evaluateRegularQueueAdmission };
