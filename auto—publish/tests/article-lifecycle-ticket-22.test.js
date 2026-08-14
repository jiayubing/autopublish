"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { DatabaseSync } = require("node:sqlite");

const domain = require("../src/domain");
const {
  createOperationalStore,
} = require("../src/infrastructure/operational-store/operational-store");
const {
  createArticleStore,
} = require("../src/content/article-store");
const {
  createContentStore,
  fingerprintArticle,
} = require("../src/content/content-store");
const {
  createArticleMutationCoordinator,
} = require("../src/content/article-mutation-coordinator");
const {
  createArticleRemovalService,
} = require("../src/content/article-removal-service");
const {
  createArticleTrashService,
} = require("../src/content/article-trash-service");
const {
  createArticleManagementSnapshot,
} = require("../desktop/services/article-management-snapshot");
const {
  createContractRegistry,
} = require("../desktop/ipc/contracts/registry");
const {
  articleManagementContracts,
} = require("../desktop/ipc/contracts/article-management-contracts");

function workspace(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function article(articleId, clientId = "client-22") {
  return {
    id: articleId,
    clientId,
    platform: "toutiao",
    scenario: "guide",
    templateId: "template-22",
    title: `文章标题 ${articleId}`,
    content: `文章正文 ${articleId}`,
    status: "saved",
    createdAt: "2026-08-08T00:00:00.000Z",
    updatedAt: "2026-08-08T00:00:00.000Z",
  };
}

function evidenceFixture(overrides) {
  const title = "实际投稿标题";
  const body = "实际投稿正文";
  return Object.assign(
    {
      version: 1,
      articleIdentityV1: {
        version: 1,
        clientId: "client-22",
        articleId: "article-22",
      },
      customerSnapshotV1: {
        version: 1,
        clientId: "client-22",
        displayName: "客户二十二",
      },
      contentAvailable: true,
      title,
      body,
      contentFingerprint: domain.preparedContentFingerprint({ title, body }),
      targetSnapshotV1: {
        version: 1,
        kind: "platform",
        platformId: "toutiao",
        platformName: "头条",
        accountProfileId: "account-22",
        accountLabel: "二十二号账号",
      },
      resultCode: "REGULAR_ACCEPTED",
      submittedAt: "2026-08-08T00:01:00.000Z",
      submittedAtSource: "regular_remote_call_started",
      firstPublishedAt: "2026-08-08T00:02:00.000Z",
      firstPublishedAtSource: "provider_event_time",
      imageSummaryV1: {
        deliveryMode: "text_only",
        images: [],
        decisionKind: "initial",
      },
      orderNumber: null,
      remoteUrl: "https://publisher.example/article-22",
      missingReasons: [],
      safeEvidenceRefs: [
        { kind: "PREPARED_SUBMISSION", fingerprint: "a".repeat(64) },
      ],
    },
    overrides || {},
  );
}

function targetFixture() {
  return {
    version: 1,
    kind: "platform",
    platformId: "toutiao",
    accountProfileId: "account-22",
  };
}

function terminalFixture() {
  return {
    version: 1,
    articleIdentityV1: {
      version: 1,
      clientId: "client-22",
      articleId: "article-22",
    },
    targetIdentityV1: targetFixture(),
    attemptId: "attempt-22",
    terminalKind: "PUBLISHED",
    reasonCode: "PUBLICATION_SUCCESS",
    terminalAt: "2026-08-08T00:02:00.000Z",
    terminalAtSource: "provider_event_time",
    evidenceFingerprint: "b".repeat(64),
  };
}

function closedFixture() {
  return {
    version: 1,
    articleIdentityV1: {
      version: 1,
      clientId: "client-22",
      articleId: "article-22",
    },
    targetIdentityV1: targetFixture(),
    attemptId: "attempt-22",
    closedKind: "REJECTED",
    reasonCode: "PUBLICATION_FAILED",
    closedAt: "2026-08-08T00:03:00.000Z",
    closedAtSource: "observation_time",
    evidenceFingerprint: "c".repeat(64),
  };
}

function tombstoneIdentityFixture() {
  return {
    version: 1,
    articleIdentityV1: {
      version: 1,
      clientId: "client-22",
      articleId: "article-22",
    },
    state: "TRASHED",
    deletedAt: "2026-08-08T00:04:00.000Z",
    purgedAt: null,
    reasonCode: "ARTICLE_TRASHED",
    contentFingerprint: "d".repeat(64),
  };
}

function deletionIdentityFixture() {
  return {
    version: 1,
    transactionId: "removal-22",
    articleIdentitiesV1: [
      {
        version: 1,
        clientId: "client-22",
        articleId: "article-22",
      },
    ],
    state: "PENDING",
    reasonCode: null,
    createdAt: "2026-08-08T00:05:00.000Z",
    updatedAt: "2026-08-08T00:05:00.000Z",
    selectionFingerprint: "e".repeat(64),
  };
}

test("Ticket 22 exports four recursively closed V1 contracts with exact fields", () => {
  const parsed = [
    domain.parseTerminalTargetV1(terminalFixture()),
    domain.parseClosedTargetV1(closedFixture()),
    domain.parseTombstoneIdentityV1(tombstoneIdentityFixture()),
    domain.parseDeletionTransactionIdentityV1(deletionIdentityFixture()),
  ];
  assert.equal(parsed.every((value) => Object.isFrozen(value)), true);
  assert.equal(Object.isFrozen(parsed[0].articleIdentityV1), true);
  assert.equal(Object.isFrozen(parsed[3].articleIdentitiesV1[0]), true);

  for (const [parse, value] of [
    [domain.parseTerminalTargetV1, terminalFixture()],
    [domain.parseClosedTargetV1, closedFixture()],
    [domain.parseTombstoneIdentityV1, tombstoneIdentityFixture()],
    [domain.parseDeletionTransactionIdentityV1, deletionIdentityFixture()],
  ]) {
    assert.throws(() => parse(Object.assign({}, value, { workspacePath: "F:\\private" })));
    assert.throws(() => parse(Object.assign({}, value, { token: "secret" })));
    assert.throws(() => parse(Object.assign({}, value, {
      articleIdentityV1: Object.assign({}, value.articleIdentityV1, { body: "正文" }),
    })));
  }

  assert.throws(
    () => domain.parseTerminalTargetV1(Object.assign(terminalFixture(), {
      terminalAt: null,
      terminalAtSource: "provider_event_time",
    })),
    { code: "TERMINAL_TARGET_V1_INVALID" },
  );
  assert.throws(
    () => domain.parseClosedTargetV1(Object.assign(closedFixture(), {
      closedKind: "UNKNOWN",
    })),
    { code: "CLOSED_TARGET_V1_INVALID" },
  );
  assert.throws(
    () => domain.parseTombstoneIdentityV1(Object.assign(tombstoneIdentityFixture(), {
      state: "PERMANENTLY_DELETED",
    })),
    { code: "TOMBSTONE_IDENTITY_V1_INVALID" },
  );
  assert.throws(
    () => domain.parseDeletionTransactionIdentityV1(Object.assign(deletionIdentityFixture(), {
      articleIdentitiesV1: [
        deletionIdentityFixture().articleIdentitiesV1[0],
        deletionIdentityFixture().articleIdentitiesV1[0],
      ],
    })),
    { code: "DELETION_TRANSACTION_IDENTITY_V1_INVALID" },
  );
  const sparseIdentities = [];
  sparseIdentities.length = 1;
  assert.throws(
    () => domain.parseDeletionTransactionIdentityV1(Object.assign(deletionIdentityFixture(), {
      articleIdentitiesV1: sparseIdentities,
    })),
    { code: "DELETION_TRANSACTION_IDENTITY_V1_INVALID" },
  );
});

function regularPublishedFixture(articleId = "article-22-regular") {
  const root = workspace("ticket-22-regular-");
  const transitionPorts = {};
  const store = createOperationalStore({
    workspaceRoot: root,
    transitionPorts,
    clock: () => new Date("2026-08-08T01:00:00.000Z"),
  });
  const profile = store.createAccountProfile({
    platformId: "toutiao",
    displayName: "二十二号账号",
  });
  const target = {
    kind: "platform",
    platformId: "toutiao",
    accountProfileId: profile.accountProfileId,
  };
  const title = `实际标题 ${articleId}`;
  const body = `实际正文 ${articleId}`;
  const admitted = transitionPorts.regularQueueTransitions.admitRegularQueueItem({
    clientId: "client-22",
    articleId,
    batchId: `batch-${articleId}`,
    itemId: `item-${articleId}`,
    publicationId: `publication-${articleId}`,
    attemptId: `attempt-${articleId}`,
    target,
    publicationSnapshot: {
      articleId,
      title,
      body,
      fingerprint: domain.preparedContentFingerprint({ title, body }),
    },
    payload: {
      clientId: "client-22",
      customerSnapshotV1: {
        version: 1,
        clientId: "client-22",
        displayName: "客户二十二",
      },
    },
  });
  transitionPorts.regularQueueGroupTransitions.setRegularQueueGroupRunIntent({
    queueGroupId: admitted.queueGroupId,
    running: true,
  });
  const claim = transitionPorts.regularQueueGroupTransitions.claimRegularQueueGroupHead({
    queueGroupId: admitted.queueGroupId,
    claimToken: `claim-${articleId}`,
    leaseMs: 30000,
  });
  const evidence = domain.createTextOnlyPreparedSubmissionEvidenceV1(claim);
  transitionPorts.regularQueueGroupTransitions.beginRegularRemoteSubmission({
    regularPublicationAttemptId: claim.regularPublicationAttemptId,
    claimToken: claim.claimToken,
    preparedSubmissionEvidenceV1: evidence,
  });
  const success = transitionPorts.regularOutcomeTransitions.recordRegularAccepted({
    regularPublicationAttemptId: claim.regularPublicationAttemptId,
    observation: {
      status: "accepted",
      code: "HEPAN_ACCEPTED",
      observedAt: "2026-08-08T01:00:02.000Z",
      providerEventAt: "2026-08-08T01:00:01.000Z",
      remoteId: `remote-${articleId}`,
      remoteUrl: `https://publisher.example/${articleId}`,
    },
  });
  return {
    root,
    store,
    transitionPorts,
    articleId,
    evidence: success.publicationEvidenceV1,
    close() {
      store.close();
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
}

function paidPublishedFixture(articleId = "article-22-paid") {
  const root = workspace("ticket-22-paid-");
  let store = createOperationalStore({
    workspaceRoot: root,
    clock: () => new Date("2026-08-08T01:00:00.000Z"),
  });
  const attemptId = `attempt-${articleId}`;
  const publicationId = `publication-${articleId}`;
  const orderId = `order-${articleId}`;
  store.reservePublicationTarget({
    articleId,
    publicationId,
    attemptId,
    target: { kind: "media", mediaResourceId: `media-${articleId}` },
  });
  store.commitRemoteOutcome({
    attemptId,
    outcome: {
      status: "uncertain",
      evidence: {
        articleId,
        attemptId,
        targetKey: `media-resource:media-${articleId}`,
        remoteId: orderId,
      },
    },
  });
  const snapshot = domain.parseOrderSnapshotV1({
    version: 1,
    orderIdentityV1: { version: 1, orderId },
    articleIdentityV1: { version: 1, clientId: "client-22", articleId },
    targetIdentityV1: {
      version: 1,
      kind: "media",
      mediaResourceId: `media-${articleId}`,
    },
    orderCreationAttemptId: `paid-${articleId}`,
    mediaName: "二十二号媒体",
    quotedPrice: 22,
    estimatedTotal: 22,
    actualAmount: null,
    systemSubmissionCode: `system-${articleId}`,
    submittedTitle: "付费实际标题",
    submittedBody: "付费实际正文",
    contentFingerprint: domain.contentFingerprint("付费实际标题", "付费实际正文"),
    remoteCallStartedAt: "2026-08-08T00:59:00.000Z",
  });
  const db = new DatabaseSync(store.databasePath);
  db.prepare("UPDATE remote_orders SET payload_json=? WHERE order_id=?").run(
    JSON.stringify(snapshot),
    orderId,
  );
  db.prepare("INSERT INTO submission_batches VALUES(?,?,?,?,?)").run(
    `batch-${articleId}`,
    "completed",
    1,
    "2026-08-08T00:59:00.000Z",
    "2026-08-08T00:59:01.000Z",
  );
  db.prepare("INSERT INTO submission_items VALUES(?,?,?,?,?,?,?,?,?)").run(
    `item-${articleId}`,
    `batch-${articleId}`,
    articleId,
    `media-resource:media-${articleId}`,
    1,
    "completed",
    null,
    null,
    JSON.stringify({
      attemptId,
      customerSnapshotV1: {
        version: 1,
        clientId: "client-22",
        displayName: "客户二十二",
      },
    }),
  );
  db.close();
  store.close();

  const transitionPorts = {};
  store = createOperationalStore({
    workspaceRoot: root,
    transitionPorts,
    clock: () => new Date("2026-08-08T01:00:00.000Z"),
  });
  const context = transitionPorts.orderObservationTransitions.getOrderObservationContext(orderId);
  const result = transitionPorts.orderObservationTransitions.recordOrderObservation({
    orderObservationV1: domain.parseOrderObservationV1({
      version: 1,
      orderIdentityV1: { version: 1, orderId },
      statusCode: "2",
      observedAt: "2026-08-08T01:00:02.000Z",
      eventAt: null,
      eventAtSource: "not_available",
      remoteUrl: `https://media.example/${orderId}`,
      actualAmount: null,
      evidenceFingerprint: "f".repeat(64),
      orderSnapshotFingerprint: context.orderSnapshotFingerprint,
    }),
  });
  return {
    root,
    store,
    transitionPorts,
    articleId,
    orderId,
    evidence: result.publication.publicationEvidenceV1,
    close() {
      store.close();
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
}

test("published archive query is read-only and covers regular accepted and paid status 2", (t) => {
  const regular = regularPublishedFixture();
  const paid = paidPublishedFixture();
  t.after(() => {
    regular.close();
    paid.close();
  });

  for (const fixture of [regular, paid]) {
    const query = fixture.transitionPorts.publishedArchiveQueries;
    assert.deepEqual(Object.keys(query), ["listPublishedArchives"]);
    const db = new DatabaseSync(fixture.store.databasePath, { readOnly: true });
    const before = db.prepare("SELECT COUNT(*) AS count FROM remote_evidence").get().count;
    db.close();
    const archives = query.listPublishedArchives({ articleIds: [fixture.articleId] });
    const afterDb = new DatabaseSync(fixture.store.databasePath, { readOnly: true });
    const after = afterDb.prepare("SELECT COUNT(*) AS count FROM remote_evidence").get().count;
    afterDb.close();
    assert.equal(after, before);
    assert.equal(archives.length, 1);
    assert.equal(archives[0].publicationEvidenceV1.body, fixture.evidence.body);
    assert.equal(archives[0].terminalTargetV1.terminalKind, "PUBLISHED");
    assert.equal(archives[0].terminalTargetV1.attemptId, archives[0].attemptId);
  }
  assert.equal(regular.evidence.resultCode, "REGULAR_ACCEPTED");
  assert.equal(paid.evidence.resultCode, "PAID_PUBLISHED");
});

test("published archive remains immutable after a later paid aftercare observation", (t) => {
  const fixture = paidPublishedFixture("article-22-aftercare");
  t.after(() => fixture.close());
  const before = fixture.transitionPorts.publishedArchiveQueries.listPublishedArchives({
    articleIds: [fixture.articleId],
  })[0];
  const context = fixture.transitionPorts.orderObservationTransitions.getOrderObservationContext(
    fixture.orderId,
  );
  fixture.transitionPorts.orderObservationTransitions.recordOrderObservation({
    orderObservationV1: domain.parseOrderObservationV1({
      version: 1,
      orderIdentityV1: { version: 1, orderId: fixture.orderId },
      statusCode: "9",
      observedAt: "2026-08-08T01:00:03.000Z",
      eventAt: null,
      eventAtSource: "not_available",
      remoteUrl: "https://media.example/aftercare",
      actualAmount: null,
      evidenceFingerprint: "9".repeat(64),
      orderSnapshotFingerprint: context.orderSnapshotFingerprint,
    }),
  });
  const after = fixture.transitionPorts.publishedArchiveQueries.listPublishedArchives({
    articleIds: [fixture.articleId],
  })[0];
  assert.deepEqual(after.publicationEvidenceV1, before.publicationEvidenceV1);
  assert.deepEqual(after.terminalTargetV1, before.terminalTargetV1);
});

test("legacy unavailable evidence stays null and never falls back to current article content or current time", async (t) => {
  const root = workspace("ticket-22-legacy-");
  const transitionPorts = {};
  const store = createOperationalStore({ workspaceRoot: root, transitionPorts });
  const account = store.createAccountProfile({
    platformId: "toutiao",
    displayName: "历史账号",
  });
  const articleId = "article-22-legacy";
  const publicationId = "publication-22-legacy";
  const attemptId = "attempt-22-legacy";
  const evidence = evidenceFixture({
    articleIdentityV1: { version: 1, clientId: "client-22", articleId },
    customerSnapshotV1: { version: 1, clientId: "client-22", displayName: "客户二十二" },
    contentAvailable: false,
    title: null,
    body: null,
    contentFingerprint: null,
    targetSnapshotV1: {
      version: 1,
      kind: "legacy-unknown-account",
      platformId: "toutiao",
      platformName: "历史账号",
    },
    submittedAt: null,
    submittedAtSource: "legacy_unavailable",
    firstPublishedAt: null,
    firstPublishedAtSource: "legacy_unavailable",
    imageSummaryV1: null,
    missingReasons: [
      "LEGACY_SUBMISSION_CONTENT_UNAVAILABLE",
      "LEGACY_SUBMITTED_AT_UNAVAILABLE",
      "LEGACY_FIRST_PUBLISHED_AT_UNAVAILABLE",
      "LEGACY_IMAGE_SUMMARY_UNAVAILABLE",
    ],
    safeEvidenceRefs: [
      { kind: "LEGACY_EVIDENCE", fingerprint: "1".repeat(64) },
    ],
    remoteUrl: null,
  });
  assert.doesNotThrow(() => domain.parsePublicationEvidenceV1(evidence, { allowLegacy: true }));
  const db = new DatabaseSync(store.databasePath);
  db.prepare("INSERT INTO publication_records VALUES(?,?,?,?,?,?,?)").run(
    publicationId,
    articleId,
    "platform:toutiao:legacy",
    JSON.stringify({
      kind: "platform",
      platformId: "toutiao",
      accountProfileId: account.accountProfileId,
    }),
    "published",
    "2026-08-01T00:00:00.000Z",
    "2026-08-01T00:00:00.000Z",
  );
  db.prepare("INSERT INTO publication_attempts VALUES(?,?,?,?,?)").run(
    attemptId,
    publicationId,
    "published",
    "2026-08-01T00:00:00.000Z",
    "2026-08-01T00:00:01.000Z",
  );
  db.prepare("INSERT INTO remote_evidence VALUES(?,?,?,?,?,?)").run(
    "legacy-evidence-22",
    attemptId,
    `publication-success:${attemptId}`,
    null,
    JSON.stringify(evidence),
    "2026-08-01T00:00:01.000Z",
  );
  db.close();
  t.after(() => {
    store.close();
    fs.rmSync(root, { recursive: true, force: true });
  });

  const snapshot = await createArticleManagementSnapshot({
    listArticles: () => [Object.assign(article(articleId), { content: "当前文章正文" })],
    listTrash: () => [],
    listBatches: () => [],
    listLifecycleFacts: () => ({
      publications: [{
        articleId,
        publicationId,
        targetKey: "platform:toutiao:legacy",
        status: "published",
      }],
      submissionItems: [],
      orders: [],
      attentionItems: [],
    }),
    publishedArchiveQueries: transitionPorts.publishedArchiveQueries,
  }).get({ clientId: "client-22" });
  const archived = snapshot.publishedArchives[0].publicationEvidenceV1;
  assert.equal(archived.body, null);
  assert.equal(archived.title, null);
  assert.equal(archived.firstPublishedAt, null);
  assert.equal(archived.submittedAt, null);
  assert.equal(archived.imageSummaryV1, null);
  assert.equal(archived.missingReasons.includes("LEGACY_SUBMISSION_CONTENT_UNAVAILABLE"), true);
  assert.equal(archived.missingReasons.includes("LEGACY_FIRST_PUBLISHED_AT_UNAVAILABLE"), true);
  assert.equal(snapshot.articles[0].content, "当前文章正文");
});

test("archive query and article-management snapshot preserve an empty client state", async (t) => {
  const root = workspace("ticket-22-empty-");
  const transitionPorts = {};
  const store = createOperationalStore({ workspaceRoot: root, transitionPorts });
  t.after(() => {
    store.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  assert.deepEqual(
    transitionPorts.publishedArchiveQueries.listPublishedArchives({ articleIds: [] }),
    [],
  );
  const snapshot = await createArticleManagementSnapshot({
    listArticles: () => [],
    listTrash: () => [],
    listBatches: () => [],
    listLifecycleFacts: () => ({ publications: [], submissionItems: [], orders: [] }),
    publishedArchiveQueries: transitionPorts.publishedArchiveQueries,
  }).get({ clientId: "client-22" });
  assert.deepEqual(snapshot.publishedArchives, []);
});

test("typed article-management archive field delegates V1 validation and rejects sensitive extras", () => {
  const registry = createContractRegistry(articleManagementContracts);
  const contract = registry.byChannel("content:get-article-management-snapshot");
  const evidence = domain.parsePublicationEvidenceV1(evidenceFixture());
  const archive = {
    publicationId: "publication-22",
    attemptId: "attempt-22",
    publicationEvidenceV1: evidence,
    terminalTargetV1: domain.parseTerminalTargetV1(terminalFixture()),
  };
  const data = {
    clientId: "client-22",
    revision: 1,
    articles: [],
    trash: [],
    submissionBatches: [],
    cancellationPlans: [],
    publicationRecords: [],
    publishedArchives: [archive],
    attention: { revision: 1, items: [], counts: { total: 0, actionable: 0 } },
    submissionPlatforms: [],
    workflowItems: [],
    publicationSummaryItems: [],
    attentionCountItems: [],
    orderSummaryItems: [],
  };
  const encoded = registry.success(contract, data);
  assert.equal(encoded.data.publishedArchives[0].publicationEvidenceV1.body, "实际投稿正文");
  assert.throws(
    () => registry.success(contract, Object.assign({}, data, {
      publishedArchives: [Object.assign({}, archive, { token: "secret" })],
    })),
    { code: "IPC_UNKNOWN_FIELD" },
  );
  assert.throws(
    () => registry.success(contract, Object.assign({}, data, {
      publishedArchives: [Object.assign({}, archive, {
        publicationEvidenceV1: Object.assign({}, evidence, { workspacePath: "F:\\private" }),
      })],
    })),
    { code: "IPC_RESULT_INVALID" },
  );
});

function mutationFixture() {
  const root = workspace("ticket-22-mutation-");
  const articleStore = createArticleStore(root);
  const clients = new Set(["client-22"]);
  const contentStore = createContentStore({
    articleStore,
    listClientIds: () => [...clients],
  });
  let facts = {
    publications: [],
    submissionItems: [],
    orders: [],
    attentionItems: [],
    removalTransactions: [],
  };
  const operationalStore = { listArticleLifecycleFacts: () => facts };
  const coordinator = createArticleMutationCoordinator({
    articleStore,
    contentStore,
    operationalStore,
  });
  return {
    root,
    articleStore,
    contentStore,
    operationalStore,
    coordinator,
    add(value) {
      clients.add(value.clientId);
      articleStore.createArticle(value);
    },
    setFacts(value) {
      facts = Object.assign({
        publications: [],
        submissionItems: [],
        orders: [],
        attentionItems: [],
        removalTransactions: [],
      }, value);
    },
    trash(value) {
      const tombstone = {
        version: 1,
        deletedAt: "2026-08-08T02:00:00.000Z",
        clientId: value.clientId,
        articleId: value.id,
        status: value.status,
        references: [],
        titleSnapshot: value.title,
        contentFingerprint: fingerprintArticle(value),
      };
      return contentStore.moveArticleToTrash(value.clientId, value.id, tombstone);
    },
    close() {
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
}

test("restore/permanent-delete use coordinator lock and publish tombstone identities", (t) => {
  const fixture = mutationFixture();
  t.after(() => fixture.close());
  const value = article("article-22-delete");
  fixture.add(value);
  fixture.trash(value);
  const service = createArticleTrashService({
    contentStore: fixture.contentStore,
    operationalStore: fixture.operationalStore,
    mutationCoordinator: fixture.coordinator,
    now: () => "2026-08-08T02:01:00.000Z",
  });
  assert.equal(service.listTrashedArticles("client-22")[0].tombstoneIdentityV1.state, "TRASHED");
  const restored = service.restoreArticle({ clientId: "client-22", articleId: value.id });
  assert.equal(restored.id, value.id);

  fixture.trash(value);
  const confirmation = service.preparePermanentDelete({ clientId: "client-22", articleId: value.id });
  const deleted = service.permanentlyDeleteArticle({
    clientId: "client-22",
    articleId: value.id,
    token: confirmation.token,
  });
  assert.equal(deleted.deleted, true);
  assert.equal(deleted.tombstoneIdentityV1.state, "PERMANENTLY_DELETED");
  assert.equal(deleted.tombstoneIdentityV1.purgedAt, "2026-08-08T02:01:00.000Z");
  assert.equal(fixture.contentStore.isArticleTrashed("client-22", value.id), false);
});

test("permanent deletion retains terminal order facts and canonicalizes the purge time", (t) => {
  const fixture = mutationFixture();
  t.after(() => fixture.close());
  const current = article("article-22-terminal-order");
  fixture.add(current);
  fixture.setFacts({
    orders: [{
      articleId: current.id,
      orderId: "order-22-terminal",
      supplierStatusCode: "4",
      mediaResourceId: "media-22-terminal",
    }],
  });
  fixture.trash(current);
  const service = createArticleTrashService({
    contentStore: fixture.contentStore,
    operationalStore: fixture.operationalStore,
    mutationCoordinator: fixture.coordinator,
    now: () => "2026-08-08T02:03:00Z",
  });
  const confirmation = service.preparePermanentDelete({
    clientId: current.clientId,
    articleId: current.id,
  });
  const result = service.permanentlyDeleteArticle({
    clientId: current.clientId,
    articleId: current.id,
    token: confirmation.token,
  });
  assert.equal(result.tombstoneIdentityV1.purgedAt, "2026-08-08T02:03:00.000Z");
  assert.deepEqual(fixture.operationalStore.listArticleLifecycleFacts().orders, [{
    articleId: current.id,
    orderId: "order-22-terminal",
    supplierStatusCode: "4",
    mediaResourceId: "media-22-terminal",
  }]);
});

test("restore and permanent-delete fail closed for published, active, paid, and uncertain facts", (t) => {
  const cases = [
    {
      facts: { publications: [{ articleId: "article-22-blocked", status: "published" }] },
      code: "ARTICLE_PUBLISHED_IMMUTABLE",
    },
    {
      facts: { publications: [{ articleId: "article-22-blocked", status: "queued", targetKey: "platform:toutiao" }] },
      code: "ARTICLE_OPERATION_FROZEN",
    },
    {
      facts: { orders: [{ articleId: "article-22-blocked", orderId: "order-22", supplierStatusCode: "0", mediaResourceId: "media-22" }] },
      code: "ARTICLE_OPERATION_FROZEN",
    },
    {
      facts: { submissionItems: [{ articleId: "article-22-blocked", status: "uncertain", targetKey: "platform:toutiao" }] },
      code: "PUBLICATION_UNCERTAIN",
    },
  ];
  for (const value of cases) {
    const fixture = mutationFixture();
    t.after(() => fixture.close());
    const current = article("article-22-blocked");
    fixture.add(current);
    fixture.trash(current);
    fixture.setFacts(value.facts);
    assert.throws(
      () => fixture.coordinator.restoreArticles({ articleRefs: [{ clientId: current.clientId, articleId: current.id }] }),
      { code: value.code },
    );
    assert.throws(
      () => fixture.coordinator.permanentlyDeleteArticles({ articleRefs: [{ clientId: current.clientId, articleId: current.id }] }),
      { code: value.code },
    );
    assert.equal(fixture.contentStore.isArticleTrashed(current.clientId, current.id), true);
  }
});

test("deletion transaction DTO is versioned while completed history remains queryable", (t) => {
  const fixture = mutationFixture();
  t.after(() => fixture.close());
  const current = article("article-22-transaction");
  fixture.add(current);
  const removal = createArticleRemovalService({
    workspaceRoot: fixture.root,
    contentStore: fixture.contentStore,
    mutationCoordinator: fixture.coordinator,
    submissionService: {
      previewArticleRemovalImpact: () => ({
        blockedItems: [],
        canCommit: true,
      }),
    },
    createTransactionId: () => "removal-22-transaction",
    now: () => "2026-08-08T02:02:00.000Z",
  });
  const preview = removal.previewArticleRemovalImpact({
    selections: [{ clientId: current.clientId, articleId: current.id }],
  });
  const result = removal.applyArticleRemovalImpact({
    selections: preview.selections,
    token: preview.token,
    confirmed: true,
  });
  const transaction = removal.getArticleRemovalTransaction(result.transactionId);
  assert.equal(transaction.deletionTransactionIdentityV1.version, 1);
  assert.equal(transaction.deletionTransactionIdentityV1.state, "COMMITTED");
  assert.deepEqual(transaction.deletionTransactionIdentityV1.articleIdentitiesV1, [
    { version: 1, clientId: current.clientId, articleId: current.id },
  ]);
  assert.match(transaction.deletionTransactionIdentityV1.selectionFingerprint, /^[a-f0-9]{64}$/);
  assert.equal(fixture.contentStore.isArticleTrashed(current.clientId, current.id), true);
});
