"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { createArticleStore } = require("../src/content/article-store");
const { createContentStore } = require("../src/content/content-store");
const {
  createOperationalStore,
} = require("../src/infrastructure/operational-store/operational-store");
const { MediaPoolStore } = require("../src/platforms/media/media-pool-store");
const {
  createMediaWorkbenchApplication,
} = require("../desktop/services/media-workbench-application");

function article(articleId) {
  return {
    id: articleId,
    clientId: "client-a",
    platform: "toutiao",
    scenario: "guide",
    templateId: "template-1",
    title: `标题 ${articleId}`,
    content: `正文 ${articleId}`,
    status: "saved",
    createdAt: "2026-08-07T00:00:00.000Z",
    updatedAt: "2026-08-07T00:00:00.000Z",
  };
}

function refs(articleId) {
  return [{ clientId: "client-a", articleId }];
}

test("paid preflight application uses the real MediaPoolStore owner for preflight and confirm recheck", async () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "paid-media-real-pool-owner-"),
  );
  const mediaDataRoot = path.join(root, "media-data");
  const transitionPorts = {};
  let contentStore;
  let store;

  try {
    store = createOperationalStore({
      workspaceRoot: root,
      clock: () => new Date("2026-08-07T00:00:00.000Z"),
      transitionPorts,
    });
    const articleStore = createArticleStore(root);
    contentStore = createContentStore({
      articleStore,
      listClientIds: () => ["client-a"],
    });
    contentStore.createArticle(article("article-owner"));

    const articleRefs = refs("article-owner");

    const poolStore = new MediaPoolStore({ paths: { data: mediaDataRoot } });
    const admissionCalls = [];
    const application = createMediaWorkbenchApplication({
      paths: { data: mediaDataRoot },
      mediaClientProvider: () => ({}),
      poolStore,
      mediaOrderService: {
        listOrderViews: () => [],
      },
      contentStore,
      paidAdmissionFacade: {
        admitPaidBatch(input) {
          admissionCalls.push(input);
          return { batchId: "unexpected-admission" };
        },
      },
      clientSnapshotResolver: (clientId) => ({
        version: 1,
        clientId,
        displayName: "客户甲",
      }),
      systemSubmissionCodeProvider: () => "system-submission-owner",
      mediaResourceService: {
        async queryCurrentResource(resourceId) {
          assert.equal(resourceId, "media-owner");
          return {
            resourceId,
            name: "真实收藏媒体",
            remarks: "合成测试资源",
            price: 12.5,
            available: true,
          };
        },
      },
      lifecycleFacts: transitionPorts.paidAdmissionTransitions,
      clock: () => new Date("2026-08-07T00:00:00.000Z"),
    });

    await assert.rejects(
      application.preflightPaidMedia({
        articleRefs,
        mediaResourceId: "media-owner",
      }),
      { code: "INVALID_MEDIA_RESOURCE_ID" },
    );

    poolStore.add({
      id: "media-owner",
      name: "真实收藏媒体",
      price: 12.5,
    });
    assert.equal(poolStore.contains("media-owner"), true);

    const preview = await application.preflightPaidMedia({
      articleRefs,
      mediaResourceId: "media-owner",
    });
    assert.equal(preview.status, "ready");
    assert.equal(preview.canConfirm, true);
    assert.equal(preview.mediaResourceId, "media-owner");

    poolStore.remove("media-owner");
    assert.equal(poolStore.contains("media-owner"), false);

    await assert.rejects(
      application.confirmPaidMedia({
        confirmationToken: preview.confirmationToken,
      }),
      { code: "PAID_MEDIA_CONFIRMATION_STALE" },
    );
    assert.deepEqual(admissionCalls, []);
    assert.equal(store.listPaidSubmissionBatches().length, 0);
  } finally {
    if (store) store.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
