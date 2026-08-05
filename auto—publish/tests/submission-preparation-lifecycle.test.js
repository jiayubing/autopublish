"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  articleMarkdown,
  writePairAtomic,
} = require("../desktop/services/submission-file-helpers");
const {
  createContentSubmissionApplication,
} = require("../desktop/services/content-submission-application");
const {
  createSubmissionBatchPersistence,
} = require("../desktop/services/submission-batch-persistence");
const {
  createSubmissionBatchPlanner,
} = require("../desktop/services/submission-batch-planner");
const {
  createSubmissionBatchReader,
} = require("../desktop/services/submission-batch-reader");
const {
  createSubmissionPreflight,
} = require("../desktop/services/submission-preflight");
const {
  createSubmissionTargetCatalog,
} = require("../desktop/services/submission-target-catalog");

function article() {
  return {
    id: "article-1",
    clientId: "client-1",
    status: "saved",
    title: "Fixture",
    content: "Body",
    source: {
      client_material: true,
      doubao_answer: true,
      references: false,
      template: true,
    },
    materialSnapshots: [{ id: "material-1" }],
    researchSnapshots: [{ questionId: "question-1" }],
    templateSnapshot: {
      platform: "fixture",
      id: "template-1",
      name: "Template",
      scenario: "Fixture",
      body: "Body",
      bodyHash: "hash",
    },
  };
}

function planner() {
  let reads = 0;
  const targetCatalog = createSubmissionTargetCatalog({
    platforms: [
      {
        id: "toutiao",
        displayName: "头条",
        scanDir: "toutiao",
        contentQueueImport: true,
      },
      {
        id: "media",
        displayName: "媒体",
        scanDir: "media",
        contentQueueImport: true,
        publicationTarget: { kind: "resource" },
      },
    ],
  });
  const value = createSubmissionBatchPlanner({
    targetCatalog,
    preflight: createSubmissionPreflight(),
    articleMarkdown,
    contentStore: {
      getArticle() {
        reads += 1;
        return article();
      },
    },
  });
  return { value, targetCatalog, reads: () => reads };
}

test("preflight and planning are side-effect-free application ports", () => {
  const { value, targetCatalog, reads } = planner();
  const eligibility = createSubmissionPreflight().check(article(), {
    id: "toutiao",
    contentQueueImport: true,
  });
  assert.deepEqual(eligibility, {
    eligible: true,
    reasonCodes: [],
    reasons: [],
  });

  const preview = value.previewBatch({
    clientId: "client-1",
    articleIds: ["article-1"],
    targetPlatformIds: ["toutiao"],
    accountProfiles: { toutiao: "account-1" },
  });
  assert.equal(reads(), 1);
  assert.equal(preview.queueableTaskCount, 1);
  assert.equal(preview.items[0].articleId, "article-1");
  assert.equal(preview.items[0].targetPlatformId, "toutiao");
  assert.equal("filePath" in preview.items[0], false);
  assert.equal("sidecarPath" in preview.items[0], false);
  assert.deepEqual(
    targetCatalog.list().map((item) => item.id),
    ["toutiao"],
  );
});

test("persistence and query ports keep account-bound batch facts durable", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "submission-lifecycle-"));
  try {
    const { value, targetCatalog } = planner();
    const preview = value.previewBatch({
      clientId: "client-1",
      articleIds: ["article-1"],
      targetPlatformIds: ["toutiao"],
      accountProfiles: { toutiao: "account-1" },
    });
    let durable;
    const operationalStore = {
      createSubmissionBatch(input) {
        durable = {
          batchId: input.batchId,
          status: "queued",
          revision: 1,
          createdAt: "2026-08-05T00:00:00.000Z",
          updatedAt: "2026-08-05T00:00:00.000Z",
          items: input.items.map((item, index) => ({
            itemId: "item-" + index,
            articleId: item.articleId,
            targetKey: "platform:toutiao:account:account-1",
            revision: 1,
            status: "queued",
            payload: item.payload,
          })),
        };
        return {
          batchId: input.batchId,
          items: durable.items.map((item) => ({ itemId: item.itemId })),
        };
      },
      getSubmissionBatch() {
        return durable;
      },
      listSubmissionBatches() {
        return [durable];
      },
    };
    const persistence = createSubmissionBatchPersistence({
      inputRoot: root,
      operationalStore,
      targetCatalog,
      writePairAtomic,
    });
    const created = persistence.createBatch(preview);
    assert.equal("filePath" in preview.items[0], false);
    assert.equal("sidecarPath" in preview.items[0], false);
    assert.equal("itemId" in preview.items[0], false);
    assert.equal(created.items[0].itemId, "item-0");
    assert.equal("markdown" in created.items[0], false);
    assert.equal(fs.existsSync(created.items[0].filePath), true);
    assert.equal(fs.existsSync(created.items[0].sidecarPath), true);

    const reader = createSubmissionBatchReader({ operationalStore });
    assert.deepEqual(reader.listBatches("client-1")[0].items[0], {
      itemId: "item-0",
      articleId: "article-1",
      targetKey: "platform:toutiao:account:account-1",
      status: "queued",
      revision: 1,
      clientId: "client-1",
      targetPlatformId: "toutiao",
      accountProfileId: "account-1",
      sourcePlatformId: "toutiao",
      filename: created.items[0].filename,
      contentHash: created.items[0].contentHash,
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("the application facade exposes only stable submission operations", () => {
  const implementation = {
    previewBatch: () => ({ ok: true }),
    listPlatforms: () => [],
  };
  for (const name of [
    "previewExport",
    "exportArticle",
    "createBatch",
    "listBatches",
    "getBatch",
    "buildSubmissionActionPlan",
    "previewCancelBatch",
    "cancelBatch",
    "reconcileBatch",
    "previewCleanupFailedItems",
    "cleanupFailedItems",
    "previewArticleRemovalImpact",
    "cancelArticleSubmissionItem",
    "cleanupArticleSubmissionItem",
    "cleanupPublishedArticleLocal",
    "cleanupCancelledArticleLocal",
    "reconcileArticleRemovalAction",
    "inspectSubmissionPair",
    "evaluateItemAction",
    "isSubmissionItemExecutable",
    "previewTrashedArticleQueueResidue",
    "cleanupTrashedArticleQueueResidue",
    "previewRetryFailedPublication",
    "retryFailedPublication",
    "listArchiveFailures",
  ])
    implementation[name] = () => name;
  implementation.createBatch = () => ({
    filePath: "C:\\private\\batch",
    sidecarPath: "C:\\private\\batch.submission.json",
    items: [
      {
        filename: "article.md",
        filePath: "C:\\private\\article.md",
        sidecarPath: "C:\\private\\article.md.submission.json",
      },
    ],
  });
  const application = createContentSubmissionApplication(implementation);
  assert.equal(Object.isFrozen(application), true);
  assert.deepEqual(
    Object.keys(application).sort(),
    Object.keys(implementation).sort(),
  );
  assert.deepEqual(application.previewBatch(), { ok: true });
  const created = application.createBatch();
  assert.equal("filePath" in created, false);
  assert.equal("sidecarPath" in created, false);
  assert.equal("filePath" in created.items[0], false);
  assert.equal("sidecarPath" in created.items[0], false);
  assert.equal(created.items[0].filename, "article.md");
  assert.equal("privateOperation" in application, false);
});
