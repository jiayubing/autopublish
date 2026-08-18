import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { createMediaFeature } from "../media-workbench/src/features/media/media-feature.js";
import { createPlatformFeature } from "../media-workbench/src/features/platform/platform-feature.js";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

function emptyPoolPage(input) {
  return {
    items: [],
    memberResourceIds: [],
    total: 0,
    page: input.page,
    pageSize: input.pageSize,
    totalPages: 0,
    hasPrev: false,
    hasNext: false,
  };
}

function mediaAdapters(overrides = {}) {
  return {
    getResourcePage: async (input) => ({
      items: [],
      total: 0,
      page: input.page,
      pageSize: input.pageSize,
    }),
    searchResourcePage: async (input) => ({
      items: [],
      total: 0,
      page: input.page,
      pageSize: input.pageSize,
    }),
    refreshResources: async () => ({ resourceCount: 0 }),
    getPoolPage: async (input) => emptyPoolPage(input),
    addToPool: async () => ({}),
    removeFromPool: async () => ({}),
    getBalance: async () => 0,
    getDrafts: async () => [],
    getDraft: async () => null,
    setDraft: async () => ({}),
    scanArticles: async () => [],
    previewArticle: async () => ({}),
    buildConfirmation: async () => ({}),
    getOrders: async () => [],
    syncOrder: async () => ({}),
    syncAllOrders: async () => ({ items: [], succeeded: 0, failed: 0 }),
    prepareOrderCancellation: async () => ({}),
    cancelOrder: async () => ({}),
    prepareCancellationResolution: async () => ({}),
    confirmCancellationSucceeded: async () => ({}),
    confirmCancellationNotApplied: async () => ({}),
    prepareOrderStatusAnomalyResolution: async () => ({}),
    resumeOrderTracking: async () => ({}),
    confirmOrderPublished: async () => ({}),
    confirmOrderNotPublished: async () => ({}),
    openPublishedUrl: async () => ({}),
    ...overrides,
  };
}

describe("Phase 08 platform/media/settings/workspace renderer slice", () => {
  it("deduplicates a bounded resource page without a retired article editor", async () => {
    const feature = createMediaFeature(
      mediaAdapters({
        getResourcePage: async (input) => ({
          items: [
            { resourceId: "resource-1" },
            { resourceId: "resource-1" },
            { resourceId: "resource-2" },
          ],
          total: 3,
          page: input.page,
          pageSize: input.pageSize,
        }),
      }),
    );
    feature.setScope({ workspaceRuntimeId: "media-runtime-a" });
    await feature.loadResourcePage(1, "initial");
    assert.deepEqual(
      feature.getSnapshot().resources.items.map((item) => item.resourceId),
      ["resource-1", "resource-2"],
    );

    assert.equal(typeof feature.openArticle, "undefined");
    assert.equal(typeof feature.saveDraft, "undefined");
    feature.dispose();
  });

  it("does not let an old order sync clear a newer workspace sync indicator", async () => {
    const oldSync = deferred();
    const newSync = deferred();
    let syncCalls = 0;
    const feature = createMediaFeature(
      mediaAdapters({
        syncOrder: () =>
          ++syncCalls === 1 ? oldSync.promise : newSync.promise,
      }),
    );
    feature.setScope({ workspaceRuntimeId: "media-runtime-a" });
    const first = feature.syncOrder("order-a");
    feature.setScope({ workspaceRuntimeId: "media-runtime-b" });
    const second = feature.syncOrder("order-b");
    assert.equal(feature.getSnapshot().orders.syncingOrderNid, "order-b");

    oldSync.resolve({ orderNid: "order-a" });
    await first;
    assert.equal(feature.getSnapshot().orders.syncingOrderNid, "order-b");
    newSync.resolve({ orderNid: "order-b" });
    await second;
    assert.equal(feature.getSnapshot().orders.syncingOrderNid, null);
    feature.dispose();
  });

  it("clears platform residue and exposes run-query state on workspace switch", async () => {
    const feature = createPlatformFeature({
      loadQueue: async () => ({ revision: 1, platforms: [], queue: [] }),
      getRunState: async () => ({
        workspaceRuntimeId: "platform-runtime-a",
        runId: null,
        phase: "idle",
        total: 0,
        processed: 0,
        succeeded: 0,
        failed: 0,
        skipped: 0,
        uncertain: 0,
        currentTask: null,
        startedAt: null,
        updatedAt: null,
        terminalResult: null,
        isBatchRunning: false,
        isStopPending: false,
        isPlatformRunning: false,
        waitRemainingMs: 0,
      }),
      previewResidue: async () => ({
        cleanableCount: 1,
        reportedCount: 0,
      }),
    });
    feature.setScope({ workspaceRuntimeId: "platform-runtime-a" });
    await feature.inspectResidue();
    assert.equal(feature.getSnapshot().residue.phase, "awaiting-confirmation");
    feature.setScope({ workspaceRuntimeId: "platform-runtime-b" });
    assert.equal(feature.getSnapshot().residue.phase, "idle");
    await feature.refreshRun("manual");
    assert.equal(feature.getSnapshot().runQuery.loading, false);
    assert.equal(feature.getSnapshot().runQuery.error, null);
    feature.dispose();
  });

  it("publishes a settled run-query snapshot when transport stops", async () => {
    const pending = deferred();
    const feature = createPlatformFeature({
      getRunState: () => pending.promise,
      onRunState: () => () => {},
    });
    feature.setScope({ workspaceRuntimeId: "platform-runtime-stop" });
    const start = feature.start();
    assert.equal(feature.getSnapshot().runQuery.loading, true);

    feature.stopTransport();
    assert.equal(feature.getSnapshot().runQuery.loading, false);

    pending.resolve({
      workspaceRuntimeId: "platform-runtime-stop",
      phase: "idle",
      isPlatformRunning: false,
    });
    await start;
    feature.dispose();
  });

  it("records an initial run refresh failure while preserving the query error", async () => {
    const reports = [];
    const feature = createPlatformFeature({
      getRunState: async () => {
        throw new Error("private platform transport detail");
      },
      reportDiagnostic: (code) => reports.push(code),
    });
    feature.setScope({ workspaceRuntimeId: "platform-refresh-failure" });
    await feature.start();
    assert.equal(feature.getSnapshot().runQuery.loading, false);
    assert.equal(
      feature.getSnapshot().runQuery.error.code,
      "PLATFORM_RUN_QUERY_FAILED",
    );
    assert.deepEqual(reports, ["PLATFORM_RUN_REFRESH_FAILED"]);
    assert.doesNotMatch(
      JSON.stringify(feature.getSnapshot()),
      /private platform transport detail/,
    );
    feature.dispose();
  });

  it("coordinates queue-group commands through the renderer feature without overriding manual pause", async () => {
    const group = {
      queueGroupId: "group-a",
      platformId: "toutiao",
      accountProfileId: "profile-a",
      runState: "paused",
      pauseIntent: "manual",
      manuallyPaused: true,
      current: null,
      remaining: [
        {
          itemId: "item-a",
          batchId: "batch-a",
          articleId: "article-a",
          articleRef: { clientId: "client-a", articleId: "article-a" },
          articleSummary: { title: "文章 A", customerName: "客户 A" },
          regularPublicationAttemptId: "attempt-a",
          position: 1,
        },
      ],
      actions: { canStart: true, canPause: false, reasonCode: null },
      revision: 1,
      createdAt: "2026-08-08T00:00:00.000Z",
      updatedAt: "2026-08-08T00:00:00.000Z",
    };
    let listedGroups = [group];
    let startAllCalls = 0;
    let removedItems = null;
    const feature = createPlatformFeature({
      loadQueue: async () => ({
        revision: 1,
        platforms: [
          { id: "toutiao", displayName: "头条", loginAvailable: true },
        ],
        queue: [],
      }),
      listRegularQueueGroups: async () => listedGroups,
      listAccountProfiles: async () => [
        {
          accountProfileId: "profile-a",
          platformId: "toutiao",
          displayName: "机构主账号",
          bindingStatus: "bound",
        },
      ],
      confirmAccountProfile: async () => ({
        accountProfileId: "profile-b",
        platformId: "toutiao",
        displayName: "机构备用账号",
        bindingStatus: "bound",
      }),
      startAllRegularQueueGroups: async () => {
        startAllCalls += 1;
        return [group];
      },
      pauseAllRegularQueueGroups: async () => [group],
      startRegularQueueGroup: async () => [group],
      pauseRegularQueueGroup: async () => [group],
      removePendingQueueItems: async (input) => {
        removedItems = input.items;
        return { removedCount: 1, idempotentCount: 0, conflictCount: 0, items: [] };
      },
    });
    feature.setScope({ workspaceRuntimeId: "platform-queue-groups" });
    await feature.refreshQueue();
    await feature.refreshAccountProfiles();
    await feature.refreshRegularQueueGroups();
    assert.equal(
      feature.getSnapshot().regularQueueGroupViews[0].showAccount,
      false,
    );
    assert.equal(
      feature.getSnapshot().regularQueueGroupViews[0].platformLabel,
      "头条",
    );
    assert.equal(
      feature.getSnapshot().regularQueueGroupViews[0].accountLabel,
      "机构主账号",
    );
    await feature.confirmAccountProfile({
      platformId: "toutiao",
      displayName: "机构备用账号",
    });
    assert.equal(
      feature.getSnapshot().regularQueueGroupViews[0].showAccount,
      true,
    );
    const first = feature.startAllGroups();
    const second = feature.startAllGroups();
    await Promise.all([first, second]);
    assert.equal(startAllCalls, 1);
    await feature.removePendingQueueItems([{
      articleRef: { clientId: "client-a", articleId: "article-a" },
      itemId: "item-a",
      batchId: "batch-a",
    }]);
    assert.deepEqual(removedItems, [{
      articleRef: { clientId: "client-a", articleId: "article-a" },
      itemId: "item-a",
      batchId: "batch-a",
    }]);
    assert.equal(
      feature.getSnapshot().regularQueueGroupViews[0].pauseIntent,
      "manual",
    );
    listedGroups = [
      {
        ...group,
        runState: "paused",
        pauseIntent: "system",
        manuallyPaused: false,
        actions: {
          canStart: true,
          canPause: false,
          reasonCode: "REGULAR_ACCOUNT_PROFILE_UNVERIFIED",
        },
      },
    ];
    await feature.refreshRegularQueueGroups();
    assert.equal(
      feature.getSnapshot().regularQueueGroupViews[0].actions.reasonCode,
      "REGULAR_ACCOUNT_PROFILE_UNVERIFIED",
    );
    assert.equal(
      feature.getSnapshot().regularQueueGroupViews[0].stateLabel,
      "系统暂停",
    );
    listedGroups = [
      {
        ...group,
        runState: "running",
        pauseIntent: "none",
        manuallyPaused: false,
        remaining: [],
        actions: {
          canStart: false,
          canPause: false,
          reasonCode: "REGULAR_QUEUE_GROUP_EMPTY",
        },
      },
    ];
    await feature.refreshRegularQueueGroups();
    assert.equal(
      feature.getSnapshot().regularQueueGroupViews[0].stateLabel,
      "队列为空",
    );
    feature.dispose();
  });

  it("refreshes owner actions while a group start is pending so pause stays available", async () => {
    const startGate = deferred();
    let pauseCalls = 0;
    let current = {
      queueGroupId: "group-running",
      platformId: "toutiao",
      accountProfileId: "profile-running",
      runState: "paused",
      pauseIntent: "manual",
      manuallyPaused: true,
      current: null,
      remaining: [
        {
          itemId: "item-running",
          batchId: "batch-running",
          articleId: "article-running",
          articleRef: { clientId: "client-a", articleId: "article-running" },
          articleSummary: { title: "运行中文章", customerName: "客户 A" },
          regularPublicationAttemptId: "attempt-running",
          position: 1,
        },
      ],
      actions: { canStart: true, canPause: false, reasonCode: null },
      revision: 1,
      createdAt: "2026-08-08T00:00:00.000Z",
      updatedAt: "2026-08-08T00:00:00.000Z",
    };
    const feature = createPlatformFeature({
      listRegularQueueGroups: async () => [current],
      startRegularQueueGroup: () => {
        current = {
          ...current,
          runState: "running",
          pauseIntent: "none",
          manuallyPaused: false,
          actions: { canStart: false, canPause: true, reasonCode: null },
          revision: 2,
        };
        return startGate.promise;
      },
      pauseRegularQueueGroup: async () => {
        pauseCalls += 1;
        current = {
          ...current,
          runState: "paused",
          pauseIntent: "manual",
          manuallyPaused: true,
          actions: { canStart: true, canPause: false, reasonCode: null },
        };
        return [current];
      },
    });
    feature.setScope({ workspaceRuntimeId: "platform-start-pending" });
    await feature.refreshRegularQueueGroups();

    const starting = feature.startGroup("group-running");
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(feature.getSnapshot().commands.startGroup.busy, true);
    assert.equal(
      feature.getSnapshot().regularQueueGroupViews[0].actions.canPause,
      true,
    );
    await feature.pauseGroup("group-running");
    assert.equal(pauseCalls, 1);

    startGate.resolve([current]);
    await starting;
    feature.dispose();
  });

  it("does not let an older queue-group query overwrite a completed pause", async () => {
    const queryGate = deferred();
    const paused = {
      queueGroupId: "group-stale-query",
      platformId: "toutiao",
      accountProfileId: "profile-stale-query",
      runState: "paused",
      pauseIntent: "manual",
      manuallyPaused: true,
      current: null,
      remaining: [
        {
          itemId: "item-stale-query",
          batchId: "batch-stale-query",
          articleId: "article-stale-query",
          articleRef: { clientId: "client-a", articleId: "article-stale-query" },
          articleSummary: { title: "过期查询文章", customerName: "客户 A" },
          regularPublicationAttemptId: "attempt-stale-query",
          position: 1,
        },
      ],
      actions: { canStart: true, canPause: false, reasonCode: null },
      revision: 2,
      createdAt: "2026-08-08T00:00:00.000Z",
      updatedAt: "2026-08-08T00:00:01.000Z",
    };
    const feature = createPlatformFeature({
      listRegularQueueGroups: () => queryGate.promise,
      pauseRegularQueueGroup: async () => [paused],
    });
    feature.setScope({ workspaceRuntimeId: "platform-stale-group-query" });

    const staleQuery = feature.refreshRegularQueueGroups("initial");
    await feature.pauseGroup(paused.queueGroupId);
    queryGate.resolve([
      {
        ...paused,
        runState: "running",
        pauseIntent: "none",
        manuallyPaused: false,
        actions: { canStart: false, canPause: true, reasonCode: null },
        revision: 1,
      },
    ]);
    await staleQuery;

    assert.equal(
      feature.getSnapshot().regularQueueGroupViews[0].pauseIntent,
      "manual",
    );
    assert.equal(feature.getSnapshot().regularQueueGroupViews[0].revision, 2);
    feature.dispose();
  });

  it("keeps the domain import boundary explicit for remaining renderer callers", () => {
    const sourceRoot = path.resolve(
      import.meta.dirname,
      "../media-workbench/src",
    );
    const files = fs.readdirSync(sourceRoot, {
      recursive: true,
      withFileTypes: true,
    });
    for (const entry of files) {
      if (!entry.isFile() || !/\.(?:ts|tsx|js)$/.test(entry.name)) continue;
      const source = fs.readFileSync(
        path.join(entry.parentPath, entry.name),
        "utf8",
      );
      assert.doesNotMatch(source, /from\s+["'][^"']*\/types["']/, entry.name);
    }
    const settingsView = fs.readFileSync(
      path.join(sourceRoot, "components/SettingsView.tsx"),
      "utf8",
    );
    assert.match(settingsView, /types\/workspace/);
    assert.doesNotMatch(settingsView, /bridge\/workspace/);
  });
});
