"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const domain = require("../src/domain");
const { createArticleStore } = require("../src/content/article-store");
const {
  createContentStore,
  fingerprintArticle,
} = require("../src/content/content-store");
const {
  createArticleMutationCoordinator,
} = require("../src/content/article-mutation-coordinator");
const {
  evaluateArticleSubmissionEligibility,
} = require("../src/content/article-submission-eligibility");
const {
  createAiContentService,
} = require("../desktop/services/ai-content-service");
const {
  createArticleManagementSnapshot,
} = require("../desktop/services/article-management-snapshot");
const {
  createArticleTrashService,
} = require("../src/content/article-trash-service");
const {
  createOperationalStore,
} = require("../src/infrastructure/operational-store/operational-store");

const CLIENT_ID = "ticket-25-b-client";
const NOW = "2026-08-12T00:00:00.000Z";

function article(articleId, overrides) {
  return Object.assign(
    {
      id: articleId,
      clientId: CLIENT_ID,
      platform: "toutiao",
      scenario: "guide",
      templateId: "ticket-25-b-template",
      title: `标题 ${articleId}`,
      content: `正文 ${articleId}`,
      status: "saved",
      createdAt: NOW,
      updatedAt: NOW,
    },
    overrides || {},
  );
}

function createHarness(options) {
  const value = options || {};
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ticket-25-b-"));
  const transitionPorts = {};
  const store = createOperationalStore({
    workspaceRoot: root,
    transitionPorts,
    clock: () => new Date(NOW),
  });
  const articleStore = createArticleStore(root);
  const contentStore = createContentStore({
    articleStore,
    listClientIds: () => [CLIENT_ID],
  });
  const lifecycleFacts =
    value.lifecycleFacts || transitionPorts.publicationTransitions;
  const coordinator = createArticleMutationCoordinator({
    articleStore,
    contentStore,
    lifecycleFacts,
    publicationTransitions: transitionPorts.publicationTransitions,
    regularQueueTransitions: transitionPorts.regularQueueTransitions,
    paidAdmissionTransitions: transitionPorts.paidAdmissionTransitions,
    clock: () => new Date(NOW),
  });
  const removalService = createArticleTrashService({
    workspaceRoot: root,
    contentStore,
    mutationCoordinator: coordinator,
    articleRemovalImpactQuery: {
      previewArticleRemovalImpact() {
        return { canCommit: true, blockedItems: [] };
      },
    },
    now: () => NOW,
  });
  let generatedId = 0;
  const aiContentService = createAiContentService({
    workspaceRoot: root,
    contentStore,
    operationalStore: store,
    articleMutationCoordinator: coordinator,
    articleTrashService: removalService,
    clientKnowledge: {
      getClient(clientId) {
        return { id: clientId, displayName: "合成客户" };
      },
      listClients() {
        return [{ id: CLIENT_ID, displayName: "合成客户" }];
      },
    },
    researchStore: {
      getResearch() {
        return {
          question: "合成问题",
          answerText: "合成调研回答",
          references: [],
          collectedAt: NOW,
          collectionMethod: "synthetic",
          isAnswerComplete: true,
        };
      },
    },
    templateStore: {
      getTemplate() {
        return {
          id: "ticket-25-b-template",
          name: "合成模板",
          scenario: "guide",
          body: "合成模板正文",
        };
      },
    },
    materialStore: {
      async getSelectedMaterials() {
        return [
          {
            id: "material-1",
            name: "合成资料",
            extension: ".md",
            content: "合成资料内容",
            source: "text",
          },
        ];
      },
    },
    buildPrompt: () => ({ system: "synthetic", user: "synthetic" }),
    aiClientFactory: () => ({
      async complete() {
        return "# AI 生成标题\n\nAI 生成正文";
      },
    }),
    createId: () => {
      generatedId += 1;
      return `generated-${generatedId}`;
    },
  });
  let revision = 0;
  const snapshot = createArticleManagementSnapshot({
    workspaceIdentity: "ticket-25-b",
    getRevision: () => revision,
    aiContentService,
    operationalStore: store,
    ...(value.lifecycleFacts
      ? { listLifecycleFacts: () => lifecycleFacts.listArticleLifecycleFacts() }
      : {}),
    publishedArchiveQueries: transitionPorts.publishedArchiveQueries,
    listPlatforms: () => [],
  });

  return {
    root,
    store,
    transitionPorts,
    articleStore,
    contentStore,
    coordinator,
    removalService,
    aiContentService,
    snapshot,
    bumpRevision() {
      revision += 1;
      snapshot.invalidate();
    },
    add(valueArticle) {
      articleStore.createArticle(valueArticle);
    },
    close() {
      store.close();
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
}

function profileFor(harness, suffix) {
  return harness.store.createAccountProfile({
    platformId: "toutiao",
    displayName: `合成账号 ${suffix}`,
  });
}

function admitRegular(harness, articleId, profile) {
  const result = harness.coordinator.admitRegularQueueItems({
    articleRefs: [{ clientId: CLIENT_ID, articleId }],
    target: {
      kind: "platform",
      platformId: profile.platformId,
      accountProfileId: profile.accountProfileId,
    },
  });
  assert.equal(result.admittedCount, 1);
  return result.items[0];
}

function completeRegular(harness, item, suffix) {
  const groups = harness.transitionPorts.regularQueueGroupTransitions;
  groups.setRegularQueueGroupRunIntent({
    queueGroupId: item.queueGroupId,
    running: true,
  });
  const claim = groups.claimRegularQueueGroupHead({
    queueGroupId: item.queueGroupId,
    claimToken: `ticket-25-b-claim-${suffix}`,
    leaseMs: 30000,
  });
  assert.ok(claim);
  const preparedEvidence =
    domain.createTextOnlyPreparedSubmissionEvidenceV1(claim);
  assert.deepEqual(
    {
      deliveryMode: preparedEvidence.deliveryMode,
      images: preparedEvidence.images,
      decisionKind: preparedEvidence.decisionKind,
    },
    { deliveryMode: "text_only", images: [], decisionKind: "initial" },
  );
  groups.beginRegularRemoteSubmission({
    regularPublicationAttemptId: claim.regularPublicationAttemptId,
    claimToken: claim.claimToken,
    preparedSubmissionEvidenceV1: preparedEvidence,
  });
  const accepted =
    harness.transitionPorts.regularOutcomeTransitions.recordRegularAccepted({
      regularPublicationAttemptId: claim.regularPublicationAttemptId,
      observation: {
        status: "accepted",
        code: "REGULAR_ACCEPTED",
        observedAt: "2026-08-12T00:00:02.000Z",
        providerEventAt: "2026-08-12T00:00:01.000Z",
        remoteId: `synthetic-remote-${suffix}`,
        remoteUrl: `https://synthetic.example/${suffix}`,
      },
    });
  return { claim, preparedEvidence, accepted };
}

function prepareRegular(harness, item, suffix) {
  const groups = harness.transitionPorts.regularQueueGroupTransitions;
  groups.setRegularQueueGroupRunIntent({
    queueGroupId: item.queueGroupId,
    running: true,
  });
  const claim = groups.claimRegularQueueGroupHead({
    queueGroupId: item.queueGroupId,
    claimToken: `ticket-25-b-prepare-${suffix}`,
    leaseMs: 30000,
  });
  const preparedEvidence =
    domain.createTextOnlyPreparedSubmissionEvidenceV1(claim);
  groups.beginRegularRemoteSubmission({
    regularPublicationAttemptId: claim.regularPublicationAttemptId,
    claimToken: claim.claimToken,
    preparedSubmissionEvidenceV1: preparedEvidence,
  });
  return { claim, preparedEvidence };
}

function beginUncertain(harness, item, suffix) {
  const { claim } = prepareRegular(harness, item, `uncertain-${suffix}`);
  return harness.transitionPorts.regularOutcomeTransitions.recordRegularUncertain(
    {
      regularPublicationAttemptId: claim.regularPublicationAttemptId,
      observation: {
        status: "uncertain",
        code: "SYNTHETIC_REMOTE_UNCERTAIN",
        observedAt: "2026-08-12T00:00:03.000Z",
      },
    },
  );
}

test("public article generation, explicit save, and eligibility use no review or source gate", async (t) => {
  const harness = createHarness();
  t.after(() => harness.close());

  const generated = await harness.aiContentService.generateArticle({
    clientId: CLIENT_ID,
    platform: "toutiao",
    templateId: "ticket-25-b-template",
    researchQueryIds: ["research-1"],
    materialIds: ["material-1"],
  });
  assert.equal(generated.status, "generated");
  assert.equal(evaluateArticleSubmissionEligibility(generated).eligible, true);

  const firstSnapshot = await harness.snapshot.get({ clientId: CLIENT_ID });
  assert.equal(
    firstSnapshot.workflowByArticle[generated.id].stage,
    "pending_submission",
  );
  assert.equal(firstSnapshot.lifecycleCounts.pending_submission, 1);

  const editor = harness.aiContentService.getArticleEditor(
    CLIENT_ID,
    generated.id,
  );
  const draft = Object.assign({}, editor.article, {
    title: "明确保存后的标题",
    content: "明确保存后的正文",
  });
  assert.equal(
    harness.contentStore.getArticle(CLIENT_ID, generated.id).title,
    "AI 生成标题",
  );
  const saved = harness.aiContentService.saveArticle({
    article: draft,
    expectedFingerprint: editor.editFingerprint,
  });
  assert.equal(saved.outcome, "saved");
  assert.equal(saved.article.title, "明确保存后的标题");

  const manual = article("manual-without-source", {
    title: "手工标题",
    content: "手工正文",
  });
  delete manual.source;
  delete manual.materialSnapshots;
  delete manual.researchSnapshots;
  delete manual.templateSnapshot;
  harness.add(manual);
  assert.deepEqual(evaluateArticleSubmissionEligibility(manual), {
    eligible: true,
    reasonCodes: [],
    reasons: [],
  });
  for (const invalid of [
    Object.assign({}, manual, { title: "" }),
    Object.assign({}, manual, { content: "" }),
  ])
    assert.equal(evaluateArticleSubmissionEligibility(invalid).eligible, false);
});

test("public mutation and lifecycle seams freeze submission items, enforce one target, remove pending items, and allow explicit retarget", async (t) => {
  const harness = createHarness();
  t.after(() => harness.close());
  const first = article("queue-single");
  const second = article("queue-batch-a");
  const third = article("queue-batch-b");
  const retarget = article("retarget");
  for (const value of [first, second, third, retarget]) harness.add(value);

  const profile = profileFor(harness, "queue");
  const firstItem = admitRegular(harness, first.id, profile);
  const secondItem = admitRegular(harness, second.id, profile);
  const thirdItem = admitRegular(harness, third.id, profile);
  const queuedSnapshot = await harness.snapshot.get({ clientId: CLIENT_ID });
  assert.equal(queuedSnapshot.workflowByArticle[first.id].stage, "in_submission");
  assert.deepEqual(queuedSnapshot.workflowByArticle[first.id].locks, {
    canEdit: false,
    canSubmit: false,
    canQueue: false,
    canCancel: true,
    canTrash: false,
  });
  assert.throws(
    () =>
      harness.coordinator.saveExistingArticle({
        article: Object.assign({}, first, { title: "队列中编辑" }),
        expectedFingerprint: fingerprintArticle(first),
      }),
    { code: "ARTICLE_OPERATION_FROZEN" },
  );

  const removedOne = harness.coordinator.removePendingQueueItems({
    items: [firstItem],
  });
  assert.equal(removedOne.removedCount, 1);
  const removedBatch = harness.coordinator.removePendingQueueItems({
    items: [secondItem, thirdItem],
  });
  assert.equal(removedBatch.removedCount, 2);
  harness.bumpRevision();
  const restoredSnapshot = await harness.snapshot.get({ clientId: CLIENT_ID });
  for (const id of [first.id, second.id, third.id]) {
    assert.equal(
      restoredSnapshot.workflowByArticle[id].stage,
      "pending_submission",
    );
    assert.equal(restoredSnapshot.workflowByArticle[id].locks.canEdit, true);
  }

  const secondProfile = profileFor(harness, "retarget");
  const secondTarget = {
    kind: "platform",
    platformId: secondProfile.platformId,
    accountProfileId: secondProfile.accountProfileId,
  };
  const oldItem = admitRegular(harness, retarget.id, profile);
  const conflictingTarget = harness.coordinator.admitRegularQueueItems({
    articleRefs: [{ clientId: CLIENT_ID, articleId: retarget.id }],
    target: secondTarget,
  });
  assert.equal(conflictingTarget.items[0].status, "conflict");
  assert.equal(
    conflictingTarget.items[0].reasonCode,
    "ARTICLE_ACTIVE_TARGET_CONFLICT",
  );
  const { claim: oldClaim } = prepareRegular(harness, oldItem, "retarget");
  const failed =
    harness.transitionPorts.regularOutcomeTransitions.recordRegularArticleRejected(
      {
        regularPublicationAttemptId: oldClaim.regularPublicationAttemptId,
        observation: {
          status: "article_rejected",
          code: "SYNTHETIC_REJECTED",
          observedAt: "2026-08-12T00:00:03.000Z",
        },
      },
    );
  assert.equal(failed.status, "article_rejected");
  const changed = admitRegular(harness, retarget.id, secondProfile);
  assert.equal(changed.status, "queued");
});

test("public regular submission preserves text-only evidence, first success, archive content, uncertain freeze, and independent identities", async (t) => {
  const harness = createHarness();
  t.after(() => harness.close());
  const published = article("published");
  const uncertain = article("uncertain");
  const similarA = article("similar-a", {
    title: "相似标题",
    content: "相似正文",
  });
  const similarB = article("similar-b", {
    title: "相似标题",
    content: "相似正文",
  });
  for (const value of [published, uncertain, similarA, similarB])
    harness.add(value);

  const publishedItem = admitRegular(
    harness,
    published.id,
    profileFor(harness, "published"),
  );
  const completed = completeRegular(harness, publishedItem, "published");
  assert.equal(completed.accepted.status, "published");
  assert.equal(completed.accepted.firstWins, true);
  assert.deepEqual(completed.accepted.publicationEvidence.imageSummaryV1, {
    deliveryMode: "text_only",
    images: [],
    decisionKind: "initial",
  });

  const archives =
    harness.transitionPorts.publishedArchiveQueries.listPublishedArchives({
      articleIds: [published.id],
    });
  assert.equal(archives.length, 1);
  assert.equal(archives[0].publicationEvidence.title, published.title);
  assert.equal(archives[0].publicationEvidence.body, published.content);
  assert.equal(
    archives[0].publicationEvidence.remoteUrl,
    "https://synthetic.example/published",
  );

  const publishedSnapshot = await harness.snapshot.get({ clientId: CLIENT_ID });
  assert.equal(
    publishedSnapshot.workflowByArticle[published.id].stage,
    "published",
  );
  assert.deepEqual(publishedSnapshot.workflowByArticle[published.id].locks, {
    canEdit: false,
    canSubmit: false,
    canQueue: false,
    canCancel: false,
    canTrash: false,
  });
  const lateRejected =
    harness.transitionPorts.regularOutcomeTransitions.recordRegularArticleRejected(
      {
        regularPublicationAttemptId:
          completed.claim.regularPublicationAttemptId,
        observation: {
          status: "article_rejected",
          code: "LATE_REJECTED",
          observedAt: "2026-08-12T00:00:04.000Z",
        },
      },
    );
  assert.equal(lateRejected.status, "published");
  assert.equal(
    harness.transitionPorts.publishedArchiveQueries.listPublishedArchives({
      articleIds: [published.id],
    })[0].publicationEvidence.body,
    published.content,
  );

  const uncertainItem = admitRegular(
    harness,
    uncertain.id,
    profileFor(harness, "uncertain"),
  );
  const uncertainResult = beginUncertain(harness, uncertainItem, "uncertain");
  assert.equal(uncertainResult.status, "uncertain");
  harness.bumpRevision();
  const uncertainSnapshot = await harness.snapshot.get({ clientId: CLIENT_ID });
  assert.equal(
    uncertainSnapshot.workflowByArticle[uncertain.id].stage,
    "in_submission",
  );
  assert.equal(
    uncertainSnapshot.workflowByArticle[uncertain.id].locks.canEdit,
    false,
  );
  assert.equal(uncertainSnapshot.workflowByArticle[uncertain.id].locks.canSubmit, false);
  assert.equal(uncertainSnapshot.workflowByArticle[uncertain.id].locks.canQueue, false);

  const similarItems = [
    admitRegular(harness, similarA.id, profileFor(harness, "similar-a")),
    admitRegular(harness, similarB.id, profileFor(harness, "similar-b")),
  ];
  assert.notEqual(similarItems[0].articleId, similarItems[1].articleId);
  assert.notEqual(similarItems[0].itemId, similarItems[1].itemId);
});

test("public management snapshot has five article-library categories and removal preserves terminal order evidence", async (t) => {
  const facts = {
    publications: [
      { articleId: "queued", status: "queued", targetKey: "platform:queued" },
      {
        articleId: "attention",
        status: "uncertain",
        targetKey: "platform:attention",
      },
      {
        articleId: "published",
        status: "published",
        targetKey: "platform:published",
      },
    ],
    submissionItems: [],
    orders: [
      {
        articleId: "paid",
        orderId: "order-terminal",
        mediaResourceId: "media-paid",
        supplierStatusCode: "0",
      },
      {
        articleId: "published",
        orderId: "order-aftercare",
        mediaResourceId: "media-published",
        supplierStatusCode: "9",
      },
    ],
    attentionItems: [],
    removalTransactions: [],
  };
  const harness = createHarness({
    lifecycleFacts: { listArticleLifecycleFacts: () => facts },
  });
  t.after(() => harness.close());
  const values = [
    article("pending"),
    article("queued"),
    article("paid"),
    article("attention"),
    article("published"),
  ];
  values.forEach((value) => harness.add(value));
  const trash = article("trash");
  harness.articleStore.createArticle(trash);
  const tombstone = {
    version: 1,
    deletedAt: NOW,
    clientId: CLIENT_ID,
    articleId: trash.id,
    status: "saved",
    references: [],
    titleSnapshot: trash.title,
    contentFingerprint: fingerprintArticle(trash),
  };
  harness.contentStore.moveArticleToTrash(CLIENT_ID, trash.id, tombstone);

  const snapshot = await harness.snapshot.get({ clientId: CLIENT_ID });
  assert.deepEqual(snapshot.lifecycleCounts, {
    pending_submission: 1,
    needs_completion: 0,
    in_submission: 3,
    published: 1,
    trash: 1,
    total: 6,
  });
  assert.deepEqual(
    Object.values(snapshot.workflowByArticle)
      .map((workflow) => workflow.label)
      .sort(),
    ["投稿中", "投稿中", "投稿中", "回收站", "待投稿", "已发布"].sort(),
  );
  assert.equal(snapshot.workflowByArticle.attention.locks.canEdit, false);
  assert.equal(snapshot.workflowByArticle.published.locks.canTrash, false);
  assert.equal(snapshot.workflowByArticle.published.stage, "published");

  const removalHarness = createHarness({
    lifecycleFacts: { listArticleLifecycleFacts: () => facts },
  });
  t.after(() => removalHarness.close());
  const removable = article("removable");
  removalHarness.add(removable);
  const preview = removalHarness.removalService.previewTrashArticles({
    selections: [{ clientId: CLIENT_ID, articleId: removable.id }],
  });
  const moved = removalHarness.removalService.trashArticles({
    selections: preview.selections,
    token: preview.token,
    confirmed: true,
  });
  assert.equal(moved.status, "committed");
  assert.equal(
    removalHarness.removalService.restoreArticle({
      clientId: CLIENT_ID,
      articleId: removable.id,
    }).restored,
    true,
  );
  const secondPreview = removalHarness.removalService.previewTrashArticles({
    selections: [{ clientId: CLIENT_ID, articleId: removable.id }],
  });
  removalHarness.removalService.trashArticles({
    selections: secondPreview.selections,
    token: secondPreview.token,
    confirmed: true,
  });
  const confirmation = removalHarness.removalService.preparePermanentDelete({
    clientId: CLIENT_ID,
    articleId: removable.id,
  });
  const deleted = removalHarness.removalService.permanentlyDeleteArticle({
    clientId: CLIENT_ID,
    articleId: removable.id,
    token: confirmation.token,
  });
  assert.equal(deleted.deleted, true);
  assert.equal(
    removalHarness.contentStore.isArticleTrashed(CLIENT_ID, removable.id),
    false,
  );
  assert.deepEqual(facts.orders, [
    {
      articleId: "paid",
      orderId: "order-terminal",
      mediaResourceId: "media-paid",
      supplierStatusCode: "0",
    },
    {
      articleId: "published",
      orderId: "order-aftercare",
      mediaResourceId: "media-published",
      supplierStatusCode: "9",
    },
  ]);
});
