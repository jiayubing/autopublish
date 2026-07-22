const assert = require("node:assert/strict");
const { it } = require("node:test");
const { createWorkspaceDataInvalidation } = require("../desktop/workspace-data-invalidation");
const { createWorkspaceRuntime } = require("../desktop/workspace-runtime");

it("workspace invalidation owns reason-to-scope policy and emits safe monotonic payloads", function() {
  const sent = [];
  const invalidation = createWorkspaceDataInvalidation({ sendToRenderer: function(channel, payload) { sent.push([channel, payload]); } });
  assert.equal(invalidation.invalidate("PUBLICATION_RECONCILED"), 1);
  assert.equal(invalidation.invalidate("PUBLICATION_RECONCILED"), 2);
  assert.deepEqual(sent[0], ["workspace:data-invalidated", {
    revision: 1,
    scopes: ["articleManagement", "articleAttention", "platformQueue", "navigationSummary"],
    reasonCode: "PUBLICATION_RECONCILED"
  }]);
  assert.equal(sent[1][1].revision, 2);
  assert.deepEqual(invalidation.scopesForReason("MEDIA_SUBMIT_COMPLETED"), ["articleManagement", "articleAttention", "platformQueue", "navigationSummary", "orders"]);
});

it("workspace runtime validates lifecycle dependencies before a workspace can start", function() {
  assert.throws(function() { createWorkspaceRuntime({}); }, /ipcMain/);
  assert.throws(function() { createWorkspaceRuntime({ ipcMain: {} }); }, /sendToRenderer/);
});
