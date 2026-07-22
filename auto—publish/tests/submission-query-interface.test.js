const assert = require("node:assert/strict");
const { it } = require("node:test");
const { createSubmissionQuery } = require("../desktop/services/submission/submission-query");

it("submission query reads batches once and shares its snapshot with reconciliation and planning", function() {
  const batches = [{ id: "b-1", clientId: "c-1", items: [{ articleId: "a-1", targetPlatformId: "p-1" }] }];
  let listCount = 0;
  const snapshots = [];
  const query = createSubmissionQuery({
    batchStore: { list() { listCount += 1; return batches; }, get() { throw new Error("unexpected get"); } },
    reconcileBatch(id, snapshot) { snapshots.push(snapshot); return { batch: batches[0], items: [] }; },
    buildActionPlan(id, action, snapshot) {
      snapshots.push(snapshot);
      return { items: [{ articleId: "a-1", targetPlatformId: "p-1", publicationId: null, attemptId: null, allowed: true, fingerprint: "bound" }] };
    }
  });
  const result = query.listBatches("c-1");
  assert.equal(listCount, 1);
  assert.equal(snapshots[0], snapshots[1]);
  assert.equal(result[0].items[0].canCancel, true);
  assert.equal(result[0].items[0].actionFingerprint, "bound");
});
