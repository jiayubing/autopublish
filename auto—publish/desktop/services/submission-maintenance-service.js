"use strict";

const path = require("node:path");
const {
  createSubmissionTargetCatalog,
} = require("./submission-target-catalog");
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
const { createSubmissionCleanup } = require("./submission-cleanup");
const {
  createPreparedSubmissionRecovery,
} = require("./prepared-submission-recovery");

function fail(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function createSubmissionMaintenanceService(options) {
  const value = options || {};
  if (!value.operationalStore) throw fail("OPERATIONAL_STORE_REQUIRED");
  if (!value.contentStore) throw fail("CONTENT_STORE_REQUIRED");
  const workspaceRoot = path.resolve(value.workspaceRoot || process.cwd());
  const inputRoot = path.resolve(
    (value.paths && value.paths.input) ||
      path.join(workspaceRoot, ".autopublish", "input"),
  );
  // This service is the compatibility owner for artifacts created by the retired
  // physical queue. No current submission path may infer queue-import support
  // from this opt-in.
  const targetCatalog = createSubmissionTargetCatalog({
    directoryEntries: value.directoryEntries,
    allowLegacyCompatibility: true,
  });

  function queuePaths(payload) {
    const item = payload || {};
    const platform = targetCatalog
      .queueTargets()
      .find(
        (candidate) =>
          candidate.id === item.targetPlatformId &&
          candidate.contentQueueImport === true,
      );
    if (
      !platform ||
      typeof item.filename !== "string" ||
      !item.filename ||
      path.basename(item.filename) !== item.filename ||
      path.isAbsolute(item.filename)
    )
      throw fail("CONTENT_SUBMISSION_QUEUE_ITEM_INVALID");
    const directory = path.resolve(
      inputRoot,
      platform.scanDir || platform.id,
    );
    const filePath = path.resolve(directory, item.filename);
    if (path.dirname(filePath) !== directory)
      throw fail("CONTENT_SUBMISSION_QUEUE_ITEM_INVALID");
    return { filePath, sidecarPath: filePath + ".submission.json" };
  }

  const preparedRecovery = createPreparedSubmissionRecovery({
    inputRoot,
    operationalStore: value.operationalStore,
    queuePaths,
  });
  const projection = createSubmissionItemProjection({
    workspaceRoot,
    operationalStore: value.operationalStore,
    queuePaths,
  });
  const policy = createSubmissionActionPolicy({ projection });
  const files = createSubmissionOperationFiles({
    inputRoot,
    operationalStore: value.operationalStore,
  });
  const actionRecovery = createSubmissionActionRecovery({
    operationalStore: value.operationalStore,
    projection,
    policy,
    files,
    staging: createSubmissionOperationStaging({ files }),
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
  return Object.freeze({
    previewTrashedArticleQueueResidue:
      cleanup.previewTrashedArticleQueueResidue,
    cleanupTrashedArticleQueueResidue:
      cleanup.cleanupTrashedArticleQueueResidue,
    listArchiveFailures: cleanup.listArchiveFailures,
    recoverPreparedBatches: preparedRecovery.recoverPreparedBatches,
  });
}

module.exports = { createSubmissionMaintenanceService };