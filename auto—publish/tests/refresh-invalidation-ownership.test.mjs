import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createFavoriteMediaQuery } from "../media-workbench/src/features/media/favorite-media-query.js";
import { createMediaFeature } from "../media-workbench/src/features/media/media-feature.js";
import { createWorkspaceCoordinator } from "../media-workbench/src/features/workspace/workspace-coordinator.js";

const require = createRequire(import.meta.url);
const {
  createWorkspaceDataInvalidation,
  scopesForReason,
} = require("../desktop/workspace-data-invalidation");
const {
  createMediaWorkbenchApplication,
} = require("../desktop/services/media-workbench-application");
const {
  createSubmissionCenterSnapshot,
} = require("../desktop/services/submission-center-snapshot");
const {
  createArticleManagementSnapshot,
} = require("../desktop/services/article-management-snapshot");
const {
  createAiContentService,
} = require("../desktop/services/ai-content-service");
const {
  createArticleAttentionQuery,
} = require("../desktop/services/article-attention-query");
const {
  createRegularQueueApplication,
} = require("../desktop/services/regular-queue-application");
const settle = () => new Promise(setImmediate);
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const page = (name) => ({
  items: [{ resourceId: name }],
  total: 1,
  page: 1,
  totalPages: 1,
  hasPrev: false,
  hasNext: false,
});

test("paid batch commands use their complete batch scope and retain a global fallback on identity read failure", async () => {
  const invalidation = createWorkspaceDataInvalidation({
    workspaceRuntimeId: "paid",
  });
  const batch = {
    batchId: "batch",
    items: [{ articleIdentityV1: { clientId: "a" } }],
  };
  let failScope = false;
  const app = createMediaWorkbenchApplication({
    mediaResourceService: {},
    mediaOrderService: {},
    paidMediaBatchOrchestrator: {
      snapshot(input) {
        assert.equal(input.batchId, "batch");
        if (failScope) throw new Error("synthetic");
        return [batch];
      },
      startBatch: async () => ({ status: "completed" }),
      pauseBatch: () => batch,
      cancelRemaining: async () => ({ batch, cancelledCount: 1 }),
    },
    invalidateData: invalidation.invalidate,
  });
  await app.startPaidMediaBatch({ batchId: "batch" });
  app.pausePaidMediaBatch({ batchId: "batch" });
  await app.cancelRemainingPaidMediaBatchItems({ batchId: "batch" });
  assert.equal(invalidation.getArticleReadRevision("a"), 4);
  assert.equal(invalidation.getArticleReadRevision("b"), 0);
  failScope = true;
  await assert.rejects(app.startPaidMediaBatch({ batchId: "batch" }));
  assert.equal(
    invalidation.getArticleReadRevision("b"),
    invalidation.getRevision(),
  );
});

test("favorite query is lazy, fences reordered pages, workspace switches, failures and disposal", async () => {
  const pending = [];
  const query = createFavoriteMediaQuery({
    getPoolPage(input) {
      assert.equal(input.pageSize, 50);
      const gate = deferred();
      pending.push(gate);
      return gate.promise;
    },
  });
  query.setScope({ workspaceRuntimeId: "a" });
  await query.refresh();
  assert.equal(pending.length, 0);
  const old = query.loadPage(1);
  const newer = query.loadPage(2);
  pending[1].resolve(page("newer"));
  await newer;
  pending[0].resolve(page("older"));
  await old;
  assert.equal(query.getSnapshot().items[0].resourceId, "newer");
  const late = query.loadPage(3);
  query.setScope({ workspaceRuntimeId: "b" });
  assert.deepEqual(query.getSnapshot().items, []);
  const current = query.refresh();
  pending[2].reject(new Error("sensitive-old-error"));
  await late;
  assert.equal(query.getSnapshot().loading, true);
  pending[3].resolve(page("b"));
  await current;
  assert.equal(query.getSnapshot().items[0].resourceId, "b");
  const failed = query.loadPage(1);
  pending[4].reject(new Error("secret"));
  await failed;
  assert.equal(query.getSnapshot().errorMessage, "无法加载收藏媒体。");
  const closing = query.loadPage(1);
  query.dispose();
  pending[5].resolve(page("closed"));
  await closing;
  assert.equal(query.getSnapshot().items[0].resourceId, "b");
});

function mediaAdapters(overrides = {}) {
  const adapters = Object.fromEntries(
    [
      "getResourcePage",
      "searchResourcePage",
      "refreshResources",
      "getPoolPage",
      "addToPool",
      "removeFromPool",
      "getBalance",
      "getOrders",
      "syncOrder",
      "syncAllOrders",
      "prepareOrderCancellation",
      "cancelOrder",
      "prepareCancellationResolution",
      "confirmCancellationSucceeded",
      "confirmCancellationNotApplied",
      "prepareOrderStatusAnomalyResolution",
      "resumeOrderTracking",
      "confirmOrderPublished",
      "confirmOrderNotPublished",
      "openPublishedUrl",
    ].map((name) => [name, async () => ({})]),
  );
  return {
    ...adapters,
    getOrders: async () => [],
    getPoolPage: async () => page("pool"),
    ...overrides,
  };
}

test("orders use the application invalidation exactly once for success, uncertain and changed failure", async () => {
  let consume,
    reads = 0,
    outcome = "success",
    identityUnavailable = false;
  const invalidation = createWorkspaceDataInvalidation({
    workspaceRuntimeId: "orders",
    sendToRenderer: (_channel, event) => consume(event),
  });
  const application = createMediaWorkbenchApplication({
    mediaResourceService: {},
    mediaOrderService: {},
    orderObservationTransitions: {
      getOrderObservationContext(orderId) {
        assert.equal(orderId, "order");
        if (identityUnavailable)
          throw new Error("synthetic identity read failure");
        return { articleIdentityV1: { clientId: "a" } };
      },
    },
    orderCancellationService: {
      async cancelOrder() {
        if (outcome === "failed")
          throw Object.assign(new Error("synthetic"), {
            mutation: { changed: true },
          });
        return { status: outcome, idempotent: false };
      },
    },
    invalidateData: invalidation.invalidate,
  });
  const feature = createMediaFeature(
    mediaAdapters({
      getOrders: async () => {
        reads++;
        return [{ orderNid: "order", status: outcome }];
      },
      cancelOrder: application.cancelOrder,
    }),
  );
  const coordinator = createWorkspaceCoordinator({
    subscribe(listener) {
      consume = listener;
      return () => {};
    },
  });
  coordinator.register("orders", (event) => {
    if (!event.workspaceRuntimeId) return;
    feature.setScope({ workspaceRuntimeId: event.workspaceRuntimeId });
    return feature.refreshOrders(event.kind);
  });
  coordinator.start();
  coordinator.initialize({ workspaceRuntimeId: "orders", revision: 0 });
  await settle();
  assert.equal(reads, 1);
  for (const next of ["success", "uncertain", "failed"]) {
    outcome = next;
    const before = reads;
    await feature.cancelOrder({ orderId: "order" });
    await settle();
    assert.equal(reads, before + 1);
    assert.equal(feature.getSnapshot().orders.items[0].status, next);
    assert.equal(invalidation.getArticleReadRevision("b"), 0);
    assert.equal(
      invalidation.getArticleReadRevision("a"),
      invalidation.getRevision(),
    );
  }
  assert.ok(feature.getSnapshot().commands.cancelOrder.error);
  identityUnavailable = true;
  await feature.cancelOrder({ orderId: "order" });
  await settle();
  assert.equal(
    invalidation.getArticleReadRevision("b"),
    invalidation.getRevision(),
  );
  for (const scope of [
    "orders",
    "articleAttention",
    "articleManagement",
    "submissionCenter",
  ])
    assert.ok(
      scopesForReason("PAID_ORDER_CANCELLATION_CHANGED").includes(scope),
    );
  assert.ok(
    scopesForReason("REGULAR_QUEUE_GROUP_SUBMISSION_INTERVAL_UPDATED").includes(
      "submissionCenter",
    ),
  );
  assert.ok(
    scopesForReason("ARTICLE_ATTENTION_DOMAIN_MUTATION").includes("orders"),
  );
  coordinator.dispose();
  feature.dispose();
});

test("a burst while media workbench is reading waits for one pending refresh", async () => {
  let consume;
  const pending = [];
  let poolReads = 0;
  const feature = createMediaFeature(
    mediaAdapters({
      getResourcePage: () => {
        const gate = deferred();
        pending.push(gate);
        return gate.promise;
      },
      getPoolPage: async () => {
        poolReads++;
        return page("pool");
      },
    }),
  );
  const coordinator = createWorkspaceCoordinator({
    subscribe(listener) {
      consume = listener;
      return () => {};
    },
  });
  coordinator.register("mediaWorkbench", (event) => {
    if (!event.workspaceRuntimeId) return;
    feature.setScope({ workspaceRuntimeId: event.workspaceRuntimeId });
    return feature.refreshWorkbench(event.kind);
  });
  coordinator.start();
  coordinator.initialize({ workspaceRuntimeId: "media", revision: 0 });
  for (let revision = 1; revision <= 20; revision++)
    consume({
      schemaVersion: 1,
      workspaceRuntimeId: "media",
      revision,
      scopes: ["mediaWorkbench"],
      reasonCode: "CONTENT_EXPORT_QUEUED",
    });
  assert.equal(pending.length, 1);
  pending[0].resolve(page("one"));
  await settle();
  assert.equal(pending.length, 2);
  pending[1].resolve(page("two"));
  await settle();
  assert.equal(poolReads, 2);
  coordinator.dispose();
  feature.dispose();
});

test("client A save keeps B article and center caches hot; global changes still invalidate both", async () => {
  const invalidation = createWorkspaceDataInvalidation({
    workspaceRuntimeId: "cache",
  });
  const revisions = {
    getRevision: invalidation.getRevision,
    getCacheRevision: invalidation.getArticleReadRevision,
  };
  const reads = [];
  const articles = new Map(
    ["a", "b"].map((clientId) => [
      clientId,
      {
        id: "article",
        clientId,
        title: clientId,
        content: "body",
        status: "saved",
      },
    ]),
  );
  const ai = createAiContentService({
    clientKnowledge: {},
    researchStore: {},
    templateStore: {},
    contentStore: {
      saveArticle(article) {
        articles.set(article.clientId, article);
        return article;
      },
      fingerprintArticle: () => "fingerprint",
    },
    onDataInvalidated: invalidation.invalidate,
  });
  const management = createArticleManagementSnapshot({
    ...revisions,
    listArticles(clientId) {
      reads.push(clientId);
      return [articles.get(clientId)];
    },
  });
  let centerReads = 0;
  const center = createSubmissionCenterSnapshot({
    ...revisions,
    getWorkspaceRuntimeId: invalidation.getWorkspaceRuntimeId,
    validateClient() {},
    listRegularQueueGroups: () => {
      centerReads++;
      return [];
    },
    listPaidMediaBatches: () => ({ items: [] }),
    listAttention: () => ({ items: [] }),
  });
  for (const clientId of ["a", "b", "a"]) {
    await management.get(clientId);
    await center.get({ clientId });
  }
  assert.deepEqual(reads, ["a", "b"]);
  assert.equal(centerReads, 2);
  ai.saveArticle({ ...articles.get("a"), title: "edited" });
  await management.get("b");
  await center.get({ clientId: "b" });
  assert.deepEqual(reads, ["a", "b"]);
  assert.equal(centerReads, 2);
  assert.equal((await management.get("a")).articles[0].title, "edited");
  await center.get({ clientId: "a" });
  assert.equal(centerReads, 3);
  invalidation.invalidate("WORKSPACE_RUNTIME_READY");
  await management.get("b");
  await center.get({ clientId: "b" });
  assert.equal(reads.length, 4);
  assert.equal(centerReads, 4);
});

test("center shares concurrent reads, retries failed sections and fences clear during a build", async () => {
  let gate = deferred(),
    reads = 0,
    fail = false;
  const center = createSubmissionCenterSnapshot({
    getRevision: () => 1,
    getWorkspaceRuntimeId: () => "cache",
    validateClient() {},
    listRegularQueueGroups: async () => {
      reads++;
      await gate.promise;
      if (fail) throw new Error("synthetic");
      return [];
    },
    listPaidMediaBatches: () => ({ items: [] }),
    listAttention: () => ({ items: [] }),
  });
  const first = center.get({ clientId: "a" }),
    second = center.get({ clientId: "a" });
  await settle();
  assert.equal(reads, 1);
  gate.resolve();
  const results = await Promise.all([first, second]);
  assert.notEqual(results[0], results[1]);
  center.clear();
  gate = deferred();
  fail = true;
  const failed = center.get({ clientId: "a" });
  await settle();
  gate.resolve();
  assert.equal((await failed).failures.length, 1);
  fail = false;
  assert.equal((await center.get({ clientId: "a" })).failures.length, 0);
  assert.equal(reads, 3);
  center.clear();
  gate = deferred();
  const stale = center.get({ clientId: "a" });
  await settle();
  center.clear();
  gate.resolve();
  await assert.rejects(stale, { code: "SUBMISSION_CENTER_SNAPSHOT_STALE" });
});

test("regular admission scopes invalidation to A without rebuilding B attention", () => {
  const invalidation = createWorkspaceDataInvalidation({
    workspaceRuntimeId: "admission",
  });
  let reads = 0;
  const attention = createArticleAttentionQuery({
    getRevision: invalidation.getRevision,
    getCacheRevision: invalidation.getArticleReadRevision,
    readers: {
      listTransactions: () => {
        reads++;
        return [];
      },
    },
  });
  const app = createRegularQueueApplication({
    contentStore: {
      getArticle() {
        throw new Error("unused");
      },
    },
    articleMutationCoordinator: {
      admitRegularQueueItems: () => ({
        admittedCount: 1,
        conflictCount: 0,
        items: [],
      }),
    },
    regularQueueTransitions: {
      listArticleLifecycleFacts: () => ({
        publications: [],
        submissionItems: [],
        orders: [],
      }),
    },
    accountProfileResolver: () => ({ displayName: "Synthetic" }),
    platforms: [
      {
        id: "hepan",
        displayName: "蓝色河畔",
        publicationTargetKind: "platform",
        imagePublishing: false,
      },
    ],
    onDataInvalidated: invalidation.invalidate,
  });
  attention.list({ clientId: "a" });
  attention.list({ clientId: "b" });
  assert.equal(reads, 2);
  app.admitRegularQueueItems({
    platformId: "hepan",
    accountProfileId: "synthetic",
    articleRefs: [{ clientId: "a", articleId: "article" }],
  });
  attention.list({ clientId: "b" });
  assert.equal(reads, 2);
  attention.list({ clientId: "a" });
  assert.equal(reads, 3);
  invalidation.invalidate("PAID_ORDER_OBSERVATION_CHANGED");
  attention.list({ clientId: "b" });
  assert.equal(reads, 4);
});

test("an unrelated client revision does not retry a center read; its own change does", async () => {
  const invalidation = createWorkspaceDataInvalidation({
    workspaceRuntimeId: "concurrent",
  });
  const gates = [];
  const center = createSubmissionCenterSnapshot({
    getRevision: invalidation.getRevision,
    getCacheRevision: invalidation.getArticleReadRevision,
    getWorkspaceRuntimeId: invalidation.getWorkspaceRuntimeId,
    validateClient() {},
    listRegularQueueGroups: () => {
      const gate = deferred();
      gates.push(gate);
      return gate.promise;
    },
    listPaidMediaBatches: () => ({ items: [] }),
    listAttention: () => ({ items: [] }),
  });
  const b = center.get({ clientId: "b" });
  await settle();
  invalidation.invalidate("ARTICLE_SAVED", { clientId: "a" });
  gates[0].resolve([]);
  assert.equal((await b).revision, 1);
  assert.equal(gates.length, 1);
  const a = center.get({ clientId: "a" });
  await settle();
  invalidation.invalidate("ARTICLE_SAVED", { clientId: "a" });
  gates[1].resolve([]);
  await settle();
  assert.equal(gates.length, 3);
  gates[2].resolve([]);
  assert.equal((await a).revision, 2);
  await center.get({ clientId: "b" });
  assert.equal(gates.length, 3);
});
