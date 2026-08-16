"use strict";

const { it } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createArticleRemovalService } = require("../src/content/article-removal-service");
const { createArticleRemovalTransactionStore } = require("../src/content/article-removal-transaction-store");
const { transactionFingerprint, fingerprint } = require("../src/content/article-removal-plan");

function hash(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function fixture(options) {
  const value = options || {};
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "article-removal-"));
  const store = createArticleRemovalTransactionStore({
    workspaceRoot: root,
    createId: value.createId || (() => "tx-1"),
  });
  let time = "2026-07-25T00:00:00.000Z";
  let blockedItems = value.blockedItems || [];
  let readError = null;
  let moveError = value.moveError || null;
  let trashed = false;
  let tombstone = null;
  let moveCalls = 0;
  let moveEffects = 0;
  let queueMutationCalls = 0;
  const article = {
    clientId: "c-1",
    id: "a-1",
    title: "Title",
    content: "body",
    status: "generated",
  };

  const submissionService = {
    previewArticleRemovalImpact: () => ({
      blockedItems: blockedItems.slice(),
      queuedToCancel: [
        { clientId: "c-1", articleId: "a-1", batchId: "legacy-batch" },
      ],
    }),
    cancelArticleSubmissionItem: () => {
      queueMutationCalls += 1;
      throw new Error("legacy queue mutation must not be called");
    },
    cancelPaidOrder: () => {
      queueMutationCalls += 1;
      throw new Error("paid cancellation must not be called");
    },
    cancelOrder: () => {
      queueMutationCalls += 1;
      throw new Error("order cancellation must not be called");
    },
  };

  const contentStore = {
    snapshotArticle: (current) => JSON.parse(JSON.stringify(current)),
    getArticle: () => {
      if (readError) throw Object.assign(new Error("article read failed"), { code: readError });
      if (trashed) throw Object.assign(new Error("article missing"), { code: "ARTICLE_NOT_FOUND" });
      return article;
    },
    fingerprintArticle: (current) => hash(current),
    isArticleTrashed: () => trashed,
    getTrashedTombstone: () => {
      if (!trashed) throw Object.assign(new Error("article missing"), { code: "ARTICLE_NOT_FOUND" });
      return tombstone;
    },
    supportsIdempotentRemovalOperation: true,
    moveArticleToTrash: (clientId, articleId, nextTombstone, operationId, expectedFingerprint) => {
      moveCalls += 1;
      if (value.mutateInsideMove) {
        article.content = "changed inside move";
        value.mutateInsideMove = false;
      }
      if (value.moveAfterEffect) {
        trashed = true;
        tombstone = Object.assign({}, nextTombstone, { operationId });
        moveEffects += 1;
        value.moveAfterEffect = false;
        throw Object.assign(new Error("move result uncertain"), { code: "EIO" });
      }
      if (expectedFingerprint && expectedFingerprint !== hash(article))
        throw Object.assign(new Error("article changed"), { code: "ARTICLE_REMOVAL_CONTENT_CHANGED" });
      if (moveError) throw Object.assign(new Error("move failed"), { code: moveError });
      if (!trashed) {
        trashed = true;
        tombstone = Object.assign({}, nextTombstone, { operationId });
        moveEffects += 1;
      }
      return tombstone;
    },
  };

  const service = createArticleRemovalService({
    contentStore,
    articleRemovalImpactQuery: submissionService,
    transactionStore: store,
    now: () => time,
    recoveryBackoffMs: 1,
    maxRecoveryAttempts: value.maxRecoveryAttempts || 2,
    runnerId: value.runnerId || "runner-a",
    afterArticleMove: value.afterArticleMove,
  });

  return {
    root,
    store,
    service,
    article,
    contentStore,
    articleRemovalImpactQuery: submissionService,
    setNow: (next) => { time = next; },
    setBlocked: (next) => { blockedItems = next || []; },
    setReadError: (next) => { readError = next || null; },
    setMoveError: (next) => { moveError = next || null; },
    setTrashed: (next, nextTombstone) => {
      trashed = next === true;
      tombstone = nextTombstone || tombstone;
    },
    setMoveAfterEffect: (next) => { value.moveAfterEffect = next === true; },
    calls: () => ({ moveCalls, moveEffects, queueMutationCalls }),
    cleanup: () => fs.rmSync(root, { recursive: true, force: true }),
  };
}

function begin(fixtureValue, selections) {
  const preview = fixtureValue.service.previewArticleRemovalImpact({
    selections: selections || [{ clientId: "c-1", articleId: "a-1" }],
  });
  return {
    preview,
    result: fixtureValue.service.applyArticleRemovalImpact({
      confirmed: true,
      token: preview.token,
    }),
  };
}

function seedLegacyTransaction(fixtureValue, overrides) {
  const article = fixtureValue.article;
  const selections = [{ clientId: article.clientId, articleId: article.id }];
  const createdAt = "2026-07-25T00:00:00.000Z";
  const transaction = Object.assign(
    {
      version: 1,
      id: "legacy-1",
      kind: "article-removal",
      status: "pending_auto_recovery",
      phase: "queue-actions",
      createdAt,
      updatedAt: createdAt,
      selections,
      articles: [{ clientId: article.clientId, articleId: article.id, titleSnapshot: article.title }],
      contentArticleFingerprints: [hash(article)],
      contentFingerprint: fingerprint([article]),
      fingerprint: transactionFingerprint(selections),
      queueActions: [{ clientId: article.clientId, articleId: article.id, batchId: "legacy-batch" }],
      queueCursor: 1,
      queueResults: [{ status: "completed" }],
      revision: 0,
    },
    overrides || {},
  );
  fixtureValue.store.save(transaction);
  return transaction;
}

it("removal preview exposes only blocked facts and never creates queue actions", (t) => {
  const f = fixture();
  t.after(f.cleanup);
  const preview = f.service.previewArticleRemovalImpact({
    selections: [{ clientId: "c-1", articleId: "a-1" }],
  });
  assert.equal(preview.canCommit, true);
  assert.deepEqual(preview.blockedItems, []);
  assert.equal(Object.hasOwn(preview, "queuedToCancel"), false);
  const { result } = begin(f);
  assert.equal(result.status, "committed");
  assert.equal(f.calls().queueMutationCalls, 0);
  const transaction = f.store.get(result.transactionId);
  assert.equal(transaction.version, 2);
  assert.equal(Object.hasOwn(transaction, "queueActions"), false);
  assert.equal(Object.hasOwn(transaction, "queueCursor"), false);
  assert.equal(Object.hasOwn(transaction, "queueResults"), false);
});

it("revalidates active facts before moving and keeps the article unchanged", (t) => {
  const f = fixture({ moveError: "IO_DOWN" });
  t.after(f.cleanup);
  const started = begin(f).result;
  f.setBlocked([{ clientId: "c-1", articleId: "a-1", reasonCode: "PUBLICATION_UNCERTAIN" }]);
  const retried = f.service.retryArticleRemovalTransaction({
    transactionId: started.transactionId,
    confirmed: true,
  });
  assert.equal(retried.status, "needs_repair");
  assert.equal(retried.errorCode, "ARTICLE_REMOVAL_BLOCKED");
  assert.equal(f.calls().moveEffects, 0);
});

it("detects content identity changes after intent and before the durable move", (t) => {
  const f = fixture();
  t.after(f.cleanup);
  const originalCompare = f.store.compareAndUpdate;
  let changed = false;
  f.store.compareAndUpdate = (id, revision, updater) => {
    const result = originalCompare(id, revision, updater);
    if (!changed && result && result.claimToken) {
      changed = true;
      f.article.remark = "changed after intent";
    }
    return result;
  };
  const result = begin(f).result;
  assert.equal(result.status, "needs_repair");
  assert.equal(result.errorCode, "ARTICLE_REMOVAL_CONTENT_CHANGED");
  assert.equal(f.calls().moveEffects, 0);
});

it("records a move fault for bounded recovery and commits after the fault is cleared", (t) => {
  const f = fixture({ moveError: "IO_DOWN" });
  t.after(f.cleanup);
  const first = begin(f).result;
  assert.equal(first.status, "pending_auto_recovery");
  assert.equal(f.store.get(first.transactionId).retryCount, 1);
  f.setMoveError(null);
  f.setNow("2026-07-25T00:01:00.000Z");
  const recovered = f.service.recoverPendingRemovals();
  assert.equal(recovered[0].status, "committed");
  assert.equal(f.calls().moveEffects, 1);
});

it("moves only the completed prefix when a later article changes", (t) => {
  const f = fixture();
  t.after(f.cleanup);
  const articles = new Map([
    ["a-1", { clientId: "c-1", id: "a-1", title: "One", content: "one", status: "generated" }],
    ["a-2", { clientId: "c-1", id: "a-2", title: "Two", content: "two", status: "generated" }],
  ]);
  const trashed = new Set();
  const moved = [];
  const contentStore = {
    snapshotArticle: (article) => JSON.parse(JSON.stringify(article)),
    getArticle: (_clientId, articleId) => {
      if (trashed.has(articleId)) throw Object.assign(new Error("missing"), { code: "ARTICLE_NOT_FOUND" });
      return articles.get(articleId);
    },
    fingerprintArticle: hash,
    isArticleTrashed: (_clientId, articleId) => trashed.has(articleId),
    getTrashedTombstone: (_clientId, articleId) => {
      if (!trashed.has(articleId)) throw Object.assign(new Error("missing"), { code: "ARTICLE_NOT_FOUND" });
      return { clientId: "c-1", articleId, operationId: "known" };
    },
    moveArticleToTrash: (_clientId, articleId) => {
      trashed.add(articleId);
      moved.push(articleId);
    },
  };
  const store = createArticleRemovalTransactionStore({
    workspaceRoot: f.root,
    createId: () => "tx-many",
  });
  const service = createArticleRemovalService({
    contentStore,
    articleRemovalImpactQuery: { previewArticleRemovalImpact: () => ({ blockedItems: [] }) },
    transactionStore: store,
    now: () => "2026-07-25T00:00:00.000Z",
    runnerId: "runner-many",
    afterArticleMove: (_item, index) => {
      if (index === 0) articles.get("a-2").remark = "changed after first move";
    },
  });
  const preview = service.previewArticleRemovalImpact({
    selections: [
      { clientId: "c-1", articleId: "a-1" },
      { clientId: "c-1", articleId: "a-2" },
    ],
  });
  const result = service.applyArticleRemovalImpact({ confirmed: true, token: preview.token });
  assert.equal(result.status, "needs_repair");
  assert.deepEqual(moved, ["a-1"]);
  assert.equal(store.get(result.transactionId).articleCursor, 1);
});

it("does not repeat a durable move when the postcondition is already present", (t) => {
  const f = fixture({ moveAfterEffect: true });
  t.after(f.cleanup);
  const first = begin(f).result;
  assert.equal(first.status, "pending_auto_recovery");
  f.setNow("2026-07-25T00:01:00.000Z");
  const recovered = f.service.recoverPendingRemovals();
  assert.equal(recovered[0].status, "committed");
  assert.equal(f.calls().moveCalls, 1);
  assert.equal(f.calls().moveEffects, 1);
});

it("reconciles an article active operation using the same operation identity", (t) => {
  const f = fixture({ moveError: "IO_DOWN" });
  t.after(f.cleanup);
  const started = begin(f).result;
  const transaction = f.store.get(started.transactionId);
  transaction.activeOperation = {
    operationId: `${transaction.id}:article:0`,
    kind: "article",
    cursor: 0,
    owner: "runner-old",
    clientId: "c-1",
    articleId: "a-1",
  };
  f.store.save(transaction);
  f.setMoveError(null);
  const result = f.service.retryArticleRemovalTransaction({
    transactionId: started.transactionId,
    confirmed: true,
  });
  assert.equal(result.status, "committed");
  assert.equal(f.calls().moveEffects, 1);
});

it("migrates a completed legacy queue-action transaction once and resumes article removal", (t) => {
  const f = fixture();
  t.after(f.cleanup);
  seedLegacyTransaction(f, {
    fingerprint: fingerprint({
      selections: ["c-1\0a-1"],
      actions: [{
        clientId: "c-1",
        articleId: "a-1",
        batchId: "legacy-batch",
        publicationId: null,
        targetPlatformId: null,
        attemptId: null,
        action: "cancel",
      }],
    }),
  });
  const recovered = f.service.recoverPendingRemovals();
  assert.equal(recovered.length, 1);
  assert.equal(recovered[0].status, "committed");
  const transaction = f.store.get("legacy-1");
  assert.equal(transaction.legacyQueueMigration, "completed");
  assert.equal(transaction.legacyQueueMigrationCode, "LEGACY_QUEUE_ACTIONS_RETIRED");
  assert.equal(transaction.fingerprint, transactionFingerprint(transaction.selections));
  assert.equal(Object.hasOwn(transaction, "queueActions"), false);
  assert.equal(Object.hasOwn(transaction, "queueCursor"), false);
  assert.equal(Object.hasOwn(transaction, "queueResults"), false);
  assert.equal(f.calls().queueMutationCalls, 0);
  assert.equal(f.calls().moveEffects, 1);
});

it("retires an unproven legacy queue action into needs_repair without executing it", (t) => {
  const f = fixture();
  t.after(f.cleanup);
  seedLegacyTransaction(f, {
    activeOperation: {
      operationId: "legacy-1:queue:0",
      kind: "queue",
      cursor: 0,
      owner: "runner-old",
      clientId: "c-1",
      articleId: "a-1",
    },
    queueCursor: 0,
    queueResults: [],
  });
  f.service.recoverPendingRemovals();
  const migrated = f.store.get("legacy-1");
  assert.equal(migrated.status, "needs_repair");
  assert.equal(migrated.phase, "needs_repair");
  assert.equal(migrated.errorCode, "ARTICLE_REMOVAL_LEGACY_QUEUE_ACTION");
  assert.equal(migrated.resolutionCode, "LEGACY_QUEUE_ACTIONS_REQUIRE_MANUAL_REPAIR");
  assert.equal(Object.hasOwn(migrated, "queueActions"), false);
  assert.equal(Object.hasOwn(migrated, "queueCursor"), false);
  assert.equal(Object.hasOwn(migrated, "queueResults"), false);
  assert.equal(f.calls().moveEffects, 0);
  const retry = f.service.retryArticleRemovalTransaction({ transactionId: "legacy-1", confirmed: true });
  assert.equal(retry.status, "needs_repair");
  assert.equal(f.calls().queueMutationCalls, 0);
});

it("fails closed for a transaction without durable content identity", (t) => {
  const f = fixture();
  t.after(f.cleanup);
  f.store.save({
    id: "tx-missing-fingerprint",
    version: 2,
    kind: "article-removal",
    status: "pending_auto_recovery",
    phase: "articles",
    createdAt: "2026-07-25T00:00:00.000Z",
    updatedAt: "2026-07-25T00:00:00.000Z",
    selections: [{ clientId: "c-1", articleId: "a-1" }],
    articles: [{ clientId: "c-1", articleId: "a-1" }],
    revision: 0,
  });
  f.service.recoverPendingRemovals();
  const transaction = f.store.get("tx-missing-fingerprint");
  assert.equal(transaction.status, "needs_repair");
  assert.equal(transaction.errorCode, "ARTICLE_REMOVAL_CONTENT_FINGERPRINT_MISSING");
  assert.equal(f.calls().moveEffects, 0);
});

it("permits only one runner to execute a claimed transaction", (t) => {
  const f = fixture({ runnerId: "runner-a" });
  t.after(f.cleanup);
  const other = createArticleRemovalService({
    contentStore: f.contentStore,
    articleRemovalImpactQuery: f.articleRemovalImpactQuery,
    transactionStore: f.store,
    now: () => "2026-07-25T00:00:00.000Z",
    runnerId: "runner-b",
  });
  seedLegacyTransaction(f, {
    version: 2,
    phase: "articles",
    queueActions: undefined,
    queueCursor: undefined,
    queueResults: undefined,
    legacyQueueMigration: "completed",
  });
  let competing = null;
  const move = f.contentStore.moveArticleToTrash;
  f.contentStore.moveArticleToTrash = (...args) => {
    competing = other.recoverPendingRemovals();
    return move(...args);
  };
  const recovered = f.service.recoverPendingRemovals();
  assert.equal(recovered[0].status, "committed");
  assert.equal(competing.length, 1);
  assert.equal(competing[0].status, "pending_auto_recovery");
  assert.equal(f.calls().moveEffects, 1);
});

it("records persistence faults without losing a legal article phase", (t) => {
  const f = fixture();
  t.after(f.cleanup);
  const originalCompare = f.store.compareAndUpdate;
  let checkpoints = 0;
  f.store.compareAndUpdate = (id, revision, updater) => {
    checkpoints += 1;
    if (checkpoints === 2) throw Object.assign(new Error("disk"), { code: "EIO" });
    return originalCompare(id, revision, updater);
  };
  const result = begin(f).result;
  const transaction = f.store.get(result.transactionId);
  assert.equal(transaction.status, "pending_auto_recovery");
  assert.equal(transaction.phase, "articles");
  assert.equal(transaction.retryCount, 1);
  assert.equal(transaction.resolutionCode, "PERSISTENCE_RETRY_REQUIRED");
});

it("surfaces read faults during preview and never starts a transaction", (t) => {
  const f = fixture();
  t.after(f.cleanup);
  f.setReadError("IO_DOWN");
  assert.throws(
    () => f.service.previewArticleRemovalImpact({ selections: [{ clientId: "c-1", articleId: "a-1" }] }),
    { code: "IO_DOWN" },
  );
  assert.deepEqual(f.store.list(), []);
});
