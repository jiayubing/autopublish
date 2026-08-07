"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { DatabaseSync } = require("node:sqlite");

const {
  createArticleMutationCoordinator,
} = require("../src/content/article-mutation-coordinator");
const { createArticleStore } = require("../src/content/article-store");
const {
  createContentStore,
  fingerprintArticle,
} = require("../src/content/content-store");
const {
  createOperationalStore,
} = require("../src/infrastructure/operational-store/operational-store");
const {
  createPaidMediaPreflightService,
} = require("../desktop/services/paid-media-preflight-service");
const {
  createRegularQueueApplication,
} = require("../desktop/services/regular-queue-application");

function article(articleId, overrides) {
  return Object.assign(
    {
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
    },
    overrides || {},
  );
}

function makeFixture(options) {
  const value = options || {};
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "paid-media-preflight-12-"),
  );
  const transitionPorts = {};
  const code = { value: "system-submission-12" };
  let store;
  try {
    store = createOperationalStore({
      workspaceRoot: root,
      clock: () => new Date("2026-08-07T00:00:00.000Z"),
      transitionPorts,
    });
    const articleStore = createArticleStore(root, {
      internalArticleLockFault: value.lockFault,
    });
    const contentStore = createContentStore({
      articleStore,
      listClientIds: () => ["client-a"],
    });
    const coordinator = createArticleMutationCoordinator({
      articleStore,
      contentStore,
      lifecycleFacts: transitionPorts.paidAdmissionTransitions,
      regularQueueTransitions: transitionPorts.regularQueueTransitions,
      paidAdmissionTransitions: transitionPorts.paidAdmissionTransitions,
      systemSubmissionCodeProvider: () => code.value,
      clock: () => new Date("2026-08-07T00:00:00.000Z"),
    });
    const resource = {
      resourceId: "media-12",
      name: "媒体十二",
      remarks: "只收工作日稿件",
      price: 12.5,
      available: true,
    };
    const service = createPaidMediaPreflightService({
      contentStore,
      lifecycleFacts: transitionPorts.paidAdmissionTransitions,
      paidAdmission: Object.freeze({
        admitPaidBatch: coordinator.admitPaidBatch,
      }),
      queryResource: async (resourceId) => {
        assert.equal(resourceId, resource.resourceId);
        if (typeof value.queryResource === "function")
          return value.queryResource(resource);
        return Object.assign({}, resource);
      },
      systemSubmissionCodeProvider: () => code.value,
      clientSnapshotResolver: (clientId) => ({
        version: 1,
        clientId,
        displayName: "客户甲",
      }),
      clock: () => new Date("2026-08-07T00:00:00.000Z"),
    });
    const profile = store.createAccountProfile({
      platformId: "toutiao",
      displayName: "头条账号",
    });
    const regularApplication = createRegularQueueApplication({
      contentStore,
      articleMutationCoordinator: coordinator,
      regularQueueTransitions: transitionPorts.regularQueueTransitions,
      accountProfileResolver: store.assertExecutableAccountProfile,
      platforms: [
        {
          id: "toutiao",
          contentQueueImport: true,
          publicationTarget: { kind: "platform" },
        },
      ],
    });
    return {
      root,
      store,
      articleStore,
      contentStore,
      coordinator,
      transitionPorts,
      service,
      regularApplication,
      profile,
      resource,
      code,
      add(valueArticle) {
        contentStore.createArticle(valueArticle);
      },
      close() {
        store.close();
        fs.rmSync(root, { recursive: true, force: true });
      },
    };
  } catch (error) {
    if (store) store.close();
    fs.rmSync(root, { recursive: true, force: true });
    throw error;
  }
}

function assertNoSubmissionFacts(fixture, articleIds) {
  assert.equal(fixture.store.listPaidSubmissionBatches().length, 0);
  assert.equal(fixture.store.listSubmissionBatches().length, 0);
  assert.equal(fixture.store.listSubmissionQueueItems().length, 0);
  assert.equal(fixture.store.listPublicationRecords({ articleIds }).length, 0);
}

function paidStoreItem(articleId, suffix) {
  return {
    clientId: "client-a",
    articleRef: { clientId: "client-a", articleId },
    articleId,
    itemId: `paid-item-${suffix}`,
    publicationId: "paid-publication-duplicate",
    attemptId: `paid-attempt-${suffix}`,
    target: { kind: "media", mediaResourceId: "media-12" },
    customerSnapshotV1: {
      version: 1,
      clientId: "client-a",
      displayName: "客户甲",
    },
    publicationSnapshot: {
      articleId,
      title: `标题 ${articleId}`,
      body: `正文 ${articleId}`,
      fingerprint: "a".repeat(64),
    },
  };
}

function refs(...ids) {
  return ids.map((articleId) => ({ clientId: "client-a", articleId }));
}

test("paid preflight is a single-resource immutable snapshot and emits local risks only", async () => {
  const fixture = makeFixture();
  try {
    fixture.add(article("article-b", { title: "带网址 https://example.test" }));
    fixture.add(article("article-a", { content: "联系方式 13800138000" }));
    const preview = await fixture.service.preflight({
      articleRefs: refs("article-b", "article-a"),
      mediaResourceId: fixture.resource.resourceId,
    });
    assert.equal(preview.status, "ready");
    assert.equal(preview.canConfirm, true);
    assert.deepEqual(
      preview.articleRefs.map((ref) => ref.articleId),
      ["article-a", "article-b"],
    );
    assert.equal(preview.articleCount, 2);
    assert.equal(preview.mediaName, "媒体十二");
    assert.equal(preview.mediaRemarks, "只收工作日稿件");
    assert.equal(preview.quotedPrice, 12.5);
    assert.equal(preview.estimatedTotal, 25);
    assert.equal(preview.systemSubmissionCode, "system-submission-12");
    assert.deepEqual(
      preview.risks.map((risk) => risk.code),
      ["PHONE_NUMBER", "URL"],
    );
    assert.equal(fixture.store.listPaidSubmissionBatches().length, 0);
  } finally {
    fixture.close();
  }
});

test("confirm rechecks resource, code and content before one atomic paid admission", async () => {
  const fixture = makeFixture();
  try {
    const first = article("article-a");
    const second = article("article-b");
    fixture.add(first);
    fixture.add(second);
    const preview = await fixture.service.preflight({
      articleRefs: refs("article-b", "article-a"),
      mediaResourceId: "media-12",
    });
    const result = await fixture.service.confirm({
      confirmationToken: preview.confirmationToken,
    });
    assert.equal(result.articleCount, 2);
    assert.equal(result.estimatedTotal, 25);
    assert.equal(result.items.length, 2);
    assert.equal(fixture.store.listPaidSubmissionBatches().length, 1);
    assert.equal(fixture.store.listSubmissionBatches().length, 1);
    assert.equal(
      fixture.store.listPublicationRecords({
        articleIds: ["article-a", "article-b"],
      }).length,
      2,
    );
    assert.equal(fixture.store.listSubmissionQueueItems().length, 0);
    const db = new DatabaseSync(fixture.store.databasePath);
    const storedItems = db
      .prepare("SELECT payload_json FROM submission_items ORDER BY article_id")
      .all()
      .map((row) => JSON.parse(row.payload_json));
    db.close();
    assert.deepEqual(
      storedItems.map((item) => item.customerSnapshotV1),
      [
        { version: 1, clientId: "client-a", displayName: "客户甲" },
        { version: 1, clientId: "client-a", displayName: "客户甲" },
      ],
    );
    assert.throws(
      () =>
        fixture.coordinator.saveExistingArticle({
          article: Object.assign({}, first, { title: "不能修改" }),
          expectedFingerprint: fingerprintArticle(first),
        }),
      { code: "ARTICLE_OPERATION_FROZEN" },
    );
    await assert.rejects(
      fixture.service.confirm({ confirmationToken: preview.confirmationToken }),
      { code: "PAID_MEDIA_CONFIRMATION_STALE" },
    );
  } finally {
    fixture.close();
  }
});

test("resource price and system-id changes invalidate the old confirmation without local facts", async () => {
  const fixture = makeFixture();
  try {
    fixture.add(article("article-a"));
    const preview = await fixture.service.preflight({
      articleRefs: refs("article-a"),
      mediaResourceId: "media-12",
    });
    fixture.resource.price = 15;
    await assert.rejects(
      fixture.service.confirm({ confirmationToken: preview.confirmationToken }),
      { code: "PAID_MEDIA_CONFIRMATION_STALE" },
    );
    assert.equal(fixture.store.listPaidSubmissionBatches().length, 0);

    fixture.resource.price = 12.5;
    const next = await fixture.service.preflight({
      articleRefs: refs("article-a"),
      mediaResourceId: "media-12",
    });
    fixture.code.value = "changed-system-id";
    await assert.rejects(
      fixture.service.confirm({ confirmationToken: next.confirmationToken }),
      { code: "PAID_MEDIA_SYSTEM_SUBMISSION_CODE_CHANGED" },
    );
    assert.equal(
      fixture.store.listPublicationRecords({ articleIds: ["article-a"] })
        .length,
      0,
    );
  } finally {
    fixture.close();
  }
});

test("invalid resource prices remain visible as a blocked preflight through the IPC-safe model", async () => {
  const fixture = makeFixture({
    queryResource: (resource) => Object.assign({}, resource, { price: -1 }),
  });
  try {
    fixture.add(article("article-a"));
    const preview = await fixture.service.preflight({
      articleRefs: refs("article-a"),
      mediaResourceId: "media-12",
    });
    assert.equal(preview.status, "blocked");
    assert.equal(preview.canConfirm, false);
    assert.equal(preview.quotedPrice, null);
    assert.equal(preview.estimatedTotal, null);
    assert.deepEqual(preview.blockers, ["PAID_MEDIA_RESOURCE_PRICE_INVALID"]);
    assert.equal(fixture.store.listPaidSubmissionBatches().length, 0);
  } finally {
    fixture.close();
  }
});

test("preflight blocks an estimated total above the paid admission amount limit", async () => {
  const fixture = makeFixture({
    queryResource: (resource) =>
      Object.assign({}, resource, { price: 60000000 }),
  });
  try {
    fixture.add(article("article-a"));
    fixture.add(article("article-b"));
    const preview = await fixture.service.preflight({
      articleRefs: refs("article-a", "article-b"),
      mediaResourceId: "media-12",
    });
    assert.equal(preview.quotedPrice, 60000000);
    assert.equal(preview.estimatedTotal, 120000000);
    assert.equal(preview.status, "blocked");
    assert.equal(preview.canConfirm, false);
    assert.ok(preview.blockers.includes("PAID_ADMISSION_PRICE_INVALID"));
    await assert.rejects(
      fixture.service.confirm({
        confirmationToken: preview.confirmationToken,
      }),
      { code: "PAID_MEDIA_CONFIRMATION_BLOCKED" },
    );
    assertNoSubmissionFacts(fixture, ["article-a", "article-b"]);
  } finally {
    fixture.close();
  }
});

test("paid admission locks articles in canonical order and exposes only its transition capability", async () => {
  const lockEvents = [];
  const fixture = makeFixture({
    lockFault(point, detail) {
      if (
        point === "after-candidate-owner" &&
        detail &&
        detail.files &&
        detail.files.json
      )
        lockEvents.push(path.basename(detail.files.json, ".json"));
    },
  });
  try {
    fixture.add(article("article-b"));
    fixture.add(article("article-a"));
    assert.deepEqual(
      Object.keys(fixture.transitionPorts.paidAdmissionTransitions).sort(),
      ["admitPaidBatch", "listArticleLifecycleFacts"],
    );
    assert.equal(
      Object.prototype.hasOwnProperty.call(
        fixture.transitionPorts.paidAdmissionTransitions,
        "createSubmissionBatch",
      ),
      false,
    );
    const preview = await fixture.service.preflight({
      articleRefs: refs("article-b", "article-a"),
      mediaResourceId: "media-12",
    });
    await fixture.service.confirm({
      confirmationToken: preview.confirmationToken,
    });
    assert.deepEqual(lockEvents.slice(-2), ["article-a", "article-b"]);
  } finally {
    fixture.close();
  }
});

test("confirmation resource failures, stop-order state and resource fingerprint drift expire the token with zero facts", async () => {
  let mode = "ready";
  const fixture = makeFixture({
    queryResource(resource) {
      if (mode === "failed") throw new Error("synthetic resource outage");
      if (mode === "stopped")
        return Object.assign({}, resource, { available: false });
      if (mode === "fingerprint")
        return Object.assign({}, resource, {
          fingerprint: "resource-fingerprint-drift",
        });
      return Object.assign({}, resource);
    },
  });
  try {
    fixture.add(article("article-a"));
    for (const [nextMode, expectedCode] of [
      ["failed", "PAID_MEDIA_RESOURCE_RECHECK_FAILED"],
      ["stopped", "PAID_MEDIA_CONFIRMATION_STALE"],
      ["fingerprint", "PAID_MEDIA_CONFIRMATION_STALE"],
    ]) {
      mode = "ready";
      const preview = await fixture.service.preflight({
        articleRefs: refs("article-a"),
        mediaResourceId: "media-12",
      });
      mode = nextMode;
      await assert.rejects(
        fixture.service.confirm({
          confirmationToken: preview.confirmationToken,
        }),
        { code: expectedCode },
      );
      await assert.rejects(
        fixture.service.confirm({
          confirmationToken: preview.confirmationToken,
        }),
        { code: "PAID_MEDIA_CONFIRMATION_STALE" },
      );
      assertNoSubmissionFacts(fixture, ["article-a"]);
    }
  } finally {
    fixture.close();
  }
});

test("article fingerprint, title/body validity and system identifier changes cannot cross confirmation", async () => {
  const fixture = makeFixture();
  try {
    const original = article("article-a");
    fixture.add(original);
    const changedArticlePreview = await fixture.service.preflight({
      articleRefs: refs("article-a"),
      mediaResourceId: "media-12",
    });
    fixture.coordinator.saveExistingArticle({
      article: Object.assign({}, original, { content: "确认前正文已变化" }),
      expectedFingerprint: fingerprintArticle(original),
    });
    await assert.rejects(
      fixture.service.confirm({
        confirmationToken: changedArticlePreview.confirmationToken,
      }),
      { code: "PAID_MEDIA_CONFIRMATION_STALE" },
    );

    const current = fixture.contentStore.getArticle("client-a", "article-a");
    fixture.coordinator.saveExistingArticle({
      article: Object.assign({}, current, { title: "标题".repeat(16) }),
      expectedFingerprint: fingerprintArticle(current),
    });
    const longTitle = await fixture.service.preflight({
      articleRefs: refs("article-a"),
      mediaResourceId: "media-12",
    });
    assert.equal(longTitle.canConfirm, false);
    assert.ok(longTitle.blockers.includes("PAID_MEDIA_TITLE_TOO_LONG"));
    await assert.rejects(
      fixture.service.confirm({
        confirmationToken: longTitle.confirmationToken,
      }),
      { code: "PAID_MEDIA_CONFIRMATION_BLOCKED" },
    );

    assertNoSubmissionFacts(fixture, ["article-a"]);
  } finally {
    fixture.close();
  }
});

test("preflight blocks a missing authoritative body before paid admission", async () => {
  let admitted = false;
  const service = createPaidMediaPreflightService({
    contentStore: {
      getArticle(clientId, articleId) {
        assert.equal(clientId, "client-a");
        return article(articleId, { content: "" });
      },
    },
    paidAdmission: {
      admitPaidBatch() {
        admitted = true;
        throw new Error("must not admit");
      },
    },
    queryResource: async () => ({
      resourceId: "media-12",
      name: "媒体十二",
      remarks: "",
      price: 12.5,
      available: true,
    }),
    systemSubmissionCodeProvider: () => "system-submission-12",
    clientSnapshotResolver: (clientId) => ({
      version: 1,
      clientId,
      displayName: "客户甲",
    }),
    clock: () => new Date("2026-08-07T00:00:00.000Z"),
  });
  const preview = await service.preflight({
    articleRefs: refs("article-a"),
    mediaResourceId: "media-12",
  });
  assert.equal(preview.canConfirm, false);
  assert.ok(preview.blockers.includes("PAID_MEDIA_ARTICLE_CONTENT_REQUIRED"));
  await assert.rejects(
    service.confirm({ confirmationToken: preview.confirmationToken }),
    { code: "PAID_MEDIA_CONFIRMATION_BLOCKED" },
  );
  assert.equal(admitted, false);
});

test("lock acquisition failure releases earlier locks and leaves no paid admission facts", async () => {
  let armed = false;
  let articleBLockCount = 0;
  let failed = false;
  const fixture = makeFixture({
    lockFault(point, detail) {
      if (
        armed &&
        point === "after-candidate-owner" &&
        detail.files.json.endsWith("article-b.json")
      ) {
        articleBLockCount += 1;
      }
      if (
        armed &&
        !failed &&
        articleBLockCount === 2 &&
        point === "after-candidate-owner" &&
        detail.files.json.endsWith("article-b.json")
      ) {
        failed = true;
        const error = new Error("synthetic article lock contention");
        error.code = "ARTICLE_STORE_BUSY";
        throw error;
      }
    },
  });
  try {
    fixture.add(article("article-a"));
    fixture.add(article("article-b"));
    const preview = await fixture.service.preflight({
      articleRefs: refs("article-b", "article-a"),
      mediaResourceId: "media-12",
    });
    armed = true;
    await assert.rejects(
      fixture.service.confirm({ confirmationToken: preview.confirmationToken }),
      { code: "ARTICLE_MUTATION_BUSY" },
    );
    assert.equal(failed, true);
    assertNoSubmissionFacts(fixture, ["article-a", "article-b"]);
    assert.equal(
      fs.existsSync(
        path.join(
          fixture.root,
          "generated",
          "client-a",
          "article-a.article-lock",
        ),
      ),
      false,
    );
    armed = false;
    const retried = await fixture.service.confirm({
      confirmationToken: preview.confirmationToken,
    });
    assert.equal(retried.articleCount, 2);
  } finally {
    fixture.close();
  }
});

test("paid admission transaction rollback removes rows written before a later constraint failure", () => {
  const fixture = makeFixture();
  try {
    assert.throws(
      () =>
        fixture.transitionPorts.paidAdmissionTransitions.admitPaidBatch({
          batchId: "paid-batch-rollback",
          target: { kind: "media", mediaResourceId: "media-12" },
          mediaResourceId: "media-12",
          confirmationFingerprint: "confirmation-rollback",
          confirmation: { version: 1 },
          systemSubmissionCode: "system-submission-12",
          quotedPrice: 12.5,
          estimatedTotal: 25,
          articleCount: 2,
          items: [
            paidStoreItem("article-a", "a"),
            paidStoreItem("article-b", "b"),
          ],
        }),
      { code: "PAID_ADMISSION_TRANSACTION_FAILED" },
    );
    assertNoSubmissionFacts(fixture, ["article-a", "article-b"]);
  } finally {
    fixture.close();
  }
});

test("save racing a delayed confirmation wins cleanly and makes confirmation stale", async () => {
  let releaseRecheck;
  let queryCount = 0;
  const fixture = makeFixture({
    queryResource(resource) {
      queryCount += 1;
      if (queryCount === 1) return Object.assign({}, resource);
      return new Promise((resolve) => {
        releaseRecheck = () => resolve(Object.assign({}, resource));
      });
    },
  });
  try {
    const original = article("article-a");
    fixture.add(original);
    const preview = await fixture.service.preflight({
      articleRefs: refs("article-a"),
      mediaResourceId: "media-12",
    });
    const confirming = fixture.service.confirm({
      confirmationToken: preview.confirmationToken,
    });
    await Promise.resolve();
    const saved = fixture.coordinator.saveExistingArticle({
      article: Object.assign({}, original, { content: "并发保存胜出" }),
      expectedFingerprint: fingerprintArticle(original),
    });
    assert.equal(saved.outcome, "saved");
    releaseRecheck();
    await assert.rejects(confirming, { code: "PAID_MEDIA_CONFIRMATION_STALE" });
    assertNoSubmissionFacts(fixture, ["article-a"]);
  } finally {
    fixture.close();
  }
});

test("regular and paid admission race through the shared coordinator and establish exactly one active target", async () => {
  const fixture = makeFixture();
  try {
    fixture.add(article("article-a"));
    const preview = await fixture.service.preflight({
      articleRefs: refs("article-a"),
      mediaResourceId: "media-12",
    });
    const outcomes = await Promise.allSettled([
      fixture.service.confirm({ confirmationToken: preview.confirmationToken }),
      Promise.resolve().then(() =>
        fixture.regularApplication.admitRegularQueueItems({
          articleRefs: refs("article-a"),
          platformId: "toutiao",
          accountProfileId: fixture.profile.accountProfileId,
        }),
      ),
    ]);
    const paidSucceeded = outcomes[0].status === "fulfilled";
    const regularSucceeded =
      outcomes[1].status === "fulfilled" &&
      outcomes[1].value.admittedCount === 1;
    assert.equal(
      Number(paidSucceeded) + Number(regularSucceeded),
      1,
      JSON.stringify(outcomes),
    );
    assert.equal(paidSucceeded, true);
    if (!paidSucceeded)
      assert.equal(outcomes[0].reason.code, "PUBLICATION_TARGET_CONFLICT");
    if (!regularSucceeded) {
      assert.equal(outcomes[1].status, "fulfilled");
      assert.equal(
        outcomes[1].value.items[0].reasonCode,
        "ARTICLE_ACTIVE_TARGET_CONFLICT",
      );
    }
    assert.equal(
      fixture.store.listPublicationRecords({ articleIds: ["article-a"] })
        .length,
      1,
    );
    assert.equal(fixture.store.listSubmissionBatches().length, 1);
    assert.equal(
      fixture.store.listPaidSubmissionBatches().length,
      paidSucceeded ? 1 : 0,
    );
    assert.equal(
      fixture.store.listSubmissionQueueItems().length,
      regularSucceeded ? 1 : 0,
    );
  } finally {
    fixture.close();
  }
});

test("regular admission can win while paid resource recheck is pending without paid orphan facts", async () => {
  let queryCount = 0;
  let releaseRecheck;
  const fixture = makeFixture({
    queryResource(resource) {
      queryCount += 1;
      if (queryCount === 1) return Object.assign({}, resource);
      return new Promise((resolve) => {
        releaseRecheck = () => resolve(Object.assign({}, resource));
      });
    },
  });
  try {
    fixture.add(article("article-a"));
    const preview = await fixture.service.preflight({
      articleRefs: refs("article-a"),
      mediaResourceId: "media-12",
    });
    const paid = fixture.service.confirm({
      confirmationToken: preview.confirmationToken,
    });
    await Promise.resolve();
    const regular = fixture.regularApplication.admitRegularQueueItems({
      articleRefs: refs("article-a"),
      platformId: "toutiao",
      accountProfileId: fixture.profile.accountProfileId,
    });
    assert.equal(regular.admittedCount, 1);
    releaseRecheck();
    await assert.rejects(paid, { code: "ARTICLE_OPERATION_FROZEN" });
    assert.equal(
      fixture.store.listPublicationRecords({ articleIds: ["article-a"] })
        .length,
      1,
    );
    assert.equal(fixture.store.listSubmissionBatches().length, 1);
    assert.equal(fixture.store.listSubmissionQueueItems().length, 1);
    assert.equal(fixture.store.listPaidSubmissionBatches().length, 0);
  } finally {
    fixture.close();
  }
});

test("duplicate confirmation race admits once and leaves no duplicate or orphan facts", async () => {
  const fixture = makeFixture();
  try {
    fixture.add(article("article-a"));
    const preview = await fixture.service.preflight({
      articleRefs: refs("article-a"),
      mediaResourceId: "media-12",
    });
    const outcomes = await Promise.allSettled([
      fixture.service.confirm({ confirmationToken: preview.confirmationToken }),
      fixture.service.confirm({ confirmationToken: preview.confirmationToken }),
    ]);
    assert.equal(
      outcomes.filter((outcome) => outcome.status === "fulfilled").length,
      1,
    );
    const rejected = outcomes.find((outcome) => outcome.status === "rejected");
    assert.equal(rejected.reason.code, "PAID_MEDIA_CONFIRMATION_STALE");
    assert.equal(fixture.store.listPaidSubmissionBatches().length, 1);
    assert.equal(fixture.store.listSubmissionBatches().length, 1);
    assert.equal(
      fixture.store.listPublicationRecords({ articleIds: ["article-a"] })
        .length,
      1,
    );
    assert.equal(fixture.store.listSubmissionQueueItems().length, 0);
  } finally {
    fixture.close();
  }
});
