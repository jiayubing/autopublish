"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createPaidMediaBatchOrchestrator,
} = require("../desktop/services/paid-media-batch-orchestrator");

function batch(batchId, clientIds) {
  return {
    batchId,
    actions: { canStart: true },
    pauseIntent: "paused",
    items: clientIds.map((clientId, index) => ({
      batchItemId: `${batchId}-${index + 1}`,
      articleIdentityV1: {
        version: 1,
        clientId,
        articleId: `${batchId}-article-${index + 1}`,
      },
    })),
  };
}

function fixture(t, batches) {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const {createOperationalStore} = require("../src/infrastructure/operational-store/operational-store");
  const root = fs.mkdtempSync(path.join(os.tmpdir(),"paid-client-scope-"));
  const ports = {};
  const store = createOperationalStore({workspaceRoot:root,transitionPorts:ports});
  t.after(() => { store.close(); fs.rmSync(root,{recursive:true,force:true}); });
  for (const row of batches) {
    const refs = row.items.map(item => ({clientId:item.articleIdentityV1.clientId,articleId:item.articleIdentityV1.articleId}));
    ports.paidAdmissionTransitions.admitPaidBatch({
      batchId:row.batchId,articleCount:refs.length,
      target:{kind:"media",mediaResourceId:"media-a"}, confirmationFingerprint:"b".repeat(64),
      confirmation:{version:1,articleRefs:refs,mediaResourceId:"media-a",quotedPrice:1,confirmedAt:"2026-09-13T00:00:00.000Z"},
      systemSubmissionCode:"system-a",quotedPrice:1,estimatedTotal:refs.length,
      items:refs.map((ref,index)=>({...ref,articleRef:ref,batchId:row.batchId,itemId:`${row.batchId}-item-${index}`,publicationId:`${row.batchId}-publication-${index}`,attemptId:`${row.batchId}-attempt-${index}`,customerSnapshotV1:{version:1,clientId:ref.clientId,displayName:ref.clientId},publicationSnapshot:{articleId:ref.articleId,title:"Synthetic",body:"Synthetic body",fingerprint:"a".repeat(64)}})),
    });
  }
  const runIntentCalls=[];
  const transitions={...ports.paidExecutionTransitions,
    claimPaidSubmissionBatchItem(){return null;},
    setPaidSubmissionBatchRunIntent(input){runIntentCalls.push(input);return ports.paidExecutionTransitions.setPaidSubmissionBatchRunIntent(input);},
  };
  const orchestrator=createPaidMediaBatchOrchestrator({paidExecutionTransitions:transitions,orderCreationPort:{createOrder(){throw new Error("No real orders");}}});
  t.after(()=>orchestrator.dispose());
  return {orchestrator,runIntentCalls};
}

test("client snapshot keeps valid mixed-client paid batches visible", (t) => {
  const mixed = batch("mixed", ["client-a", "client-b"]);
  const onlyA = batch("only-a", ["client-a"]);
  const onlyB = batch("only-b", ["client-b"]);
  const { orchestrator } = fixture(t, [mixed, onlyA, onlyB]);

  assert.deepEqual(
    orchestrator.snapshot({ clientId: "client-a" }).map((item) => item.batchId),
    ["mixed", "only-a"],
  );
  assert.deepEqual(
    orchestrator.snapshot({ clientId: "client-b" }).map((item) => item.batchId),
    ["mixed", "only-b"],
  );
});

test("client-scoped start-all starts only batches fully owned by that client", async (t) => {
  const mixed = batch("mixed", ["client-a", "client-b"]);
  const onlyA = batch("only-a", ["client-a"]);
  const onlyB = batch("only-b", ["client-b"]);
  const { orchestrator, runIntentCalls } = fixture(t, [mixed, onlyA, onlyB]);

  const result = await orchestrator.startAll({ clientId: "client-a" });

  assert.equal(result.status, "paid_batches_started");
  assert.deepEqual(
    result.results.map((item) => [item.batchId, item.status]),
    [["only-a", "idle"]],
  );
  assert.deepEqual(runIntentCalls, [{ batchId: "only-a", running: true }]);
});

test("client-scoped start-all does not start a mixed-client batch by itself", async (t) => {
  const { orchestrator, runIntentCalls } = fixture(t, [
    batch("mixed", ["client-a", "client-b"]),
  ]);

  const result = await orchestrator.startAll({ clientId: "client-a" });

  assert.deepEqual(result, {
    status: "no_eligible_paid_batches",
    results: [],
  });
  assert.deepEqual(runIntentCalls, []);
});
