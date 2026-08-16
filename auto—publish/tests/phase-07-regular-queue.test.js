const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  createRegularQueueApplication,
} = require("../desktop/services/regular-queue-application");
const {
  createWorkspaceDataInvalidation,
} = require("../desktop/workspace-data-invalidation");
const {
  createArticleManagementSnapshot,
} = require("../desktop/services/article-management-snapshot");
const {
  createArticleMutationCoordinator,
} = require("../src/content/article-mutation-coordinator");
const { createArticleStore } = require("../src/content/article-store");
const {
  createContentStore,
  fingerprintArticle,
} = require("../src/content/content-store");
const {
  createOperationalStore,
} = require("../src/infrastructure/operational-store/operational-store");

function article(articleId, clientId = "client-a", overrides) {
  return Object.assign(
    {
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
    },
    overrides || {},
  );
}

function ref(articleId, clientId = "client-a") {
  return { clientId, articleId };
}

function makeFixture(options) {
  const value = options || {};
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "regular-queue-07-"));
  const lockEvents = [];
  const invalidationReasons = [];
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
        if (
          point === "after-candidate-owner" &&
          detail &&
          detail.files &&
          detail.files.json
        )
          lockEvents.push(path.basename(detail.files.json, ".json"));
        if (typeof value.lockFault === "function")
          value.lockFault(point, detail);
      },
    });
    const contentStore = createContentStore({
      articleStore,
      listClientIds: () => [...clients],
    });
    const profiles = {
      toutiao: store.createAccountProfile({
        platformId: "toutiao",
        displayName: "头条账号",
      }),
      hepan: store.createAccountProfile({
        platformId: "hepan",
        displayName: "禾畔账号",
      }),
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
      regularQueueGroupTransitions:
        transitionPorts.regularQueueGroupTransitions,
      regularQueueGroupImageCountTransitions:
        transitionPorts.regularQueueGroupImageCountTransitions,
      accountProfileResolver: store.assertExecutableAccountProfile,
      clientSnapshotResolver: (clientId) => ({
        version: 1,
        clientId,
        displayName: `客户 ${clientId}`,
      }),
      onDataInvalidated: (reasonCode) => {
        invalidationReasons.push(reasonCode);
        if (typeof value.onDataInvalidated === "function")
          value.onDataInvalidated(reasonCode);
      },
      platforms: [
        {
          id: "toutiao",
          contentQueueImport: true,
          publicationTarget: { kind: "platform" },
        },
        {
          id: "hepan",
          contentQueueImport: true,
          publicationTarget: { kind: "platform" },
        },
        {
          id: "media",
          contentQueueImport: true,
          publicationTarget: { kind: "resource" },
        },
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
      invalidationReasons,
      add(valueArticle) {
        clients.add(valueArticle.clientId);
        contentStore.createArticle(valueArticle);
      },
      close() {
        store.close();
        fs.rmSync(root, {
          recursive: true,
          force: true,
          maxRetries: 3,
          retryDelay: 100,
        });
      },
    };
  } catch (error) {
    if (store) store.close();
    fs.rmSync(root, {
      recursive: true,
      force: true,
      maxRetries: 3,
      retryDelay: 100,
    });
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
  const item = result.items.find(
    (candidate) => candidate.articleRef.articleId === articleRef.articleId,
  );
  return {
    items: [
      {
        articleRef,
        itemId: item.itemId,
        batchId: item.batchId,
        targetKey: item.targetKey,
      },
    ],
  };
}

async function waitFor(predicate, message) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.fail(message || "synthetic refresh condition was not reached");
}

test("regular queue application enforces one platform/account and returns per-article preview results", () => {
  const fixture = makeFixture();
  try {
    fixture.add(article("article-a"));
    fixture.add(article("article-b"));
    const input = admissionInput(fixture, [
      ref("article-b"),
      ref("article-a"),
      ref("article-a"),
      ref("missing"),
    ]);
    const preview = fixture.application.previewRegularQueueAdmission(input);
    assert.deepEqual(
      preview.articleRefs.map((item) => item.articleId),
      ["article-a", "article-b", "missing"],
    );
    assert.equal(preview.totalCount, 3);
    assert.equal(preview.queueableCount, 2);
    assert.equal(preview.missingCount, 1);
    assert.deepEqual(
      preview.items.map((item) => item.status),
      ["queueable", "queueable", "missing"],
    );

    assert.throws(
      () =>
        fixture.application.previewRegularQueueAdmission(
          Object.assign({}, input, { targetPlatformIds: ["toutiao"] }),
        ),
      { code: "REGULAR_QUEUE_SINGLE_TARGET_REQUIRED" },
    );
    assert.throws(
      () =>
        fixture.application.previewRegularQueueAdmission(
          Object.assign({}, input, { mediaResourceId: "resource-1" }),
        ),
      { code: "REGULAR_QUEUE_PLATFORM_REQUIRED" },
    );
    assert.throws(
      () =>
        fixture.application.previewRegularQueueAdmission(
          Object.assign({}, input, { platformId: "unknown" }),
        ),
      { code: "REGULAR_QUEUE_PLATFORM_UNSUPPORTED" },
    );
    assert.throws(
      () =>
        fixture.application.previewRegularQueueAdmission(
          Object.assign({}, input, {
            accountProfileId: fixture.profiles.hepan.accountProfileId,
          }),
        ),
      { code: "ACCOUNT_PROFILE_PLATFORM_MISMATCH" },
    );
    assert.throws(
      () =>
        fixture.application.previewRegularQueueAdmission(
          Object.assign({}, input, { batchId: "caller-controlled-batch" }),
        ),
      { code: "REGULAR_QUEUE_INPUT_INVALID" },
    );
    assert.throws(
      () =>
        fixture.application.admitRegularQueueItems(
          Object.assign({}, input, { batchId: "caller-controlled-batch" }),
        ),
      { code: "REGULAR_QUEUE_INPUT_INVALID" },
    );
    fixture.add(article("article-cross-client", "client-b"));
    assert.throws(
      () =>
        fixture.application.previewRegularQueueAdmission(
          admissionInput(fixture, [
            ref("article-a"),
            ref("article-cross-client", "client-b"),
          ]),
        ),
      { code: "REGULAR_QUEUE_SINGLE_CLIENT_REQUIRED" },
    );
  } finally {
    fixture.close();
  }
});

test("regular queue snapshots fail closed to the requested client", () => {
  const fixture = makeFixture();
  try {
    fixture.add(article("article-a", "client-a"));
    fixture.add(article("article-b", "client-b"));
    fixture.application.admitRegularQueueItems(
      admissionInput(fixture, [ref("article-a", "client-a")]),
    );
    fixture.application.admitRegularQueueItems(
      admissionInput(fixture, [ref("article-b", "client-b")]),
    );

    const clientAGroups = fixture.application.listRegularQueueGroups({
      clientId: "client-a",
    });
    assert.equal(clientAGroups.length, 1);
    assert.deepEqual(
      clientAGroups.flatMap((group) =>
        group.remaining.map((item) => item.articleRef),
      ),
      [ref("article-a", "client-a")],
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
    assert.deepEqual(
      first.items.map((item) => item.status),
      ["queued", "queued"],
    );
    assert.equal(new Set(first.items.map((item) => item.queueGroupId)).size, 1);
    assert.deepEqual(
      first.items.map((item) => item.position),
      [1, 2],
    );
    assert.equal(fixture.store.listSubmissionQueueGroups().length, 1);
    assert.equal(fixture.store.listSubmissionQueueItems().length, 2);
    assert.equal(
      fixture.store.listPublicationRecords({
        articleIds: ["article-a", "article-b"],
      }).length,
      2,
    );
    assert.equal(
      fixture.store.listArticleLifecycleFacts({
        articleIds: ["article-a", "article-b"],
      }).publications.length,
      2,
    );

    const publicItems = first.items;
    assert.equal(publicItems.length, 2);
    assert.equal(
      Object.prototype.hasOwnProperty.call(
        publicItems[0],
        "publicationSnapshot",
      ),
      false,
    );
    assert.equal(
      publicItems[0].queueGroupId,
      first.items[0].queueGroupId,
    );

    const second = fixture.application.admitRegularQueueItems(input);
    assert.equal(second.admittedCount, 0);
    assert.equal(second.idempotentCount, 2);
    assert.notEqual(second.batchId, first.batchId);
    assert.deepEqual(
      second.items.map((item) => item.status),
      ["idempotent", "idempotent"],
    );
    assert.equal(fixture.store.listSubmissionQueueItems().length, 2);
    assert.equal(
      fixture.store.listPublicationRecords({
        articleIds: ["article-a", "article-b"],
      }).length,
      2,
    );
  } finally {
    fixture.close();
  }
});

test("regular admission invalidates exactly once for new items and not for idempotent replay", () => {
  const fixture = makeFixture();
  try {
    fixture.add(article("article-a"));
    const input = admissionInput(fixture, [ref("article-a")]);

    const first = fixture.application.admitRegularQueueItems(input);
    assert.equal(first.admittedCount, 1);
    assert.deepEqual(fixture.invalidationReasons, ["SUBMISSION_BATCH_CREATED"]);

    const replay = fixture.application.admitRegularQueueItems(input);
    assert.equal(replay.admittedCount, 0);
    assert.deepEqual(fixture.invalidationReasons, ["SUBMISSION_BATCH_CREATED"]);
  } finally {
    fixture.close();
  }
});

test("regular admission invalidation refreshes article management from the new workspace revision", async () => {
  let managementSnapshot = null;
  const invalidation = createWorkspaceDataInvalidation({
    workspaceRuntimeId: "r2-article-management",
    sendToRenderer: (_channel, event) => {
      if (event.scopes.includes("articleManagement") && managementSnapshot)
        managementSnapshot.invalidate();
    },
  });
  const fixture = makeFixture({
    onDataInvalidated: (reasonCode) => invalidation.invalidate(reasonCode),
  });
  try {
    fixture.add(article("article-a"));
    managementSnapshot = createArticleManagementSnapshot({
      workspaceRoot: fixture.root,
      getRevision: invalidation.getRevision,
      aiContentService: {
        listGeneratedArticles: (clientId) =>
          fixture.contentStore.listArticles(clientId),
        listTrashedArticles: (clientId) =>
          fixture.contentStore.listTrashedArticles(clientId),
      },
      operationalStore: fixture.store,
    });

    const before = await managementSnapshot.get({ clientId: "client-a" });
    assert.equal(before.revision, 0);
    assert.equal(
      before.workflowByArticle["article-a"].stage,
      "pending_submission",
    );

    const admitted = fixture.application.admitRegularQueueItems(
      admissionInput(fixture, [ref("article-a")]),
    );
    assert.equal(admitted.admittedCount, 1);

    const after = await managementSnapshot.get({ clientId: "client-a" });
    assert.equal(after.revision, 1);
    assert.equal(after.workflowByArticle["article-a"].stage, "in_submission");
    assert.notEqual(
      after.workflowByArticle["article-a"].stage,
      "pending_submission",
    );
  } finally {
    fixture.close();
  }
});

test("regular queue removal invalidation refreshes cached article management from the new workspace revision", async () => {
  let managementSnapshot = null;
  const invalidation = createWorkspaceDataInvalidation({
    workspaceRuntimeId: "r2-article-management-removal",
    sendToRenderer: (_channel, event) => {
      if (event.scopes.includes("articleManagement") && managementSnapshot)
        managementSnapshot.invalidate();
    },
  });
  const fixture = makeFixture({
    onDataInvalidated: (reasonCode) => invalidation.invalidate(reasonCode),
  });
  try {
    fixture.add(article("article-a"));
    managementSnapshot = createArticleManagementSnapshot({
      workspaceRoot: fixture.root,
      getRevision: invalidation.getRevision,
      aiContentService: {
        listGeneratedArticles: (clientId) =>
          fixture.contentStore.listArticles(clientId),
        listTrashedArticles: (clientId) =>
          fixture.contentStore.listTrashedArticles(clientId),
      },
      operationalStore: fixture.store,
    });

    const admitted = fixture.application.admitRegularQueueItems(
      admissionInput(fixture, [ref("article-a")]),
    );
    assert.equal(admitted.admittedCount, 1);

    const queued = await managementSnapshot.get({ clientId: "client-a" });
    assert.equal(queued.revision, 1);
    assert.equal(queued.workflowByArticle["article-a"].stage, "in_submission");
    assert.equal(managementSnapshot.cacheSize(), 1);

    const removed = fixture.application.removePendingQueueItems(
      removalInput(admitted, ref("article-a")),
    );
    assert.equal(removed.removedCount, 1);
    assert.deepEqual(fixture.invalidationReasons, [
      "SUBMISSION_BATCH_CREATED",
      "SUBMISSION_BATCH_CANCELLED",
    ]);
    assert.equal(invalidation.getRevision(), 2);
    assert.equal(fixture.store.listSubmissionQueueItems().length, 0);

    const restored = await managementSnapshot.get({ clientId: "client-a" });
    assert.equal(restored.revision, 2);
    assert.equal(
      restored.workflowByArticle["article-a"].stage,
      "pending_submission",
    );
    assert.equal(restored.workflowByArticle["article-a"].locks.canEdit, true);
    assert.equal(restored.workflowByArticle["article-a"].locks.canSubmit, true);
    assert.equal(restored.workflowByArticle["article-a"].locks.canQueue, true);
  } finally {
    fixture.close();
  }
});

test("regular admission invalidation refreshes the platform queue view with the new queue item", async () => {
  const platformModule =
    await import("../media-workbench/src/features/platform/platform-feature.js");
  let platformFeature = null;
  const invalidation = createWorkspaceDataInvalidation({
    workspaceRuntimeId: "r2-platform-queue",
    sendToRenderer: (_channel, event) => {
      if (event.scopes.includes("platformQueue") && platformFeature)
        void platformFeature.refreshRegularQueueGroups(event.reasonCode);
    },
  });
  const fixture = makeFixture({
    onDataInvalidated: (reasonCode) => invalidation.invalidate(reasonCode),
  });
  try {
    platformFeature = platformModule.createPlatformFeature({
      platformDisplayName: (platformId) => platformId,
      listAccountProfiles: async () => fixture.store.listAccountProfiles(),
      listRegularQueueGroups: async () =>
        fixture.application.listRegularQueueGroups(),
    });
    platformFeature.setScope({ workspaceRuntimeId: "r2-platform-queue" });
    await platformFeature.refreshAccountProfiles("initial");
    await platformFeature.refreshRegularQueueGroups("initial");
    assert.deepEqual(platformFeature.getSnapshot().regularQueueGroupViews, []);

    fixture.add(article("article-a"));
    const admitted = fixture.application.admitRegularQueueItems(
      admissionInput(fixture, [ref("article-a")]),
    );
    assert.equal(admitted.admittedCount, 1);

    await waitFor(
      () =>
        platformFeature
          .getSnapshot()
          .regularQueueGroupViews.some((group) =>
            group.remaining.some((item) => item.articleId === "article-a"),
          ),
      "platform queue view should refresh after regular admission",
    );
    const view = platformFeature
      .getSnapshot()
      .regularQueueGroupViews.find((group) =>
        group.remaining.some((item) => item.articleId === "article-a"),
      );
    assert.equal(view.platformId, "toutiao");
    assert.equal(
      view.accountProfileId,
      fixture.profiles.toutiao.accountProfileId,
    );
  } finally {
    if (platformFeature) platformFeature.dispose();
    fixture.close();
  }
});

test("posting-center read model exposes safe article summaries and queue actions", () => {
  const fixture = makeFixture();
  try {
    fixture.add(article("article-a"));
    fixture.add(article("article-b"));
    const admitted = fixture.application.admitRegularQueueItems(
      admissionInput(fixture, [ref("article-a"), ref("article-b")]),
    );

    const paused = fixture.application.listRegularQueueGroups();
    assert.equal(paused.length, 1);
    assert.equal(paused[0].runState, "paused");
    assert.equal(paused[0].pauseIntent, "system");
    assert.equal(paused[0].actions.canStart, true);
    assert.equal(paused[0].actions.canPause, false);
    assert.deepEqual(
      paused[0].remaining.map((item) => [item.position, item.articleRef]),
      [
        [1, ref("article-a")],
        [2, ref("article-b")],
      ],
    );
    assert.deepEqual(paused[0].remaining[0].articleSummary, {
      title: "Title article-a",
      customerName: "客户 client-a",
    });
    assert.equal(
      Object.prototype.hasOwnProperty.call(
        paused[0].remaining[0],
        "claimToken",
      ),
      false,
    );
    assert.equal(
      Object.prototype.hasOwnProperty.call(
        paused[0].remaining[0],
        "publicationSnapshot",
      ),
      false,
    );

    fixture.transitionPorts.regularQueueGroupTransitions.setRegularQueueGroupRunIntent(
      {
        queueGroupId: admitted.items[0].queueGroupId,
        running: true,
      },
    );
    const running = fixture.application.listRegularQueueGroups()[0];
    assert.equal(running.runState, "running");
    assert.equal(running.actions.canStart, false);
    assert.equal(running.actions.canPause, true);

    fixture.transitionPorts.regularQueueGroupTransitions.setRegularQueueGroupRunIntent(
      {
        queueGroupId: admitted.items[0].queueGroupId,
        running: false,
      },
    );
    const pausedAgain = fixture.application.listRegularQueueGroups()[0];
    assert.equal(pausedAgain.runState, "paused");
    const removed = fixture.application.removePendingQueueItems(
      removalInput(admitted, ref("article-a")),
    );
    assert.equal(removed.removedCount, 1);
    const afterRemoval = fixture.application.listRegularQueueGroups()[0];
    assert.deepEqual(
      afterRemoval.remaining.map((item) => item.articleId),
      ["article-b"],
    );
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
    const admitted = fixture.application.admitRegularQueueItems(
      admissionInput(fixture, [ref("article-a")]),
    );
    assert.throws(
      () =>
        fixture.coordinator.saveExistingArticle({
          article: Object.assign({}, original, { title: "blocked" }),
          expectedFingerprint: before.editFingerprint,
        }),
      { code: "ARTICLE_OPERATION_FROZEN" },
    );

    const removed = fixture.application.removePendingQueueItems(
      removalInput(admitted, ref("article-a")),
    );
    assert.equal(removed.removedCount, 1);
    assert.equal(removed.idempotentCount, 0);
    assert.equal(fixture.store.listSubmissionQueueItems().length, 0);
    const facts = fixture.store.listArticleLifecycleFacts({
      articleIds: ["article-a"],
    });
    assert.equal(facts.publications.length, 1);
    assert.equal(facts.publications[0].status, "cancelled");
    assert.equal(
      facts.publications[0].reasonCode,
      "REGULAR_QUEUE_ITEM_CANCELLED",
    );
    assert.equal(facts.submissionItems[0].status, "cancelled");
    const history = fixture.store.listPublicationRecords({
      articleIds: ["article-a"],
    });
    assert.equal(history.length, 1);
    assert.equal(history[0].status, "cancelled");
    assert.equal(history[0].reasonCode, "REGULAR_QUEUE_ITEM_CANCELLED");
    assert.equal(history[0].attempts.length, 1);
    assert.equal(history[0].attempts[0].status, "cancelled");
    assert.equal(
      history[0].attempts[0].reasonCode,
      "REGULAR_QUEUE_ITEM_CANCELLED",
    );
    assert.throws(
      () =>
        fixture.store.commitRemoteOutcome({
          attemptId: admitted.items[0].attemptId,
          outcome: { status: "failed" },
        }),
      { code: "PUBLICATION_CANCELLED" },
    );

    const editable = fixture.coordinator.readArticleForEdit(ref("article-a"));
    const saved = fixture.coordinator.saveExistingArticle({
      article: Object.assign({}, editable.article, {
        title: "saved after removal",
      }),
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

    const repeated = fixture.application.removePendingQueueItems(
      removalInput(admitted, ref("article-a")),
    );
    assert.equal(repeated.removedCount, 0);
    assert.equal(repeated.idempotentCount, 1);
    assert.equal(repeated.items[0].status, "cancelled");
  } finally {
    fixture.close();
  }
});

test("cancelled regular admission can re-enter the same target with a new attempt and preserved audit history", () => {
  const fixture = makeFixture();
  try {
    const original = article("article-a");
    fixture.add(original);
    const first = fixture.application.admitRegularQueueItems(
      admissionInput(fixture, [ref("article-a")]),
    );
    const removed = fixture.application.removePendingQueueItems(
      removalInput(first, ref("article-a")),
    );
    assert.equal(removed.removedCount, 1);

    const preview = fixture.application.previewRegularQueueAdmission(
      admissionInput(fixture, [ref("article-a")]),
    );
    assert.equal(preview.items[0].status, "queueable");

    const second = fixture.application.admitRegularQueueItems(
      admissionInput(fixture, [ref("article-a")]),
    );
    assert.equal(second.admittedCount, 1);
    assert.equal(second.items[0].status, "queued");
    assert.equal(second.items[0].publicationId, first.items[0].publicationId);
    assert.notEqual(second.items[0].attemptId, first.items[0].attemptId);
    assert.notEqual(second.items[0].itemId, first.items[0].itemId);
    assert.equal(fixture.store.listSubmissionQueueItems().length, 1);
    const repeatedAdmission = fixture.application.admitRegularQueueItems(
      admissionInput(fixture, [ref("article-a")]),
    );
    assert.equal(repeatedAdmission.idempotentCount, 1);
    assert.equal(
      repeatedAdmission.items[0].attemptId,
      second.items[0].attemptId,
    );
    assert.equal(fixture.store.listSubmissionQueueItems().length, 1);

    const facts = fixture.store.listArticleLifecycleFacts({
      articleIds: ["article-a"],
    });
    assert.equal(facts.publications.length, 1);
    assert.equal(facts.publications[0].status, "queued");
    assert.equal(facts.publications[0].attemptId, second.items[0].attemptId);
    assert.deepEqual(facts.submissionItems.map((item) => item.status).sort(), [
      "cancelled",
      "queued",
    ]);
    const history = fixture.store.listPublicationRecords({
      articleIds: ["article-a"],
    });
    assert.equal(history.length, 1);
    assert.deepEqual(
      history[0].attempts.map((attempt) => attempt.status),
      ["cancelled", "queued"],
    );
    assert.throws(
      () =>
        fixture.coordinator.saveExistingArticle({
          article: Object.assign({}, original, { title: "still frozen" }),
          expectedFingerprint: fingerprintArticle(original),
        }),
      { code: "ARTICLE_OPERATION_FROZEN" },
    );

    const removedAgain = fixture.application.removePendingQueueItems(
      removalInput(second, ref("article-a")),
    );
    assert.equal(removedAgain.removedCount, 1);
    const finalHistory = fixture.store.listPublicationRecords({
      articleIds: ["article-a"],
    });
    assert.deepEqual(
      finalHistory[0].attempts.map((attempt) => attempt.status),
      ["cancelled", "cancelled"],
    );
    assert.equal(fixture.store.listSubmissionQueueItems().length, 0);
    assert.equal(
      fixture.coordinator.readArticleForEdit(ref("article-a")).article.id,
      "article-a",
    );
  } finally {
    fixture.close();
  }
});

test("attention selects only the latest failed attempt and a new admission can re-enter the same target", () => {
  const fixture = makeFixture();
  try {
    fixture.add(article("article-a"));
    const first = fixture.application.admitRegularQueueItems(
      admissionInput(fixture, [ref("article-a")]),
    );
    fixture.application.removePendingQueueItems(
      removalInput(first, ref("article-a")),
    );
    const second = fixture.application.admitRegularQueueItems(
      admissionInput(fixture, [ref("article-a")]),
    );
    const durableItem = fixture.store.getSubmissionBatch(second.batchId)
      .items[0];
    const claim = fixture.store.claimSubmissionItemById({
      itemId: second.items[0].itemId,
      batchId: second.batchId,
      revision: durableItem.revision,
      claimToken: "same-clock-failure",
    });
    fixture.store.commitRemoteOutcome({
      attemptId: second.items[0].attemptId,
      batchItemId: second.items[0].itemId,
      batchClaimToken: claim.claimToken,
      outcome: { status: "failed" },
    });

    const attention = fixture.store.listPublicationAttention();
    assert.equal(attention.length, 1);
    assert.equal(attention[0].attemptId, second.items[0].attemptId);
    const history = fixture.store.listPublicationRecords({
      articleIds: ["article-a"],
    });
    assert.deepEqual(
      history[0].attempts.map((attempt) => attempt.status),
      ["cancelled", "failed"],
    );

    const preview = fixture.application.previewRegularQueueAdmission(
      admissionInput(fixture, [ref("article-a")]),
    );
    assert.equal(preview.items[0].status, "queueable");
    const third = fixture.application.admitRegularQueueItems(
      admissionInput(fixture, [ref("article-a")]),
    );
    assert.equal(third.admittedCount, 1);
    assert.equal(third.items[0].publicationId, second.items[0].publicationId);
    assert.notEqual(third.items[0].attemptId, second.items[0].attemptId);
    assert.deepEqual(fixture.store.listPublicationAttention(), []);
    assert.deepEqual(
      fixture.store
        .listPublicationRecords({ articleIds: ["article-a"] })[0]
        .attempts.map((attempt) => attempt.status),
      ["cancelled", "failed", "queued"],
    );
  } finally {
    fixture.close();
  }
});

test("pending removal binds the caller batch id and leaves the real queue item untouched on mismatch", () => {
  const fixture = makeFixture();
  try {
    fixture.add(article("article-a"));
    const admitted = fixture.application.admitRegularQueueItems(
      admissionInput(fixture, [ref("article-a")]),
    );
    const wrong = removalInput(admitted, ref("article-a"));
    wrong.items[0].batchId = "regular-batch-stale-caller-value";

    const rejected = fixture.application.removePendingQueueItems(wrong);
    assert.equal(rejected.removedCount, 0);
    assert.equal(rejected.conflictCount, 1);
    assert.equal(rejected.items[0].reasonCode, "REGULAR_QUEUE_ITEM_NOT_FOUND");
    assert.equal(fixture.store.listSubmissionQueueItems().length, 1);
    assert.equal(
      fixture.store.listArticleLifecycleFacts({ articleIds: ["article-a"] })
        .submissionItems[0].status,
      "queued",
    );

    const removed = fixture.application.removePendingQueueItems(
      removalInput(admitted, ref("article-a")),
    );
    assert.equal(removed.removedCount, 1);
  } finally {
    fixture.close();
  }
});

test("partial admission leaves no orphan facts and claimed or active-order items cannot be locally removed", () => {
  const fixture = makeFixture();
  try {
    fixture.add(article("article-a"));
    fixture.add(article("article-b"));
    const toutiao = fixture.application.admitRegularQueueItems(
      admissionInput(fixture, [ref("article-a")]),
    );
    const mixed = fixture.application.admitRegularQueueItems(
      admissionInput(fixture, [ref("article-a"), ref("article-b")], "hepan"),
    );
    assert.equal(mixed.items[0].status, "conflict");
    assert.equal(mixed.items[0].reasonCode, "ARTICLE_ACTIVE_TARGET_CONFLICT");
    assert.equal(mixed.items[1].status, "queued");
    assert.equal(fixture.store.listSubmissionQueueItems().length, 2);
    assert.equal(
      fixture.store.listPublicationRecords({ articleIds: ["article-a"] })
        .length,
      1,
    );

    const claimed = fixture.store.claimSubmissionItemById({
      itemId: toutiao.items[0].itemId,
      batchId: toutiao.items[0].batchId,
      claimToken: "fixture-claim",
    });
    assert.ok(claimed);
    const blocked = fixture.application.removePendingQueueItems(
      removalInput(toutiao, ref("article-a")),
    );
    assert.equal(blocked.removedCount, 0);
    assert.equal(blocked.conflictCount, 1);
    assert.equal(
      blocked.items[0].reasonCode,
      "REGULAR_QUEUE_ITEM_NOT_REMOVABLE",
    );
    assert.equal(fixture.store.listSubmissionQueueItems().length, 2);

    fixture.add(article("article-c"));
    const activeOrder = fixture.application.admitRegularQueueItems(
      admissionInput(fixture, [ref("article-c")]),
    );
    const activeOrderFact = fixture.store
      .listArticleLifecycleFacts({ articleIds: ["article-c"] })
      .submissionItems.find(
        (item) => item.itemId === activeOrder.items[0].itemId,
      );
    fixture.store.attachRemoteOrderEvidence({
      attemptId: activeOrderFact.payload.attemptId,
      orderId: "order-regular-c",
      remoteId: "remote-order-c",
      evidence: { source: "fixture" },
    });
    const activeOrderBlocked = fixture.application.removePendingQueueItems(
      removalInput(activeOrder, ref("article-c")),
    );
    assert.equal(activeOrderBlocked.removedCount, 0);
    assert.equal(activeOrderBlocked.conflictCount, 1);
    assert.equal(
      activeOrderBlocked.items[0].reasonCode,
      "REGULAR_QUEUE_ITEM_NOT_REMOVABLE",
    );
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
    const result = fixture.application.admitRegularQueueItems(
      admissionInput(fixture, [
        ref("article-b"),
        ref("article-a"),
        ref("article-a"),
      ]),
    );
    assert.equal(result.admittedCount, 2);
    assert.deepEqual(fixture.lockEvents.slice(-2), ["article-a", "article-b"]);
  } finally {
    fixture.close();
  }

  let armed = false;
  let failed = false;
  const failing = makeFixture({
    lockFault(point, detail) {
      if (
        armed &&
        !failed &&
        point === "after-candidate-owner" &&
        detail.files.json.endsWith("article-b.json")
      ) {
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
      () =>
        failing.application.admitRegularQueueItems(
          admissionInput(failing, [ref("article-b"), ref("article-a")]),
        ),
      { code: "ARTICLE_MUTATION_BUSY" },
    );
    assert.equal(failed, true);
    assert.equal(failing.store.listSubmissionQueueItems().length, 0);
    assert.equal(
      fs.existsSync(
        path.join(
          failing.root,
          "generated",
          "client-a",
          "article-a.article-lock",
        ),
      ),
      false,
    );
  } finally {
    failing.close();
  }
});

test("regular queue capabilities stay isolated from the full operational store and unrelated application commands", () => {
  const fixture = makeFixture();
  try {
    assert.deepEqual(
      Object.keys(fixture.transitionPorts.regularQueueTransitions).sort(),
      [
        "admitRegularQueueItem",
        "listArticleLifecycleFacts",
        "removePendingQueueItem",
      ],
    );
    assert.deepEqual(Object.keys(fixture.application).sort(), [
      "admitRegularQueueItems",
      "listRegularQueueGroups",
      "previewRegularQueueAdmission",
      "removePendingQueueItems",
      "updateRegularQueueGroupImageCount",
    ]);
    assert.equal(
      Object.prototype.hasOwnProperty.call(
        fixture.application,
        "createPaidSubmissionBatch",
      ),
      false,
    );
    assert.equal(
      Object.prototype.hasOwnProperty.call(
        fixture.application,
        "commitRemoteOutcome",
      ),
      false,
    );
  } finally {
    fixture.close();
  }
});
