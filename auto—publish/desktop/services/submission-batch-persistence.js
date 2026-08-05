"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

function fail(code, message) {
  const error = new Error(message || code);
  error.code = code;
  return error;
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
    const created = value.operationalStore.createSubmissionBatch({
      batchId,
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
    });

    const persistedItems = [];
    const queuedFiles = [];
    try {
      queued.forEach((candidate, index) => {
        const files = queuePaths(candidate);
        queuedFiles.push(files);
        fs.mkdirSync(path.dirname(files.filePath), { recursive: true });
        const sidecar = {
          version: 2,
          submissionBatchId: created.batchId,
          generatedArticleId: candidate.articleId,
          clientId: preview.clientId,
          targetPlatform: candidate.targetPlatformId,
          targetPlatformId: candidate.targetPlatformId,
          accountProfileId: candidate.accountProfileId,
          filename: candidate.filename,
          contentHash: candidate.contentHash,
          status: "queued",
          queuedAt: new Date().toISOString(),
        };
        value.writePairAtomic(
          files.filePath,
          candidate.markdown,
          files.sidecarPath,
          JSON.stringify(sidecar, null, 2) + "\n",
        );
        persistedItems.push(
          Object.assign({}, candidate, {
            filePath: files.filePath,
            sidecarPath: files.sidecarPath,
            itemId: created.items[index].itemId,
          }),
        );
      });
    } catch (error) {
      queuedFiles.forEach((files) => {
        for (const filename of [files.sidecarPath, files.filePath]) {
          try {
            fs.unlinkSync(filename);
          } catch (_) {}
        }
      });
      throw error;
    }

    if (typeof value.onDataInvalidated === "function")
      value.onDataInvalidated("SUBMISSION_BATCH_CREATED");
    return Object.assign({}, preview, {
      batchId: created.batchId,
      createdCount: queued.length,
      idempotentCount: 0,
      items: persistedItems.map((candidate) => {
        const copy = Object.assign({}, candidate);
        delete copy.markdown;
        return copy;
      }),
    });
  }

  return Object.freeze({ createBatch, queuePaths });
}

module.exports = { createSubmissionBatchPersistence };
