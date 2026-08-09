import assert from "node:assert/strict";
import { describe, it } from "node:test";
import fs from "node:fs";
import path from "node:path";
import { createMediaFeature as createMediaFeatureOwner } from "../media-workbench/src/features/media/media-feature.js";

function createMediaFeature(options) {
  return createMediaFeatureOwner({
    prepareOrderCancellation: async () => ({}),
    cancelOrder: async () => ({}),
    prepareCancellationResolution: async () => ({}),
    confirmCancellationSucceeded: async () => ({}),
    confirmCancellationNotApplied: async () => ({}),
    ...options,
  });
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((next, fail) => {
    resolve = next;
    reject = fail;
  });
  return { promise, resolve, reject };
}

describe("Phase 06 media feature", () => {
  const emptyPoolPage = async (input) => ({
    items: [],
    memberResourceIds: [],
    total: 0,
    page: input.page,
    pageSize: input.pageSize,
    totalPages: 0,
    hasPrev: false,
    hasNext: false,
  });

  it("owns the complete media workbench snapshot and named command lifecycles", async () => {
    const calls = [];
    const article = {
      filename: "article-1.docx",
      title: "Article 1",
      selectedResources: [],
    };
    const resource = {
      resourceId: "resource-1",
      name: "Resource 1",
      price: 10,
      type: "image",
    };
    const feature = createMediaFeature({
      getResourcePage: async (input) => ({
        items: [resource],
        total: 1,
        page: input.page,
        pageSize: input.pageSize,
      }),
      searchResourcePage: async (input) => ({
        items: [resource],
        total: 1,
        page: input.page,
        pageSize: input.pageSize,
      }),
      refreshResources: async () => ({ status: "complete", truncated: false }),
      getPoolPage: async (input) => ({
        items: [],
        memberResourceIds: [],
        total: 0,
        page: input.page,
        pageSize: input.pageSize,
        totalPages: 0,
        hasPrev: false,
        hasNext: false,
      }),
      addToPool: async (value) => {
        calls.push(["addToPool", value.resourceId]);
        return value;
      },
      removeFromPool: async (resourceId) => {
        calls.push(["removeFromPool", resourceId]);
        return { removed: true };
      },
      getBalance: async () => 80,
      getDrafts: async () => [],
      getDraft: async () => ({
        filename: article.filename,
        title: article.title,
        selectedResources: [],
      }),
      setDraft: async (filename, draft) => {
        calls.push(["setDraft", filename, draft.title]);
      },
      scanArticles: async () => [article],
      previewArticle: async () => ({ ...article, content: "preview" }),
      getOrders: async () => [],
      syncOrder: async () => ({}),
      syncAllOrders: async () => ({ items: [], succeeded: 0, failed: 0 }),
      prepareOrderStatusAnomalyResolution: async () => ({}),
      resumeOrderTracking: async () => ({}),
      confirmOrderPublished: async () => ({}),
      confirmOrderNotPublished: async () => ({}),
      openPublishedUrl: async (orderNid) => {
        calls.push(["openPublishedUrl", orderNid]);
      },
    });
    feature.setScope({ workspaceRuntimeId: "workspace-media-owner" });
    await feature.refresh("initial");
    assert.equal(feature.getSnapshot().articles.items.length, 1);
    assert.equal(feature.getSnapshot().drafts.items.length, 0);
    assert.equal(feature.getSnapshot().pool.pageSize, 50);
    assert.equal(feature.getSnapshot().balance.value, 80);

    await feature.openArticle(article.filename);
    feature.toggleSelectedResource(resource);
    assert.equal(
      feature.getSnapshot().articles.activeArticle.selectedResources[0]
        .resourceId,
      "resource-1",
    );
    assert.equal(feature.getSnapshot().selectionRevision, 1);
    await feature.saveDraft({
      filename: article.filename,
      title: "Saved title",
      remark: "",
      ignoreImages: false,
      selectedResources: [resource],
    });
    assert.deepEqual(calls.at(-1), [
      "setDraft",
      article.filename,
      "Saved title",
    ]);
    assert.equal(
      feature.getSnapshot().articles.activeArticle.title,
      "Saved title",
    );
    assert.equal(
      feature.getSnapshot().articles.activeArticle.selectedResources[0]
        .resourceId,
      "resource-1",
    );

    await feature.openPublishedUrl("order-1");
    assert.deepEqual(calls.at(-1), ["openPublishedUrl", "order-1"]);
  });

  it("lets the workspace coordinator own the single production initial refresh", () => {
    const source = fs.readFileSync(
      path.resolve(
        import.meta.dirname,
        "../media-workbench/src/features/media/use-media-feature.ts",
      ),
      "utf8",
    );
    assert.match(source, /useWorkspaceScope\(['"]orders['"]/);
    assert.doesNotMatch(source, /feature\.refresh\(['"]initial['"]\)/);
  });

  it("queries one bounded resource page at a time with a default page size of 50", async () => {
    const calls = [];
    const feature = createMediaFeature({
      getResourcePage: async (input) => {
        calls.push(["page", input]);
        return {
          items: [{ resourceId: `page-${input.page}` }],
          total: 130,
          page: input.page,
          pageSize: input.pageSize,
        };
      },
      searchResourcePage: async (input) => {
        calls.push(["search", input]);
        return {
          items: [{ resourceId: `search-${input.page}` }],
          total: 2,
          page: input.page,
          pageSize: input.pageSize,
        };
      },
      refreshResources: async () => ({ resourceCount: 130 }),
      getPoolPage: emptyPoolPage,
      addToPool: async () => ({}),
      removeFromPool: async () => ({}),
      getBalance: async () => 0,
      getDrafts: async () => [],
      getDraft: async () => null,
      setDraft: async () => ({}),
      scanArticles: async () => [],
      previewArticle: async () => ({}),
      getOrders: async () => [],
      syncOrder: async () => ({}),
      syncAllOrders: async () => ({ items: [], succeeded: 0, failed: 0 }),
      prepareOrderStatusAnomalyResolution: async () => ({}),
      resumeOrderTracking: async () => ({}),
      confirmOrderPublished: async () => ({}),
      confirmOrderNotPublished: async () => ({}),
      openPublishedUrl: async () => ({}),
    });
    feature.setScope({ workspaceRuntimeId: "workspace-media" });
    await feature.loadResourcePage(1, "initial");
    assert.deepEqual(calls[0], ["page", { page: 1, pageSize: 50 }]);
    await feature.searchResources("finance");
    assert.deepEqual(calls[1], [
      "search",
      { query: "finance", page: 1, pageSize: 50 },
    ]);
    await feature.loadResourcePage(2, "manual");
    assert.deepEqual(calls[2], [
      "search",
      { query: "finance", page: 2, pageSize: 50 },
    ]);
    assert.deepEqual(
      feature.getSnapshot().resources.items.map((item) => item.resourceId),
      ["search-2"],
    );
    assert.equal(feature.getSnapshot().resources.pageSize, 50);
  });

  it("owns media Promise failures in the snapshot without rejected refresh or toggle callers", async () => {
    const oldPage = deferred();
    const nextPage = deferred();
    let pageCalls = 0;
    const feature = createMediaFeature({
      getResourcePage: () =>
        ++pageCalls === 1 ? oldPage.promise : nextPage.promise,
      searchResourcePage: async () => ({
        items: [],
        total: 0,
        page: 1,
        pageSize: 50,
      }),
      refreshResources: async () => {
        throw Object.assign(new Error("刷新失败"), {
          code: "MEDIA_REFRESH_FAILED",
        });
      },
      getPoolPage: emptyPoolPage,
      addToPool: async () => {
        throw Object.assign(new Error("收藏失败"), {
          code: "MEDIA_POOL_FAILED",
        });
      },
      removeFromPool: async () => ({}),
      getBalance: async () => 0,
      getDrafts: async () => [],
      getDraft: async () => null,
      setDraft: async () => ({}),
      scanArticles: async () => [],
      previewArticle: async () => ({}),
      getOrders: async () => [{ orderNid: "order-1" }],
      syncOrder: async () => {
        throw Object.assign(new Error("同步暂时失败"), {
          code: "ORDER_SYNC_FAILED",
        });
      },
      syncAllOrders: async () => ({
        items: [
          { orderNid: "order-1", ok: false, errorCode: "ORDER_SYNC_FAILED" },
        ],
        succeeded: 0,
        failed: 1,
      }),
      prepareOrderStatusAnomalyResolution: async () => ({}),
      resumeOrderTracking: async () => ({}),
      confirmOrderPublished: async () => ({}),
      confirmOrderNotPublished: async () => ({}),
      openPublishedUrl: async () => ({}),
    });
    feature.setScope({ workspaceRuntimeId: "workspace-media" });
    const first = feature.loadResourcePage(1, "initial");
    const second = feature.loadResourcePage(2, "manual");
    nextPage.resolve({
      items: [{ resourceId: "new" }],
      total: 1,
      page: 2,
      pageSize: 50,
    });
    await second;
    oldPage.resolve({
      items: [{ resourceId: "old" }],
      total: 1,
      page: 1,
      pageSize: 50,
    });
    await first;
    assert.equal(feature.getSnapshot().resources.items[0].resourceId, "new");
    await feature.refreshOrders("initial");
    await feature.syncOrder("order-1");
    assert.deepEqual(feature.getSnapshot().orders.items, [
      { orderNid: "order-1" },
    ]);
    assert.equal(
      feature.getSnapshot().commands.syncOrder.error.code,
      "ORDER_SYNC_FAILED",
    );
    await assert.doesNotReject(feature.refreshResources());
    await assert.doesNotReject(
      feature.togglePool({ resourceId: "resource-1" }),
    );
    assert.equal(
      feature.getSnapshot().commands.refreshResources.error.code,
      "MEDIA_REFRESH_FAILED",
    );
    assert.equal(
      feature.getSnapshot().commands.togglePool.error.code,
      "MEDIA_POOL_FAILED",
    );
  });

  it("refreshes all orders only once on the first open and preserves per-item failures", async () => {
    let syncCalls = 0;
    let queryCalls = 0;
    const feature = createMediaFeature({
      getResourcePage: async () => ({
        items: [],
        total: 0,
        page: 1,
        pageSize: 50,
      }),
      searchResourcePage: async () => ({
        items: [],
        total: 0,
        page: 1,
        pageSize: 50,
      }),
      refreshResources: async () => ({}),
      getPoolPage: emptyPoolPage,
      addToPool: async () => ({}),
      removeFromPool: async () => ({}),
      getBalance: async () => 0,
      getDrafts: async () => [],
      getDraft: async () => null,
      setDraft: async () => ({}),
      scanArticles: async () => [],
      previewArticle: async () => ({}),
      getOrders: async () => {
        queryCalls += 1;
        return [{ orderNid: "order-1", statusCode: "0" }];
      },
      syncOrder: async () => ({}),
      syncAllOrders: async () => {
        syncCalls += 1;
        return {
          items: [
            {
              orderNid: "order-1",
              ok: false,
              errorCode: "MEDIA_ORDER_SYNC_FAILED",
            },
          ],
          succeeded: 0,
          failed: 1,
        };
      },
      prepareOrderStatusAnomalyResolution: async () => ({}),
      resumeOrderTracking: async () => ({}),
      confirmOrderPublished: async () => ({}),
      confirmOrderNotPublished: async () => ({}),
      openPublishedUrl: async () => ({}),
    });
    feature.setScope({ workspaceRuntimeId: "workspace-orders" });
    await feature.openOrders();
    await feature.openOrders();
    assert.deepEqual([syncCalls, queryCalls], [1, 1]);
    assert.equal(feature.getSnapshot().orders.syncFailures.length, 1);
  });

  it("acquires one order mutation command before exposing busy identity and blocks conflicting actions", async () => {
    const singleSync = deferred();
    let prepareCalls = 0;
    let resolutionCalls = 0;
    let syncAllCalls = 0;
    let anomalyOpen = true;
    const feature = createMediaFeature({
      getResourcePage: async () => ({
        items: [],
        total: 0,
        page: 1,
        pageSize: 50,
      }),
      searchResourcePage: async () => ({
        items: [],
        total: 0,
        page: 1,
        pageSize: 50,
      }),
      refreshResources: async () => ({}),
      getPoolPage: emptyPoolPage,
      addToPool: async () => ({}),
      removeFromPool: async () => ({}),
      getBalance: async () => 0,
      getDrafts: async () => [],
      getDraft: async () => null,
      setDraft: async () => ({}),
      scanArticles: async () => [],
      previewArticle: async () => ({}),
      getOrders: async () => [
        {
          orderNid: "order-1",
          statusCode: "0",
          anomaly: anomalyOpen ? {} : null,
        },
      ],
      syncOrder: () =>
        singleSync.promise.then((result) => {
          anomalyOpen = false;
          return result;
        }),
      syncAllOrders: async () => {
        syncAllCalls += 1;
        return { items: [], succeeded: 0, failed: 0 };
      },
      prepareOrderStatusAnomalyResolution: async () => {
        prepareCalls += 1;
        return {
          orderId: "order-1",
          confirmationToken: "token-1",
          classification: "verified_published",
          allowedActions: ["confirmOrderPublished"],
        };
      },
      resumeOrderTracking: async () => ({}),
      confirmOrderPublished: async () => {
        resolutionCalls += 1;
        return {};
      },
      confirmOrderNotPublished: async () => ({}),
      openPublishedUrl: async () => ({}),
    });
    feature.setScope({ workspaceRuntimeId: "workspace-order-owner" });
    await feature.prepareOrderStatusAnomalyResolution("order-1");
    assert.equal(prepareCalls, 1);

    const syncing = feature.syncOrder("order-1");
    assert.equal(feature.getSnapshot().orders.syncingOrderNid, "order-1");
    await feature.syncAllOrders();
    await feature.prepareOrderStatusAnomalyResolution("order-1");
    await feature.confirmOrderPublished("order-1");
    assert.deepEqual([syncAllCalls, prepareCalls, resolutionCalls], [0, 1, 0]);

    singleSync.resolve({});
    await syncing;
    assert.equal(feature.getSnapshot().orders.syncingOrderNid, null);
    assert.equal(
      feature.getSnapshot().orders.anomalyPreparations["order-1"],
      undefined,
    );
  });

  it("owns safe refresh, prepare, and resolution errors in the public snapshot", async () => {
    const failures = {
      syncAll: false,
      prepare: false,
      resolution: false,
    };
    const feature = createMediaFeature({
      getResourcePage: async () => ({
        items: [],
        total: 0,
        page: 1,
        pageSize: 50,
      }),
      searchResourcePage: async () => ({
        items: [],
        total: 0,
        page: 1,
        pageSize: 50,
      }),
      refreshResources: async () => ({}),
      getPoolPage: emptyPoolPage,
      addToPool: async () => ({}),
      removeFromPool: async () => ({}),
      getBalance: async () => 0,
      getDrafts: async () => [],
      getDraft: async () => null,
      setDraft: async () => ({}),
      scanArticles: async () => [],
      previewArticle: async () => ({}),
      getOrders: async () => [
        { orderNid: "order-1", statusCode: "0", anomaly: {} },
      ],
      syncOrder: async () => ({}),
      syncAllOrders: async () => {
        if (failures.syncAll) throw new Error("supplier-secret-sync");
        return { items: [], succeeded: 0, failed: 0 };
      },
      prepareOrderStatusAnomalyResolution: async () => {
        if (failures.prepare) throw new Error("supplier-secret-prepare");
        return {
          orderId: "order-1",
          confirmationToken: "token-1",
          classification: "verified_published",
          allowedActions: ["confirmOrderPublished"],
        };
      },
      resumeOrderTracking: async () => ({}),
      confirmOrderPublished: async () => {
        if (failures.resolution) throw new Error("supplier-secret-resolution");
        return {};
      },
      confirmOrderNotPublished: async () => ({}),
      openPublishedUrl: async () => ({}),
    });
    feature.setScope({ workspaceRuntimeId: "workspace-order-errors" });
    await feature.prepareOrderStatusAnomalyResolution("order-1");

    failures.syncAll = true;
    await feature.syncAllOrders();
    assert.deepEqual(feature.getSnapshot().commands.syncAllOrders.error, {
      code: "MEDIA_ORDER_SYNC_FAILED",
      category: "internal",
      retryability: "manual-check",
      userMessage: "刷新订单失败。",
    });
    failures.syncAll = false;
    failures.prepare = true;
    await feature.prepareOrderStatusAnomalyResolution("order-1");
    assert.equal(
      feature.getSnapshot().commands.prepareOrderStatusAnomalyResolution.error
        .userMessage,
      "无法准备订单状态核对。",
    );
    failures.prepare = false;
    failures.resolution = true;
    await feature.confirmOrderPublished("order-1");
    assert.equal(
      feature.getSnapshot().commands.confirmOrderPublished.error.userMessage,
      "订单状态核对未能安全完成。",
    );
  });

  it("clears stale anomaly preparation so the renderer can explicitly re-prepare evidence", async () => {
    let prepareCount = 0;
    const feature = createMediaFeature({
      getResourcePage: async () => ({
        items: [],
        total: 0,
        page: 1,
        pageSize: 50,
      }),
      searchResourcePage: async () => ({
        items: [],
        total: 0,
        page: 1,
        pageSize: 50,
      }),
      refreshResources: async () => ({}),
      getPoolPage: emptyPoolPage,
      addToPool: async () => ({}),
      removeFromPool: async () => ({}),
      getBalance: async () => 0,
      getDrafts: async () => [],
      getDraft: async () => null,
      setDraft: async () => ({}),
      scanArticles: async () => [],
      previewArticle: async () => ({}),
      getOrders: async () => [
        { orderNid: "order-1", statusCode: "0", anomaly: {} },
      ],
      syncOrder: async () => ({}),
      syncAllOrders: async () => ({ items: [], succeeded: 0, failed: 0 }),
      prepareOrderStatusAnomalyResolution: async () => {
        prepareCount += 1;
        if (prepareCount === 3) throw new Error("stale preparation");
        return {
          orderId: "order-1",
          confirmationToken: `token-${prepareCount}`,
          classification:
            prepareCount === 1 ? "verified_published" : "inconclusive",
          allowedActions: prepareCount === 1 ? ["confirmOrderPublished"] : [],
        };
      },
      resumeOrderTracking: async () => ({}),
      confirmOrderPublished: async () => {
        throw Object.assign(new Error("stale token"), {
          code: "ORDER_STATUS_ANOMALY_TOKEN_STALE",
        });
      },
      confirmOrderNotPublished: async () => ({}),
      openPublishedUrl: async () => ({}),
    });
    feature.setScope({ workspaceRuntimeId: "workspace-anomaly-reprepare" });
    await feature.refreshOrders("initial");
    await feature.prepareOrderStatusAnomalyResolution("order-1");
    assert.ok(feature.getSnapshot().orders.anomalyPreparations["order-1"]);
    await feature.confirmOrderPublished("order-1");
    assert.equal(
      feature.getSnapshot().orders.anomalyPreparations["order-1"],
      undefined,
    );
    assert.equal(
      feature.getSnapshot().commands.confirmOrderPublished.error.code,
      "ORDER_STATUS_ANOMALY_TOKEN_STALE",
    );
    await feature.prepareOrderStatusAnomalyResolution("order-1");
    assert.deepEqual(
      feature.getSnapshot().orders.anomalyPreparations["order-1"]
        .allowedActions,
      [],
    );
    await feature.prepareOrderStatusAnomalyResolution("order-1");
    assert.equal(
      feature.getSnapshot().orders.anomalyPreparations["order-1"],
      undefined,
    );
  });
});
