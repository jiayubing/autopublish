"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  createOperationalStore,
} = require("../src/infrastructure/operational-store/operational-store");
const {
  createContentSubmissionService,
} = require("../desktop/services/content-submission-service");

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
  const service = createContentSubmissionService({
    workspaceRoot: root,
    operationalStore: store,
    contentStore: { getArticle: () => article() },
    platforms: [
      { id: "toutiao", scanDir: "toutiao", contentQueueImport: true },
    ],
  });
  const profile = store.createAccountProfile({
    platformId: "toutiao",
    displayName: "Cleanup fixture account",
  });
  const batch = service.createBatch({
    clientId: "client-cleanup",
    articleIds: ["article-cleanup"],
    platformId: "toutiao",
    accountProfileId: profile.accountProfileId,
    confirmed: true,
  });
  return { root, store, service, batch, profile };
}

function closeFixture(value) {
  value.store.close();
  fs.rmSync(value.root, { recursive: true, force: true });
}

test("cleans a terminal failed item and its owned queue pair", () => {
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
        value.batch.items[0].filename,
      ),
    };
    files.sidecarPath = files.filePath + ".submission.json";
    const preview = value.service.previewCleanupFailedItems({
      batchId: value.batch.batchId,
    });
    assert.equal(preview.cleanableCount, 1);
    const result = value.service.cleanupFailedItems({
      batchId: value.batch.batchId,
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

test("reconciles a batch through the public item projection", () => {
  const value = fixture();
  try {
    const result = value.service.reconcileBatch(value.batch.batchId);
    assert.equal(result.batch.batchId, value.batch.batchId);
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0].status, "queued");
    assert.equal("filePath" in result.items[0], false);
    assert.equal("sidecarPath" in result.items[0], false);
  } finally {
    closeFixture(value);
  }
});
