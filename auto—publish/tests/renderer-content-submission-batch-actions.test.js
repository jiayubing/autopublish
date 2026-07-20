const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const viewPath = path.resolve(__dirname, "..", "media-workbench", "src", "components", "content", "GeneratedArticlesView.tsx");
const source = () => fs.readFileSync(viewPath, "utf8");

describe("renderer content submission batch actions", () => {
  it("renders only service-issued cancel action plans and executes their plan ids", () => {
    const view = source();
    assert.match(view, /const \[cancellationPlans, setCancellationPlans\]/);
    assert.match(view, /previewCancelContentSubmissionBatch\(batch\.id\)/);
    assert.match(view, /const cancelableBatches = useMemo\(\(\) => cancellationPlans\.map/);
    assert.match(view, /const cleanableBatches = useMemo\(\(\) => submissionBatches\.map/);
    assert.doesNotMatch(view, /submissionBatches\[0\]/);
    assert.doesNotMatch(view, /item\.canCancel === true/);
    assert.doesNotMatch(view, /cancelableCount\?: number/);
    assert.doesNotMatch(view, /uncancelableCount\?: number/);
    assert.match(view, /cancelContentSubmissionBatch\(preview\.batchId, preview\.planId\)/);
  });

  it("clears old plans while cancellation is pending and handles stale plans with one refresh", () => {
    const view = source();
    const cancel = view.slice(view.indexOf("async function cancelCancelableBatches"), view.indexOf("\n  async function cleanupFailedBatches"));
    assert.match(cancel, /setCancellationPlans\(\[\]\)/);
    assert.match(cancel, /setCancellationPending\(\{ clientId: requestedClientId, count: total \}\)/);
    assert.match(cancel, /SUBMISSION_ACTION_STALE/);
    assert.match(cancel, /队列已变化，请重新检查/);
    assert.match(cancel, /cancellationRequestIdRef\.current === requestId/);
  });

  it("labels an empty action state as applying to all current-client batches", () => {
    assert.match(source(), /当前客户全部批次均无可撤销或可清理项/);
  });
});
