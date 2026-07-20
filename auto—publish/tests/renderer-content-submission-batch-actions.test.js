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
    assert.match(view, /cancelContentSubmissionBatch\(preview\.batchId, preview\.planId\)/);
  });

  it("labels an empty action state as applying to all current-client batches", () => {
    assert.match(source(), /当前客户全部批次均无可撤销或可清理项/);
  });
});
