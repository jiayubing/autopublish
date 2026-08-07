import assert from "node:assert/strict";
import { describe, it } from "node:test";
import fs from "node:fs";
import path from "node:path";
import { createMediaFeature } from "../media-workbench/src/features/media/media-feature.js";

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

  it("keeps production App on the media snapshot and named commands only", () => {
    const app = fs.readFileSync(
      path.resolve(import.meta.dirname, "../media-workbench/src/App.tsx"),
      "utf8",
    );
    assert.doesNotMatch(app, /bridge\/media|app-draft-save-controller/);
    assert.doesNotMatch(
      app,
      /\bset(?:Articles|PoolResources|Balance|IsScanning|IsCheckingBalance|IsSubmitting|SubmissionError)\b/,
    );
    assert.doesNotMatch(app, /useWorkspaceScope\(['"]mediaWorkbench['"]/);
    assert.match(app, /mediaSnapshot\.articles/);
    assert.match(app, /mediaSnapshot\.pool/);
    assert.match(app, /mediaSnapshot\.balance/);
    assert.match(app, /mediaFeature\.(?:openArticle|saveDraft)/);
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
});
