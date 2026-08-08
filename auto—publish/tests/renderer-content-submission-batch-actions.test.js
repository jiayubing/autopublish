const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const viewPath = path.resolve(__dirname, "..", "media-workbench", "src", "components", "content", "GeneratedArticlesView.tsx");
const source = () => fs.readFileSync(viewPath, "utf8");

describe("renderer content submission batch actions", () => {
  it("renders only service-issued cancel action plans and executes their plan ids", () => {
    const view = source();
    assert.match(view, /management: ArticleManagementReadModel/);
    assert.doesNotMatch(view, /previewCancelContentSubmissionBatch\(batch\.id\)/);
    assert.match(
      view,
      /const \{\s*articles,\s*trash,\s*submissionBatches,\s*cancellationPlans,/,
    );
    assert.match(
      view,
      /const cancelableBatches = useMemo\(\s*\(\) =>\s*cancellationPlans\s*\.map/,
    );
    assert.doesNotMatch(view, /cleanableBatches/);
    assert.doesNotMatch(view, /submissionBatches\[0\]/);
    assert.doesNotMatch(view, /item\.canCancel === true/);
    assert.doesNotMatch(view, /cancelableCount\?: number/);
    assert.doesNotMatch(view, /uncancelableCount\?: number/);
    assert.match(
      view,
      /commands\.cancelContentSubmissionBatch\(\{\s*batchId: preview\.batchId,\s*planId: preview\.planId,?\s*\}\)/,
    );
  });

  it("tracks cancellation pending state and refreshes authoritative management after stale plans", () => {
    const view = source();
    const management = fs.readFileSync(path.resolve(__dirname, "..", "media-workbench", "src", "features", "content", "article-management-feature.js"), "utf8");
    const cancel = view.slice(view.indexOf("async function cancelCancelableBatches"), view.indexOf("\n  async function previewTrashSelections"));
    assert.match(cancel, /setCancellationPending\(\{ clientId: requestedClientId, count: total \}\)/);
    assert.match(cancel, /SUBMISSION_ACTION_STALE/);
    assert.match(cancel, /队列已变化，请重新检查/);
    assert.doesNotMatch(cancel, /refreshBatchAffectedArticles\(\)/);
    assert.match(
      management,
      /await refreshAfterCommand\(name, ["']command-error["']\)/,
    );
    assert.match(cancel, /cancellationRequestIdRef\.current === requestId/);
  });

  it("labels an empty action state as applying to all current-client batches", () => {
    assert.match(source(), /当前客户全部批次均无可撤销的未开始项/);
  });
});
