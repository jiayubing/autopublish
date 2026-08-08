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
const { createAuthenticatedIpcMain } = require("../desktop/ipc/register");
const { registerAiContentIpc } = require("../desktop/ipc/ai-content-ipc");
const { createContractRegistry } = require("../desktop/ipc/contracts/registry");
const { contentCoreContracts } = require("../desktop/ipc/contracts/content-core-contracts");
const { createArticleStore } = require("../src/content/article-store");
const { fingerprintArticle } = require("../src/content/content-store");

function article(overrides) {
  return Object.assign({
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
  }, overrides || {});
}

function planner(articleValue) {
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
        return articleValue || article();
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
    platformId: "toutiao",
    accountProfileId: "account-1",
  });
  assert.equal(reads(), 1);
  assert.equal(preview.queueableTaskCount, 1);
  assert.equal(preview.totalTaskCount, 1);
  assert.equal(preview.platformId, "toutiao");
  assert.equal(preview.accountProfileId, "account-1");
  assert.equal(preview.items[0].articleId, "article-1");
  assert.equal(preview.items[0].targetPlatformId, "toutiao");
  assert.equal("filePath" in preview.items[0], false);
  assert.equal("sidecarPath" in preview.items[0], false);
  assert.throws(() => value.previewBatch({
    clientId: "client-1",
    articleIds: ["article-1"],
    targetPlatformIds: ["toutiao"],
    accountProfiles: { toutiao: "account-1" },
  }), { code: "CONTENT_SUBMISSION_BATCH_INPUT_INVALID" });
  assert.deepEqual(
    targetCatalog.list().map((item) => item.id),
    ["toutiao"],
  );
});

test("complete manual content without AI provenance is queueable and reports content gaps in Chinese", () => {
  const manual = {
    id: "manual-1",
    clientId: "client-1",
    status: "saved",
    title: "手工文章",
    content: "手工正文",
  };
  const manualPlanner = planner(manual);
  const preview = manualPlanner.value.previewBatch({
    clientId: "client-1",
    articleIds: ["manual-1"],
    platformId: "toutiao",
    accountProfileId: "account-1",
  });
  assert.equal(preview.queueableTaskCount, 1);
  assert.equal(preview.totalTaskCount, 1);
  assert.equal(preview.platformId, "toutiao");
  assert.equal(preview.accountProfileId, "account-1");

  for (const [field, code, reason] of [
    ["title", "ARTICLE_TITLE_EMPTY", "标题为空"],
    ["content", "ARTICLE_CONTENT_EMPTY", "正文为空"],
  ]) {
    const incompletePlanner = planner(Object.assign({}, manual, { [field]: "" }));
    const incomplete = incompletePlanner.value.previewBatch({
      clientId: "client-1",
      articleIds: ["manual-1"],
      platformId: "toutiao",
      accountProfileId: "account-1",
    });
    assert.equal(incomplete.queueableTaskCount, 0);
    assert.equal(incomplete.items[0].status, "blocked");
    assert.deepEqual(incomplete.items[0].reasonCodes, [code]);
    assert.deepEqual(incomplete.items[0].reasons, [reason]);
  }
});

test("manual content crosses typed save IPC and the real article store into submission planning", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "manual-article-submission-chain-"));
  try {
    const articleStore = createArticleStore(root);
    const handlers = new Map();
    const ipcMain = createAuthenticatedIpcMain(
      { handle(channel, handler) { handlers.set(channel, handler); } },
      async function () {},
    );
    registerAiContentIpc({
      ipcMain,
      aiContentService: {
        saveArticle(input) {
          const saved = articleStore.saveArticle(input.article);
          return { outcome: "saved", article: saved, editFingerprint: fingerprintArticle(saved) };
        },
      },
    });
    const initial = {
      id: "manual-chain-1",
      clientId: "client-1",
      title: "手工投稿文章",
      content: "初始手工正文。",
      status: "saved",
      createdAt: "2026-08-06T00:00:00.000Z",
    };
    articleStore.createArticle(initial);
    const manual = Object.assign({}, initial, { content: "没有 AI 来源的手工正文。" });
    const registry = createContractRegistry(contentCoreContracts);
    const contract = registry.byChannel("content:save-article");
    const request = registry.encodeRequest(contract, {
      article: manual,
      expectedFingerprint: fingerprintArticle(initial),
    });
    const response = await handlers.get("content:save-article")(null, request);
    const saved = registry.parseSuccess(contract, response).article;
    assert.deepEqual(saved, manual);
    assert.deepEqual(articleStore.getArticle("client-1", "manual-chain-1"), manual);

    const targetCatalog = createSubmissionTargetCatalog({
      platforms: [{ id: "toutiao", displayName: "头条", scanDir: "toutiao", contentQueueImport: true }],
    });
    const plannerValue = createSubmissionBatchPlanner({
      targetCatalog,
      preflight: createSubmissionPreflight(),
      articleMarkdown,
      contentStore: articleStore,
    });
    const preview = plannerValue.previewBatch({
      clientId: "client-1",
      articleIds: ["manual-chain-1"],
      platformId: "toutiao",
      accountProfileId: "account-1",
    });
    assert.equal(preview.queueableTaskCount, 1);
    assert.deepEqual(preview.items[0].reasonCodes, undefined);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("persistence and query ports keep account-bound batch facts durable", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "submission-lifecycle-"));
  try {
    const { value, targetCatalog } = planner();
    const preview = value.previewBatch({
      clientId: "client-1",
      articleIds: ["article-1"],
      platformId: "toutiao",
      accountProfileId: "account-1",
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
      queueSubmissionBatch(input) {
        assert.equal(input.batchId, durable.batchId);
        durable.status = "queued";
        durable.items.forEach((item) => {
          item.status = "queued";
        });
        return { batchId: input.batchId, status: "queued" };
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

test("persistence keeps the queue pair invisible until the prepared batch is durable", () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "submission-prepared-visibility-"),
  );
  try {
    const { value, targetCatalog } = planner();
    const preview = value.previewBatch({
      clientId: "client-1",
      articleIds: ["article-1"],
      platformId: "toutiao",
      accountProfileId: "account-1",
    });
    const filePath = path.join(root, "toutiao", preview.items[0].filename);
    const sidecarPath = filePath + ".submission.json";
    let prepared;
    const operationalStore = {
      createSubmissionBatch(input) {
        prepared = input;
        assert.equal(input.status, "prepared");
        assert.equal(fs.existsSync(filePath), false);
        assert.equal(fs.existsSync(sidecarPath), false);
        return {
          batchId: input.batchId,
          items: input.items.map((item, index) => ({
            itemId: "item-" + index,
            articleId: item.articleId,
          })),
        };
      },
      queueSubmissionBatch(input) {
        assert.equal(input.batchId, prepared.batchId);
        assert.equal(fs.existsSync(filePath), true);
        assert.equal(fs.existsSync(sidecarPath), true);
        return { batchId: input.batchId, status: "queued" };
      },
      discardPreparedSubmissionBatch() {},
      listSubmissionBatches() {
        return [];
      },
    };
    const persistence = createSubmissionBatchPersistence({
      inputRoot: root,
      operationalStore,
      targetCatalog,
      writePairAtomic,
    });

    const created = persistence.createBatch(preview);
    assert.equal(prepared.status, "prepared");
    assert.equal(fs.existsSync(filePath), true);
    assert.equal(fs.existsSync(sidecarPath), true);
    assert.equal(fs.existsSync(path.join(root, ".submission-staging")), false);
    assert.equal(created.items[0].itemId, "item-0");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("persistence does not create queued database items when queue file creation fails", () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "submission-compensation-"),
  );
  try {
    const { value, targetCatalog } = planner();
    const preview = value.previewBatch({
      clientId: "client-1",
      articleIds: ["article-1"],
      platformId: "toutiao",
      accountProfileId: "account-1",
    });
    let createCalls = 0;
    const operationalStore = {
      createSubmissionBatch(input) {
        createCalls += 1;
        return {
          batchId: input.batchId,
          items: input.items.map((item, index) => ({
            itemId: "item-" + index,
            articleId: item.articleId,
          })),
        };
      },
    };
    const persistence = createSubmissionBatchPersistence({
      inputRoot: root,
      operationalStore,
      targetCatalog,
      writePairAtomic() {
        throw Object.assign(new Error("disk full"), { code: "ENOSPC" });
      },
    });

    assert.throws(() => persistence.createBatch(preview), { code: "ENOSPC" });
    assert.equal(createCalls, 0);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("persistence removes prepared queue files when the database commit fails", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "submission-db-failure-"));
  try {
    const { value, targetCatalog } = planner();
    const preview = value.previewBatch({
      clientId: "client-1",
      articleIds: ["article-1"],
      platformId: "toutiao",
      accountProfileId: "account-1",
    });
    const persistence = createSubmissionBatchPersistence({
      inputRoot: root,
      operationalStore: {
        createSubmissionBatch() {
          throw Object.assign(new Error("database busy"), {
            code: "SQLITE_BUSY",
          });
        },
      },
      targetCatalog,
      writePairAtomic,
    });

    assert.throws(() => persistence.createBatch(preview), {
      code: "SQLITE_BUSY",
    });
    assert.equal(
      fs.existsSync(path.join(root, "toutiao", preview.items[0].filename)),
      false,
    );
    assert.equal(fs.existsSync(path.join(root, ".submission-staging")), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("persistence preserves an existing queue pair when a new batch collides", () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "submission-existing-pair-"),
  );
  try {
    const { value, targetCatalog } = planner();
    const preview = value.previewBatch({
      clientId: "client-1",
      articleIds: ["article-1"],
      platformId: "toutiao",
      accountProfileId: "account-1",
    });
    const directory = path.join(root, "toutiao");
    fs.mkdirSync(directory, { recursive: true });
    const filePath = path.join(directory, preview.items[0].filename);
    const sidecarPath = filePath + ".submission.json";
    fs.writeFileSync(filePath, "existing article", "utf8");
    fs.writeFileSync(sidecarPath, "existing sidecar", "utf8");
    let createCalls = 0;
    const persistence = createSubmissionBatchPersistence({
      inputRoot: root,
      operationalStore: {
        createSubmissionBatch() {
          createCalls += 1;
          throw Object.assign(new Error("database busy"), {
            code: "SQLITE_BUSY",
          });
        },
      },
      targetCatalog,
      writePairAtomic,
    });

    assert.throws(() => persistence.createBatch(preview), {
      code: "CONTENT_SUBMISSION_QUEUE_CONFLICT",
    });
    assert.equal(createCalls, 0);
    assert.equal(fs.readFileSync(filePath, "utf8"), "existing article");
    assert.equal(fs.readFileSync(sidecarPath, "utf8"), "existing sidecar");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("prepared batch recovery promotes staging evidence before queueing", () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "submission-recovery-promote-"),
  );
  try {
    const { value, targetCatalog } = planner();
    const preview = value.previewBatch({
      clientId: "client-1",
      articleIds: ["article-1"],
      platformId: "toutiao",
      accountProfileId: "account-1",
    });
    const candidate = preview.items[0];
    const batchId = "batch-recovery-promote";
    const payload = {
      clientId: preview.clientId,
      targetPlatformId: candidate.targetPlatformId,
      accountProfileId: candidate.accountProfileId,
      filename: candidate.filename,
      contentHash: candidate.contentHash,
    };
    const batch = {
      batchId,
      status: "prepared",
      items: [{ articleId: candidate.articleId, payload }],
    };
    const stagedFile = path.join(
      root,
      ".submission-staging",
      batchId,
      "toutiao",
      candidate.filename,
    );
    const stagedSidecar = stagedFile + ".submission.json";
    fs.mkdirSync(path.dirname(stagedFile), { recursive: true });
    writePairAtomic(
      stagedFile,
      candidate.markdown,
      stagedSidecar,
      JSON.stringify(
        {
          version: 2,
          submissionBatchId: batchId,
          generatedArticleId: candidate.articleId,
          clientId: preview.clientId,
          targetPlatformId: candidate.targetPlatformId,
          accountProfileId: candidate.accountProfileId,
          filename: candidate.filename,
          contentHash: candidate.contentHash,
          status: "queued",
        },
        null,
        2,
      ) + "\n",
    );
    const operationalStore = {
      listSubmissionBatches: () => [batch],
      queueSubmissionBatch(input) {
        assert.equal(input.batchId, batchId);
        assert.equal(
          fs.existsSync(path.join(root, "toutiao", candidate.filename)),
          true,
        );
        batch.status = "queued";
        return { batchId, status: "queued" };
      },
      discardPreparedSubmissionBatch() {
        throw new Error("must not discard recoverable batch");
      },
    };
    const persistence = createSubmissionBatchPersistence({
      inputRoot: root,
      operationalStore,
      targetCatalog,
      writePairAtomic,
    });

    assert.deepEqual(persistence.recoverPreparedBatches(), [
      { batchId, status: "queued" },
    ]);
    assert.equal(batch.status, "queued");
    assert.equal(fs.existsSync(stagedFile), false);
    assert.equal(
      fs.existsSync(path.join(root, "toutiao", candidate.filename)),
      true,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("prepared batch recovery discards a batch with no file evidence", () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "submission-recovery-discard-"),
  );
  try {
    const { value, targetCatalog } = planner();
    const preview = value.previewBatch({
      clientId: "client-1",
      articleIds: ["article-1"],
      platformId: "toutiao",
      accountProfileId: "account-1",
    });
    const batch = {
      batchId: "batch-recovery-discard",
      status: "prepared",
      items: [
        {
          articleId: preview.items[0].articleId,
          payload: {
            clientId: preview.clientId,
            targetPlatformId: preview.items[0].targetPlatformId,
            accountProfileId: preview.items[0].accountProfileId,
            filename: preview.items[0].filename,
            contentHash: preview.items[0].contentHash,
          },
        },
      ],
    };
    let discarded = 0;
    const persistence = createSubmissionBatchPersistence({
      inputRoot: root,
      operationalStore: {
        listSubmissionBatches: () => [batch],
        discardPreparedSubmissionBatch(input) {
          assert.equal(input.batchId, batch.batchId);
          discarded += 1;
          batch.status = "discarded";
          return { batchId: batch.batchId, status: "discarded" };
        },
      },
      targetCatalog,
      writePairAtomic,
    });

    assert.deepEqual(persistence.recoverPreparedBatches(), [
      { batchId: batch.batchId, status: "discarded" },
    ]);
    assert.equal(discarded, 1);
    assert.equal(fs.existsSync(path.join(root, ".submission-staging")), false);
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
    "createBatch",
    "listBatches",
    "getBatch",
    "buildSubmissionActionPlan",
    "previewCancelBatch",
    "cancelBatch",
    "reconcileBatch",
    "previewArticleRemovalImpact",
    "cancelArticleSubmissionItem",
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
