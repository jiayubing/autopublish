"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const {
  createSubmissionBatchRecovery,
} = require("./submission-batch-recovery");

function fail(code, message) {
  const error = new Error(message || code);
  error.code = code;
  return error;
}

function fileMatches(filename, expected) {
  try {
    const stat = fs.lstatSync(filename);
    return (
      stat.isFile() &&
      !stat.isSymbolicLink() &&
      fs.readFileSync(filename, "utf8") === expected
    );
  } catch (_) {
    return false;
  }
}

function createSubmissionBatchPersistence(options) {
  const value = options || {};
  if (!value.operationalStore) throw fail("OPERATIONAL_STORE_REQUIRED");
  if (!value.targetCatalog) throw fail("SUBMISSION_TARGET_CATALOG_REQUIRED");
  if (typeof value.writePairAtomic !== "function")
    throw fail("SUBMISSION_QUEUE_WRITER_REQUIRED");
  const inputRoot = path.resolve(
    value.inputRoot || path.join(process.cwd(), "input"),
  );

  function queuePaths(payload) {
    const platform = value.targetCatalog
      .queueTargets()
      .find(
        (candidate) =>
          candidate.id === payload.targetPlatformId &&
          candidate.contentQueueImport === true,
      );
    if (
      !platform ||
      typeof payload.filename !== "string" ||
      !payload.filename ||
      path.basename(payload.filename) !== payload.filename ||
      path.isAbsolute(payload.filename)
    )
      throw fail("CONTENT_SUBMISSION_QUEUE_ITEM_INVALID");
    const directory = path.resolve(inputRoot, platform.scanDir || platform.id);
    const filePath = path.resolve(directory, payload.filename);
    if (path.dirname(filePath) !== directory)
      throw fail("CONTENT_SUBMISSION_QUEUE_ITEM_INVALID");
    return { filePath, sidecarPath: filePath + ".submission.json" };
  }

  const recovery = createSubmissionBatchRecovery({
    inputRoot,
    operationalStore: value.operationalStore,
    queuePaths,
  });

  function sidecarData(batchId, preview, candidate) {
    return {
      version: 2,
      submissionBatchId: batchId,
      generatedArticleId: candidate.articleId,
      clientId: preview.clientId,
      targetPlatformId: candidate.targetPlatformId,
      accountProfileId: candidate.accountProfileId,
      filename: candidate.filename,
      contentHash: candidate.contentHash,
      status: "queued",
      queuedAt: new Date().toISOString(),
    };
  }

  function createEntry(batchId, preview, candidate) {
    const files = queuePaths(candidate);
    const sidecar =
      JSON.stringify(sidecarData(batchId, preview, candidate), null, 2) + "\n";
    return {
      candidate,
      files,
      staged: recovery.stagingPaths(batchId, files),
      markdown: candidate.markdown,
      sidecar,
    };
  }

  function stageEntry(entry, root) {
    recovery.ensureDirectory(root, "CONTENT_SUBMISSION_STAGING_INVALID");
    recovery.ensureDirectory(
      path.dirname(entry.staged.filePath),
      "CONTENT_SUBMISSION_STAGING_INVALID",
    );
    value.writePairAtomic(
      entry.staged.filePath,
      entry.markdown,
      entry.staged.sidecarPath,
      entry.sidecar,
    );
  }

  function promoteEntry(entry) {
    recovery.ensureDirectory(
      path.dirname(entry.files.filePath),
      "CONTENT_SUBMISSION_QUEUE_INVALID",
    );
    recovery.moveOwnedFile(
      entry.staged.sidecarPath,
      entry.files.sidecarPath,
      (filename) => fileMatches(filename, entry.sidecar),
      "CONTENT_SUBMISSION_QUEUE_CONFLICT",
    );
    recovery.moveOwnedFile(
      entry.staged.filePath,
      entry.files.filePath,
      (filename) => fileMatches(filename, entry.markdown),
      "CONTENT_SUBMISSION_QUEUE_CONFLICT",
    );
  }

  function removeEntryFiles(entry) {
    recovery.removeOwnedFile(entry.files.sidecarPath, (filename) =>
      fileMatches(filename, entry.sidecar),
    );
    recovery.removeOwnedFile(entry.files.filePath, (filename) =>
      fileMatches(filename, entry.markdown),
    );
    recovery.removeOwnedFile(entry.staged.sidecarPath, (filename) =>
      fileMatches(filename, entry.sidecar),
    );
    recovery.removeOwnedFile(entry.staged.filePath, (filename) =>
      fileMatches(filename, entry.markdown),
    );
  }

  function durableBatchFor(batchId, preview, queued) {
    return {
      batchId,
      status: "prepared",
      items: queued.map((candidate) => ({
        articleId: candidate.articleId,
        target: {
          kind: "platform",
          platformId: candidate.targetPlatformId,
          accountProfileId: candidate.accountProfileId,
        },
        payload: {
          clientId: preview.clientId,
          targetPlatformId: candidate.targetPlatformId,
          accountProfileId: candidate.accountProfileId,
          sourcePlatformId: candidate.targetPlatformId,
          filename: candidate.filename,
          contentHash: candidate.contentHash,
        },
      })),
    };
  }

  function compensateCreatedBatch(batchId, entries) {
    entries.forEach(removeEntryFiles);
    recovery.cleanupStageRoot(recovery.stagingRoot(batchId));
    if (
      typeof value.operationalStore.discardPreparedSubmissionBatch !==
      "function"
    )
      throw fail("CONTENT_SUBMISSION_BATCH_RECOVERY_PROTOCOL_UNAVAILABLE");
    value.operationalStore.discardPreparedSubmissionBatch({ batchId });
  }

  function createBatch(preview) {
    if (!preview || !Array.isArray(preview.items))
      throw fail("CONTENT_SUBMISSION_BATCH_INPUT_INVALID");
    if (preview.missingArticleIds && preview.missingArticleIds.length)
      throw fail(
        "CONTENT_SUBMISSION_ARTICLE_NOT_FOUND",
        "Selected article was not found",
      );
    const queued = preview.items.filter(
      (candidate) => candidate.status === "queueable",
    );
    const batchId = `batch-${crypto.randomUUID()}`;
    const entries = queued.map((candidate) =>
      createEntry(batchId, preview, candidate),
    );
    if (
      entries.some(
        (entry) =>
          recovery.pathExists(entry.files.filePath) ||
          recovery.pathExists(entry.files.sidecarPath),
      )
    )
      throw fail(
        "CONTENT_SUBMISSION_QUEUE_CONFLICT",
        "Submission queue item already exists",
      );

    const root = recovery.stagingRoot(batchId);
    let created;
    let stageCreated = false;
    let queuedDurably = false;
    try {
      recovery.ensureDirectory(
        path.dirname(root),
        "CONTENT_SUBMISSION_STAGING_INVALID",
      );
      if (recovery.pathExists(root))
        throw fail("CONTENT_SUBMISSION_BATCH_RECOVERY_REQUIRED");
      recovery.ensureDirectory(root, "CONTENT_SUBMISSION_STAGING_INVALID");
      stageCreated = true;
      entries.forEach((entry) => stageEntry(entry, root));
      created = value.operationalStore.createSubmissionBatch(
        durableBatchFor(batchId, preview, queued),
      );
      if (
        !created ||
        created.batchId !== batchId ||
        !Array.isArray(created.items) ||
        created.items.length !== queued.length
      )
        throw fail("CONTENT_SUBMISSION_BATCH_PERSISTENCE_INVALID");
      if (typeof value.operationalStore.queueSubmissionBatch !== "function")
        throw fail("CONTENT_SUBMISSION_BATCH_RECOVERY_PROTOCOL_UNAVAILABLE");
      entries.forEach(promoteEntry);
      recovery.cleanupStageRoot(root);
      value.operationalStore.queueSubmissionBatch({ batchId });
      queuedDurably = true;
    } catch (error) {
      let compensationError = null;
      try {
        if (created && !queuedDurably) compensateCreatedBatch(batchId, entries);
        else if (!created && stageCreated) {
          entries.forEach(removeEntryFiles);
          recovery.cleanupStageRoot(root);
        }
      } catch (cleanupError) {
        compensationError = cleanupError;
      }
      if (compensationError && !error.compensationCode)
        error.compensationCode = compensationError.code || "UNKNOWN";
      throw error;
    }

    if (typeof value.onDataInvalidated === "function")
      value.onDataInvalidated("SUBMISSION_BATCH_CREATED");
    return Object.assign({}, preview, {
      batchId: created.batchId,
      createdCount: queued.length,
      idempotentCount: 0,
      items: entries.map((entry, index) => {
        const copy = Object.assign({}, entry.candidate, {
          filePath: entry.files.filePath,
          sidecarPath: entry.files.sidecarPath,
          itemId: created.items[index].itemId,
        });
        delete copy.markdown;
        return copy;
      }),
    });
  }

  return Object.freeze({
    createBatch,
    queuePaths,
    recoverPreparedBatches: recovery.recoverPreparedBatches,
  });
}

module.exports = { createSubmissionBatchPersistence };
