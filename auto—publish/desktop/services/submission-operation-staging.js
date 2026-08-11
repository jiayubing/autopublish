"use strict";

const fs = require("node:fs");

function fail(code, message) {
  const error = new Error(message || code);
  error.code = code;
  return error;
}

function createSubmissionOperationStaging(options) {
  const value = options || {};
  if (!value.files) throw fail("SUBMISSION_OPERATION_FILES_REQUIRED");
  const files = value.files;

  function sameFileState(actual, expected) {
    if (
      !actual ||
      !expected ||
      actual.exists !== expected.exists ||
      actual.kind !== expected.kind
    )
      return false;
    return !actual.exists || actual.hash === expected.hash;
  }

  function stageFile(source, target, expected, staged) {
    files.assertOperationStageRoot(staged, true);
    const sourceState = files.fileState(source);
    const targetState = files.fileState(target);
    if (
      targetState.kind === "unsafe" ||
      targetState.kind === "unknown" ||
      (targetState.exists && targetState.hash !== expected.hash)
    )
      files.operationConflict("Submission operation staging is corrupted");
    if (targetState.exists) {
      if (sourceState.exists)
        files.operationConflict(
          "Submission queue copy exists in both source and staging",
        );
      return;
    }
    if (
      !sourceState.exists ||
      sourceState.kind !== "file" ||
      sourceState.hash !== expected.hash
    )
      files.operationConflict(
        "Submission queue copy no longer matches its checkpoint",
      );
    files.ensureOperationStageRoot(staged);
    try {
      fs.renameSync(source, target);
    } catch (error) {
      throw fail(
        "CONTENT_SUBMISSION_QUEUE_STAGE_FAILED",
        "Queue copy could not be staged",
      );
    }
  }

  function assertOperationTopology(item, operation, staged, before) {
    if (files.assertOperationStageRoot(staged, true)) {
      const entries = fs.readdirSync(staged.directory);
      if (
        entries.some(
          (entry) => !["main.queue-copy", "sidecar.json"].includes(entry),
        )
      )
        files.operationConflict(
          "Submission operation staging contains an unexpected entry",
        );
    }
    const sourceMain = files.fileState(item.filePath);
    const sourceSidecar = files.fileState(item.sidecarPath);
    const stagedMain = files.fileState(staged.main);
    const stagedSidecar = files.fileState(staged.sidecar);
    const sourcePair =
      sameFileState(sourceMain, before.main) &&
      sameFileState(sourceSidecar, before.sidecar) &&
      !stagedMain.exists &&
      !stagedSidecar.exists;
    const mainMoved =
      sameFileState(stagedMain, before.main) &&
      sameFileState(sourceSidecar, before.sidecar) &&
      !sourceMain.exists &&
      !stagedSidecar.exists;
    const bothMoved =
      sameFileState(stagedMain, before.main) &&
      sameFileState(stagedSidecar, before.sidecar) &&
      !sourceMain.exists &&
      !sourceSidecar.exists;
    const stateAppliedCleanup =
      !sourceMain.exists &&
      !sourceSidecar.exists &&
      (!stagedMain.exists || sameFileState(stagedMain, before.main)) &&
      (!stagedSidecar.exists || sameFileState(stagedSidecar, before.sidecar));
    if (operation.state === "prepared" && !sourcePair && !mainMoved)
      files.operationConflict(
        "Submission queue pair is only partially or externally changed",
      );
    if (operation.state === "main_staged" && !mainMoved && !bothMoved)
      files.operationConflict(
        "Submission queue pair staging checkpoint is not proven",
      );
    if (["sidecar_staged", "staged"].includes(operation.state) && !bothMoved)
      files.operationConflict(
        "Submission queue pair staging checkpoint is not proven",
      );
    if (operation.state === "state_applied" && !stateAppliedCleanup)
      files.operationConflict(
        "Submission queue cleanup checkpoint is not proven",
      );
    if (
      operation.state === "complete" &&
      (stagedMain.exists ||
        stagedSidecar.exists ||
        sourceMain.exists ||
        sourceSidecar.exists)
    )
      files.operationConflict(
        "Completed submission operation has unexpected queue residue",
      );
  }

  function stageOperation(item, operation) {
    const before = operation && operation.payload && operation.payload.before;
    if (!before)
      files.operationConflict("Submission operation checkpoint is incomplete");
    const staged = files.operationStagePaths(operation.operationId);
    if (
      !before.main.exists ||
      before.main.kind !== "file" ||
      !before.sidecar.exists ||
      before.sidecar.kind !== "file"
    )
      files.operationConflict(
        "Submission queue pair was not complete at operation prepare",
      );
    assertOperationTopology(item, operation, staged, before);
    if (
      ![
        "main_staged",
        "sidecar_staged",
        "staged",
        "state_applied",
        "complete",
      ].includes(operation.state)
    ) {
      stageFile(item.filePath, staged.main, before.main, staged);
      operation = files.checkpointOperation(
        operation.operationId,
        "main_staged",
        Object.assign({}, operation.payload, { stage: "main_staged" }),
      );
    }
    if (
      !["sidecar_staged", "staged", "state_applied", "complete"].includes(
        operation.state,
      )
    ) {
      stageFile(item.sidecarPath, staged.sidecar, before.sidecar, staged);
      operation = files.checkpointOperation(
        operation.operationId,
        "sidecar_staged",
        Object.assign({}, operation.payload, { stage: "sidecar_staged" }),
      );
    }
    if (!["staged", "state_applied", "complete"].includes(operation.state))
      operation = files.checkpointOperation(
        operation.operationId,
        "staged",
        Object.assign({}, operation.payload, { stage: "staged" }),
      );
    const currentStage = {
      main: files.fileState(staged.main),
      sidecar: files.fileState(staged.sidecar),
    };
    if (
      !sameFileState(currentStage.main, before.main) ||
      !sameFileState(currentStage.sidecar, before.sidecar) ||
      files.fileState(item.filePath).exists ||
      files.fileState(item.sidecarPath).exists
    )
      files.operationConflict(
        "Submission operation staging postcondition is not proven",
      );
    return { operation, staged };
  }

  function cleanupOperationStage(operation, staged, before) {
    files.assertOperationStageRoot(staged, true);
    for (const [key, filename] of [
      ["main", staged.main],
      ["sidecar", staged.sidecar],
    ]) {
      files.assertOperationStageRoot(staged, true);
      const state = files.fileState(filename);
      if (state.exists) {
        if (!sameFileState(state, before[key]))
          files.operationConflict(
            "Submission operation staging changed before cleanup",
          );
        try {
          fs.unlinkSync(filename);
        } catch (error) {
          throw fail(
            "CONTENT_SUBMISSION_QUEUE_STAGE_CLEANUP_FAILED",
            "Submission operation staging could not be cleaned",
          );
        }
      }
    }
    try {
      if (
        files.assertOperationStageRoot(staged, true) &&
        fs.readdirSync(staged.directory).length === 0
      )
        fs.rmdirSync(staged.directory);
    } catch (error) {
      if (error && error.code === "SUBMISSION_ACTION_OPERATION_CONFLICT")
        throw error;
      throw fail(
        "CONTENT_SUBMISSION_QUEUE_STAGE_CLEANUP_FAILED",
        "Submission operation staging could not be cleaned",
      );
    }
  }

  return Object.freeze({
    assertOperationTopology,
    stageOperation,
    cleanupOperationStage,
  });
}

module.exports = { createSubmissionOperationStaging };
