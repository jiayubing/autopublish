"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  createPublicationWorkflowComposition,
} = require("../desktop/composition/publication-workflow-composition");

test("Phase 3 composition owns one OperationalStore writer and releases it on dispose", async () => {
  const workspaceRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "phase-03-composition-"),
  );
  const publisher = {
    inspectAccount: async () => ({}),
    publish: async () => ({
      status: "failed",
      error: {
        code: "FIXTURE",
        category: "remote",
        retryability: "safe",
        userMessage: "fixture",
      },
    }),
  };
  const composition = createPublicationWorkflowComposition({
    workspaceRoot,
    publisher,
  });
  assert.equal(typeof composition.publicationWorkflow.publish, "function");
  assert.equal(composition.operationalStore.verify().schemaVersion, 4);
  await composition.dispose();
  const next = createPublicationWorkflowComposition({
    workspaceRoot,
    publisher,
  });
  await next.dispose();
});

test("restarted composition rebuilds uncertain attention from OperationalStore with stable account identity", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "phase-03-attention-restart-"));
  const publisher = { inspectAccount: async () => ({}), publish: async () => { throw new Error("unused"); } };
  const first = createPublicationWorkflowComposition({ workspaceRoot, publisher });
  try {
    const profile = first.operationalStore.createAccountProfile({ platformId: "toutiao", displayName: "fixture" });
    first.operationalStore.reservePublicationTarget({ articleId: "article-1", publicationId: "publication-1", attemptId: "attempt-1", target: { kind: "platform", platformId: "toutiao", accountProfileId: profile.accountProfileId } });
    first.operationalStore.markRecoveryUncertain({ attemptId: "attempt-1", error: { code: "FIXTURE", category: "transport", retryability: "manual-check", userMessage: "fixture" } });
  } finally { await first.dispose(); }
  const second = createPublicationWorkflowComposition({ workspaceRoot, publisher });
  try {
    const ports = second.createAttentionPorts({});
    const item = ports.attentionQuery.list().items[0];
    assert.equal(item.attemptId, "attempt-1");
    assert.equal(item.accountProfileId, second.operationalStore.listPublicationAttention()[0].accountProfileId);
    assert.ok(item.allowedActions.includes("reconcile-failed"));
    const before = second.operationalStore.listPublicationRecords({ articleIds: ["article-1"] });
    await assert.rejects(() => ports.attentionResolver.resolve({ attentionId: item.attentionId, action: "retry-archive", expectedRevision: ports.attentionQuery.getRevision(), confirmed: true }), { code: "ARTICLE_ATTENTION_ACTION_NOT_ALLOWED" });
    await assert.rejects(() => ports.attentionResolver.resolve({ attentionId: item.attentionId, action: "reconcile-failed", expectedRevision: ports.attentionQuery.getRevision() + 1, confirmed: true }), { code: "ARTICLE_ATTENTION_STALE" });
    assert.deepEqual(second.operationalStore.listPublicationRecords({ articleIds: ["article-1"] }), before);
    await ports.attentionResolver.resolve({ attentionId: item.attentionId, action: "reconcile-failed", expectedRevision: ports.attentionQuery.getRevision(), confirmed: true });
  } finally { await second.dispose(); }
  const third = createPublicationWorkflowComposition({ workspaceRoot, publisher });
  try {
    assert.equal(third.createAttentionPorts({}).attentionQuery.list().items.length, 0);
  } finally { await third.dispose(); fs.rmSync(workspaceRoot, { recursive: true, force: true }); }
});

test("attention retry requeues only an existing failed post-processing job without republishing", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "phase-03-attention-retry-"));
  let profile; let publishes = 0;
  const publisher = { inspectAccount: async () => ({ verified: true, accountProfileId: profile.accountProfileId }), publish: async (input) => { publishes += 1; return { status: "published", evidence: { articleId: input.articleId, attemptId: input.attemptId, targetKey: `platform:toutiao:account:${profile.accountProfileId}`, accountProfileId: profile.accountProfileId, remoteId: "remote-1", remoteUrl: "https://example.test/remote-1" } }; } };
  const first = createPublicationWorkflowComposition({ workspaceRoot, publisher });
  try {
    profile = first.operationalStore.createAccountProfile({ platformId: "toutiao", displayName: "fixture" });
    const result = await first.publicationWorkflow.publish({ articleId: "article-1", target: { kind: "platform", platformId: "toutiao", accountProfileId: profile.accountProfileId }, title: "title", body: "body", postProcessingPayload: { sourcePlatformId: "toutiao", filename: "fixture.md", batchId: "batch-1" } });
    const job = first.operationalStore.claimPostProcessing({ claimToken: "fixture-claim" });
    first.operationalStore.completePostProcessing({ jobId: job.jobId, claimToken: "fixture-claim", success: false });
    publishes = 0;
    const ports = first.createAttentionPorts({ archiveActionPort: { retryArchive: () => ({}) } });
    const item = ports.attentionQuery.list().items.find((value) => value.jobId === job.jobId);
    await ports.attentionResolver.resolve({ attentionId: item.attentionId, action: "retry-archive", expectedRevision: ports.attentionQuery.getRevision(), confirmed: true });
    assert.equal(publishes, 0);
    assert.equal(first.operationalStore.listPublicationRecords({ articleIds: ["article-1"] })[0].attempts.length, 1);
  } finally { await first.dispose(); }
  const second = createPublicationWorkflowComposition({ workspaceRoot, publisher });
  try { assert.equal(second.createAttentionPorts({ archiveActionPort: { retryArchive: () => ({}) } }).attentionQuery.list().items.length, 0); }
  finally { await second.dispose(); fs.rmSync(workspaceRoot, { recursive: true, force: true }); }
});
