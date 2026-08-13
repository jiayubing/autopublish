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
const {
  parsePaidStagingItem,
  parsePaidStagingArticleRefs,
} = require("../src/domain");

function workspace() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "paid-staging-phase-01-"));
}

function article(clientId, articleId, status = "saved") {
  return {
    id: articleId,
    clientId,
    title: `${articleId} title`,
    content: `${articleId} body`,
    status,
  };
}

function fixture() {
  const root = workspace();
  const articles = new Map([
    ["client-a\u0000article-1", article("client-a", "article-1")],
    ["client-a\u0000article-2", article("client-a", "article-2")],
    ["client-b\u0000article-1", article("client-b", "article-1")],
  ]);
  const store = createOperationalStore({
    workspaceRoot: root,
    articleReader: {
      getArticle(clientId, articleId) {
        const value = articles.get(`${clientId}\u0000${articleId}`);
        if (!value)
          throw Object.assign(new Error("missing"), {
            code: "ARTICLE_NOT_FOUND",
          });
        return value;
      },
    },
    clock: () => new Date("2026-08-12T00:00:00.000Z"),
  });
  return { root, store, articles };
}

function ref(clientId, articleId) {
  return { clientId, articleId };
}

test("paid staging contract is closed, minimal, and identity-normalized", () => {
  assert.deepEqual(
    parsePaidStagingArticleRefs([
      ref(" client-a ", "article-2"),
      ref("client-a", "article-1"),
      ref("client-a", "article-1"),
    ]),
    [ref("client-a", "article-1"), ref("client-a", "article-2")],
  );
  assert.deepEqual(
    parsePaidStagingItem({
      articleRef: ref("client-a", "article-1"),
      selectedMediaResourceId: null,
      createdAt: "2026-08-12T00:00:00.000Z",
      updatedAt: "2026-08-12T00:00:00.000Z",
    }),
    {
      articleRef: ref("client-a", "article-1"),
      selectedMediaResourceId: null,
      createdAt: "2026-08-12T00:00:00.000Z",
      updatedAt: "2026-08-12T00:00:00.000Z",
    },
  );
  assert.throws(
    () =>
      parsePaidStagingItem({
        articleRef: ref("client-a", "article-1"),
        price: 10,
      }),
    { code: "PAID_STAGING_ITEM_INVALID" },
  );
  assert.throws(
    () => parsePaidStagingArticleRefs([ref("client-a", "../escape")]),
    { code: "PAID_STAGING_ARTICLE_IDENTITY_INVALID" },
  );
});

test("paid staging add is batch-capable, duplicate-idempotent, scoped, and persistent", () => {
  const f = fixture();
  try {
    const added = f.store.addPaidStagingItems([
      ref("client-a", "article-2"),
      ref("client-a", "article-1"),
    ]);
    assert.equal(added.addedCount, 2);
    assert.equal(added.idempotentCount, 0);
    assert.deepEqual(
      f.store
        .listPaidStagingItems({ clientId: "client-a" })
        .map((item) => item.articleRef),
      [ref("client-a", "article-1"), ref("client-a", "article-2")],
    );
    const duplicate = f.store.addPaidStagingItems([
      ref("client-a", "article-1"),
      ref("client-a", "article-1"),
    ]);
    assert.equal(duplicate.addedCount, 0);
    assert.equal(duplicate.idempotentCount, 1);
    assert.equal(duplicate.items[0].status, "already-staged");
    assert.equal(
      f.store.hasPaidStagingItem(ref("client-a", "article-1")),
      true,
    );
    assert.equal(
      f.store.hasPaidStagingItem(ref("client-b", "article-1")),
      false,
    );
    assert.deepEqual(
      f.store.listPaidStagingItems({ clientId: "client-b" }),
      [],
    );

    const databasePath = f.store.databasePath;
    f.store.close();
    const reopened = createOperationalStore({
      workspaceRoot: f.root,
      articleReader: {
        getArticle(clientId, articleId) {
          const value = f.articles.get(`${clientId}\u0000${articleId}`);
          if (!value)
            throw Object.assign(new Error("missing"), {
              code: "ARTICLE_NOT_FOUND",
            });
          return value;
        },
      },
    });
    assert.equal(reopened.databasePath, databasePath);
    assert.equal(reopened.verify().schemaVersion, 6);
    assert.equal(
      reopened.listPaidStagingItems({ clientId: "client-a" }).length,
      2,
    );
    reopened.close();
  } finally {
    fs.rmSync(f.root, { recursive: true, force: true });
  }
});

test("paid staging supports removal, one-to-many media assignment, and clearing", () => {
  const f = fixture();
  try {
    f.store.addPaidStagingItems([
      ref("client-a", "article-1"),
      ref("client-a", "article-2"),
    ]);
    const selected = f.store.setPaidStagingMedia(
      [ref("client-a", "article-1"), ref("client-a", "article-2")],
      "media-resource-1",
    );
    assert.equal(selected.updatedCount, 2);
    assert.deepEqual(
      f.store
        .listPaidStagingItems({ clientId: "client-a" })
        .map((item) => item.selectedMediaResourceId),
      ["media-resource-1", "media-resource-1"],
    );
    const replay = f.store.setPaidStagingMedia(
      [ref("client-a", "article-1")],
      "media-resource-1",
    );
    assert.equal(replay.idempotentCount, 1);
    f.store.setPaidStagingMedia([ref("client-a", "article-1")], null);
    assert.equal(
      f.store.listPaidStagingItems({ clientId: "client-a" })[0]
        .selectedMediaResourceId,
      null,
    );
    const removed = f.store.removePaidStagingItems([
      ref("client-a", "article-1"),
      ref("client-a", "article-2"),
    ]);
    assert.equal(removed.removedCount, 2);
    assert.deepEqual(
      f.store.listPaidStagingItems({ clientId: "client-a" }),
      [],
    );
    assert.equal(
      f.store.removePaidStagingItems([ref("client-a", "article-1")])
        .idempotentCount,
      1,
    );
  } finally {
    f.store.close();
    fs.rmSync(f.root, { recursive: true, force: true });
  }
});

test("paid staging rejects missing or invalid articles and active publication conflicts without writes", () => {
  const f = fixture();
  try {
    assert.throws(
      () => f.store.addPaidStagingItems([ref("client-a", "missing")]),
      { code: "ARTICLE_NOT_FOUND" },
    );
    assert.throws(
      () => f.store.addPaidStagingItems([ref("client-a", "../escape")]),
      { code: "PAID_STAGING_ARTICLE_IDENTITY_INVALID" },
    );
    f.store.reservePublicationTarget({
      articleId: "article-2",
      publicationId: "publication-2",
      attemptId: "attempt-2",
      target: { kind: "media", mediaResourceId: "existing-media" },
    });
    assert.throws(
      () => f.store.addPaidStagingItems([ref("client-a", "article-2")]),
      { code: "ARTICLE_ACTIVE_TARGET_CONFLICT" },
    );
    const db = new DatabaseSync(f.store.databasePath, { readOnly: true });
    try {
      assert.equal(
        db.prepare("SELECT COUNT(*) AS count FROM paid_staging_items").get()
          .count,
        0,
      );
      assert.equal(
        db
          .prepare("SELECT COUNT(*) AS count FROM paid_submission_batches")
          .get().count,
        0,
      );
      assert.equal(
        db.prepare("SELECT COUNT(*) AS count FROM remote_orders").get().count,
        0,
      );
      assert.equal(
        db
          .prepare(
            "SELECT COUNT(*) AS count FROM paid_staging_items WHERE selected_media_resource_id IS NOT NULL",
          )
          .get().count,
        0,
      );
      const columns = db
        .prepare("PRAGMA table_info(paid_staging_items)")
        .all()
        .map((row) => row.name);
      assert.deepEqual(columns, [
        "client_id",
        "article_id",
        "selected_media_resource_id",
        "created_at",
        "updated_at",
      ]);
    } finally {
      db.close();
    }
  } finally {
    f.store.close();
    fs.rmSync(f.root, { recursive: true, force: true });
  }
});

test("paid staging public methods fail closed for scope, media, and missing rows", () => {
  const f = fixture();
  try {
    assert.throws(() => f.store.listPaidStagingItems({ clientId: "" }), {
      code: "PAID_STAGING_CLIENT_SCOPE_INVALID",
    });
    assert.throws(
      () =>
        f.store.setPaidStagingMedia([ref("client-a", "article-1")], "../media"),
      { code: "PAID_STAGING_MEDIA_RESOURCE_ID_INVALID" },
    );
    assert.throws(
      () => f.store.setPaidStagingMedia([ref("client-a", "article-1")], null),
      { code: "PAID_STAGING_ITEM_NOT_FOUND" },
    );
    assert.throws(() => f.store.hasPaidStagingItem({ clientId: "client-a" }), {
      code: "PAID_STAGING_ARTICLE_IDENTITY_INVALID",
    });
  } finally {
    f.store.close();
    fs.rmSync(f.root, { recursive: true, force: true });
  }
});
