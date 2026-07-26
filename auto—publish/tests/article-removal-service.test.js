const { it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createArticleRemovalService } = require("../src/content/article-removal-service");
const { createArticleRemovalTransactionStore } = require("../src/content/article-removal-transaction-store");

function fixture(options) {
  const value = options || {}; let blocked = value.blocked || []; let hasQueue = value.queue !== false; let queueCalls = 0; let queueBatches = []; let moves = 0; let moveEffects = 0; let trashed = false; let trashTombstone = null;
  let time = "2026-07-25T00:00:00.000Z"; const now = () => time;
  const article = { clientId: "c-1", id: "a-1", title: "Title", content: "body", status: "generated" };
  const configuredQueueActions = value.queueActions || [{ clientId: "c-1", articleId: "a-1", batchId: "b", publicationId: "p", targetPlatformId: "x", attemptId: "at" }];
  const submissionService = {
    previewArticleRemovalImpact: () => ({ canCommit: blocked.length === 0, items: [], queuedToCancel: hasQueue ? value.queuePostcondition && value.queuePostcondition.status === "completed" ? configuredQueueActions.slice(1) : configuredQueueActions : [], failedToClean: [], publishedToClean: [], cancelledToClean: [], blockedItems: blocked }),
    cancelArticleSubmissionItem: (action) => { queueCalls += 1; queueBatches.push(action.batchId); if (value.queueError) throw Object.assign(new Error("queue"), { code: value.queueError }); return {}; },
    reconcileArticleRemovalAction: () => value.queuePostcondition || { status: "unknown", reasonCode: "QUEUE_RESULT_UNPROVABLE" },
    cleanupArticleSubmissionItem: () => ({}), cleanupPublishedArticleLocal: () => ({}), cleanupCancelledArticleLocal: () => ({})
  };
  const articleStore = {
    getArticle: () => { if (trashed) throw Object.assign(new Error("missing"), { code: "ARTICLE_NOT_FOUND" }); if (value.readError) throw Object.assign(new Error("read"), { code: value.readError }); return article; },
    getTrashedTombstone: () => { if (!trashed) throw Object.assign(new Error("missing"), { code: "ARTICLE_NOT_FOUND" }); return trashTombstone; },
    moveArticleToTrash: (clientId, articleId, tombstone, operationId, expectedFingerprint) => {
      moves += 1;
      if (value.mutateInsideMove) {
        article.remark = "changed inside move";
        value.mutateInsideMove = false;
      }
      if (expectedFingerprint && expectedFingerprint !== require("node:crypto").createHash("sha256").update(JSON.stringify(article)).digest("hex")) {
        throw Object.assign(new Error("content changed"), { code: "ARTICLE_REMOVAL_CONTENT_CHANGED" });
      }
      if (value.moveError) throw Object.assign(new Error("move"), { code: value.moveError });
      if (!trashed) { trashed = true; moveEffects += 1; trashTombstone = Object.assign({}, tombstone, { operationId }); }
      return trashTombstone;
    },
    fingerprintArticle: (valueToHash) => require("node:crypto").createHash("sha256").update(JSON.stringify(valueToHash)).digest("hex"),
    supportsIdempotentRemovalOperation: true,
    isArticleTrashed: () => trashed
  };
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "article-removal-"));
  const store = createArticleRemovalTransactionStore({ workspaceRoot: root, createId: () => "tx" });
  const service = createArticleRemovalService({ contentStore: articleStore, submissionService, transactionStore: store, now, recoveryBackoffMs: 1, maxRecoveryAttempts: 2, runnerId: value.runnerId || "runner-a", afterQueueAction: value.afterQueueAction ? () => value.afterQueueAction(article) : undefined });
  return { service, store, article, now, setNow: (next) => { time = next; }, setBlocked: (next) => { blocked = next; }, setQueue: (next) => { hasQueue = next; }, setMoveError: (next) => { value.moveError = next; }, setQueuePostcondition: (next) => { value.queuePostcondition = next; }, setTrashed: (next, tombstone) => { trashed = next; trashTombstone = tombstone || trashTombstone; }, calls: () => ({ queueCalls, queueBatches, moves, moveEffects }), root, submissionService, articleStore };
}

function begin(f) {
  const preview = f.service.previewArticleRemovalImpact({ selections: [{ clientId: "c-1", articleId: "a-1" }] });
  return f.service.applyArticleRemovalImpact({ confirmed: true, token: preview.token });
}

it("explicit retry revalidates blocked state and does not move the article", () => {
  const f = fixture({ queueError: "IO_DOWN" }); const started = begin(f);
  f.setBlocked([{ clientId: "c-1", articleId: "a-1", reasonCode: "PUBLICATION_UNCERTAIN" }]);
  const result = f.service.retryArticleRemovalTransaction({ transactionId: started.transactionId, confirmed: true });
  assert.equal(result.status, "needs_repair"); assert.equal(result.errorCode, "ARTICLE_REMOVAL_BLOCKED"); assert.equal(f.calls().moves, 0);
});

it("reports the persisted pending state rather than committed after initial execution fails", () => {
  const f = fixture({ queueError: "IO_DOWN" }); const result = begin(f);
  assert.equal(result.status, "pending_auto_recovery");
  assert.equal(f.store.get(result.transactionId).status, "pending_auto_recovery");
});

it("revalidates the persisted article fingerprint before the first queue action", () => {
  const f = fixture();
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
  const result = begin(f);
  assert.equal(result.status, "needs_repair");
  assert.equal(f.calls().queueCalls, 0);
  assert.equal(f.calls().moves, 0);
});

it("revalidates content after queue actions and inside the idempotent move", () => {
  for (const options of [
    { afterQueueAction: (article) => { article.remark = "changed after queue"; } },
    { queue: false, mutateInsideMove: true },
  ]) {
    const f = fixture(options);
    const result = begin(f);
    assert.equal(result.status, "needs_repair");
    assert.equal(f.calls().moveEffects, 0);
    assert.equal(f.store.get(result.transactionId).articleCursor || 0, 0);
  }
});

it("keeps the completed cursor when a later article changes in a multi-article removal", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "article-removal-many-"));
  const articles = new Map([
    ["a-1", { clientId: "c-1", id: "a-1", title: "One", content: "one", status: "generated" }],
    ["a-2", { clientId: "c-1", id: "a-2", title: "Two", content: "two", status: "generated" }],
  ]);
  const trashed = new Set();
  const moves = [];
  const fingerprintArticle = (article) =>
    require("node:crypto")
      .createHash("sha256")
      .update(JSON.stringify(article))
      .digest("hex");
  const contentStore = {
    getArticle(_clientId, articleId) {
      if (trashed.has(articleId)) throw Object.assign(new Error("missing"), { code: "ARTICLE_NOT_FOUND" });
      return articles.get(articleId);
    },
    fingerprintArticle,
    isArticleTrashed(_clientId, articleId) { return trashed.has(articleId); },
    moveArticleToTrash(_clientId, articleId) { trashed.add(articleId); moves.push(articleId); },
  };
  const submissionService = {
    previewArticleRemovalImpact: () => ({
      canCommit: true,
      items: [],
      queuedToCancel: [],
      failedToClean: [],
      publishedToClean: [],
      cancelledToClean: [],
      blockedItems: [],
    }),
  };
  const store = createArticleRemovalTransactionStore({
    workspaceRoot: root,
    createId: () => "tx-many",
  });
  const service = createArticleRemovalService({
    contentStore,
    submissionService,
    transactionStore: store,
    now: () => "2026-07-25T00:00:00.000Z",
    runnerId: "runner-many",
    afterArticleMove(_item, index) {
      if (index === 0) articles.get("a-2").remark = "changed after first move";
    },
  });
  const preview = service.previewArticleRemovalImpact({
    selections: [
      { clientId: "c-1", articleId: "a-1" },
      { clientId: "c-1", articleId: "a-2" },
    ],
  });
  const result = service.applyArticleRemovalImpact({
    confirmed: true,
    token: preview.token,
  });
  assert.equal(result.status, "needs_repair");
  assert.deepEqual(moves, ["a-1"]);
  assert.equal(store.get(result.transactionId).articleCursor, 1);
  fs.rmSync(root, { recursive: true, force: true });
});

it("claims a newly persisted transaction before its first destructive action", () => {
  const f = fixture({ runnerId: "runner-a" }); let nestedCalls = 0;
  const other = createArticleRemovalService({ contentStore: f.articleStore, submissionService: f.submissionService, transactionStore: f.store, now: () => "2026-07-25T00:00:00.000Z", runnerId: "runner-b", recoveryBackoffMs: 1 });
  f.submissionService.cancelArticleSubmissionItem = () => { nestedCalls += 1; other.recoverPendingRemovals(); return {}; };
  begin(f);
  assert.equal(nestedCalls, 1);
});

it("fences a runner whose lease expires during an action before it can move an article", () => {
  const f = fixture({ runnerId: "runner-a" }); let reentered = false;
  const other = createArticleRemovalService({ contentStore: f.articleStore, submissionService: f.submissionService, transactionStore: f.store, now: f.now, runnerId: "runner-b", recoveryBackoffMs: 1 });
  f.submissionService.cancelArticleSubmissionItem = () => { if (!reentered) { reentered = true; f.setNow("2026-07-25T00:05:01.000Z"); other.recoverPendingRemovals(); } return {}; };
  begin(f);
  assert.equal(f.calls().moves, 0);
});

it("fails closed for a legacy transaction without a content fingerprint", () => {
  const f = fixture({ queue: false });
  f.store.save({ id: "tx", revision: 0, status: "pending_auto_recovery", phase: "articles", createdAt: "2026-07-25T00:00:00.000Z", updatedAt: "2026-07-25T00:00:00.000Z", selections: [{ clientId: "c-1", articleId: "a-1" }], articles: [{ clientId: "c-1", articleId: "a-1" }], queueActions: [] });
  f.service.recoverPendingRemovals(); const transaction = f.store.get("tx");
  assert.equal(transaction.status, "needs_repair"); assert.equal(transaction.errorCode, "ARTICLE_REMOVAL_CONTENT_FINGERPRINT_MISSING"); assert.equal(f.calls().moves, 0);
});

it("explicit retry keeps needs_repair when content identity or queue fingerprint changed", () => {
  for (const mutate of [
    (f) => { f.article.content = "changed"; },
    (f) => { f.setQueue(false); }
  ]) {
    const f = fixture({ queueError: "IO_DOWN" }); const started = begin(f); mutate(f);
    const result = f.service.retryArticleRemovalTransaction({ transactionId: started.transactionId, confirmed: true });
    assert.equal(result.status, "needs_repair"); assert.equal(f.calls().moves, 0);
  }
});

it("queue, read and move failures share bounded retry accounting", () => {
  for (const scenario of [{ queueError: "IO_DOWN" }, { readError: "IO_DOWN", queue: false }, { moveError: "IO_DOWN", queue: false }]) {
    const f = fixture(scenario); const first = begin(f); const pending = f.store.get(first.transactionId);
    assert.equal(pending.retryCount, 1); assert.equal(pending.status, "pending_auto_recovery");
    pending.nextAttemptAt = "2020-01-01T00:00:00.000Z"; f.store.save(pending);
    f.service.recoverPendingRemovals();
    const exhausted = f.store.get(first.transactionId);
    assert.equal(exhausted.status, "needs_repair"); assert.equal(exhausted.retryCount, 2);
  }
});

it("persistence failures are recorded through the same retry path", () => {
  const f = fixture({ queue: false }); const originalCompare = f.store.compareAndUpdate; let checkpoints = 0;
  f.store.compareAndUpdate = (id, revision, updater) => { checkpoints += 1; if (checkpoints === 2) throw Object.assign(new Error("disk"), { code: "EIO" }); return originalCompare(id, revision, updater); };
  const result = begin(f); const transaction = f.store.get(result.transactionId);
  assert.equal(transaction.status, "pending_auto_recovery"); assert.equal(transaction.retryCount, 1);
  assert.equal(transaction.resolutionCode, "PERSISTENCE_RETRY_REQUIRED");
});

it("terminal checkpoint persistence failure returns to a legal recoverable phase", () => {
  const f = fixture({ queue: false }); const originalCompare = f.store.compareAndUpdate; let checkpoints = 0;
  f.store.compareAndUpdate = (id, revision, updater) => { checkpoints += 1; if (checkpoints === 6) throw Object.assign(new Error("disk"), { code: "EIO" }); return originalCompare(id, revision, updater); };
  const result = begin(f); const transaction = f.store.get(result.transactionId);
  assert.equal(transaction.status, "pending_auto_recovery"); assert.equal(transaction.phase, "articles"); assert.equal(result.status, "pending_auto_recovery");
});

it("automatically finalizes a durable committed phase without repeating destructive effects", () => {
  const f = fixture({ queue: false });
  f.store.remove = () => {};
  const completed = begin(f);
  const interrupted = f.store.get(completed.transactionId);
  interrupted.status = "pending_auto_recovery";
  interrupted.phase = "committed";
  interrupted.errorCode = "PROCESS_EXIT";
  interrupted.resolutionCode = "TERMINAL_CHECKPOINT_PENDING";
  interrupted.claimLeaseExpiresAt = "2020-01-01T00:00:00.000Z";
  f.store.save(interrupted);
  const movesBeforeRecovery = f.calls().moveEffects;
  const rebuilt = createArticleRemovalService({
    contentStore: f.articleStore,
    submissionService: f.submissionService,
    transactionStore: f.store,
    now: () => "2026-07-25T00:10:00.000Z",
    runnerId: "runner-rebuilt",
  });

  rebuilt.recoverPendingRemovals();
  const finalized = rebuilt.getArticleRemovalTransaction(completed.transactionId);
  assert.equal(finalized.status, "committed");
  assert.equal(finalized.phase, "committed");
  assert.equal(finalized.errorCode, null);
  assert.equal(f.calls().moveEffects, movesBeforeRecovery);
  assert.deepEqual(rebuilt.listArticleRemovalTransactions(), []);
});

it("routes repairable queue conflicts straight to manual repair", () => {
  const f = fixture({ queueError: "SUBMISSION_ACTION_STALE" }); const result = begin(f);
  assert.equal(result.status, "needs_repair"); assert.equal(f.store.get(result.transactionId).resolutionCode, "REMOVAL_MANUAL_REPAIR_REQUIRED");
});

it("resumes a needs_repair transaction from its durable checkpoint after repair", () => {
  const f = fixture({ queue: false, moveError: "IO_DOWN" });
  const started = begin(f); const pending = f.store.get(started.transactionId); pending.nextAttemptAt = "2020-01-01T00:00:00.000Z"; f.store.save(pending);
  f.service.recoverPendingRemovals();
  const repair = f.store.get(started.transactionId); assert.equal(repair.status, "needs_repair"); assert.equal(repair.resumePhase, "articles");
  f.setMoveError(undefined);
  const result = f.service.retryArticleRemovalTransaction({ transactionId: started.transactionId, confirmed: true });
  assert.equal(result.status, "committed"); assert.equal(f.calls().moves, 3);
});

it("does not duplicate an article move when another runner takes over during the move", () => {
  const f = fixture({ queue: false, runnerId: "runner-a" });
  const other = createArticleRemovalService({ contentStore: f.articleStore, submissionService: f.submissionService, transactionStore: f.store, now: f.now, runnerId: "runner-b", recoveryBackoffMs: 1 });
  let takeover = false;
  const move = f.articleStore.moveArticleToTrash;
  f.articleStore.moveArticleToTrash = () => { move(); f.setNow("2026-07-25T00:05:01.000Z"); if (!takeover) { takeover = true; other.recoverPendingRemovals(); } };
  const result = begin(f);
  assert.equal(takeover, true); assert.equal(f.calls().moves, 1);
  assert.equal(f.store.get(result.transactionId).status, "needs_repair");
});

it("reconciles an article active operation after its trash postcondition is proven", () => {
  const f = fixture({ queue: false, runnerId: "runner-a" });
  const other = createArticleRemovalService({ contentStore: f.articleStore, submissionService: f.submissionService, transactionStore: f.store, now: f.now, runnerId: "runner-b", recoveryBackoffMs: 1 });
  let takeover = false;
  const move = f.articleStore.moveArticleToTrash;
  f.articleStore.moveArticleToTrash = (clientId, articleId, tombstone, operationId) => { const result = move(clientId, articleId, tombstone, operationId); f.setNow("2026-07-25T00:05:01.000Z"); if (!takeover) { takeover = true; other.recoverPendingRemovals(); } return result; };
  const started = begin(f);
  const result = other.retryArticleRemovalTransaction({ transactionId: started.transactionId, confirmed: true });
  assert.equal(result.status, "committed");
  assert.equal(f.calls().moves, 1);
  assert.equal(f.calls().moveEffects, 1);
});

it("retries an article active operation with the same operation id when the source remains", () => {
  const f = fixture({ queue: false, moveError: "IO_DOWN" });
  const started = begin(f); const transaction = f.store.get(started.transactionId);
  transaction.activeOperation = { operationId: transaction.id + ":article:0", kind: "article", cursor: 0, owner: "runner-old", clientId: "c-1", articleId: "a-1" };
  f.store.save(transaction); f.setMoveError(undefined);
  const result = f.service.retryArticleRemovalTransaction({ transactionId: started.transactionId, confirmed: true });
  assert.equal(result.status, "committed");
  assert.equal(f.calls().moveEffects, 1);
});

it("reconciles a completed queue active operation without repeating queue I/O", () => {
  const f = fixture({ queueError: "IO_DOWN" }); const started = begin(f); const transaction = f.store.get(started.transactionId);
  transaction.activeOperation = { operationId: transaction.id + ":queue:0", kind: "queue", cursor: 0, owner: "runner-old", clientId: "c-1", articleId: "a-1" };
  f.store.save(transaction); f.setQueuePostcondition({ status: "completed", result: { idempotent: true } });
  const result = f.service.retryArticleRemovalTransaction({ transactionId: started.transactionId, confirmed: true });
  assert.equal(result.status, "committed");
  assert.equal(f.calls().queueCalls, 1);
});

it("revalidates blocked state and remaining queue actions after queue reconciliation", () => {
  const f = fixture({
    queueError: "IO_DOWN",
    queueActions: [
      { clientId: "c-1", articleId: "a-1", batchId: "b1", publicationId: "p1", targetPlatformId: "x", attemptId: "at1" },
      { clientId: "c-1", articleId: "a-1", batchId: "b2", publicationId: "p2", targetPlatformId: "x", attemptId: "at2" }
    ]
  });
  const started = begin(f); const transaction = f.store.get(started.transactionId);
  transaction.activeOperation = { operationId: transaction.id + ":queue:0", kind: "queue", cursor: 0, owner: "runner-old", clientId: "c-1", articleId: "a-1" };
  f.store.save(transaction);
  f.setQueuePostcondition({ status: "completed", result: { idempotent: true } });
  f.setBlocked([{ clientId: "c-1", articleId: "a-1", reasonCode: "PUBLICATION_UNCERTAIN" }]);
  const result = f.service.retryArticleRemovalTransaction({ transactionId: started.transactionId, confirmed: true });
  assert.equal(result.status, "needs_repair");
  assert.equal(result.errorCode, "ARTICLE_REMOVAL_BLOCKED");
  assert.deepEqual(f.calls().queueBatches, ["b1"]);
});

it("keeps an active operation repairable when its result cannot be proven", () => {
  const f = fixture({ queue: false, moveError: "IO_DOWN" }); const started = begin(f); const transaction = f.store.get(started.transactionId);
  transaction.activeOperation = { operationId: transaction.id + ":article:0", kind: "article", cursor: 0, owner: "runner-old", clientId: "c-1", articleId: "a-1" };
  f.store.save(transaction); f.setMoveError(undefined); f.articleStore.supportsIdempotentRemovalOperation = false;
  const result = f.service.retryArticleRemovalTransaction({ transactionId: started.transactionId, confirmed: true });
  assert.equal(result.status, "needs_repair");
  assert.equal(result.resolutionCode, "REMOVAL_OPERATION_RESULT_UNPROVABLE");
  assert.equal(f.calls().moveEffects, 0);
});

it("automatic recovery rejects invalid status and phase combinations", () => {
  const f = fixture({ queue: false });
  f.store.save({ id: "tx", status: "pending_auto_recovery", phase: "needs_repair", createdAt: "2026-07-25T00:00:00.000Z", updatedAt: "2026-07-25T00:00:00.000Z", selections: [{ clientId: "c-1", articleId: "a-1" }], articles: [], queueActions: [] });
  f.service.recoverPendingRemovals();
  assert.equal(f.calls().moves, 0);
});

it("a persistent claim permits only one runner to execute a transaction", () => {
  const f = fixture({ runnerId: "runner-a" }); let second;
  const other = createArticleRemovalService({ contentStore: f.articleStore, submissionService: f.submissionService, transactionStore: f.store, now: () => "2026-07-25T00:00:00.000Z", runnerId: "runner-b", recoveryBackoffMs: 1 });
  f.submissionService.cancelArticleSubmissionItem = () => { second = other.recoverPendingRemovals(); return {}; };
  const preview = f.service.previewArticleRemovalImpact({ selections: [{ clientId: "c-1", articleId: "a-1" }] });
  const transaction = { id: "tx", version: 1, revision: 0, status: "pending_auto_recovery", phase: "queue-actions", createdAt: preview.createdAt, updatedAt: preview.createdAt, selections: preview.selections, articles: preview.articles, queueActions: [{ clientId: "c-1", articleId: "a-1", batchId: "b", publicationId: "p", targetPlatformId: "x", attemptId: "at", action: "cancel" }], contentFingerprint: require("node:crypto").createHash("sha256").update(JSON.stringify([{ clientId: "c-1", articleId: "a-1", title: "Title", content: "body", status: "generated", generationBatchId: null, generationTaskId: null }])).digest("hex") };
  f.store.save(transaction); f.service.recoverPendingRemovals();
  assert.equal(second.length, 1); assert.equal(f.calls().queueCalls, 0);
});
