"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  createSubmissionOperationFiles,
} = require("../desktop/services/submission-operation-files");
const {
  createSubmissionOperationStaging,
} = require("../desktop/services/submission-operation-staging");

for (const change of ["none", "rewrite", "cleanup", "resume"]) {
  test(`staging fingerprint cache: ${change}`, (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "staging-fingerprint-"));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const item = {
      filePath: path.join(root, "article.md"),
      sidecarPath: path.join(root, "sidecar.json"),
    };
    fs.writeFileSync(item.filePath, "article");
    fs.writeFileSync(item.sidecarPath, "sidecar");
    let operation;
    const files = createSubmissionOperationFiles({
      inputRoot: root,
      operationalStore: {
        checkpointSubmissionItemAction(checkpoint) {
          operation = { ...operation, ...checkpoint };
          return operation;
        },
      },
    });
    const staging = createSubmissionOperationStaging({ files });
    const reads = [];
    const read = fs.readFileSync;
    t.mock.method(fs, "readFileSync", function (filename, ...args) {
      reads.push(filename);
      return read.call(this, filename, ...args);
    });
    const cache = new Map();
    const before = files.pairManifest(item, cache);
    operation = {
      operationId: "fixture",
      state: "prepared",
      payload: { before },
    };
    if (change === "rewrite") {
      const original = fs.statSync(item.sidecarPath);
      fs.writeFileSync(item.sidecarPath, "changed");
      fs.utimesSync(item.sidecarPath, original.atime, original.mtime);
      assert.throws(() => staging.stageOperation(item, operation, cache), {
        code: "SUBMISSION_ACTION_OPERATION_CONFLICT",
      });
      assert.equal(fs.readFileSync(item.sidecarPath, "utf8"), "changed");
      return;
    }
    const result = staging.stageOperation(item, operation, cache);
    for (const filename of [
      item.filePath,
      item.sidecarPath,
      result.staged.main,
      result.staged.sidecar,
    ])
      assert.equal(reads.filter((entry) => entry === filename).length, 1);
    if (change === "resume") {
      reads.length = 0;
      staging.stageOperation(item, result.operation);
      assert.deepEqual(
        reads.sort(),
        [result.staged.main, result.staged.sidecar].sort(),
      );
    }
    if (change === "cleanup") {
      fs.writeFileSync(result.staged.main, "changed");
      assert.throws(
        () =>
          staging.cleanupOperationStage(
            result.operation,
            result.staged,
            before,
          ),
        { code: "SUBMISSION_ACTION_OPERATION_CONFLICT" },
      );
      assert.equal(fs.existsSync(result.staged.main), true);
      return;
    }
    reads.length = 0;
    staging.cleanupOperationStage(result.operation, result.staged, before);
    assert.deepEqual(
      reads.sort(),
      [result.staged.main, result.staged.sidecar].sort(),
    );
    assert.equal(fs.existsSync(result.staged.directory), false);
  });
}
