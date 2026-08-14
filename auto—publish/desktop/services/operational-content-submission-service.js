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
    lifecycleFacts: value.operationalStore,
    policy,
  });
  const retry = createSubmissionRetry({
    operationalStore: value.operationalStore,
    contentStore: value.contentStore,
    preflight,
    queuePaths: batchPersistence.queuePaths,
    retryFailedPublication: value.retryFailedPublication,
    onDataInvalidated: value.onDataInvalidated,
  });

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
  });
}

module.exports = { createOperationalContentSubmissionService };
