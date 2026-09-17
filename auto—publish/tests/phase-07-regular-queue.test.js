const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const domain = require("../src/domain");
const { createArticleAttentionQuery } = require("../desktop/services/article-attention-query");
const { createCrossClientRegularQueueApplication } = require("../desktop/services/cross-client-regular-queue-application");

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
      internalBeforeCommit: value.beforeCommit,
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
      removalTransactionStore: value.removalTransactionStore,
      clock: () => new Date("2026-08-07T00:00:00.000Z"),
    });
    const attentionQuery = createArticleAttentionQuery({ operationalStore: store, readers: { getArticle: contentStore.getArticle } });
    const application = createRegularQueueApplication({
      getAttentionItems(ids) {
        attentionQuery.invalidate();
        return ids.map((attentionId) => attentionQuery.get({ attentionId }));
      },
      isTargetConfigured: value.isTargetConfigured,
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
          id: "toutiao", publicationTargetKind: "platform", imagePublishing: false,
        },
        {
          id: "hepan", publicationTargetKind: "platform", imagePublishing: false,
        },
        {
          id: "media", publicationTargetKind: "resource", imagePublishing: false,
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
      attentionQuery,
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

function failQueuedArticle(fixture, queued, status = "failed") {
  if (status === "accepted") {
    const group = fixture.transitionPorts.regularQueueGroupTransitions;
    group.setRegularQueueGroupRunIntent({ queueGroupId: queued.queueGroupId, running: true });
    const claim = group.claimRegularQueueGroupHead({ queueGroupId: queued.queueGroupId, claimToken: `claim-${queued.attemptId}`, leaseMs: 30000 });
    assert.equal(claim.regularPublicationAttemptId, queued.attemptId);
    group.beginRegularRemoteSubmission({ regularPublicationAttemptId: queued.attemptId, claimToken: claim.claimToken, preparedSubmissionEvidenceV1: domain.createTextOnlyPreparedSubmissionEvidenceV1(claim) });
    fixture.transitionPorts.regularOutcomeTransitions.recordRegularAccepted({ regularPublicationAttemptId: queued.attemptId, observation: { status: "accepted", code: "HEPAN_ACCEPTED", remoteId: "synthetic-accepted", observedAt: "2026-08-07T00:00:00.000Z" } });
    return;
  }
  const durable = fixture.store.getSubmissionBatch(queued.batchId).items.find((item) => item.itemId === queued.itemId);
  const claim = fixture.store.claimSubmissionItemById({ itemId: queued.itemId, batchId: queued.batchId, revision: durable.revision, claimToken: `claim-${queued.attemptId}` });
  fixture.store.commitRemoteOutcome({ attemptId: queued.attemptId, batchItemId: queued.itemId, batchClaimToken: claim.claimToken, outcome: { status, ...(status === "accepted" ? { remoteId: "synthetic-accepted" } : {}) } });
}

function retargetInput(fixture, refs, platformId = "hepan") {
  fixture.attentionQuery.invalidate();
  const attention = fixture.attentionQuery.list().items;
  return { ...admissionInput(fixture, refs, platformId), autoStart: false,
    retargetFrom: refs.map((articleRef) => ({ articleRef, attentionId: attention.find((item) => item.articleId === articleRef.articleId && item.clientId === articleRef.clientId).attentionId })) };
}

test("attention retarget uses existing queue, preserves articles/history, closes attention and survives restart", () => {
  const f = makeFixture();
  try {
    f.add(article("retarget-a"));
    f.add(article("retarget-b", "client-b"));
    const app = createCrossClientRegularQueueApplication({ regularQueueApplication: f.application });
    const refs = [ref("retarget-a"), ref("retarget-b", "client-b")];
    const original = refs.map((item) => f.contentStore.getArticle(item.clientId, item.articleId));
    const first = app.admitRegularQueueItems(admissionInput(f, refs));
    first.items.forEach((item) => failQueuedArticle(f, item));
    const input = retargetInput(f, refs);
    assert.equal(app.previewRegularQueueAdmission(input).queueableCount, 2);
    const admitted = app.admitRegularQueueItems(input);
    assert.equal(admitted.admittedCount, 2);
    assert.equal(app.admitRegularQueueItems(input).admittedCount, 0);
    assert.equal(f.store.listSubmissionQueueItems().filter((item) => item.status === "queued").length, 2);
    assert.deepEqual(f.store.listPublicationAttention(), []);
    assert.deepEqual(refs.map((item) => f.contentStore.getArticle(item.clientId, item.articleId)), original);
    assert.deepEqual(f.store.listPublicationRecords({ articleIds: refs.map((item) => item.articleId) }).map((item) => item.status).sort(), ["failed", "failed", "queued", "queued"]);
    // The new target uses the original claim/outcome path, not a retarget publisher.
    failQueuedArticle(f, admitted.items[0], "accepted");
    assert.equal(app.admitRegularQueueItems(input).admittedCount, 0);
    f.store.close();
    const reopened = createOperationalStore({ workspaceRoot: f.root });
    try {
      assert.deepEqual(reopened.listPublicationAttention(), []);
      assert.equal(reopened.listPublicationRecords({ articleIds: refs.map((item) => item.articleId) }).length, 4);
    } finally { reopened.close(); }
  } finally { f.close(); }
});

test("retarget rejects same platform, multiple targets, unconfigured/account mismatch and stale attention", () => {
  let configured = true;
  const f = makeFixture({ isTargetConfigured: () => configured });
  try {
    f.add(article("retarget-a"));
    const first = f.application.admitRegularQueueItems(admissionInput(f, [ref("retarget-a")]));
    failQueuedArticle(f, first.items[0]);
    const input = retargetInput(f, [ref("retarget-a")]);
    assert.equal(f.application.admitRegularQueueItems({ ...input, platformId: "toutiao", accountProfileId: f.profiles.toutiao.accountProfileId }).items[0].reasonCode, "REGULAR_QUEUE_DIFFERENT_PLATFORM_REQUIRED");
    assert.throws(() => f.application.admitRegularQueueItems({ ...input, targetPlatformIds: ["hepan", "toutiao"] }), { code: "REGULAR_QUEUE_SINGLE_TARGET_REQUIRED" });
    assert.throws(() => f.application.admitRegularQueueItems({ ...input, accountProfileId: f.profiles.toutiao.accountProfileId }), { code: "ACCOUNT_PROFILE_PLATFORM_MISMATCH" });
    configured = false;
    assert.throws(() => f.application.admitRegularQueueItems(input), { code: "PLATFORM_CONFIG_NOT_SET" });
    configured = true;
    assert.throws(() => f.application.admitRegularQueueItems({ ...input, autoStart: true }), { code: "REGULAR_QUEUE_RETARGET_INPUT_INVALID" });
    assert.equal(f.application.admitRegularQueueItems({ ...input, retargetFrom: [{ articleRef: ref("retarget-a"), attentionId: "stale" }] }).items[0].reasonCode, "ARTICLE_ATTENTION_STALE");
    assert.equal(f.store.listSubmissionQueueItems().filter((item) => item.status === "queued").length, 0);
    assert.equal(f.store.listPublicationAttention().length, 1);
  } finally { f.close(); }
});

test("retarget back to a previously failed platform closes the latest attention and preserves all attempts", () => {
  const f = makeFixture();
  try {
    f.add(article("retarget-cycle"));
    const refs = [ref("retarget-cycle")];
    const first = f.application.admitRegularQueueItems(admissionInput(f, refs));
    failQueuedArticle(f, first.items[0]);
    const second = f.application.admitRegularQueueItems(retargetInput(f, refs));
    failQueuedArticle(f, second.items[0]);
    const third = f.application.admitRegularQueueItems(retargetInput(f, refs, "toutiao"));
    assert.equal(third.admittedCount, 1);
    assert.deepEqual(f.store.listPublicationAttention(), []);
    failQueuedArticle(f, third.items[0]);
    assert.equal(f.store.listPublicationAttention()[0].attemptId, third.items[0].attemptId);
    const history = f.store.listPublicationRecords({ articleIds: ["retarget-cycle"] });
    assert.equal(history.flatMap((record) => record.attempts).length, 3);
  } finally { f.close(); }
});

test("retarget reports partial results without closing stale/uncertain source attention", () => {
  const f = makeFixture();
  try {
    const refs = [ref("partial-a"), ref("partial-b", "client-b")];
    refs.forEach((item) => f.add(article(item.articleId, item.clientId)));
    const app = createCrossClientRegularQueueApplication({ regularQueueApplication: f.application });
    const first = app.admitRegularQueueItems(admissionInput(f, refs));
    first.items.forEach((item) => failQueuedArticle(f, item));
    const input = retargetInput(f, refs);
    input.retargetFrom[1].attentionId = "stale-source";
    const result = app.admitRegularQueueItems(input);
    assert.equal(result.admittedCount, 1);
    assert.equal(result.conflictCount, 1);
    assert.equal(result.items.find((item) => item.articleId === "partial-b").reasonCode, "ARTICLE_ATTENTION_STALE");
    assert.deepEqual(f.store.listPublicationAttention().map((item) => item.articleId), ["partial-b"]);
    const secondInput = retargetInput(f, [refs[1]]);
    const next = f.application.admitRegularQueueItems(admissionInput(f, [refs[1]]));
    failQueuedArticle(f, next.items[0], "uncertain");
    assert.equal(f.application.admitRegularQueueItems(secondInput).admittedCount, 0);
    assert.equal(f.store.listPublicationAttention().find((item) => item.articleId === "partial-b").status, "uncertain");
  } finally { f.close(); }
});

test("retarget commit failure retains failure attention and original publication history", () => {
  let armed = false;
  const f = makeFixture({ beforeCommit() { if (armed) throw Object.assign(new Error("synthetic commit failure"), { code: "TEST_COMMIT_FAILED" }); } });
  try {
    f.add(article("rollback-retarget"));
    const refs = [ref("rollback-retarget")];
    const first = f.application.admitRegularQueueItems(admissionInput(f, refs));
    failQueuedArticle(f, first.items[0]);
    const input = retargetInput(f, refs);
    armed = true;
    const app = createCrossClientRegularQueueApplication({ regularQueueApplication: f.application });
    const result = app.admitRegularQueueItems(input);
    assert.equal(result.items[0].status, "uncertain");
    assert.equal(result.admittedCount, 0);
    assert.equal(f.store.listPublicationRecords({ articleIds: ["rollback-retarget"] }).length, 1);
    assert.equal(f.store.listPublicationAttention().length, 1);
    assert.equal(f.store.listSubmissionQueueItems().filter((item) => item.status === "queued").length, 0);
  } finally { armed = false; f.close(); }
});

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

test("persistent client identity characters survive claim and remote boundary", () => {
  const fixture = makeFixture();
  try {
    const clientId = "65-郑州玉齿（定）";
    const articleId = "article-fullwidth-client";
    fixture.add(article(articleId, clientId));
    const admitted = fixture.application.admitRegularQueueItems({
      ...admissionInput(fixture, [ref(articleId, clientId)], "hepan"),
      confirmed: true,
    });
    fixture.transitionPorts.regularQueueGroupTransitions.setRegularQueueGroupRunIntent({
      queueGroupId: admitted.items[0].queueGroupId,
      running: true,
    });
    const claim = fixture.transitionPorts.regularQueueGroupTransitions.claimRegularQueueGroupHead({
      queueGroupId: admitted.items[0].queueGroupId,
      claimToken: "claim-fullwidth-client",
      leaseMs: 30000,
    });

    assert.equal(claim.articleIdentityV1.clientId, clientId);
    const boundary = fixture.transitionPorts.regularQueueGroupTransitions.beginRegularRemoteSubmission({
      regularPublicationAttemptId: claim.regularPublicationAttemptId,
      claimToken: claim.claimToken,
      preparedSubmissionEvidenceV1:
        domain.createTextOnlyPreparedSubmissionEvidenceV1(claim),
    });
    assert.equal(boundary.submitAuthorized, true);
  } finally {
    fixture.close();
  }
});

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

test("regular preview identifies a profile-blocked idempotent queue for safe resume", () => {
  const fixture = makeFixture();
  try {
    fixture.add(article("article-profile-resume"));
    const input = admissionInput(fixture, [ref("article-profile-resume")]);
    const admitted = fixture.application.admitRegularQueueItems(input);
    const queueGroupId = admitted.items[0].queueGroupId;
    fixture.transitionPorts.regularQueueGroupTransitions.setRegularQueueGroupRunIntent({
      queueGroupId,
      running: true,
    });
    const claim =
      fixture.transitionPorts.regularQueueGroupTransitions.claimRegularQueueGroupHead({
        queueGroupId,
        claimToken: "claim-profile-resume",
        leaseMs: 30000,
      });
    fixture.transitionPorts.regularOutcomeTransitions.recordRegularGroupBlocked({
      regularPublicationAttemptId: claim.regularPublicationAttemptId,
      observation: {
        status: "group_blocked",
        code: "REGULAR_CLIENT_PROFILE_INCOMPLETE",
        observedAt: "2026-08-07T00:00:00.000Z",
        articleRecoverable: true,
      },
    });

    const preview = fixture.application.previewRegularQueueAdmission(input);
    assert.equal(preview.idempotentCount, 1);
    assert.equal(preview.items[0].status, "idempotent");
    assert.equal(preview.items[0].queueGroupId, queueGroupId);
    assert.equal(
      preview.items[0].reasonCode,
      "REGULAR_CLIENT_PROFILE_INCOMPLETE",
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
    assert.equal("canQueue" in restored.workflowByArticle["article-a"].locks, false);
  } finally {
    fixture.close();
  }
});

test("regular admission invalidation refreshes the submission center current page", async () => {
  const centerModule =
    await import("../media-workbench/src/features/submission-center/submission-center-feature.js");
  let centerFeature = null;
  const invalidation = createWorkspaceDataInvalidation({
    workspaceRuntimeId: "r2-platform-queue",
    sendToRenderer: (_channel, event) => {
      if (event.scopes.includes("submissionCenter") && centerFeature)
        void centerFeature.refresh(event.reasonCode);
    },
  });
  const fixture = makeFixture({
    onDataInvalidated: (reasonCode) => invalidation.invalidate(reasonCode),
  });
  try {
    centerFeature = centerModule.createSubmissionCenterFeature({
      getSnapshot: async () => ({
        clientId: null,
        revision: invalidation.getRevision(),
        regular: { groups: fixture.application.listRegularQueueGroups() },
        paid: { batches: [] },
        attention: { items: [] },
        counts: { total: 0 },
        page: 1,
        pageSize: 100,
      }),
    });
    centerFeature.setScope({ workspaceRuntimeId: "r2-platform-queue" });
    await centerFeature.refresh("initial");
    assert.deepEqual(centerFeature.getSnapshot().data.regular.groups, []);

    fixture.add(article("article-a"));
    const admitted = fixture.application.admitRegularQueueItems(
      admissionInput(fixture, [ref("article-a")]),
    );
    assert.equal(admitted.admittedCount, 1);

    await waitFor(
      () =>
        centerFeature
          .getSnapshot()
          .data.regular.groups.some((group) =>
            group.remaining.some((item) => item.articleId === "article-a"),
          ),
      "submission center should refresh after regular admission",
    );
    const view = centerFeature
      .getSnapshot()
      .data.regular.groups.find((group) =>
        group.remaining.some((item) => item.articleId === "article-a"),
      );
    assert.equal(view.platformId, "toutiao");
    assert.equal(
      view.accountProfileId,
      fixture.profiles.toutiao.accountProfileId,
    );
  } finally {
    if (centerFeature) centerFeature.dispose();
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

test("queue current survives an earlier terminal item and preserves remaining FIFO", () => {
  const fixture = makeFixture();
  try {
    for (const id of ["first", "second", "third"]) fixture.add(article(id));
    const admitted = fixture.application.admitRegularQueueItems(admissionInput(fixture, [ref("first"), ref("second"), ref("third")]));
    const queueGroupId = admitted.items[0].queueGroupId;
    const transitions = fixture.transitionPorts.regularQueueGroupTransitions;
    transitions.setRegularQueueGroupRunIntent({ queueGroupId, running: true });
    const first = transitions.claimRegularQueueGroupHead({ queueGroupId, claimToken: "first-claim", leaseMs: 30000 });
    fixture.store.commitRemoteOutcome({ attemptId: first.regularPublicationAttemptId, batchItemId: admitted.items[0].itemId, batchClaimToken: "first-claim", outcome: { status: "failed" } });
    transitions.setRegularQueueGroupRunIntent({ queueGroupId, running: true });
    const secondItem = fixture.store.getSubmissionBatch(admitted.batchId).items.find((item) => item.articleId === "second");
    const second = fixture.store.claimSubmissionItemById({ batchId: admitted.batchId, itemId: secondItem.itemId, revision: secondItem.revision, claimToken: "second-claim" });
    assert.ok(second);
    const snapshot = fixture.application.listRegularQueueGroups()[0];
    assert.equal(snapshot.current.articleRef.articleId, "second");
    assert.deepEqual(snapshot.remaining.map((item) => item.articleRef.articleId), ["third"]);
    assert.equal(snapshot.runState, "in_flight");
  } finally { fixture.close(); }
});

test("queue summaries use persisted admission titles without reading client articles", () => {
  const fixture = makeFixture();
  try {
    fixture.add(article("article-a"));
    fixture.add(article("article-b", "client-b"));
    const first = fixture.application.admitRegularQueueItems(admissionInput(fixture, [ref("article-a")]));
    fixture.application.admitRegularQueueItems(admissionInput(fixture, [ref("article-b", "client-b")]));
    let articleReads = 0;
    fixture.contentStore.getArticle = fixture.contentStore.listArticles = () => {
      articleReads += 1;
      throw new Error("Article storage must not be needed for queue summaries");
    };
    const restored = fixture.application.listRegularQueueGroups()[0];
    assert.deepEqual(restored.remaining.map((item) => item.articleSummary.title), ["Title article-a", "Title article-b"]);
    const groupId = first.items[0].queueGroupId;
    fixture.transitionPorts.regularQueueGroupTransitions.setRegularQueueGroupRunIntent({ queueGroupId: groupId, running: true });
    fixture.transitionPorts.regularQueueGroupTransitions.claimRegularQueueGroupHead({ queueGroupId: groupId, claimToken: "summary-claim", leaseMs: 30000 });
    const claimed = fixture.application.listRegularQueueGroups()[0];
    assert.equal(claimed.current.articleSummary.title, "Title article-a");
    assert.equal(claimed.remaining[0].articleSummary.title, "Title article-b");
    const scoped = fixture.application.listRegularQueueGroups({ clientId: "client-b" })[0];
    assert.equal(scoped.current, null);
    assert.deepEqual(scoped.remaining.map((item) => item.articleRef), [ref("article-b", "client-b")]);
    assert.equal(JSON.stringify(claimed).includes("Body article-"), false);
    assert.equal(articleReads, 0);
    fixture.store.close();
    const ports = {};
    const reopened = createOperationalStore({ workspaceRoot: fixture.root, transitionPorts: ports });
    try {
      const { createRegularQueueGroupQuery } = require("../desktop/services/regular-queue-group-query");
      const query = createRegularQueueGroupQuery({ groupTransitions: ports.regularQueueGroupTransitions });
      const afterRestart = query.listRegularQueueGroups()[0];
      assert.equal(afterRestart.current.articleSummary.title, "Title article-a");
      assert.equal(afterRestart.remaining[0].articleSummary.title, "Title article-b");
    } finally { reopened.close(); }
  } finally { fixture.close(); }
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

test("a newer account target supersedes an older failed attention without deleting publication history", () => {
  const fixture = makeFixture();
  try {
    fixture.add(article("article-a"));
    const firstProfile = fixture.store.createAccountProfile({
      platformId: "toutiao",
      displayName: "头条账号 A",
    });
    const secondProfile = fixture.store.createAccountProfile({
      platformId: "toutiao",
      displayName: "头条账号 B",
    });
    const first = fixture.application.admitRegularQueueItems({
      articleRefs: [ref("article-a")],
      platformId: "toutiao",
      accountProfileId: firstProfile.accountProfileId,
    });
    const firstDurable = fixture.store.getSubmissionBatch(first.batchId).items[0];
    const firstClaim = fixture.store.claimSubmissionItemById({
      itemId: first.items[0].itemId,
      batchId: first.batchId,
      revision: firstDurable.revision,
      claimToken: "first-account-failure",
    });
    fixture.store.commitRemoteOutcome({
      attemptId: first.items[0].attemptId,
      batchItemId: first.items[0].itemId,
      batchClaimToken: firstClaim.claimToken,
      outcome: { status: "failed" },
    });
    assert.equal(fixture.store.listPublicationAttention().length, 1);

    const second = fixture.application.admitRegularQueueItems({
      articleRefs: [ref("article-a")],
      platformId: "toutiao",
      accountProfileId: secondProfile.accountProfileId,
    });
    assert.equal(second.admittedCount, 1);
    assert.deepEqual(fixture.store.listPublicationAttention(), []);

    const secondDurable = fixture.store.getSubmissionBatch(second.batchId).items[0];
    const secondClaim = fixture.store.claimSubmissionItemById({
      itemId: second.items[0].itemId,
      batchId: second.batchId,
      revision: secondDurable.revision,
      claimToken: "second-account-failure",
    });
    fixture.store.commitRemoteOutcome({
      attemptId: second.items[0].attemptId,
      batchItemId: second.items[0].itemId,
      batchClaimToken: secondClaim.claimToken,
      outcome: { status: "failed" },
    });

    const attention = fixture.store.listPublicationAttention();
    assert.equal(attention.length, 1);
    assert.equal(attention[0].publicationId, second.items[0].publicationId);
    const history = fixture.store.listPublicationRecords({
      articleIds: ["article-a"],
    });
    assert.equal(history.length, 2);
    assert.deepEqual(
      history.map((record) => record.status).sort(),
      ["failed", "failed"],
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
        "admitRegularQueueItems",
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
      "updateRegularQueueGroupSubmissionInterval",
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


test("automatic queue start preserves a manual pause while explicit start can resume it", () => {
  const fixture = makeFixture();
  try {
    fixture.add(article("manual-pause-article"));
    const result = fixture.application.admitRegularQueueItems(
      admissionInput(fixture, [ref("manual-pause-article")]),
    );
    const queueGroupId = result.items[0].queueGroupId;
    const transitions = fixture.transitionPorts.regularQueueGroupTransitions;

    const manuallyPaused = transitions.setRegularQueueGroupRunIntent({
      queueGroupId,
      running: false,
    });
    assert.equal(manuallyPaused.pauseIntent, "manual");

    const automaticAttempt = transitions.setRegularQueueGroupRunIntent({
      queueGroupId,
      running: true,
      preserveManualPause: true,
    });
    assert.equal(automaticAttempt.pauseIntent, "manual");

    const explicitStart = transitions.setRegularQueueGroupRunIntent({
      queueGroupId,
      running: true,
    });
    assert.equal(explicitStart.pauseIntent, "none");
  } finally {
    fixture.close();
  }
});


test("batch admission commits 500 prepared articles once and replay preserves FIFO identities", () => {
  let commits = 0;
  const fixture = makeFixture({ beforeCommit() { commits += 1; } });
  try {
    const inputs = Array.from({ length: 500 }, (_, index) => ({
      articleId: `bulk-${index}`, clientId: "client-a",
      batchId: "batch-bulk", itemId: `item-bulk-${index}`,
      publicationId: `publication-bulk-${index}`, attemptId: `attempt-bulk-${index}`,
      target: { kind: "platform", platformId: "toutiao", accountProfileId: fixture.profiles.toutiao.accountProfileId },
      publicationSnapshot: { articleId: `bulk-${index}`, title: `Article ${index}`, body: "Synthetic body", fingerprint: "a".repeat(64) },
    }));
    commits = 0;
    const outcomes = fixture.transitionPorts.regularQueueTransitions.admitRegularQueueItems(inputs);
    assert.equal(commits, 1);
    assert.equal(outcomes.length, 500);
    outcomes.forEach((outcome, index) => {
      assert.equal(outcome.error, undefined);
      assert.equal(outcome.result.position, index + 1);
      assert.equal(outcome.result.idempotent, false);
    });
    const replay = fixture.transitionPorts.regularQueueTransitions.admitRegularQueueItems(inputs);
    assert.equal(commits, 2);
    replay.forEach((outcome, index) => {
      assert.equal(outcome.result.idempotent, true);
      assert.equal(outcome.result.itemId, outcomes[index].result.itemId);
    });
    assert.equal(fixture.store.listPublicationRecords({ articleIds: inputs.map(item => item.articleId) }).length, 500);
  } finally { fixture.close(); }
});

test("a failed middle item rolls back its partial facts while adjacent admissions commit", () => {
  const fixture = makeFixture();
  try {
    const inputs = ["a", "b", "c"].map(id => ({
      articleId: `savepoint-${id}`, clientId: "client-a", batchId: `batch-${id}`,
      itemId: `item-${id}`, publicationId: `publication-${id}`,
      attemptId: id === "b" ? "attempt-a" : `attempt-${id}`,
      target: { kind: "platform", platformId: "toutiao", accountProfileId: fixture.profiles.toutiao.accountProfileId },
      publicationSnapshot: { articleId: `savepoint-${id}`, title: id, body: "Synthetic body", fingerprint: "a".repeat(64) },
    }));
    const outcomes = fixture.transitionPorts.regularQueueTransitions.admitRegularQueueItems(inputs);
    assert.ok(outcomes[0].result);
    assert.ok(outcomes[1].error);
    assert.ok(outcomes[2].result);
    assert.equal(outcomes[2].result.position, 2);
    assert.deepEqual(fixture.store.listPublicationRecords({ articleIds: inputs.map(item => item.articleId) }).map(row => row.articleId).sort(), ["savepoint-a", "savepoint-c"]);
    assert.deepEqual(fixture.store.listSubmissionBatches({}).map(row => row.batchId).sort(), ["batch-a", "batch-c"]);
    inputs[1].attemptId = "attempt-b";
    assert.ok(fixture.transitionPorts.regularQueueTransitions.admitRegularQueueItems([inputs[1]])[0].result);
  } finally { fixture.close(); }
});

test("public admission prepares the whole selection then commits once; commit failure leaves no durable success", () => {
  let commits = 0;
  let failCommit = false;
  const fixture = makeFixture({ beforeCommit() {
    commits += 1;
    if (failCommit) throw Object.assign(new Error("synthetic commit failure"), { code: "TEST_COMMIT_FAILED" });
  } });
  try {
    for (const id of ["batch-a", "batch-b", "batch-c"]) fixture.add(article(id));
    const input = admissionInput(fixture, [ref("batch-a"), ref("batch-b"), ref("batch-c")]);
    commits = 0;
    failCommit = true;
    assert.throws(() => fixture.application.admitRegularQueueItems(input), { code: "TEST_COMMIT_FAILED" });
    assert.equal(commits, 1);
    assert.equal(fixture.store.listPublicationRecords({ articleIds: input.articleRefs.map(ref => ref.articleId) }).length, 0);
    assert.equal(fixture.store.listSubmissionBatches({}).length, 0);
    assert.deepEqual(fixture.invalidationReasons, []);
    failCommit = false;
    const result = fixture.application.admitRegularQueueItems(input);
    assert.equal(commits, 2);
    assert.equal(result.admittedCount, 3);
    assert.equal(fixture.invalidationReasons.length, 1);
    const reopenedPorts = {};
    fixture.store.close();
    const reopened = createOperationalStore({ workspaceRoot: fixture.root, transitionPorts: reopenedPorts });
    try {
      const facts = reopenedPorts.regularQueueTransitions.listArticleLifecycleFacts({ articleIds: input.articleRefs.map(r => r.articleId) });
      assert.equal(facts.publications.length, 3);
      assert.equal(facts.submissionItems.length, 3);
    } finally { reopened.close(); }
  } finally { fixture.close(); }
});


test("batch admission matches removal history by client and preserves unscoped legacy repair blocks", () => {
  const history = Array.from({ length: 10000 }, (_, index) => ({
    articleId: `historical-${index}`, clientId: "client-a", status: "needs_repair",
  }));
  history.push(
    { selections: [{ clientId: "client-b", articleId: "available" }], status: "needs_repair" },
    { articles: [{ clientId: "client-a", articleId: "blocked" }], status: "needs_repair" },
    { id: "legacy", status: "needs_repair" },
  );
  let reads = 0;
  const fixture = makeFixture({ removalTransactionStore: { list() { reads += 1; return history; } } });
  try {
    for (const id of ["available", "blocked", "legacy"]) fixture.add(article(id));
    const result = fixture.application.admitRegularQueueItems(admissionInput(fixture, [ref("available"), ref("blocked"), ref("legacy")]));
    assert.equal(reads, 1);
    assert.deepEqual(result.items.map(item => [item.articleId, item.status]), [["available", "queued"], ["blocked", "conflict"], ["legacy", "conflict"]]);
    assert.equal(result.items[1].reasonCode, "REMOVAL_REPAIR_REQUIRED");
    assert.equal(result.items[2].reasonCode, "REMOVAL_REPAIR_REQUIRED");
  } finally { fixture.close(); }
});
