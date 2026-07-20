const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  createSubmissionWorkflow,
} = require("../desktop/services/submission-workflow");

describe("submission workflow seams", function () {
  it("exposes preparation, batch, cleanup, and retry commands without leaking stores", function () {
    const calls = [];
    const service = new Proxy(
      {},
      {
        get:
          (_, name) =>
          (...args) => {
            calls.push([name, ...args]);
            return name;
          },
      },
    );
    const workflow = createSubmissionWorkflow(service);
    assert.equal(workflow.preparation.previewBatch("preview"), "previewBatch");
    assert.equal(workflow.batch.reconcile("batch"), "reconcileBatch");
    assert.equal(
      workflow.cleanup.cleanupFailed("cleanup"),
      "cleanupFailedItems",
    );
    assert.equal(
      workflow.retry.failedPublication("retry"),
      "retryFailedPublication",
    );
    assert.deepEqual(
      calls.map((item) => item[0]),
      [
        "previewBatch",
        "reconcileBatch",
        "cleanupFailedItems",
        "retryFailedPublication",
      ],
    );
    assert.equal(
      Object.prototype.hasOwnProperty.call(workflow, "batchStore"),
      false,
    );
  });
});
