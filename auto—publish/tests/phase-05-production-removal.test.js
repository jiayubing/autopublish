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

test("production removal uses OperationalStore queue facts and cancels before trashing", () => {
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
    const batch = submission.createBatch({ clientId: "client-1", articleIds: ["article-1"], targetPlatformIds: ["toutiao"], accountProfiles: { toutiao: profile.accountProfileId }, confirmed: true });
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
    assert.equal(preview.canCommit, true);
    assert.equal(preview.queuedToCancel.length, 1);
    const result = removal.applyArticleRemovalImpact({ confirmed: true, token: preview.token });
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
