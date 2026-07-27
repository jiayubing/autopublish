import test from "node:test";
import assert from "node:assert/strict";
import { createContentGenerationFeature } from "../media-workbench/src/features/content/content-generation-feature.js";

test("content generation fences an A response after switching to B and refreshes current scope", async () => {
  let resolveA;
  const committed = [];
  const refreshed = [];
  const feature = createContentGenerationFeature({
    generate: () => new Promise((resolve) => { resolveA = resolve; }),
    commit: (article) => committed.push(article),
    refreshCurrent: (reason, scope) => refreshed.push([reason, scope.clientId]),
  });
  feature.setScope({ workspaceRuntimeId: "w1", clientId: "a" });
  const pending = feature.generate({ clientId: "a" });
  feature.setScope({ workspaceRuntimeId: "w1", clientId: "b" });
  assert.equal(feature.getSnapshot().command.busy, false);
  resolveA({ id: "article-a", clientId: "a" });
  await pending;
  assert.deepEqual(committed, []);
  assert.deepEqual(refreshed, [["stale-command-result", "b"]]);
  assert.equal(feature.getSnapshot().scope.clientId, "b");
});
test("content generation owns visible error/finally and rejects cross-client results", async () => {
  const feature = createContentGenerationFeature({
    generate: async () => ({ id: "wrong", clientId: "a" }),
    commit: () => assert.fail("cross-client result must not commit"),
    refreshCurrent: () => undefined,
  });
  feature.setScope({ workspaceRuntimeId: "w1", clientId: "b" });
  await assert.rejects(feature.generate({ clientId: "b" }), { code: "CONTENT_SCOPE_MISMATCH" });
  assert.equal(feature.getSnapshot().command.busy, false);
  assert.equal(feature.getSnapshot().command.error.code, "CONTENT_SCOPE_MISMATCH");
  feature.dispose();
});
