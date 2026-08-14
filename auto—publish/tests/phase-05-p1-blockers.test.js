"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { createSubmissionOperationStaging } = require("../desktop/services/submission-operation-staging");

test("submission operation stage cleanup failure is an explicit stable outcome", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "submission-stage-cleanup-"));
  const realRmdirSync = fs.rmdirSync;
  try {
    fs.rmdirSync = function (filename) {
      if (filename === root)
        throw Object.assign(new Error("staging directory is locked"), { code: "EACCES" });
      return realRmdirSync.apply(fs, arguments);
    };
    const staging = createSubmissionOperationStaging({
      files: {
        assertOperationStageRoot: () => true,
        fileState: () => ({ exists: false, kind: "absent" }),
      },
    });
    assert.throws(
      () => staging.cleanupOperationStage({}, { directory: root }, { main: {}, sidecar: {} }),
      { code: "CONTENT_SUBMISSION_QUEUE_STAGE_CLEANUP_FAILED" },
    );
  } finally {
    fs.rmdirSync = realRmdirSync;
    fs.rmSync(root, { recursive: true, force: true });
  }
});
