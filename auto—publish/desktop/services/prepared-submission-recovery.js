"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const STAGING_DIRECTORY = ".submission-staging";

function fail(code, message) {
  const error = new Error(message || code);
  error.code = code;
  return error;
}

function lstatOrNull(filename) {
  try {
    return fs.lstatSync(filename);
  } catch (error) {
    if (error && error.code === "ENOENT") return null;
    throw error;
  }
}

function pathExists(filename) {
  return lstatOrNull(filename) !== null;
}

function assertDirectory(filename, code) {
  const stat = lstatOrNull(filename);
  if (stat && (!stat.isDirectory() || stat.isSymbolicLink()))
    throw fail(code || "CONTENT_SUBMISSION_STAGING_INVALID");
  return Boolean(stat);
}

function ensureDirectory(filename, code) {
  fs.mkdirSync(filename, { recursive: true });
  assertDirectory(filename, code);
}

function regularFile(filename) {
  const stat = lstatOrNull(filename);
  return Boolean(stat && stat.isFile() && !stat.isSymbolicLink());
}

function removeEmptyDirectory(filename, code) {
  if (!pathExists(filename)) return;
  assertDirectory(filename, code);
  if (fs.readdirSync(filename).length === 0) fs.rmdirSync(filename);
}

function fileHash(filename) {
  return crypto
    .createHash("sha256")
    .update(fs.readFileSync(filename))
    .digest("hex");
}

function ownedFileState(filename, owns) {
  if (!pathExists(filename)) return "absent";
  if (!regularFile(filename)) return "unexpected";
  return owns(filename) ? "owned" : "unexpected";
}

function moveOwnedFile(source, target, owns, code) {
  const sourceState = ownedFileState(source, owns);
  const targetState = ownedFileState(target, owns);
  if (sourceState === "unexpected" || targetState === "unexpected")
    throw fail(code || "CONTENT_SUBMISSION_BATCH_RECOVERY_CONFLICT");
  if (targetState === "owned") {
    if (sourceState === "owned") fs.unlinkSync(source);
    return;
  }
  if (sourceState !== "owned")
    throw fail(code || "CONTENT_SUBMISSION_BATCH_RECOVERY_CONFLICT");
  fs.renameSync(source, target);
}

function removeOwnedFile(filename, owns, code) {
  if (!pathExists(filename)) return;
  if (!regularFile(filename) || !owns(filename))
    throw fail(code || "CONTENT_SUBMISSION_BATCH_RECOVERY_CONFLICT");
  fs.unlinkSync(filename);
}

function createPreparedSubmissionRecovery(options) {
  const value = options || {};
  const inputRoot = path.resolve(value.inputRoot);
  if (!value.operationalStore || typeof value.queuePaths !== "function")
    throw fail("CONTENT_SUBMISSION_BATCH_RECOVERY_PROTOCOL_UNAVAILABLE");

  function stagingRoot(batchId) {
    if (typeof batchId !== "string" || !/^batch-[A-Za-z0-9-]+$/.test(batchId))
      throw fail("CONTENT_SUBMISSION_BATCH_RECOVERY_CONFLICT");
    const parent = path.resolve(inputRoot, STAGING_DIRECTORY);
    const root = path.resolve(parent, batchId);
    return root;
  }

  function stagingPaths(batchId, files) {
    const root = stagingRoot(batchId);
    const relative = path.relative(inputRoot, files.filePath);
    const filePath = path.resolve(root, relative);
    if (
      relative === ".." ||
      path.isAbsolute(relative) ||
      relative.startsWith(".." + path.sep)
    )
      throw fail("CONTENT_SUBMISSION_BATCH_RECOVERY_CONFLICT");
    return { filePath, sidecarPath: filePath + ".submission.json" };
  }

  function cleanupStageRoot(root) {
    if (!pathExists(root)) return;
    assertDirectory(root, "CONTENT_SUBMISSION_STAGING_INVALID");
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      const child = path.join(root, entry.name);
      if (entry.isSymbolicLink() || !entry.isDirectory())
        throw fail("CONTENT_SUBMISSION_STAGING_INVALID");
      removeEmptyDirectory(child, "CONTENT_SUBMISSION_STAGING_INVALID");
    }
    if (fs.readdirSync(root).length)
      throw fail("CONTENT_SUBMISSION_STAGING_INVALID");
    fs.rmdirSync(root);
    removeEmptyDirectory(
      path.dirname(root),
      "CONTENT_SUBMISSION_STAGING_INVALID",
    );
  }

  function preparedEntries(batch) {
    return (batch.items || []).map((stored) => {
      const payload = stored.payload || stored;
      const files = value.queuePaths(payload);
      const entry = {
        files,
        staged: stagingPaths(batch.batchId, files),
        articleId: stored.articleId,
        payload,
      };
      entry.ownsMain = (filename) => {
        try {
          return (
            regularFile(filename) && fileHash(filename) === payload.contentHash
          );
        } catch (_) {
          return false;
        }
      };
      entry.ownsSidecar = (filename) => {
        if (!regularFile(filename)) return false;
        try {
          const sidecar = JSON.parse(fs.readFileSync(filename, "utf8"));
          return (
            sidecar &&
            sidecar.version === 2 &&
            sidecar.submissionBatchId === batch.batchId &&
            sidecar.generatedArticleId === stored.articleId &&
            sidecar.clientId === payload.clientId &&
            sidecar.targetPlatformId === payload.targetPlatformId &&
            sidecar.accountProfileId === payload.accountProfileId &&
            sidecar.filename === payload.filename &&
            sidecar.contentHash === payload.contentHash
          );
        } catch (_) {
          return false;
        }
      };
      return entry;
    });
  }

  function state(entry) {
    const main = {
      final: ownedFileState(entry.files.filePath, entry.ownsMain),
      staged: ownedFileState(entry.staged.filePath, entry.ownsMain),
    };
    const sidecar = {
      final: ownedFileState(entry.files.sidecarPath, entry.ownsSidecar),
      staged: ownedFileState(entry.staged.sidecarPath, entry.ownsSidecar),
    };
    if (
      [main, sidecar].some((pair) =>
        [pair.final, pair.staged].includes("unexpected"),
      )
    )
      throw fail("CONTENT_SUBMISSION_BATCH_RECOVERY_CONFLICT");
    return {
      hasEvidence:
        main.final !== "absent" ||
        main.staged !== "absent" ||
        sidecar.final !== "absent" ||
        sidecar.staged !== "absent",
      recoverable:
        (main.final !== "absent" || main.staged !== "absent") &&
        (sidecar.final !== "absent" || sidecar.staged !== "absent"),
    };
  }

  function promote(entry) {
    ensureDirectory(
      path.dirname(entry.files.filePath),
      "CONTENT_SUBMISSION_QUEUE_INVALID",
    );
    moveOwnedFile(
      entry.staged.sidecarPath,
      entry.files.sidecarPath,
      entry.ownsSidecar,
    );
    moveOwnedFile(entry.staged.filePath, entry.files.filePath, entry.ownsMain);
  }

  function compensate(batch, entries) {
    entries.forEach((entry) => {
      removeOwnedFile(entry.files.sidecarPath, entry.ownsSidecar);
      removeOwnedFile(entry.files.filePath, entry.ownsMain);
      removeOwnedFile(entry.staged.sidecarPath, entry.ownsSidecar);
      removeOwnedFile(entry.staged.filePath, entry.ownsMain);
    });
    cleanupStageRoot(stagingRoot(batch.batchId));
    if (
      typeof value.operationalStore.discardPreparedSubmissionBatch !==
      "function"
    )
      throw fail("CONTENT_SUBMISSION_BATCH_RECOVERY_PROTOCOL_UNAVAILABLE");
    value.operationalStore.discardPreparedSubmissionBatch({
      batchId: batch.batchId,
    });
  }

  function recoverBatch(batch) {
    const entries = preparedEntries(batch);
    const states = entries.map(state);
    if (
      states.every((item) => !item.hasEvidence) ||
      states.some((item) => !item.recoverable)
    ) {
      compensate(batch, entries);
      return { batchId: batch.batchId, status: "discarded" };
    }
    entries.forEach(promote);
    cleanupStageRoot(stagingRoot(batch.batchId));
    if (typeof value.operationalStore.queueSubmissionBatch !== "function")
      throw fail("CONTENT_SUBMISSION_BATCH_RECOVERY_PROTOCOL_UNAVAILABLE");
    value.operationalStore.queueSubmissionBatch({ batchId: batch.batchId });
    return { batchId: batch.batchId, status: "queued" };
  }

  function removeOrphan(root) {
    assertDirectory(root, "CONTENT_SUBMISSION_STAGING_INVALID");
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      const child = path.join(root, entry.name);
      if (entry.isSymbolicLink())
        throw fail("CONTENT_SUBMISSION_STAGING_INVALID");
      if (entry.isDirectory()) removeOrphan(child);
      else if (entry.isFile()) fs.unlinkSync(child);
      else throw fail("CONTENT_SUBMISSION_STAGING_INVALID");
    }
    fs.rmdirSync(root);
  }

  function recoverPreparedBatches() {
    if (typeof value.operationalStore.listSubmissionBatches !== "function")
      return Object.freeze([]);
    const batches = value.operationalStore.listSubmissionBatches() || [];
    const results = batches
      .filter((batch) => batch && batch.status === "prepared")
      .map(recoverBatch);
    const parent = path.resolve(inputRoot, STAGING_DIRECTORY);
    if (pathExists(parent)) {
      assertDirectory(parent, "CONTENT_SUBMISSION_STAGING_INVALID");
      const active = new Set(batches.map((batch) => batch && batch.batchId));
      for (const entry of fs.readdirSync(parent, { withFileTypes: true })) {
        if (entry.isSymbolicLink() || !entry.isDirectory())
          throw fail("CONTENT_SUBMISSION_STAGING_INVALID");
        const child = path.join(parent, entry.name);
        const batch = batches.find((item) => item.batchId === entry.name);
        if (!active.has(entry.name) || !batch || batch.status !== "prepared")
          removeOrphan(child);
      }
      removeEmptyDirectory(parent, "CONTENT_SUBMISSION_STAGING_INVALID");
    }
    return Object.freeze(results);
  }

  return Object.freeze({
    stagingRoot,
    stagingPaths,
    ensureDirectory,
    pathExists,
    moveOwnedFile,
    removeOwnedFile,
    cleanupStageRoot,
    recoverPreparedBatches,
  });
}

module.exports = { createPreparedSubmissionRecovery, STAGING_DIRECTORY };
