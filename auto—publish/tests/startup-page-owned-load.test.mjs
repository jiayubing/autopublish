import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  createContentWorkbenchFeature,
  loadContentWorkbenchPage,
} from "../media-workbench/src/features/content/content-workbench-feature.js";
import { createMediaFeature } from "../media-workbench/src/features/media/media-feature.js";
import { createMediaBalanceFeature } from "../media-workbench/src/features/media/media-balance-feature.js";
import { createSubmissionCenterFeature } from "../media-workbench/src/features/submission-center/submission-center-feature.js";
import {
  articleLibraryBadgeCount,
  ordersBadgeCount,
  submissionCenterBadgeCount,
} from "../media-workbench/src/features/navigation-badges.js";

const root = dirname(fileURLToPath(import.meta.url));

function paidExecutionAdapters(calls) {
  return {
    listPaidMediaBatches: async () => {
      calls.push("listPaidMediaBatches");
      return [];
    },
    startPaidMediaBatch: async () => ({}),
    startAllPaidMediaBatches: async () => ({}),
    pausePaidMediaBatch: async () => ({}),
    cancelRemainingPaidMediaBatchItems: async () => ({}),
  };
}

function contentAdapters(calls) {
  return {
    ...paidExecutionAdapters(calls),
    listClients: async () => {
      calls.push("listClients");
      return [{ id: "client-a", name: "A" }];
    },
    listTemplateCatalog: async () => {
      calls.push("listTemplateCatalog");
      return { revision: "r1", platforms: [], templates: [], diagnostics: [] };
    },
    getClientGroups: async () => {
      calls.push("getClientGroups");
      return { revision: 1, groups: [], memberships: [] };
    },
    listQuestions: async () => {
      calls.push("listQuestions");
      return [];
    },
    listResearch: async () => {
      calls.push("listResearch");
      return [];
    },
    listResearchMetadata: async () => {
      calls.push("listResearchMetadata");
      return [];
    },
    getClientDetails: async () => {
      calls.push("getClientDetails");
      return { client: { id: "client-a", name: "A" }, research: [] };
    },
    loadManagement: async () => {
      calls.push("loadManagement");
      return {
        articles: [],
        lifecycleCounts: { needs_completion: 2 },
        workflowByArticle: {},
      };
    },
    getDoubaoQueueState: async () => {
      calls.push("getDoubaoQueueState");
      return { status: "idle", currentTaskId: null, completed: 0, total: 0, waitRemainingMs: 0, tasks: [] };
    },
  };
}

function mediaAdapters(calls) {
  return {
    getResourcePage: async (input) => {
      calls.push(["getResourcePage", input.page]);
      return { items: [], total: 0, page: input.page, pageSize: input.pageSize };
    },
    searchResourcePage: async (input) => {
      calls.push(["searchResourcePage", input.page]);
      return { items: [], total: 0, page: input.page, pageSize: input.pageSize };
    },
    refreshResources: async () => {
      calls.push("refreshResources");
      return { status: "complete" };
    },
    getPoolPage: async (input) => {
      calls.push(["getPoolPage", input.page]);
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
    },
    addToPool: async () => ({}),
    removeFromPool: async () => ({}),
    getBalance: async () => {
      calls.push("getBalance");
      return 12;
    },
    getOrders: async () => {
      calls.push("getOrders");
      return [
        { orderNid: "1", anomaly: { code: "X" } },
        { orderNid: "2" },
      ];
    },
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
    openPublishedUrl: async () => {},
  };
}

describe("startup page-owned loads", () => {
  it("loads only library-owned content queries on article-library first paint", async () => {
    const calls = [];
    const feature = createContentWorkbenchFeature(contentAdapters(calls));
    feature.setScope({ workspaceRuntimeId: "runtime-library" });
    await loadContentWorkbenchPage(feature, "library", "initial");
    assert.deepEqual(
      [...new Set(calls)].sort(),
      ["getClientGroups", "listClients", "listTemplateCatalog", "loadManagement"].sort(),
    );
    assert.equal(calls.includes("listPaidMediaBatches"), false);
    assert.equal(calls.includes("getDoubaoQueueState"), false);
    assert.equal(calls.includes("listQuestions"), false);
    assert.equal(calls.includes("listResearch"), false);
    assert.equal(calls.includes("getClientDetails"), false);
    assert.equal(articleLibraryBadgeCount(feature.getSnapshot().management), 2);
    feature.dispose();
  });

  it("loads production-owned sources without management or paid batches", async () => {
    const calls = [];
    const feature = createContentWorkbenchFeature(contentAdapters(calls));
    feature.setScope({ workspaceRuntimeId: "runtime-production" });
    await loadContentWorkbenchPage(feature, "production", "initial");
    assert.equal(calls.includes("loadManagement"), false);
    assert.equal(calls.includes("listPaidMediaBatches"), false);
    assert.equal(calls.includes("getDoubaoQueueState"), true);
    assert.equal(calls.includes("listQuestions"), true);
    assert.equal(calls.includes("listClients"), true);
    feature.dispose();
  });

  it("loads submission-center shell without management, doubao, or paid execution list", async () => {
    const calls = [];
    const feature = createContentWorkbenchFeature(contentAdapters(calls));
    feature.setScope({ workspaceRuntimeId: "runtime-shell" });
    await loadContentWorkbenchPage(feature, "shell", "initial");
    assert.deepEqual(
      [...new Set(calls)].sort(),
      ["getClientGroups", "listClients", "listTemplateCatalog"].sort(),
    );
    assert.equal(calls.includes("loadManagement"), false);
    assert.equal(calls.includes("listPaidMediaBatches"), false);
    assert.equal(calls.includes("getDoubaoQueueState"), false);
    feature.dispose();
  });

  it("does not request supplier balance or orders until those surfaces refresh", async () => {
    const calls = [];
    const feature = createMediaFeature(mediaAdapters(calls));
    feature.setScope({ workspaceRuntimeId: "runtime-media" });
    await feature.refreshWorkbench("initial");
    assert.equal(calls.includes("getBalance"), false);
    assert.equal(calls.includes("getOrders"), false);
    assert.equal(calls.some((item) => Array.isArray(item) && item[0] === "getResourcePage"), true);
    await feature.refreshOrders("orders-page");
    assert.equal(calls.includes("getOrders"), true);
    assert.equal(calls.includes("getBalance"), false);
    await feature.refreshBalance("sidebar");
    assert.equal(calls.includes("getBalance"), true);
    feature.dispose();
  });

  it("loads the submission-center page snapshot only when that feature refreshes", async () => {
    const calls = [];
    const feature = createSubmissionCenterFeature({
      getSnapshot: async () => {
        calls.push("getSubmissionCenterSnapshot");
        return {
          schemaVersion: 1,
          clientId: null,
          revision: 1,
          regular: { groups: [] },
          paid: { batches: [] },
          attention: { items: [] },
          counts: { regularItems: 0, paidBatches: 0, attentionItems: 3, total: 3 },
          page: 1,
          pageSize: 100,
          hasMore: false,
          failures: [],
        };
      },
    });
    assert.equal(calls.length, 0);
    feature.setScope({ workspaceRuntimeId: "runtime-center" });
    await feature.refresh("initial");
    assert.deepEqual(calls, ["getSubmissionCenterSnapshot"]);
    assert.equal(submissionCenterBadgeCount(feature.getSnapshot().data.counts), 3);
    feature.dispose();
  });

  it("keeps unconfigured media as notConfigured rather than balance 0", async () => {
    const feature = createMediaBalanceFeature({
      getBalance: async () => {
        const error = new Error("not configured");
        error.code = "MEDIA_CONFIG_NOT_SET";
        throw error;
      },
    });
    assert.equal(feature.getSnapshot().status, "idle");
    assert.equal(feature.getSnapshot().value, null);
    await feature.refresh("manual");
    assert.equal(feature.getSnapshot().status, "notConfigured");
    assert.equal(feature.getSnapshot().value, null);
    feature.dispose();
  });

  it("computes sidebar badges from already-loaded page data without extra adapters", () => {
    assert.equal(
      articleLibraryBadgeCount({
        lifecycleCounts: { needs_completion: 4 },
        workflowByArticle: { a: { stage: "needs_completion" } },
      }),
      4,
    );
    assert.equal(
      articleLibraryBadgeCount({
        workflowByArticle: {
          a: { stage: "needs_completion" },
          b: { stage: "published" },
        },
      }),
      1,
    );
    assert.equal(submissionCenterBadgeCount({ attentionItems: 7 }), 7);
    assert.equal(submissionCenterBadgeCount({}), 0);
    assert.equal(
      ordersBadgeCount([
        { anomaly: { code: "X" } },
        { cancellation: { manualResolutionRequired: true } },
        {},
      ]),
      2,
    );
  });

  it("keeps App from mounting media, submission-center, and kitchen-sink content on the default page", () => {
    const app = readFileSync(
      join(root, "../media-workbench/src/App.tsx"),
      "utf8",
    );
    assert.match(app, /function ArticleLibraryPage/);
    assert.match(app, /useContentWorkbenchFeature\(\{ page: "library" \}\)/);
    assert.match(app, /useContentWorkbenchFeature\(\{ page: "production" \}\)/);
    assert.match(app, /useContentWorkbenchFeature\(\{ page: "shell" \}\)/);
    assert.match(app, /useMediaFeature\(\{ surface: "orders" \}\)/);
    assert.match(app, /useMediaFeature\(\{ surface: "resources" \}\)/);
    const sidebar = readFileSync(
      join(root, "../media-workbench/src/components/Sidebar.tsx"),
      "utf8",
    );
    assert.match(sidebar, /useMediaBalance/);
    const libraryBlock = app.slice(
      app.indexOf("function ArticleLibraryPage"),
      app.indexOf("function SubmissionCenterPage"),
    );
    assert.doesNotMatch(libraryBlock, /useSubmissionCenterFeature/);
    assert.doesNotMatch(libraryBlock, /useMediaFeature/);
    assert.doesNotMatch(libraryBlock, /getBalance/);
    assert.doesNotMatch(libraryBlock, /getOrders/);
    assert.doesNotMatch(app, /useMediaFeature\(\)/);
    assert.doesNotMatch(app, /useContentWorkbenchFeature\(\)/);
  });
});
