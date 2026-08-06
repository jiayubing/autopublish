const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { createRegularQueueApplication } = require("../desktop/services/regular-queue-application");
const { createSubmissionBatchReader } = require("../desktop/services/submission-batch-reader");
const { createArticleMutationCoordinator } = require("../src/content/article-mutation-coordinator");
const { createArticleStore } = require("../src/content/article-store");
const { createContentStore } = require("../src/content/content-store");
const { createOperationalStore } = require("../src/infrastructure/operational-store/operational-store");

function article(articleId, clientId = "client-a", overrides) {
  return Object.assign({
    id: articleId,
    clientId,
    platform: "toutiao",
    scenario: "guide",
    templateId: "template-1",
    title: `Title ${articleId}`,
    content: `Body ${articleId}`,
    status: "saved",
    createdAt: "2026-08-07T00:00:00.000Z",
    updatedAt: "2026-08-07T00:00:00.000Z",
  }, overrides || {});
}

function ref(articleId, clientId = "client-a") {
  return { clientId, articleId };
}

function makeFixture(options) {
  const value = options || {};
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "regular-queue-07-"));
  const lockEvents = [];
  const clients = new Set(["client-a", "client-b"]);
  let store;
  const transitionPorts = {};
  try {
    store = createOperationalStore({
      workspaceRoot: root,
      clock: () => new Date("2026-08-07T00:00:00.000Z"),
      transitionPorts,
    });
    const articleStore = createArticleStore(root, {
      internalArticleLockFault(point, detail) {
        if (point === "after-candidate-owner" && detail && detail.files && detail.files.json)
          lockEvents.push(path.basename(detail.files.json, ".json"));
        if (typeof value.lockFault === "function") value.lockFault(point, detail);
      },
    });
    const contentStore = createContentStore({
      articleStore,
      listClientIds: () => [...clients],
    });
    const profiles = {
      toutiao: store.createAccountProfile({ platformId: "toutiao", displayName: "头条账号" }),
      hepan: store.createAccountProfile({ platformId: "hepan", displayName: "禾畔账号" }),
    };
    const coordinator = createArticleMutationCoordinator({
      articleStore,
      contentStore,
      regularQueueTransitions: transitionPorts.regularQueueTransitions,
      lifecycleFacts: transitionPorts.regularQueueTransitions,
      clock: () => new Date("2026-08-07T00:00:00.000Z"),
    });
    const application = createRegularQueueApplication({
      contentStore,
      articleMutationCoordinator: coordinator,
      regularQueueTransitions: transitionPorts.regularQueueTransitions,
      accountProfileResolver: store.assertExecutableAccountProfile,
      platforms: [
        { id: "toutiao", contentQueueImport: true, publicationTarget: { kind: "platform" } },
        { id: "hepan", contentQueueImport: true, publicationTarget: { kind: "platform" } },
        { id: "media", contentQueueImport: true, publicationTarget: { kind: "resource" } },
      ],
    });
    return {
      root,
      store,
      transitionPorts,
      articleStore,
      contentStore,
      coordinator,
      application,
      profiles,
      lockEvents,
      add(valueArticle) {
        clients.add(valueArticle.clientId);
        contentStore.createArticle(valueArticle);
      },
      close() {
        store.close();
        fs.rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
      },
    };
  } catch (error) {
    if (store) store.close();
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    throw error;
  }
}

function admissionInput(fixture, articleRefs, platformId = "toutiao") {
  return {
    articleRefs,
    platformId,
    accountProfileId: fixture.profiles[platformId].accountProfileId,
  };
}

function removalInput(result, articleRef) {
  const item = result.items.find((candidate) => candidate.articleRef.articleId === articleRef.articleId);
  return {
    items: [{
      articleRef,
      itemId: item.itemId,
      batchId: item.batchId,
      targetKey: item.targetKey,
    }],
  };
}

test("regular queue application enforces one platform/account and returns per-article preview results", () => {
  const fixture = makeFixture();
  try {
    fixture.add(article("article-a"));
    fixture.add(article("article-b"));
    const input = admissionInput(fixture, [ref("article-b"), ref("article-a"), ref("article-a"), ref("missing")]);
    const preview = fixture.application.previewRegularQueueAdmission(input);
    assert.deepEqual(preview.articleRefs.map((item) => item.articleId), ["article-a", "article-b", "missing"]);
    assert.equal(preview.totalCount, 3);
    assert.equal(preview.queueableCount, 2);
    assert.equal(preview.missingCount, 1);
    assert.deepEqual(preview.items.map((item) => item.status), ["queueable", "queueable", "missing"]);

    assert.throws(
      () => fixture.application.previewRegularQueueAdmission(Object.assign({}, input, { targetPlatformIds: ["toutiao"] })),
      { code: "REGULAR_QUEUE_SINGLE_TARGET_REQUIRED" },
    );
    assert.throws(
      () => fixture.application.previewRegularQueueAdmission(Object.assign({}, input, { mediaResourceId: "resource-1" })),
      { code: "REGULAR_QUEUE_PLATFORM_REQUIRED" },
    );
    assert.throws(
      () => fixture.application.previewRegularQueueAdmission(Object.assign({}, input, { platformId: "unknown" })),
      { code: "REGULAR_QUEUE_PLATFORM_UNSUPPORTED" },
    );
    assert.throws(
      () => fixture.application.previewRegularQueueAdmission(Object.assign({}, input, { accountProfileId: fixture.profiles.hepan.accountProfileId })),
      { code: "ACCOUNT_PROFILE_PLATFORM_MISMATCH" },
    );
    assert.throws(
      () => fixture.application.previewRegularQueueAdmission(Object.assign({}, input, { batchId: "caller-controlled-batch" })),
      { code: "REGULAR_QUEUE_INPUT_INVALID" },
    );
    assert.throws(
      () => fixture.application.admitRegularQueueItems(Object.assign({}, input, { batchId: "caller-controlled-batch" })),
      { code: "REGULAR_QUEUE_INPUT_INVALID" },
    );
    fixture.add(article("article-cross-client", "client-b"));
    assert.throws(
      () => fixture.application.previewRegularQueueAdmission(admissionInput(fixture, [ref("article-a"), ref("article-cross-client", "client-b")])),
      { code: "REGULAR_QUEUE_SINGLE_CLIENT_REQUIRED" },
    );
  } finally {
    fixture.close();
  }
});

test("regular admission creates one FIFO group and atomic facts, hides the immutable snapshot, and is idempotent", () => {
  const fixture = makeFixture();
  try {
    fixture.add(article("article-a"));
    fixture.add(article("article-b"));
    const input = admissionInput(fixture, [ref("article-b"), ref("article-a")]);
    const first = fixture.application.admitRegularQueueItems(input);
    assert.equal(first.admittedCount, 2);
    assert.equal(first.idempotentCount, 0);
    assert.deepEqual(first.items.map((item) => item.status), ["queued", "queued"]);
    assert.equal(new Set(first.items.map((item) => item.queueGroupId)).size, 1);
    assert.deepEqual(first.items.map((item) => item.position), [1, 2]);
    assert.equal(fixture.store.listSubmissionQueueGroups().length, 1);
    assert.equal(fixture.store.listSubmissionQueueItems().length, 2);
    assert.equal(fixture.store.listPublicationRecords({ articleIds: ["article-a", "article-b"] }).length, 2);
    assert.equal(fixture.store.listArticleLifecycleFacts({ articleIds: ["article-a", "article-b"] }).publications.length, 2);

    const publicBatch = createSubmissionBatchReader({ operationalStore: fixture.store }).getBatch(first.batchId);
    assert.equal(publicBatch.items.length, 2);
    assert.equal(Object.prototype.hasOwnProperty.call(publicBatch.items[0], "publicationSnapshot"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(publicBatch.items[0], "articleRef"), false);
    assert.equal(publicBatch.items[0].queueGroupId, first.items[0].queueGroupId);

    const second = fixture.application.admitRegularQueueItems(input);
    assert.equal(second.admittedCount, 0);
    assert.equal(second.idempotentCount, 2);
    assert.notEqual(second.batchId, first.batchId);
    assert.deepEqual(second.items.map((item) => item.status), ["idempotent", "idempotent"]);
    assert.equal(fixture.store.listSubmissionQueueItems().length, 2);
    assert.equal(fixture.store.listPublicationRecords({ articleIds: ["article-a", "article-b"] }).length, 2);
  } finally {
    fixture.close();
  }
});

test("pending removal restores editing, removes all linked facts, and repeated removal is idempotent", () => {
  const fixture = makeFixture();
  try {
    const original = article("article-a");
    fixture.add(original);
    const before = fixture.coordinator.readArticleForEdit(ref("article-a"));
    const admitted = fixture.application.admitRegularQueueItems(admissionInput(fixture, [ref("article-a")]));
    assert.throws(
      () => fixture.coordinator.saveExistingArticle({ article: Object.assign({}, original, { title: "blocked" }), expectedFingerprint: before.editFingerprint }),
      { code: "ARTICLE_OPERATION_FROZEN" },
    );

    const removed = fixture.application.removePendingQueueItems(removalInput(admitted, ref("article-a")));
    assert.equal(removed.removedCount, 1);
    assert.equal(removed.idempotentCount, 0);
    assert.equal(fixture.store.listSubmissionQueueItems().length, 0);
    const facts = fixture.store.listArticleLifecycleFacts({ articleIds: ["article-a"] });
    assert.equal(facts.publications.length, 1);
    assert.equal(facts.publications[0].status, "cancelled");
    assert.equal(facts.publications[0].reasonCode, "REGULAR_QUEUE_ITEM_CANCELLED");
    assert.equal(facts.submissionItems[0].status, "cancelled");
    const history = fixture.store.listPublicationRecords({ articleIds: ["article-a"] });
    assert.equal(history.length, 1);
    assert.equal(history[0].status, "cancelled");
    assert.equal(history[0].reasonCode, "REGULAR_QUEUE_ITEM_CANCELLED");
    assert.equal(history[0].attempts.length, 1);
    assert.equal(history[0].attempts[0].status, "cancelled");
    assert.equal(history[0].attempts[0].reasonCode, "REGULAR_QUEUE_ITEM_CANCELLED");
    assert.throws(
      () => fixture.store.commitRemoteOutcome({
        attemptId: admitted.items[0].attemptId,
        outcome: { status: "failed" },
      }),
      { code: "PUBLICATION_CANCELLED" },
    );

    const editable = fixture.coordinator.readArticleForEdit(ref("article-a"));
    const saved = fixture.coordinator.saveExistingArticle({
      article: Object.assign({}, editable.article, { title: "saved after removal" }),
      expectedFingerprint: editable.editFingerprint,
    });
    assert.equal(saved.outcome, "saved");
    const stale = fixture.coordinator.saveExistingArticle({
      article: Object.assign({}, saved.article, { title: "stale" }),
      expectedFingerprint: editable.editFingerprint,
    });
    assert.deepEqual(stale, {
      outcome: "conflict",
      code: "ARTICLE_EDIT_CONFLICT",
      articleId: "article-a",
      refreshRequired: true,
    });

    const repeated = fixture.application.removePendingQueueItems(removalInput(admitted, ref("article-a")));
    assert.equal(repeated.removedCount, 0);
    assert.equal(repeated.idempotentCount, 1);
    assert.equal(repeated.items[0].status, "cancelled");
  } finally {
    fixture.close();
  }
});

test("partial admission leaves no orphan facts and claimed or active-order items cannot be locally removed", () => {
  const fixture = makeFixture();
  try {
    fixture.add(article("article-a"));
    fixture.add(article("article-b"));
    const toutiao = fixture.application.admitRegularQueueItems(admissionInput(fixture, [ref("article-a")]));
    const mixed = fixture.application.admitRegularQueueItems(admissionInput(fixture, [ref("article-a"), ref("article-b")], "hepan"));
    assert.equal(mixed.items[0].status, "conflict");
    assert.equal(mixed.items[0].reasonCode, "ARTICLE_ACTIVE_TARGET_CONFLICT");
    assert.equal(mixed.items[1].status, "queued");
    assert.equal(fixture.store.listSubmissionQueueItems().length, 2);
    assert.equal(fixture.store.listPublicationRecords({ articleIds: ["article-a"] }).length, 1);

    const claimed = fixture.store.claimSubmissionItemById({
      itemId: toutiao.items[0].itemId,
      batchId: toutiao.items[0].batchId,
      claimToken: "fixture-claim",
    });
    assert.ok(claimed);
    const blocked = fixture.application.removePendingQueueItems(removalInput(toutiao, ref("article-a")));
    assert.equal(blocked.removedCount, 0);
    assert.equal(blocked.conflictCount, 1);
    assert.equal(blocked.items[0].reasonCode, "REGULAR_QUEUE_ITEM_NOT_REMOVABLE");
    assert.equal(fixture.store.listSubmissionQueueItems().length, 2);

    fixture.add(article("article-c"));
    const activeOrder = fixture.application.admitRegularQueueItems(admissionInput(fixture, [ref("article-c")]));
    const activeOrderFact = fixture.store.listArticleLifecycleFacts({ articleIds: ["article-c"] }).submissionItems.find((item) => item.itemId === activeOrder.items[0].itemId);
    fixture.store.attachRemoteOrderEvidence({
      attemptId: activeOrderFact.payload.attemptId,
      orderId: "order-regular-c",
      remoteId: "remote-order-c",
      evidence: { source: "fixture" },
    });
    const activeOrderBlocked = fixture.application.removePendingQueueItems(removalInput(activeOrder, ref("article-c")));
    assert.equal(activeOrderBlocked.removedCount, 0);
    assert.equal(activeOrderBlocked.conflictCount, 1);
    assert.equal(activeOrderBlocked.items[0].reasonCode, "REGULAR_QUEUE_ITEM_NOT_REMOVABLE");
  } finally {
    fixture.close();
  }
});

test("public admission/removal behavior uses canonical lock order and releases partial acquisitions", () => {
  const fixture = makeFixture();
  try {
    fixture.add(article("article-a"));
    fixture.add(article("article-b"));
    fixture.lockEvents.length = 0;
    const result = fixture.application.admitRegularQueueItems(admissionInput(fixture, [ref("article-b"), ref("article-a"), ref("article-a")]));
    assert.equal(result.admittedCount, 2);
    assert.deepEqual(fixture.lockEvents.slice(-2), ["article-a", "article-b"]);
  } finally {
    fixture.close();
  }

  let armed = false;
  let failed = false;
  const failing = makeFixture({
    lockFault(point, detail) {
      if (armed && !failed && point === "after-candidate-owner" && detail.files.json.endsWith("article-b.json")) {
        failed = true;
        const error = new Error("synthetic article lock contention");
        error.code = "ARTICLE_STORE_BUSY";
        throw error;
      }
    },
  });
  try {
    failing.add(article("article-a"));
    failing.add(article("article-b"));
    failing.lockEvents.length = 0;
    armed = true;
    assert.throws(
      () => failing.application.admitRegularQueueItems(
        admissionInput(failing, [ref("article-b"), ref("article-a")]),
      ),
      { code: "ARTICLE_MUTATION_BUSY" },
    );
    assert.equal(failed, true);
    assert.equal(failing.store.listSubmissionQueueItems().length, 0);
    assert.equal(fs.existsSync(path.join(failing.root, "generated", "client-a", "article-a.article-lock")), false);
  } finally {
    failing.close();
  }
});

test("regular queue capabilities stay isolated from the full operational store and unrelated application commands", () => {
  const fixture = makeFixture();
  try {
    assert.deepEqual(Object.keys(fixture.transitionPorts.regularQueueTransitions).sort(), [
      "admitRegularQueueItem",
      "listArticleLifecycleFacts",
      "removePendingQueueItem",
    ]);
    assert.deepEqual(Object.keys(fixture.application).sort(), [
      "admitRegularQueueItems",
      "previewRegularQueueAdmission",
      "removePendingQueueItems",
    ]);
    assert.equal(Object.prototype.hasOwnProperty.call(fixture.application, "createPaidSubmissionBatch"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(fixture.application, "commitRemoteOutcome"), false);
  } finally {
    fixture.close();
  }
});
