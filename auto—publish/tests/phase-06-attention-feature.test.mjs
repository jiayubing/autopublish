import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createAttentionFeature } from "../media-workbench/src/features/attention/attention-feature.js";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((next, fail) => {
    resolve = next;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function attention(attentionId, allowedActions = ["retry-publication"]) {
  return { attentionId, kind: "failed_submission", allowedActions };
}

describe("Phase 06 attention feature", () => {
  it("owns the scoped query revision/fingerprint and rejects an older response", async () => {
    const oldQuery = deferred();
    const newQuery = deferred();
    let calls = 0;
    const feature = createAttentionFeature({
      list: () => (++calls === 1 ? oldQuery.promise : newQuery.promise),
      preview: async () => ({}),
      execute: async () => ({}),
    });
    feature.setScope({
      workspaceRuntimeId: "workspace-1",
      clientId: "client-1",
    });

    const initial = feature.refresh("initial");
    const invalidation = feature.refresh("invalidation");
    newQuery.resolve({
      revision: 8,
      items: [attention("new")],
      counts: { total: 1, actionable: 1 },
    });
    await invalidation;
    oldQuery.resolve({
      revision: 7,
      items: [attention("old")],
      counts: { total: 1, actionable: 1 },
    });
    await initial;

    const snapshot = feature.getSnapshot();
    assert.deepEqual(snapshot.scope, {
      workspaceRuntimeId: "workspace-1",
      clientId: "client-1",
    });
    assert.equal(snapshot.revision, 8);
    assert.equal(snapshot.items[0].attentionId, "new");
    assert.equal(typeof snapshot.fingerprint, "string");
    assert.ok(snapshot.fingerprint.length > 0);
    assert.deepEqual(snapshot.query, {
      loading: false,
      error: null,
      reason: "invalidation",
    });
  });

  it("rejects a response from the previous client scope", async () => {
    const previousClient = deferred();
    const feature = createAttentionFeature({
      list: (clientId) =>
        clientId === "client-1"
          ? previousClient.promise
          : Promise.resolve({
              revision: 9,
              items: [attention(clientId, [])],
              counts: { total: 1, actionable: 0 },
            }),
      preview: async () => ({}),
      execute: async () => ({}),
    });
    feature.setScope({
      workspaceRuntimeId: "workspace-1",
      clientId: "client-1",
    });
    const staleRefresh = feature.refresh("initial");

    feature.setScope({
      workspaceRuntimeId: "workspace-1",
      clientId: "client-2",
    });
    await feature.refresh("initial");
    previousClient.resolve({
      revision: 2,
      items: [attention("client-1", [])],
      counts: { total: 1, actionable: 0 },
    });

    await staleRefresh;
    assert.equal(feature.getSnapshot().revision, 9);
    assert.equal(feature.getSnapshot().items[0].attentionId, "client-2");
    feature.dispose();
  });

  it("keeps preview and execute lifecycles independent and binds execute to the query fingerprint", async () => {
    const previewRequest = deferred();
    const executeRequest = deferred();
    const executeInputs = [];
    let revision = 3;
    const feature = createAttentionFeature({
      list: async () => ({
        revision,
        items: [attention("attention-1", ["cleanup"])],
        counts: { total: 1, actionable: 1 },
      }),
      preview: () => previewRequest.promise,
      execute: (input) => {
        executeInputs.push(input);
        return executeRequest.promise;
      },
    });
    feature.setScope({
      workspaceRuntimeId: "workspace-1",
      clientId: "client-1",
    });
    await feature.refresh("initial");
    const queryFingerprint = feature.getSnapshot().fingerprint;

    const previewing = feature.previewAction({
      attentionId: "attention-1",
      action: "cleanup",
    });
    assert.equal(feature.getSnapshot().commands.preview.busy, true);
    assert.equal(feature.getSnapshot().commands.execute.busy, false);
    previewRequest.resolve({
      attentionId: "attention-1",
      revision: 3,
      action: "cleanup",
      requiresConfirmation: true,
      message: "将清理队列残留",
      changedScopes: [],
    });
    const preview = await previewing;
    assert.equal(feature.getSnapshot().commands.preview.busy, false);
    assert.equal(
      feature.getSnapshot().pendingPreview.bindingFingerprint,
      queryFingerprint,
    );

    const executing = feature.executePreview(preview, { confirmed: true });
    assert.equal(feature.getSnapshot().commands.preview.busy, false);
    assert.equal(feature.getSnapshot().commands.execute.busy, true);
    assert.deepEqual(executeInputs, [
      {
        attentionId: "attention-1",
        action: "cleanup",
        expectedRevision: 3,
        confirmed: true,
      },
    ]);
    revision = 4;
    executeRequest.resolve({
      outcome: "resolved",
      attentionId: "attention-1",
      changedScopes: ["articleAttention"],
    });
    await executing;
    assert.equal(feature.getSnapshot().commands.execute.busy, false);
    assert.equal(feature.getSnapshot().commands.execute.error, null);
    assert.equal(feature.getSnapshot().revision, 4);
    assert.equal(feature.getSnapshot().pendingPreview, null);
  });

  it("rejects execute when a newer query invalidates the preview fingerprint", async () => {
    let revision = 10;
    let executeCalls = 0;
    const feature = createAttentionFeature({
      list: async () => ({
        revision,
        items: [attention("attention-1", ["cleanup"])],
        counts: { total: 1, actionable: 1 },
      }),
      preview: async () => ({
        attentionId: "attention-1",
        revision: 10,
        action: "cleanup",
        requiresConfirmation: true,
        message: "确认",
        changedScopes: [],
      }),
      execute: async () => {
        executeCalls += 1;
        return {};
      },
    });
    feature.setScope({
      workspaceRuntimeId: "workspace-1",
      clientId: "client-1",
    });
    await feature.refresh("initial");
    const preview = await feature.previewAction({
      attentionId: "attention-1",
      action: "cleanup",
    });
    revision = 11;
    await feature.refresh("invalidation");

    await assert.rejects(feature.executePreview(preview, { confirmed: true }), {
      code: "ARTICLE_ATTENTION_STALE",
    });
    assert.equal(executeCalls, 0);
    assert.equal(feature.getSnapshot().commands.execute.busy, false);
    assert.equal(
      feature.getSnapshot().commands.execute.error.code,
      "ARTICLE_ATTENTION_STALE",
    );
  });
});
