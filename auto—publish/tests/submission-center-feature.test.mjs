import test from "node:test";
import assert from "node:assert/strict";
import { createSubmissionCenterFeature } from "../media-workbench/src/features/submission-center/submission-center-feature.js";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function snapshot(clientId, revision, total = 0) {
  return {
    schemaVersion: 1,
    clientId,
    revision,
    regular: { groups: [] },
    paid: { batches: [] },
    attention: { items: [] },
    counts: { regularItems: total, paidBatches: 0, attentionItems: 0, total },
  };
}

test("submission center resets on client scope changes and rejects the older query result", async () => {
  const first = deferred();
  const feature = createSubmissionCenterFeature({
    getSnapshot(clientId) {
      return clientId === "client-1"
        ? first.promise
        : Promise.resolve(snapshot(clientId, 2, 2));
    },
  });
  feature.setScope({ workspaceRuntimeId: "workspace-1", clientId: "client-1" });
  const oldRefresh = feature.refresh("initial");
  feature.setScope({ workspaceRuntimeId: "workspace-1", clientId: "client-2" });
  assert.equal(feature.getSnapshot().data.clientId, "");
  await feature.refresh("scope-change");
  first.resolve(snapshot("client-1", 1, 9));
  assert.equal(await oldRefresh, false);
  assert.equal(feature.getSnapshot().data.clientId, "client-2");
  assert.equal(feature.getSnapshot().data.counts.total, 2);
  feature.dispose();
});

test("submission center fails closed for an error or mismatched client response", async () => {
  let mode = "error";
  const feature = createSubmissionCenterFeature({
    async getSnapshot() {
      if (mode === "error")
        throw Object.assign(new Error("状态持续变化"), { code: "SUBMISSION_CENTER_SNAPSHOT_STALE" });
      return snapshot("client-2", 1, 3);
    },
  });
  feature.setScope({ workspaceRuntimeId: "workspace-1", clientId: "client-1" });
  assert.equal(await feature.refresh("initial"), false);
  assert.equal(feature.getSnapshot().query.error.code, "SUBMISSION_CENTER_SNAPSHOT_STALE");
  assert.equal(feature.getSnapshot().data.counts.total, 0);
  mode = "mismatch";
  assert.equal(await feature.refresh("manual"), false);
  assert.equal(feature.getSnapshot().query.error.code, "SUBMISSION_CENTER_SNAPSHOT_INVALID");
  assert.equal(feature.getSnapshot().data.counts.total, 0);
  feature.dispose();
});

test("submission center clears an empty client scope and rejects its late query result", async () => {
  const pending = deferred();
  const feature = createSubmissionCenterFeature({ getSnapshot: () => pending.promise });
  feature.setScope({ workspaceRuntimeId: "workspace-1", clientId: "client-1" });
  const refresh = feature.refresh("initial");
  assert.equal(feature.clearScope(), true);
  assert.equal(feature.getSnapshot().scope, null);
  assert.equal(feature.getSnapshot().data.clientId, "");
  assert.equal(feature.getSnapshot().query.loading, false);
  pending.resolve(snapshot("client-1", 1, 9));
  assert.equal(await refresh, false);
  assert.equal(feature.getSnapshot().data.counts.total, 0);
  feature.dispose();
});
