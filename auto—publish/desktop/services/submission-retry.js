"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");

function fail(code, message) {
  const error = new Error(message || code);
  error.code = code;
  return error;
}

function regularFile(filename) {
  try {
    const stat = fs.lstatSync(filename);
    return stat.isFile() && !stat.isSymbolicLink();
  } catch (_) {
    return false;
  }
}

function createSubmissionRetry(options) {
  const value = options || {};
  if (!value.operationalStore || !value.contentStore || !value.preflight)
    throw fail("SUBMISSION_RETRY_PORT_REQUIRED");
  if (typeof value.queuePaths !== "function")
    throw fail("SUBMISSION_QUEUE_PATH_PORT_REQUIRED");

  function failedPublicationRetryPlan(input) {
    const publicationId = input && input.publicationId;
    if (typeof publicationId !== "string" || !publicationId)
      throw fail("PUBLICATION_RETRY_INPUT_INVALID");
    const record = value.operationalStore.listPublicationRecords({
      publicationIds: [publicationId],
    })[0];
    const attempt =
      record && Array.isArray(record.attempts) && record.attempts.length
        ? record.attempts[record.attempts.length - 1]
        : null;
    if (
      !record ||
      record.status !== "failed" ||
      !attempt ||
      attempt.status !== "failed"
    )
      return {
        publicationId,
        requiresConfirmation: true,
        eligible: false,
        reasonCode: "PUBLICATION_RETRY_NOT_ELIGIBLE",
      };
    const matches = value.operationalStore
      .listSubmissionBatches({})
      .flatMap((batch) =>
        batch.items
          .filter(
            (item) =>
              item.status === "failed" &&
              item.articleId === record.articleId &&
              item.targetKey === record.targetKey &&
              item.payload &&
              item.payload.attemptId === attempt.attemptId,
          )
          .map((item) => ({ batch, item })),
      );
    if (matches.length !== 1)
      return {
        publicationId,
        requiresConfirmation: true,
        eligible: false,
        reasonCode: "PUBLICATION_RETRY_BATCH_ITEM_REQUIRED",
      };
    const { batch, item } = matches[0];
    const payload = item.payload || {};
    let article;
    try {
      article = value.contentStore.getArticle(payload.clientId, item.articleId);
    } catch (_) {
      return {
        publicationId,
        requiresConfirmation: true,
        eligible: false,
        reasonCode: "CONTENT_SUBMISSION_ARTICLE_NOT_FOUND",
      };
    }
    if (!value.preflight.check(article).eligible)
      return {
        publicationId,
        requiresConfirmation: true,
        eligible: false,
        reasonCode: "CONTENT_EXPORT_NOT_READY",
      };
    let paths;
    try {
      paths = value.queuePaths(payload);
    } catch (_) {
      return {
        publicationId,
        requiresConfirmation: true,
        eligible: false,
        reasonCode: "CONTENT_SUBMISSION_QUEUE_ITEM_INVALID",
      };
    }
    if (!regularFile(paths.filePath) || !regularFile(paths.sidecarPath))
      return {
        publicationId,
        requiresConfirmation: true,
        eligible: false,
        reasonCode: "CONTENT_SUBMISSION_QUEUE_ITEM_CHANGED",
      };
    const contentHash = crypto
      .createHash("sha256")
      .update(fs.readFileSync(paths.filePath))
      .digest("hex");
    if (contentHash !== payload.contentHash)
      return {
        publicationId,
        requiresConfirmation: true,
        eligible: false,
        reasonCode: "CONTENT_SUBMISSION_QUEUE_ITEM_CHANGED",
      };
    let sidecar;
    try {
      sidecar = JSON.parse(fs.readFileSync(paths.sidecarPath, "utf8"));
    } catch (_) {
      sidecar = null;
    }
    if (
      !sidecar ||
      sidecar.submissionBatchId !== batch.batchId ||
      sidecar.generatedArticleId !== item.articleId ||
      sidecar.accountProfileId !== payload.accountProfileId ||
      sidecar.targetPlatformId !== payload.targetPlatformId
    )
      return {
        publicationId,
        requiresConfirmation: true,
        eligible: false,
        reasonCode: "CONTENT_SUBMISSION_QUEUE_ITEM_CHANGED",
      };
    return {
      publicationId,
      requiresConfirmation: true,
      eligible: typeof value.retryFailedPublication === "function",
      reasonCode:
        typeof value.retryFailedPublication === "function"
          ? null
          : "PUBLICATION_RETRY_REQUIRES_WORKFLOW",
      task: {
        publicationId,
        batchId: batch.batchId,
        itemId: item.itemId,
        filename: payload.filename,
        sourcePlatformId: payload.sourcePlatformId,
        targetPlatformId: payload.targetPlatformId,
        accountProfileId: payload.accountProfileId,
      },
    };
  }

  function previewRetryFailedPublication(input) {
    const plan = failedPublicationRetryPlan(input);
    const result = Object.assign({}, plan);
    delete result.task;
    return result;
  }

  async function retryFailedPublication(input) {
    if (!input || input.confirmed !== true)
      throw fail("CONTENT_SUBMISSION_CONFIRMATION_REQUIRED");
    const plan = failedPublicationRetryPlan(input);
    if (!plan.eligible)
      throw fail(plan.reasonCode || "PUBLICATION_RETRY_NOT_ELIGIBLE");
    const result = await value.retryFailedPublication(plan.task);
    if (typeof value.onDataInvalidated === "function")
      value.onDataInvalidated("PUBLICATION_RETRIED");
    return result;
  }

  return Object.freeze({
    previewRetryFailedPublication,
    retryFailedPublication,
  });
}

module.exports = { createSubmissionRetry };
