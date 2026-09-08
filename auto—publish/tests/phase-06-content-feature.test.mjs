import test from "node:test";
import assert from "node:assert/strict";
import { createContentGenerationFeature } from "../media-workbench/src/features/content/content-generation-feature.js";

function operation(clientId, operationId = `operation-${clientId}`) {
  return {
    operationId,
    clientId,
    articleCount: 1,
    concurrency: 2,
    status: "running",
    counts: { total: 1, pending: 0, running: 1, succeeded: 0, failed: 0 },
    tasks: [],
    createdAt: "2026-09-08T00:00:00.000Z",
    updatedAt: "2026-09-08T00:00:00.000Z",
  };
}

test("content generation fences an A start result after switching to B and observes only current-client events", async () => {
  let resolveA;
  let onOperation = () => {};
  const feature = createContentGenerationFeature({
    start: () => new Promise((resolve) => { resolveA = resolve; }),
    getState: async () => null,
    retry: async () => null,
    subscribeOperation: (listener) => {
      onOperation = listener;
      return () => {};
    },
  });
  feature.setScope({ workspaceRuntimeId: "w1", clientId: "a" });
  const pending = feature.start({ clientId: "a" });
  feature.setScope({ workspaceRuntimeId: "w1", clientId: "b" });
  assert.equal(feature.getSnapshot().command.busy, false);

  resolveA(operation("a"));
  await pending;
  assert.equal(feature.getSnapshot().operation, null);

  onOperation(operation("a", "late-a"));
  assert.equal(feature.getSnapshot().operation, null);
  onOperation(operation("b", "live-b"));
  assert.equal(feature.getSnapshot().operation.operationId, "live-b");
  assert.equal(feature.getSnapshot().scope.clientId, "b");
  feature.dispose();
});

test("content generation owns visible error/finally and rejects cross-client results", async () => {
  const feature = createContentGenerationFeature({
    start: async () => operation("a"),
    getState: async () => null,
    retry: async () => null,
    subscribeOperation: () => () => {},
  });
  feature.setScope({ workspaceRuntimeId: "w1", clientId: "b" });
  await assert.rejects(feature.start({ clientId: "b" }), { code: "CONTENT_SCOPE_MISMATCH" });
  assert.equal(feature.getSnapshot().operation, null);
  assert.equal(feature.getSnapshot().command.busy, false);
  assert.equal(feature.getSnapshot().command.error.code, "CONTENT_SCOPE_MISMATCH");
  feature.dispose();
});
