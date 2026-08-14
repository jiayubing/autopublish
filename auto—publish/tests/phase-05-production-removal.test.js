"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { createOperationalStore } = require("../src/infrastructure/operational-store/operational-store");
const { createContentLifecycleComposition } = require("../desktop/composition/content-lifecycle-composition");
const { createContentSubmissionService } = require("../desktop/services/content-submission-service");
const { createArticleRemovalService } = require("../src/content/article-removal-service");
const { createArticleSubmissionRemovalCoordinator } = require("../desktop/services/article-submission-removal-coordinator");

function article() {
  return {
    id: "article-1", clientId: "client-1", title: "Fixture", content: "Body", status: "saved",
    platform: "fixture", scenario: "fixture", templateId: "template-1", researchQueryIds: ["q-1"],
    researchSnapshots: [{ questionId: "q-1", question: "Question", answerText: "Answer", references: [], collectedAt: "2026-07-25T00:00:00.000Z", collectionMethod: "manual" }],
    source: { client_material: true, doubao_answer: true, references: false, template: true },
    materialSnapshots: [{ id: "m-1", name: "fixture", extension: ".md", content: "fixture", contentHash: "hash", source: "text" }],
    templateSnapshot: { platform: "fixture", id: "template-1", name: "template", scenario: "fixture", body: "body", bodyHash: "hash" },
    createdAt: "2026-07-25T00:00:00.000Z"
  };
}

test("production removal blocks on a queued regular item and leaves queue mutation to its owner", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "phase-05-production-removal-"));
  const operationalStore = createOperationalStore({ workspaceRoot: root });
  const composition = createContentLifecycleComposition({ workspaceRoot: root, operationalStore });
  try {
    const contentStore = composition.contentStore;
    contentStore.saveArticle(article());
    const profile = operationalStore.createAccountProfile({ platformId: "toutiao", displayName: "fixture" });
    const input = path.join(root, ".autopublish", "input");
    const submission = createContentSubmissionService({
      workspaceRoot: root, paths: { input }, operationalStore, contentStore,
      platforms: [{ id: "toutiao", scanDir: "toutiao", contentQueueImport: true }]
    });
    const batch = submission.createBatch({ clientId: "client-1", articleIds: ["article-1"], platformId: "toutiao", accountProfileId: profile.accountProfileId, confirmed: true });
    const filePath = path.join(input, "toutiao", batch.items[0].filename);
    const sidecarPath = filePath + ".submission.json";
    const removal = createArticleRemovalService({
      workspaceRoot: root,
      contentStore,
      mutationCoordinator: composition.articleMutationCoordinator,
      transactionStore: composition.articleRemovalTransactionStore,
      submissionService: submission,
      tokenTtlMs: 5000,
    });
    const preview = removal.previewArticleRemovalImpact({ selections: [{ clientId: "client-1", articleId: "article-1" }] });
    assert.equal(preview.canCommit, false);
    assert.equal(preview.queuedToCancel, undefined);
    assert.equal(preview.blockedItems.some((item) => item.reasonCode === "ARTICLE_OPERATION_FROZEN"), true);
    assert.equal(contentStore.isArticleTrashed("client-1", "article-1"), false);
    assert.equal(operationalStore.getSubmissionBatch(batch.batchId).items[0].status, "queued");

    const cancelPreview = submission.previewCancelBatch({ batchId: batch.batchId });
    const cancelled = submission.cancelBatch({ batchId: batch.batchId, planId: cancelPreview.planId, confirmed: true });
    assert.equal(cancelled.cancelledCount, 1);
    const afterCancel = removal.previewArticleRemovalImpact({ selections: [{ clientId: "client-1", articleId: "article-1" }] });
    assert.equal(afterCancel.canCommit, true);
    const result = removal.applyArticleRemovalImpact({ confirmed: true, token: afterCancel.token });
    assert.equal(result.status, "committed");
    assert.equal(contentStore.isArticleTrashed("client-1", "article-1"), true);
    assert.equal(operationalStore.getSubmissionBatch(batch.batchId).items[0].status, "cancelled");
    assert.equal(fs.existsSync(filePath), false);
    assert.equal(fs.existsSync(sidecarPath), false);
  } finally {
    operationalStore.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("active and published submission facts block removal without queue actions", () => {
  const views = [
    { clientId: "client-1", articleId: "queued", batchId: "batch-q", status: "queued" },
    { clientId: "client-1", articleId: "failed", batchId: "batch-f", status: "failed" },
    { clientId: "client-1", articleId: "published", batchId: "batch-p", status: "published" },
  ];
  const coordinator = createArticleSubmissionRemovalCoordinator({
    projection: {
      allItemViews: () => views,
      publicItem: (item) => ({ ...item }),
    },
    policy: {
      CLEANED_STATUSES: new Set(),
      normalizeSelections: (input) => input.selections,
      selectionKey: (item) => `${item.clientId}:${item.articleId}`,
      evaluateItemAction: (item) => ({
        allowed: item.action === "cancel",
        reasonCode: "ARTICLE_SUBMISSION_ACTIVE",
      }),
      submissionAction: (item, action) => ({ ...item, action }),
    },
    actionRecovery: {},
  });
  const preview = coordinator.previewArticleRemovalImpact({
    selections: views.map(({ clientId, articleId }) => ({ clientId, articleId })),
  });
  assert.equal(preview.queuedToCancel, undefined);
  assert.equal(preview.blockedItems.length, 2);
  assert.equal(preview.blockedItems.some((item) => item.articleId === "queued" && item.reasonCode === "ARTICLE_OPERATION_FROZEN"), true);
  assert.equal(preview.blockedItems.some((item) => item.articleId === "published" && item.reasonCode === "ARTICLE_PUBLISHED_IMMUTABLE"), true);
  assert.equal(preview.canCommit, false);
  assert.equal(typeof coordinator.cleanupArticleSubmissionItem, "undefined");
  assert.equal(typeof coordinator.cleanupPublishedArticleLocal, "undefined");
});
