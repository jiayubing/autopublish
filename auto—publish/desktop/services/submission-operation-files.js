"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

function fail(code, message) {
  const error = new Error(message || code);
  error.code = code;
  return error;
}

function createSubmissionOperationFiles(options) {
  const value = options || {};
  if (!value.operationalStore) throw fail("OPERATIONAL_STORE_REQUIRED");
  const inputRoot = path.resolve(
    value.inputRoot || path.join(process.cwd(), "input"),
  );

  function fileState(filename) {
    try {
      const stat = fs.lstatSync(filename);
      if (!stat.isFile() || stat.isSymbolicLink())
        return { exists: true, kind: "unsafe" };
      return {
        exists: true,
        kind: "file",
        hash: crypto
          .createHash("sha256")
          .update(fs.readFileSync(filename))
          .digest("hex"),
      };
    } catch (error) {
      if (error && error.code === "ENOENT")
        return { exists: false, kind: "absent" };
      return {
        exists: true,
        kind: "unknown",
        errorCode: (error && error.code) || "EIO",
      };
    }
  }

  function pairManifest(item) {
    return {
      main: fileState(item.filePath),
      sidecar: fileState(item.sidecarPath),
    };
  }

  function operationStagePaths(operationId) {
    const directory = path.join(
      inputRoot,
      ".submission-operations",
      crypto.createHash("sha256").update(operationId).digest("hex"),
    );
    return {
      directory,
      main: path.join(directory, "main.queue-copy"),
      sidecar: path.join(directory, "sidecar.json"),
    };
  }

  function operationConflict(message) {
    throw fail(
      "SUBMISSION_ACTION_OPERATION_CONFLICT",
      message || "Submission action operation evidence is not valid",
    );
  }

  function assertSafeOperationDirectory(directory, label) {
    const stat = fs.lstatSync(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink())
      operationConflict(label + " is unsafe");
  }

  function assertOperationStageRoot(staged, allowMissing) {
    const parent = path.resolve(inputRoot, ".submission-operations");
    const expected = path.resolve(parent, path.basename(staged.directory));
    if (
      expected !== path.resolve(staged.directory) ||
      path.dirname(expected) !== parent
    )
      operationConflict("Submission operation staging path is invalid");
    if (fs.existsSync(inputRoot))
      assertSafeOperationDirectory(inputRoot, "Submission input root");
    if (fs.existsSync(parent)) {
      assertSafeOperationDirectory(parent, "Submission operation root");
      const inputReal = fs.realpathSync(inputRoot);
      const parentReal = fs.realpathSync(parent);
      if (path.dirname(parentReal) !== inputReal)
        operationConflict("Submission operation root escapes its parent");
    }
    if (!fs.existsSync(staged.directory)) {
      if (!allowMissing)
        operationConflict("Submission operation staging directory is missing");
      return false;
    }
    assertSafeOperationDirectory(
      staged.directory,
      "Submission operation staging directory",
    );
    const parentReal = fs.realpathSync(parent);
    const stageReal = fs.realpathSync(staged.directory);
    if (path.dirname(stageReal) !== parentReal)
      operationConflict(
        "Submission operation staging directory escapes its parent",
      );
    return true;
  }

  function ensureOperationStageRoot(staged) {
    assertOperationStageRoot(staged, true);
    const parent = path.dirname(staged.directory);
    if (!fs.existsSync(parent)) fs.mkdirSync(parent);
    assertSafeOperationDirectory(parent, "Submission operation root");
    if (!fs.existsSync(staged.directory)) fs.mkdirSync(staged.directory);
    assertOperationStageRoot(staged, false);
  }

  function checkpointOperation(operationId, state, payload) {
    if (
      typeof value.operationalStore.checkpointSubmissionItemAction !==
      "function"
    )
      throw fail(
        "SUBMISSION_ACTION_PROTOCOL_UNAVAILABLE",
        "Submission action recovery protocol is unavailable",
      );
    return value.operationalStore.checkpointSubmissionItemAction({
      operationId,
      state,
      payload,
    });
  }

  function operationRecord(operationId) {
    if (typeof value.operationalStore.getSubmissionItemAction !== "function")
      throw fail(
        "SUBMISSION_ACTION_PROTOCOL_UNAVAILABLE",
        "Submission action recovery protocol is unavailable",
      );
    return value.operationalStore.getSubmissionItemAction({ operationId });
  }

  return Object.freeze({
    fileState,
    pairManifest,
    operationStagePaths,
    operationConflict,
    assertOperationStageRoot,
    ensureOperationStageRoot,
    checkpointOperation,
    operationRecord,
  });
}

module.exports = { createSubmissionOperationFiles };
