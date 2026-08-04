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
    submitSelected: async () => ({}),
    getOrders: async () => [],
    syncOrder: async () => ({}),
    openPublishedUrl: async () => ({}),
    ...overrides,
  };
}

describe("Phase 08 platform/media/settings/workspace renderer slice", () => {
  it("deduplicates a bounded resource page and rejects a late article open after close", async () => {
    const preview = deferred();
    const draft = deferred();
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
        previewArticle: () => preview.promise,
        getDraft: () => draft.promise,
      }),
    );
    feature.setScope({ workspaceRuntimeId: "media-runtime-a" });
    await feature.loadResourcePage(1, "initial");
    assert.deepEqual(
      feature.getSnapshot().resources.items.map((item) => item.resourceId),
      ["resource-1", "resource-2"],
    );

    const opening = feature.openArticle("article-1");
    feature.closeArticle();
    preview.resolve({ filename: "article-1", title: "late" });
    draft.resolve({ filename: "article-1", selectedResources: [] });
    await opening;
    assert.equal(feature.getSnapshot().articles.activeArticle, null);
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
    assert.match(
      fs.readFileSync(path.join(sourceRoot, "auth-store.tsx"), "utf8"),
      /getSnapshot\(\)|useSyncExternalStore|activeCommands|lifecycle/,
    );
    const platformWorkbench = fs.readFileSync(
      path.join(sourceRoot, "components/PlatformWorkbench.tsx"),
      "utf8",
    );
    assert.ok(platformWorkbench.split(/\r?\n/).length < 500);
    for (const component of [
      "PlatformQueuePanel.tsx",
      "PlatformSubmitPanel.tsx",
      "PlatformSubmissionOverlays.tsx",
    ]) {
      assert.equal(
        fs.existsSync(path.join(sourceRoot, "components", component)),
        true,
        component,
      );
    }
    assert.match(platformWorkbench, /PlatformQueuePanel/);
    assert.match(platformWorkbench, /PlatformSubmissionOverlays/);
  });
});
