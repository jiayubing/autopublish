"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { createMediaPublisher } = require("../desktop/services/media-publisher");
const { createMediaPublicationSubmissionService } = require("../desktop/services/media-publication-submission-service");
const { createOperationalStore } = require("../src/infrastructure/operational-store/operational-store");
const { createPlatformWorkbenchService } = require("../desktop/services/platform-workbench-service");

test("media publisher emits receipt-bound outcome without an order JSON writer", async () => {
  const publisher = createMediaPublisher({ clientProvider: () => ({ sendArticle: async (input) => { assert.equal(input.resourceId, "resource-1"); return { data: { order_nid: "order-1" } }; } }) });
  const outcome = await publisher.publish({ articleId: "media-article", attemptId: "attempt-1", target: { kind: "media", mediaResourceId: "resource-1" }, title: "title", body: "body" });
  assert.deepEqual(outcome, { status: "submitted", evidence: { articleId: "media-article", attemptId: "attempt-1", targetKey: "media-resource:resource-1", remoteId: "order-1" } });
});

test("media submission service creates an OperationalStore batch and delegates each target to PublicationWorkflow", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "phase-03-media-submit-"));
  const store = createOperationalStore({ workspaceRoot: root });
  try {
    const published = [];
    const service = createMediaPublicationSubmissionService({
      operationalStore: store,
      workbench: { prepareMediaPublicationCommands: async () => [{ articleId: "media-article", target: { kind: "media", mediaResourceId: "resource-1" }, title: "title", body: "body", postProcessingPayload: { sourcePlatformId: "media", filename: "fixture.md" } }] },
      workflow: { publish: async (command) => { published.push(command); return { attemptId: command.attemptId, status: "submitted" }; } },
    });
    const result = await service.submit([{ filename: "fixture.md" }]);
    assert.equal(result.results[0].status, "submitted");
    assert.equal(store.getSubmissionBatch(result.batchId).items.length, 1);
    assert.equal(published[0].target.mediaResourceId, "resource-1");
    assert.equal(published[0].postProcessingPayload.batchId, result.batchId);
  } finally { store.close(); }
});

test("media command preparation is read-only and derives a media target from selected resources", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "phase-03-media-prepare-"));
  const input = path.join(root, "input", "media");
  fs.mkdirSync(input, { recursive: true });
  fs.writeFileSync(path.join(input, "fixture.md"), "# Title\n\nBody");
  const workbench = createPlatformWorkbenchService({ rootDir: root, paths: { input: path.join(root, "input") }, platforms: [{ id: "media", scanDir: "media" }] });
  const commands = await workbench.prepareMediaPublicationCommands([{ filename: "fixture.md", selectedResources: [{ resourceId: "resource-1" }] }]);
  assert.equal(commands[0].target.kind, "media");
  assert.equal(commands[0].target.mediaResourceId, "resource-1");
  assert.match(commands[0].articleId, /^media-/);
  assert.equal(fs.existsSync(path.join(root, ".autopublish", "operations.sqlite")), false);
});
