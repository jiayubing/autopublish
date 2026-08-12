"use strict";

const path = require("node:path");
const {
  createSubmissionTargetCatalog,
} = require("./submission-target-catalog");
const { createSubmissionPreflight } = require("./submission-preflight");
const { createSubmissionBatchPlanner } = require("./submission-batch-planner");
const {
  createSubmissionBatchPersistence,
} = require("./submission-batch-persistence");
const { createSubmissionBatchReader } = require("./submission-batch-reader");
const {
  createSubmissionItemProjection,
} = require("./submission-item-projection");
const { createSubmissionActionPolicy } = require("./submission-action-policy");
const {
  createSubmissionOperationFiles,
} = require("./submission-operation-files");
const {
  createSubmissionOperationStaging,
} = require("./submission-operation-staging");
const {
  createSubmissionActionRecovery,
} = require("./submission-action-recovery");
const {
  createSubmissionResultReconciliation,
} = require("./submission-result-reconciliation");
const { createSubmissionQueueRemoval } = require("./submission-queue-removal");
const { createSubmissionCleanup } = require("./submission-cleanup");
const {
  createArticleSubmissionRemovalCoordinator,
} = require("./article-submission-removal-coordinator");
const { createSubmissionRetry } = require("./submission-retry");
const {
  articleMarkdown,
  writePairAtomic,
} = require("./submission-file-helpers");

function fail(code, message) {
  const error = new Error(message || code);
  error.code = code;
  return error;
}

const PAID_STAGING_ERROR_MAP = Object.freeze({
  ARTICLE_NOT_FOUND: "ARTICLE_NOT_FOUND",
  ARTICLE_NOT_SAVED: "ARTICLE_NOT_SAVED",
  ARTICLE_ACTIVE_TARGET_CONFLICT: "ACTIVE_PUBLICATION_CONFLICT",
  ACTIVE_PUBLICATION_CONFLICT: "ACTIVE_PUBLICATION_CONFLICT",
  PAID_STAGING_CONFLICT: "PAID_STAGING_REGULAR_QUEUE_CONFLICT",
  PUBLICATION_DUPLICATE: "ACTIVE_PUBLICATION_CONFLICT",
  PUBLICATION_TARGET_CONFLICT: "ACTIVE_PUBLICATION_CONFLICT",
  PUBLICATION_UNCERTAIN: "ACTIVE_PUBLICATION_CONFLICT",
  PAID_STAGING_ITEM_NOT_FOUND: "NOT_IN_STAGING",
  PAID_STAGING_MEDIA_RESOURCE_ID_INVALID: "INVALID_MEDIA_RESOURCE_ID",
  PAID_STAGING_ARTICLE_STATE_UNAVAILABLE: "STAGING_PERSISTENCE_FAILED",
  PAID_STAGING_CLIENT_SCOPE_INVALID: "STAGING_INPUT_INVALID",
  PAID_STAGING_ARTICLES_REQUIRED: "STAGING_INPUT_INVALID",
  PAID_STAGING_ARTICLE_IDENTITY_INVALID: "STAGING_INPUT_INVALID",
  PAID_STAGING_ARTICLES_INVALID: "STAGING_INPUT_INVALID",
});

function mapPaidStagingError(error) {
  const code = error && typeof error.code === "string" ? error.code : "";
  const mappedCode = PAID_STAGING_ERROR_MAP[code] ||
    (code === "STAGING_PERSISTENCE_FAILED" ? code : null);
  if (mappedCode) {
    if (mappedCode === code) return error;
    return fail(mappedCode);
  }
  return fail("STAGING_PERSISTENCE_FAILED");
}

function runPaidStaging(operation) {
  try {
    return operation();
  } catch (error) {
    throw mapPaidStagingError(error);
  }
}

function assertSavedPaidStagingArticles(contentStore, input) {
  const refs = input && input.articleRefs;
  if (!Array.isArray(refs) || refs.length === 0) return;
  for (const ref of refs) {
    let article;
    try {
      article = contentStore.getArticle(ref.clientId, ref.articleId);
    } catch (error) {
      throw mapPaidStagingError(error);
    }
    if (!article || article.status !== "saved") throw fail("ARTICLE_NOT_SAVED");
  }
}

function projectPaidStagingMutation(result) {
  const value = result || {};
  const items = Array.isArray(value.items)
    ? value.items.map(function (item) {
        const output = {
          articleRef: {
            clientId: item.articleRef && item.articleRef.clientId,
            articleId: item.articleRef && item.articleRef.articleId,
          },
          status: item.status,
          idempotent: item.idempotent === true,
        };
        if (item.status === "already-staged") output.reasonCode = "ALREADY_STAGED";
        if (item.status === "not-staged") output.reasonCode = "NOT_IN_STAGING";
        return Object.freeze(output);
      })
    : [];
        return Object.freeze({
    ...(value.addedCount === undefined ? {} : { addedCount: value.addedCount }),
    ...(value.removedCount === undefined ? {} : { removedCount: value.removedCount }),
    ...(value.updatedCount === undefined ? {} : { updatedCount: value.updatedCount }),
    idempotentCount: value.idempotentCount || 0,
    ...(value.selectedMediaResourceId === undefined
      ? {}
      : { selectedMediaResourceId: value.selectedMediaResourceId }),
    items: Object.freeze(items),
  });
}

function projectPaidStagingItems(clientId, items) {
  return Object.freeze({
    clientId,
    items: Object.freeze((items || []).map(function (item) {
      return Object.freeze({
        articleRef: Object.freeze({
          clientId: item.articleRef.clientId,
          articleId: item.articleRef.articleId,
        }),
        selectedMediaResourceId: item.selectedMediaResourceId,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      });
    })),
  });
}

function createOperationalContentSubmissionService(options) {
  const value = options || {};
  if (!value.operationalStore) throw fail("OPERATIONAL_STORE_REQUIRED");
  const root = path.resolve(value.workspaceRoot || process.cwd());
  if (!value.contentStore) throw fail("CONTENT_STORE_REQUIRED");
  const inputRoot = path.resolve(
    (value.paths && value.paths.input) ||
      path.join(root, ".autopublish", "input"),
  );
  const targetCatalog = createSubmissionTargetCatalog({
    platforms: value.platforms,
  });
  const preflight = createSubmissionPreflight();
  const batchPlanner = createSubmissionBatchPlanner({
    contentStore: value.contentStore,
    targetCatalog,
    preflight,
    articleMarkdown,
  });
  const batchPersistence = createSubmissionBatchPersistence({
    inputRoot,
    operationalStore: value.operationalStore,
    targetCatalog,
    writePairAtomic,
    onDataInvalidated: value.onDataInvalidated,
  });
  batchPersistence.recoverPreparedBatches();
  const batchReader = createSubmissionBatchReader({
    operationalStore: value.operationalStore,
  });
  const listPlatforms = batchPlanner.listPlatforms;
  const previewBatch = batchPlanner.previewBatch;
  const createBatch = (input) =>
    batchPersistence.createBatch(
      batchPlanner.previewBatch(batchPlanner.assertInput(input, true)),
    );
  const listBatches = batchReader.listBatches;
  const getBatch = batchReader.getBatch;

  const projection = createSubmissionItemProjection({
    workspaceRoot: root,
    operationalStore: value.operationalStore,
    queuePaths: batchPersistence.queuePaths,
  });
  const policy = createSubmissionActionPolicy({ projection });
  const operationFiles = createSubmissionOperationFiles({
    inputRoot,
    operationalStore: value.operationalStore,
  });
  const operationStaging = createSubmissionOperationStaging({
    files: operationFiles,
  });
  const actionRecovery = createSubmissionActionRecovery({
    operationalStore: value.operationalStore,
    projection,
    policy,
    files: operationFiles,
    staging: operationStaging,
    onDataInvalidated: value.onDataInvalidated,
  });
  const resultReconciliation = createSubmissionResultReconciliation({
    operationalStore: value.operationalStore,
    projection,
    files: operationFiles,
    staging: operationStaging,
    batchReader,
  });
  const queueRemoval = createSubmissionQueueRemoval({
    operationalStore: value.operationalStore,
    projection,
    policy,
    actionRecovery,
    onDataInvalidated: value.onDataInvalidated,
  });
  const cleanup = createSubmissionCleanup({
    operationalStore: value.operationalStore,
    contentStore: value.contentStore,
    projection,
    policy,
    actionRecovery,
    onDataInvalidated: value.onDataInvalidated,
  });
  const articleRemoval = createArticleSubmissionRemovalCoordinator({
    projection,
    policy,
    actionRecovery,
  });
  const retry = createSubmissionRetry({
    operationalStore: value.operationalStore,
    contentStore: value.contentStore,
    preflight,
    queuePaths: batchPersistence.queuePaths,
    retryFailedPublication: value.retryFailedPublication,
    onDataInvalidated: value.onDataInvalidated,
  });

  function addPaidSubmissionStaging(input) {
    assertSavedPaidStagingArticles(value.contentStore, input);
    return projectPaidStagingMutation(
      runPaidStaging(function () {
        return value.operationalStore.addPaidStagingItems(input);
      }),
    );
  }

  function removePaidSubmissionStaging(input) {
    return projectPaidStagingMutation(
      runPaidStaging(function () {
        return value.operationalStore.removePaidStagingItems(input);
      }),
    );
  }

  function setPaidSubmissionStagingMedia(input) {
    const request = input || {};
    return projectPaidStagingMutation(
      runPaidStaging(function () {
        return value.operationalStore.setPaidStagingMedia(
          request.articleRefs,
          request.mediaResourceId,
        );
      }),
    );
  }

  function getPaidSubmissionStaging(input) {
    const request = input || {};
    return runPaidStaging(function () {
      return projectPaidStagingItems(
        request.clientId,
        value.operationalStore.listPaidStagingItems(request),
      );
    });
  }

  return Object.freeze({
    listPlatforms,
    previewBatch,
    createBatch,
    listBatches,
    getBatch,
    buildSubmissionActionPlan: queueRemoval.buildSubmissionActionPlan,
    previewCancelBatch: queueRemoval.previewCancelBatch,
    cancelBatch: queueRemoval.cancelBatch,
    reconcileBatch: resultReconciliation.reconcileBatch,
    previewArticleRemovalImpact: articleRemoval.previewArticleRemovalImpact,
    cancelArticleSubmissionItem: articleRemoval.cancelArticleSubmissionItem,
    reconcileArticleRemovalAction:
      resultReconciliation.reconcileArticleRemovalAction,
    inspectSubmissionPair: resultReconciliation.inspectPair,
    evaluateItemAction: policy.evaluateItemAction,
    isSubmissionItemExecutable: policy.isSubmissionItemExecutable,
    previewTrashedArticleQueueResidue:
      cleanup.previewTrashedArticleQueueResidue,
    cleanupTrashedArticleQueueResidue:
      cleanup.cleanupTrashedArticleQueueResidue,
    previewRetryFailedPublication: retry.previewRetryFailedPublication,
    retryFailedPublication: retry.retryFailedPublication,
    listArchiveFailures: cleanup.listArchiveFailures,
    addPaidSubmissionStaging,
    removePaidSubmissionStaging,
    setPaidSubmissionStagingMedia,
    getPaidSubmissionStaging,
  });
}

module.exports = { createOperationalContentSubmissionService };
