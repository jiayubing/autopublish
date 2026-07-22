const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { scopesFor, createWorkspaceInvalidator } = require("../desktop/workspace-invalidation-policy");

describe("workspace invalidation policy", function() {
  it("owns scopes for known mutations and increments safe revisions", function() {
    const events = [];
    const invalidator = createWorkspaceInvalidator((channel, payload) => events.push([channel, payload]));
    assert.deepEqual(scopesFor("CONTENT_EXPORT_QUEUED"), ["articleManagement", "articleAttention", "platformQueue", "navigationSummary", "mediaWorkbench"]);
    assert.equal(invalidator.invalidate("PUBLICATION_RECONCILED"), 1);
    assert.deepEqual(events[0], ["workspace:data-invalidated", {
      revision: 1, reasonCode: "PUBLICATION_RECONCILED",
      scopes: ["articleManagement", "articleAttention", "platformQueue", "navigationSummary"]
    }]);
  });
});
