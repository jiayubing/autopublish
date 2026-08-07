"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { createOperationalStore } = require("../src/infrastructure/operational-store/operational-store");
const { createContentSubmissionService } = require("../desktop/services/content-submission-service");

function article() {
  return { id: "article-1", clientId: "client-1", title: "Fixture", content: "Body", status: "saved", createdAt: "2026-07-25T00:00:00.000Z", source: { client_material: true, doubao_answer: true, references: false, template: true }, materialSnapshots: [{ id: "m-1", name: "fixture", extension: ".md", content: "fixture", contentHash: "hash", source: "text" }], researchSnapshots: [{ questionId: "q-1", answerText: "fixture", references: [], collectionMethod: "manual" }], templateSnapshot: { platform: "fixture", id: "template-1", name: "template", scenario: "fixture", body: "body", bodyHash: "hash" } };
}

function queueFiles(root, item) {
  const filePath = path.join(
    root,
    ".autopublish",
    "input",
    item.targetPlatformId,
    item.filename,
  );
  return { filePath, sidecarPath: filePath + ".submission.json" };
}

test("generic content queue lists only account-bound platform targets", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "phase-03-operational-targets-"));
  const store = createOperationalStore({ workspaceRoot: root });
  try {
    const service = createContentSubmissionService({ workspaceRoot: root, operationalStore: store, contentStore: { getArticle: () => article() }, platforms: [
      { id: "toutiao", displayName: "头条", scanDir: "toutiao", contentQueueImport: true, publicationTarget: { kind: "platform" } },
      { id: "media", displayName: "媒体", scanDir: "media", contentQueueImport: true, publicationTarget: { kind: "resource" } },
    ] });
    assert.deepEqual(service.listPlatforms().map((platform) => platform.id), ["toutiao"]);
  } finally {
    store.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("failed publication retry is eligible only for its intact durable batch item", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "phase-03-content-retry-"));
  const store = createOperationalStore({ workspaceRoot: root });
  let retried = null;
  try {
    const profile = store.createAccountProfile({ platformId: "toutiao", displayName: "fixture" });
    const service = createContentSubmissionService({
      workspaceRoot: root,
      operationalStore: store,
      contentStore: { getArticle: () => article() },
      platforms: [{ id: "toutiao", scanDir: "toutiao", contentQueueImport: true }],
      retryFailedPublication: async (task) => { retried = task; return { status: "published" }; },
    });
    const batch = service.createBatch({ clientId: "client-1", articleIds: ["article-1"], targetPlatformIds: ["toutiao"], accountProfiles: { toutiao: profile.accountProfileId }, confirmed: true });
    const item = store.getSubmissionBatch(batch.batchId).items[0];
    const claim = store.claimSubmissionItemById({ batchId: batch.batchId, itemId: item.itemId, claimToken: "claim-1" });
    const target = { kind: "platform", platformId: "toutiao", accountProfileId: profile.accountProfileId };
    store.reservePublicationTarget({ articleId: "article-1", publicationId: "publication-1", attemptId: "attempt-1", target, batchItemId: item.itemId });
    store.commitRemoteOutcome({ attemptId: "attempt-1", batchItemId: item.itemId, batchClaimToken: claim.claimToken, outcome: { status: "failed", error: { code: "REMOTE_REJECTED", category: "remote", retryability: "safe", userMessage: "Retry" } } });
    const preview = service.previewRetryFailedPublication({ publicationId: "publication-1" });
    assert.equal(preview.eligible, true);
    const result = await service.retryFailedPublication({ publicationId: "publication-1", confirmed: true });
    assert.equal(result.status, "published");
    assert.deepEqual(retried, {
      publicationId: "publication-1",
      batchId: batch.batchId,
      itemId: item.itemId,
      filename: batch.items[0].filename,
      sourcePlatformId: "toutiao",
      targetPlatformId: "toutiao",
      accountProfileId: profile.accountProfileId,
    });
  } finally {
    store.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("production content batch persists explicit account binding in OperationalStore and queue sidecar", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "phase-03-operational-content-"));
  const store = createOperationalStore({ workspaceRoot: root });
  try {
    const profile = store.createAccountProfile({ platformId: "toutiao", displayName: "fixture" });
    const service = createContentSubmissionService({ workspaceRoot: root, operationalStore: store, contentStore: { getArticle: () => article() }, platforms: [{ id: "toutiao", scanDir: "toutiao", contentQueueImport: true }] });
    const batch = service.createBatch({ clientId: "client-1", articleIds: ["article-1"], targetPlatformIds: ["toutiao"], accountProfiles: { toutiao: profile.accountProfileId }, confirmed: true });
    const files = queueFiles(root, batch.items[0]);
    const durable = store.getSubmissionBatch(batch.batchId);
    const sidecar = JSON.parse(fs.readFileSync(files.sidecarPath, "utf8"));
    assert.equal(durable.items[0].payload.accountProfileId, profile.accountProfileId);
    assert.equal(durable.items[0].payload.clientId, "client-1");
    assert.equal(sidecar.accountProfileId, profile.accountProfileId);
    assert.equal(sidecar.version, 2);
    assert.equal(sidecar.filename, path.basename(files.filePath));
    assert.equal(fs.existsSync(path.join(root, ".autopublish", "submission-batches")), false);
  } finally {
    store.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("cancelling an unclaimed operational content batch removes only its queue copy", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "phase-03-operational-content-cancel-"));
  const store = createOperationalStore({ workspaceRoot: root });
  try {
    const profile = store.createAccountProfile({ platformId: "toutiao", displayName: "fixture" });
    const service = createContentSubmissionService({ workspaceRoot: root, operationalStore: store, contentStore: { getArticle: () => article() }, platforms: [{ id: "toutiao", scanDir: "toutiao", contentQueueImport: true }] });
    const batch = service.createBatch({ clientId: "client-1", articleIds: ["article-1"], targetPlatformIds: ["toutiao"], accountProfiles: { toutiao: profile.accountProfileId }, confirmed: true });
    const files = queueFiles(root, batch.items[0]);
    const preview = service.previewCancelBatch({ batchId: batch.batchId });
    assert.equal(preview.allowedCount, 1);
    const result = service.cancelBatch({ batchId: batch.batchId, planId: preview.planId, confirmed: true });
    assert.equal(result.cancelledCount, 1);
    assert.equal(fs.existsSync(files.filePath), false);
    assert.equal(fs.existsSync(files.sidecarPath), false);
    assert.equal(service.getBatch(batch.batchId).items[0].status, "cancelled");
    assert.equal(service.getBatch(batch.batchId).items[0].accountProfileId, profile.accountProfileId);
  } finally {
    store.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
