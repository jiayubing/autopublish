"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const test = require("node:test");
const {
  createOperationalStore,
} = require("../src/infrastructure/operational-store/operational-store");
const {
  createSubmissionMaintenanceService,
} = require("../desktop/services/submission-maintenance-service");
const {
  createSubmissionCleanup,
} = require("../desktop/services/submission-cleanup");

function article() {
  return {
    id: "article-cleanup",
    clientId: "client-cleanup",
    title: "Cleanup fixture",
    content: "Body",
    status: "saved",
    source: {
      client_material: true,
      doubao_answer: true,
      references: false,
      template: true,
    },
    materialSnapshots: [{ id: "material-cleanup" }],
    researchSnapshots: [{ questionId: "question-cleanup" }],
    templateSnapshot: {
      platform: "fixture",
      id: "template-cleanup",
      name: "Cleanup template",
      scenario: "fixture",
      body: "body",
      bodyHash: "hash",
    },
  };
}

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "submission-cleanup-"));
  const store = createOperationalStore({ workspaceRoot: root });
  const input = path.join(root, ".autopublish", "input");
  const markdown = "# Cleanup fixture\n\nBody\n";
  const contentHash = crypto.createHash("sha256").update(markdown).digest("hex");
  const filename = "cleanup-fixture.md";
  const profile = store.createAccountProfile({
    platformId: "toutiao",
    displayName: "Cleanup fixture account",
  });
  const batch = store.createSubmissionBatch({
    batchId: "cleanup-batch",
    items: [{
      articleId: "article-cleanup",
      target: { kind: "platform", platformId: "toutiao", accountProfileId: profile.accountProfileId },
      payload: {
        clientId: "client-cleanup",
        targetPlatformId: "toutiao",
        accountProfileId: profile.accountProfileId,
        filename,
        contentHash,
      },
    }],
  });
  const directory = path.join(input, "toutiao");
  fs.mkdirSync(directory, { recursive: true });
  const filePath = path.join(directory, filename);
  fs.writeFileSync(filePath, markdown);
  fs.writeFileSync(filePath + ".submission.json", JSON.stringify({
    submissionBatchId: batch.batchId,
    generatedArticleId: "article-cleanup",
    clientId: "client-cleanup",
    targetPlatformId: "toutiao",
    contentHash,
  }));
  const service = createSubmissionMaintenanceService({
    workspaceRoot: root,
    paths: { input },
    operationalStore: store,
    contentStore: {
      getArticle: () => article(),
      isArticleTrashed: () => true,
    },
    directoryEntries: [
      { id: "toutiao", displayName: "头条", publicationTargetKind: "platform", scanDir: "toutiao", imagePublishing: false },
    ],
  });
  return { root, store, service, batch, profile };
}

function closeFixture(value) {
  value.store.close();
  fs.rmSync(value.root, { recursive: true, force: true });
}

test("keeps failed queue residue behind the explicit repair capability", () => {
  const value = fixture();
  try {
    const stored = value.store.getSubmissionBatch(value.batch.batchId);
    const item = stored.items[0];
    const claim = value.store.claimSubmissionItemById({
      batchId: stored.batchId,
      itemId: item.itemId,
      claimToken: "cleanup-claim",
    });
    const target = {
      kind: "platform",
      platformId: "toutiao",
      accountProfileId: value.profile.accountProfileId,
    };
    value.store.reservePublicationTarget({
      articleId: item.articleId,
      publicationId: "cleanup-publication",
      attemptId: "cleanup-attempt",
      target,
      batchItemId: item.itemId,
    });
    value.store.commitRemoteOutcome({
      attemptId: "cleanup-attempt",
      batchItemId: item.itemId,
      batchClaimToken: claim.claimToken,
      outcome: {
        status: "failed",
        error: {
          code: "REMOTE_REJECTED",
          category: "remote",
          retryability: "safe",
          userMessage: "Fixture failure",
        },
      },
    });
    const files = {
      filePath: path.join(
        value.root,
        ".autopublish",
        "input",
        "toutiao",
        "cleanup-fixture.md",
      ),
    };
    files.sidecarPath = files.filePath + ".submission.json";
    assert.equal("previewCleanupFailedItems" in value.service, false);
    assert.equal("cleanupFailedItems" in value.service, false);
    const preview = value.service.previewTrashedArticleQueueResidue();
    assert.equal(preview.cleanableCount, 1);
    const result = value.service.cleanupTrashedArticleQueueResidue({
      confirmed: true,
    });
    assert.equal(result.cleanedCount, 1);
    assert.equal(
      value.store.getSubmissionBatch(value.batch.batchId).items[0].status,
      "failed-cleaned",
    );
    assert.equal(fs.existsSync(files.filePath), false);
    assert.equal(fs.existsSync(files.sidecarPath), false);
  } finally {
    closeFixture(value);
  }
});

test("fails closed when the source article state cannot be read", () => {
  const cleanup = createSubmissionCleanup({
    operationalStore: {},
    contentStore: {
      isArticleTrashed: () => {
        throw new Error("source state unavailable");
      },
    },
    projection: {
      allItemViews: () => [
        { clientId: "client-cleanup", articleId: "article-cleanup", storedStatus: "queued" },
      ],
    },
    policy: {
      CLEANED_STATUSES: new Set(),
      evaluateItemAction: () => ({ allowed: false }),
    },
    actionRecovery: {},
  });

  assert.throws(
    () => cleanup.previewTrashedArticleQueueResidue(),
    { code: "SUBMISSION_SOURCE_STATE_READ_FAILED" },
  );
});

test("fails closed when published archive attention cannot be read", () => {
  const cleanup = createSubmissionCleanup({
    operationalStore: {
      listPostProcessingAttention: () => {
        throw new Error("archive state unavailable");
      },
    },
    contentStore: {},
    projection: {},
    policy: {},
    actionRecovery: {},
  });

  assert.throws(
    () => cleanup.listArchiveFailures(),
    { code: "PUBLISHED_ARCHIVE_STATE_READ_FAILED" },
  );
});

test("named maintenance promotes durable prepared staging evidence", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "prepared-recovery-"));
  try {
    const batchId = "batch-recovery-promote";
    const filename = "prepared.md";
    const markdown = "# Prepared\n\nBody\n";
    const contentHash = crypto
      .createHash("sha256")
      .update(markdown)
      .digest("hex");
    const payload = {
      clientId: "client-prepared",
      targetPlatformId: "toutiao",
      accountProfileId: "account-prepared",
      filename,
      contentHash,
    };
    const batch = {
      batchId,
      status: "prepared",
      items: [{ articleId: "article-prepared", payload }],
    };
    const stagedFile = path.join(
      root,
      ".submission-staging",
      batchId,
      "toutiao",
      filename,
    );
    fs.mkdirSync(path.dirname(stagedFile), { recursive: true });
    fs.writeFileSync(stagedFile, markdown);
    fs.writeFileSync(
      stagedFile + ".submission.json",
      JSON.stringify({
        version: 2,
        submissionBatchId: batchId,
        generatedArticleId: "article-prepared",
        clientId: payload.clientId,
        targetPlatformId: payload.targetPlatformId,
        accountProfileId: payload.accountProfileId,
        filename,
        contentHash,
      }),
    );
    const maintenance = createSubmissionMaintenanceService({
      workspaceRoot: root,
      paths: { input: root },
      contentStore: { isArticleTrashed: () => false },
      directoryEntries: [{ id: "toutiao", displayName: "头条", publicationTargetKind: "platform", scanDir: "toutiao", imagePublishing: false }],
      operationalStore: {
        listSubmissionBatches: () => [batch],
        queueSubmissionBatch: () => {
          batch.status = "queued";
          return { batchId, status: "queued" };
        },
      },
    });

    assert.deepEqual(maintenance.recoverPreparedBatches(), [
      { batchId, status: "queued" },
    ]);
    assert.equal(fs.existsSync(stagedFile), false);
    assert.equal(fs.existsSync(path.join(root, "toutiao", filename)), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("named maintenance discards a prepared batch with no file evidence", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "prepared-discard-"));
  try {
    const batch = {
      batchId: "batch-recovery-discard",
      status: "prepared",
      items: [{
        articleId: "article-prepared",
        payload: {
          clientId: "client-prepared",
          targetPlatformId: "toutiao",
          accountProfileId: "account-prepared",
          filename: "missing.md",
          contentHash: "0".repeat(64),
        },
      }],
    };
    let discarded = 0;
    const maintenance = createSubmissionMaintenanceService({
      workspaceRoot: root,
      paths: { input: root },
      contentStore: { isArticleTrashed: () => false },
      directoryEntries: [{ id: "toutiao", displayName: "头条", publicationTargetKind: "platform", scanDir: "toutiao", imagePublishing: false }],
      operationalStore: {
        listSubmissionBatches: () => [batch],
        discardPreparedSubmissionBatch: () => {
          discarded += 1;
          batch.status = "discarded";
        },
      },
    });

    assert.deepEqual(maintenance.recoverPreparedBatches(), [
      { batchId: batch.batchId, status: "discarded" },
    ]);
    assert.equal(discarded, 1);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
