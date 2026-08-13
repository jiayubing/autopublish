"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const test = require("node:test");

const {
  createOperationalStore,
} = require("../src/infrastructure/operational-store/operational-store");

const NOW = "2026-08-13T00:00:00.000Z";

function ref(articleId, clientId = "client-a") {
  return { clientId, articleId };
}

function article(articleId, clientId = "client-a") {
  return {
    id: articleId,
    clientId,
    title: `标题 ${articleId}`,
    content: `正文 ${articleId}`,
    status: "saved",
  };
}

function makeFixture(options) {
  const value = options || {};
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "phase-04-paid-staging-admission-"),
  );
  const articles = new Map(
    ["article-a", "article-b", "article-c"].map((articleId) => [
      `client-a\u0000${articleId}`,
      article(articleId),
    ]),
  );
  const transitionPorts = {};
  let store;
  try {
    store = createOperationalStore({
      workspaceRoot: root,
      clock: () => new Date(NOW),
      transitionPorts,
      articleReader: {
        getArticle(clientId, articleId) {
          const value = articles.get(`${clientId}\u0000${articleId}`);
          if (!value)
            throw Object.assign(new Error("Article was not found"), {
              code: "ARTICLE_NOT_FOUND",
            });
          return value;
        },
      },
      internalBeforeCommit: value.beforeCommit,
    });
    return {
      root,
      store,
      transitionPorts,
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

function paidItem(articleId, suffix = articleId) {
  return {
    clientId: "client-a",
    articleRef: ref(articleId),
    articleId,
    itemId: `paid-item-${suffix}`,
    publicationId: `paid-publication-${suffix}`,
    attemptId: `paid-attempt-${suffix}`,
    target: { kind: "media", mediaResourceId: "media-1" },
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

function admission(batchId, items, overrides) {
  return Object.assign(
    {
      batchId,
      target: { kind: "media", mediaResourceId: "media-1" },
      mediaResourceId: "media-1",
      confirmationFingerprint: `confirmation-${batchId}`,
      confirmation: { version: 1 },
      systemSubmissionCode: "system-submission-1",
      quotedPrice: 12.5,
      estimatedTotal: 12.5 * items.length,
      articleCount: items.length,
      items,
    },
    overrides || {},
  );
}

function admit(fixture, input) {
  return fixture.transitionPorts.paidAdmissionTransitions.admitPaidBatch(input);
}

function stage(fixture, articleIds, mediaResourceId = "media-1") {
  const refs = articleIds.map((articleId) => ref(articleId));
  fixture.store.addPaidStagingItems(refs);
  if (mediaResourceId !== null)
    fixture.store.setPaidStagingMedia(refs, mediaResourceId);
  return refs;
}

function assertNoBatchFacts(fixture) {
  assert.equal(fixture.store.listPaidSubmissionBatches().length, 0);
  assert.equal(fixture.store.listSubmissionBatches().length, 0);
  assert.equal(fixture.store.listSubmissionQueueItems().length, 0);
  assert.equal(fixture.store.listRemoteOrders().length, 0);
}

function readTriggerDatabase(fixture, callback) {
  const db = new DatabaseSync(fixture.store.databasePath);
  try {
    return callback(db);
  } finally {
    db.close();
  }
}

test("staged matching media admits once, consumes staging, and starts paused", () => {
  const fixture = makeFixture();
  try {
    stage(fixture, ["article-a", "article-b"]);
    const result = admit(
      fixture,
      admission("paid-batch-success", [
        paidItem("article-a", "a"),
        paidItem("article-b", "b"),
      ]),
    );

    assert.equal(result.idempotent, false);
    assert.equal(result.articleCount, 2);
    assert.deepEqual(
      fixture.store.listPaidStagingItems({ clientId: "client-a" }),
      [],
    );
    const snapshots =
      fixture.transitionPorts.paidExecutionTransitions.listPaidSubmissionBatchSnapshots(
        { batchId: result.batchId },
      );
    assert.equal(snapshots.length, 1);
    assert.equal(snapshots[0].status, "queued");
    assert.equal(snapshots[0].runState, "paused");
    assert.equal(snapshots[0].pauseIntent, "manual");
    assert.equal(snapshots[0].paused, true);
    assert.equal(fixture.store.listRemoteOrders().length, 0);
  } finally {
    fixture.close();
  }
});

test("new paid admission fails when an article is not staged", () => {
  const fixture = makeFixture();
  try {
    assert.throws(
      () =>
        admit(
          fixture,
          admission("paid-batch-not-staged", [paidItem("article-a")]),
        ),
      { code: "PAID_ADMISSION_STAGING_REQUIRED" },
    );
    assertNoBatchFacts(fixture);
  } finally {
    fixture.close();
  }
});

test("new paid admission fails when staged media is null", () => {
  const fixture = makeFixture();
  try {
    stage(fixture, ["article-a"], null);
    assert.throws(
      () =>
        admit(
          fixture,
          admission("paid-batch-no-media", [paidItem("article-a")]),
        ),
      { code: "PAID_ADMISSION_STAGING_MEDIA_MISMATCH" },
    );
    assert.equal(
      fixture.store.listPaidStagingItems({ clientId: "client-a" })[0]
        .selectedMediaResourceId,
      null,
    );
    assertNoBatchFacts(fixture);
  } finally {
    fixture.close();
  }
});

test("new paid admission fails when staged media does not match the batch target", () => {
  const fixture = makeFixture();
  try {
    stage(fixture, ["article-a"], "media-2");
    assert.throws(
      () =>
        admit(
          fixture,
          admission("paid-batch-media-mismatch", [paidItem("article-a")]),
        ),
      { code: "PAID_ADMISSION_STAGING_MEDIA_MISMATCH" },
    );
    assert.equal(
      fixture.store.listPaidStagingItems({ clientId: "client-a" })[0]
        .selectedMediaResourceId,
      "media-2",
    );
    assertNoBatchFacts(fixture);
  } finally {
    fixture.close();
  }
});

test("multi-item admission validates every staging row before writing any batch fact", () => {
  const fixture = makeFixture();
  try {
    stage(fixture, ["article-a"]);
    stage(fixture, ["article-b"], null);
    assert.throws(
      () =>
        admit(
          fixture,
          admission("paid-batch-multi-invalid", [
            paidItem("article-a", "a"),
            paidItem("article-b", "b"),
          ]),
        ),
      { code: "PAID_ADMISSION_STAGING_MEDIA_MISMATCH" },
    );
    assertNoBatchFacts(fixture);
    assert.deepEqual(
      fixture.store
        .listPaidStagingItems({ clientId: "client-a" })
        .map((item) => [
          item.articleRef.articleId,
          item.selectedMediaResourceId,
        ]),
      [
        ["article-a", "media-1"],
        ["article-b", null],
      ],
    );
  } finally {
    fixture.close();
  }
});

test("injected transaction failure rolls back the batch and preserves staging", () => {
  let armed = false;
  const fixture = makeFixture({
    beforeCommit() {
      if (armed)
        throw Object.assign(new Error("synthetic transaction failure"), {
          code: "SYNTHETIC_TRANSACTION_FAILURE",
        });
    },
  });
  try {
    stage(fixture, ["article-a"]);
    armed = true;
    assert.throws(
      () =>
        admit(
          fixture,
          admission("paid-batch-injected-failure", [paidItem("article-a")]),
        ),
      { code: "SYNTHETIC_TRANSACTION_FAILURE" },
    );
    assertNoBatchFacts(fixture);
    assert.equal(
      fixture.store.listPaidStagingItems({ clientId: "client-a" }).length,
      1,
    );
  } finally {
    fixture.close();
  }
});

test("staging consume count mismatch rolls back instead of partially consuming rows", () => {
  const fixture = makeFixture();
  try {
    stage(fixture, ["article-a"]);
    readTriggerDatabase(fixture, (db) =>
      db.exec(
        "CREATE TRIGGER phase4a_consume_fault AFTER INSERT ON paid_submission_batches BEGIN DELETE FROM paid_staging_items; END",
      ),
    );
    assert.throws(
      () =>
        admit(
          fixture,
          admission("paid-batch-delete-count-failure", [paidItem("article-a")]),
        ),
      { code: "PAID_ADMISSION_STAGING_CONSUME_FAILED" },
    );
    assertNoBatchFacts(fixture);
    assert.equal(
      fixture.store.listPaidStagingItems({ clientId: "client-a" }).length,
      1,
    );
  } finally {
    fixture.close();
  }
});

test("existing legal paid batch replay succeeds after its staging rows were consumed", () => {
  const fixture = makeFixture();
  try {
    stage(fixture, ["article-a"]);
    const input = admission("paid-batch-replay", [paidItem("article-a")]);
    const first = admit(fixture, input);
    const replay = admit(fixture, input);
    assert.equal(first.idempotent, false);
    assert.equal(replay.idempotent, true);
    assert.equal(replay.batchId, first.batchId);
    assert.equal(fixture.store.listPaidSubmissionBatches().length, 1);
    assert.equal(
      fixture.store.listPaidStagingItems({ clientId: "client-a" }).length,
      0,
    );
  } finally {
    fixture.close();
  }
});

test("existing regular active target still conflicts with paid admission and preserves staging", () => {
  const fixture = makeFixture();
  try {
    stage(fixture, ["article-a"]);
    const profile = fixture.store.createAccountProfile({
      platformId: "toutiao",
      displayName: "普通平台账号",
    });
    fixture.store.reservePublicationTarget({
      articleId: "article-a",
      publicationId: "regular-publication-a",
      attemptId: "regular-attempt-a",
      target: {
        kind: "platform",
        platformId: "toutiao",
        accountProfileId: profile.accountProfileId,
      },
    });
    assert.throws(
      () =>
        admit(
          fixture,
          admission("paid-batch-active-conflict", [paidItem("article-a")]),
        ),
      { code: "PUBLICATION_TARGET_CONFLICT" },
    );
    assertNoBatchFacts(fixture);
    assert.equal(
      fixture.store.listPaidStagingItems({ clientId: "client-a" }).length,
      1,
    );
  } finally {
    fixture.close();
  }
});
