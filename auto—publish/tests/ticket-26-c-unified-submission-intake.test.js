"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { DatabaseSync } = require("node:sqlite");

const {
  createPaidMediaPreflightService,
} = require("../desktop/services/paid-media-preflight-service");
const {
  createOperationalStore,
} = require("../src/infrastructure/operational-store/operational-store");

function workspace() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "ticket-26-c-"));
}

function article(articleId = "article-1", content = "正文") {
  return {
    id: articleId,
    clientId: "client-1",
    platform: "toutiao",
    scenario: "guide",
    templateId: "template-1",
    title: "一篇可投稿文章",
    content,
    status: "saved",
    createdAt: "2026-08-15T00:00:00.000Z",
    updatedAt: "2026-08-15T00:00:00.000Z",
  };
}

function paidAdmissionInput(articleId = "article-1") {
  const fingerprint = "a".repeat(64);
  const articleRef = { clientId: "client-1", articleId };
  return {
    batchId: "paid-batch-direct-1",
    articleCount: 1,
    target: { kind: "media", mediaResourceId: "media-1" },
    confirmationFingerprint: "b".repeat(64),
    confirmation: {
      version: 1,
      articleRefs: [articleRef],
      mediaResourceId: "media-1",
      quotedPrice: 12.5,
      confirmedAt: "2026-08-15T00:00:00.000Z",
    },
    systemSubmissionCode: "system-1",
    quotedPrice: 12.5,
    estimatedTotal: 12.5,
    items: [
      {
        clientId: "client-1",
        articleId,
        articleRef,
        publicationId: "publication-paid-1",
        attemptId: "attempt-paid-1",
        itemId: "paid-item-1",
        customerSnapshotV1: {
          version: 1,
          clientId: "client-1",
          displayName: "客户一",
        },
        publicationSnapshot: {
          articleId,
          title: "一篇可投稿文章",
          body: "正文",
          fingerprint,
        },
        resourceNameSnapshot: "媒体一",
        payload: { source: "ticket-26-c" },
      },
    ],
  };
}

function downgradeToV6WithLegacyRows(database) {
  const db = new DatabaseSync(database);
  try {
    db.exec(
      "DROP TABLE submission_migration_notices; DROP TABLE submission_queue_items; DROP TABLE submission_queue_groups; CREATE TABLE submission_queue_groups(queue_group_id TEXT PRIMARY KEY NOT NULL, platform_id TEXT NOT NULL, account_profile_id TEXT NOT NULL REFERENCES account_profiles(account_profile_id), pause_intent TEXT NOT NULL CHECK(pause_intent IN('none','manual','system')), revision INTEGER NOT NULL CHECK(revision > 0), created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(platform_id,account_profile_id)); CREATE INDEX queue_group_pause_intent ON submission_queue_groups(pause_intent,updated_at,queue_group_id); CREATE TABLE submission_queue_items(item_id TEXT PRIMARY KEY NOT NULL REFERENCES submission_items(item_id), queue_group_id TEXT NOT NULL REFERENCES submission_queue_groups(queue_group_id), position INTEGER NOT NULL CHECK(position > 0), created_at TEXT NOT NULL, UNIQUE(queue_group_id,position)); CREATE INDEX queue_item_article ON submission_queue_items(item_id,queue_group_id); DELETE FROM schema_migrations WHERE version>=7; CREATE TABLE paid_staging_items(client_id TEXT NOT NULL, article_id TEXT NOT NULL, selected_media_resource_id TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY(client_id,article_id)); CREATE INDEX paid_staging_client ON paid_staging_items(client_id,created_at,article_id);",
    );
    const insert = db.prepare(
      "INSERT INTO paid_staging_items(client_id,article_id,selected_media_resource_id,created_at,updated_at) VALUES(?,?,?,?,?)",
    );
    insert.run(
      "client-1",
      "article-a",
      "media-secret",
      "2026-08-15T00:00:00.000Z",
      "2026-08-15T00:00:00.000Z",
    );
    insert.run(
      "client-2",
      "article-b",
      null,
      "2026-08-15T00:00:01.000Z",
      "2026-08-15T00:00:01.000Z",
    );
  } finally {
    db.close();
  }
}

function readLegacyMigrationState(database) {
  const db = new DatabaseSync(database, { readOnly: true });
  try {
    const hasNoticeTable = Boolean(
      db
        .prepare(
          "SELECT 1 FROM sqlite_master WHERE type='table' AND name='submission_migration_notices'",
        )
        .get(),
    );
    return {
      versions: db
        .prepare("SELECT version FROM schema_migrations ORDER BY version")
        .all()
        .map((row) => row.version),
      legacyCount: db
        .prepare(
          "SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name='paid_staging_items'",
        )
        .get().count,
      legacyRows: db
        .prepare(
          "SELECT client_id,article_id,selected_media_resource_id FROM paid_staging_items ORDER BY client_id,article_id",
        )
        .all(),
      noticeCount: hasNoticeTable
        ? db
            .prepare(
              "SELECT COUNT(*) AS count FROM submission_migration_notices",
            )
            .get().count
        : 0,
    };
  } finally {
    db.close();
  }
}

test("paid selection is an in-memory preflight session and confirmation admits directly", async () => {
  let currentArticle = article();
  let cachedFavorite = {
    resourceId: "media-1",
    name: "媒体一",
    remarks: "人工确认风险",
    price: 12.5,
    available: true,
  };
  const admissionCalls = [];
  const service = createPaidMediaPreflightService({
    contentStore: {
      getArticle: () => currentArticle,
    },
    paidAdmission: {
      admitPaidBatch(input) {
        admissionCalls.push(input);
        return {
          batchId: input.batchId,
          status: "queued",
          articleCount: input.articleRefs.length,
          items: [],
        };
      },
    },
    mediaPoolStore: { contains: async () => true },
    queryResource: async () => ({ ...cachedFavorite }),
    lifecycleFacts: {
      listArticleLifecycleFacts: () => ({
        publications: [],
        submissionItems: [],
        orders: [],
        attentionItems: [],
        removalTransactions: [],
      }),
    },
    clientSnapshotResolver: () => ({
      version: 1,
      clientId: "client-1",
      displayName: "客户一",
    }),
    systemSubmissionCodeProvider: () => "system-1",
  });

  const input = {
    articleRefs: [{ clientId: "client-1", articleId: "article-1" }],
    mediaResourceId: "media-1",
  };
  const model = await service.preflight(input);
  assert.equal(model.status, "ready");
  assert.equal(admissionCalls.length, 0);
  assert.equal(model.articleCount, 1);

  await service.confirm({ confirmationToken: model.confirmationToken });
  assert.equal(admissionCalls.length, 1);
  assert.equal(admissionCalls[0].articleRefs[0].articleId, "article-1");

  const staleResourceModel = await service.preflight(input);
  cachedFavorite = { ...cachedFavorite, price: 13.5 };
  await assert.rejects(
    () =>
      service.confirm({
        confirmationToken: staleResourceModel.confirmationToken,
      }),
    { code: "PAID_MEDIA_CONFIRMATION_STALE" },
  );
  assert.equal(admissionCalls.length, 1);

  cachedFavorite = { ...cachedFavorite, price: 12.5 };
  const staleArticleModel = await service.preflight(input);
  currentArticle = { ...currentArticle, content: "正文已修改" };
  await assert.rejects(
    () =>
      service.confirm({
        confirmationToken: staleArticleModel.confirmationToken,
      }),
    { code: "PAID_MEDIA_CONFIRMATION_STALE" },
  );
  assert.equal(admissionCalls.length, 1);
});

test("paid admission creates the target and batch without a staging row", () => {
  const root = workspace();
  const transitionPorts = {};
  const store = createOperationalStore({
    workspaceRoot: root,
    transitionPorts,
  });
  try {
    const result =
      transitionPorts.paidAdmissionTransitions.admitPaidBatch(
        paidAdmissionInput(),
      );
    assert.equal(result.status, "queued");
    assert.equal(store.listPaidSubmissionBatches().length, 1);
    assert.equal(
      store.listArticleLifecycleFacts({ articleIds: ["article-1"] })
        .submissionItems.length,
      1,
    );
    const db = new DatabaseSync(store.databasePath, { readOnly: true });
    try {
      assert.equal(
        db
          .prepare(
            "SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name='paid_staging_items'",
          )
          .get().count,
        0,
      );
      assert.equal(
        db
          .prepare("SELECT COUNT(*) AS count FROM submission_migration_notices")
          .get().count,
        0,
      );
    } finally {
      db.close();
    }
  } finally {
    store.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("v6 legacy paid selection migration records one safe notice and is atomic/retryable", () => {
  for (const point of [
    "before-v7",
    "after-v7-create",
    "after-v7-notice",
    "after-v7-clear",
    "after-v7-record",
  ]) {
    const root = workspace();
    const initial = createOperationalStore({ workspaceRoot: root });
    const database = initial.databasePath;
    initial.close();
    downgradeToV6WithLegacyRows(database);

    assert.throws(
      () =>
        createOperationalStore({
          workspaceRoot: root,
          internalMigrationFault(actual) {
            if (actual === point) throw new Error(`fault:${point}`);
          },
        }),
      { code: "OPERATIONAL_DATABASE_OPEN_FAILED" },
    );
    const failed = readLegacyMigrationState(database);
    assert.deepEqual(failed.versions, [1, 2, 3, 4, 5, 6]);
    assert.equal(failed.legacyCount, 1);
    assert.equal(failed.legacyRows.length, 2);
    assert.equal(failed.noticeCount, 0);

    const retried = createOperationalStore({ workspaceRoot: root });
    assert.equal(retried.verify().schemaVersion, 8);
    retried.close();
    const db = new DatabaseSync(database, { readOnly: true });
    try {
      assert.deepEqual(
        db
          .prepare("SELECT version FROM schema_migrations ORDER BY version")
          .all()
          .map((row) => row.version),
        [1, 2, 3, 4, 5, 6, 7, 8],
      );
      assert.equal(
        db
          .prepare(
            "SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name='paid_staging_items'",
          )
          .get().count,
        0,
      );
      const notice = db
        .prepare("SELECT * FROM submission_migration_notices")
        .get();
      assert.equal(notice.kind, "retired_paid_selection");
      assert.deepEqual(JSON.parse(notice.article_refs_json), [
        { clientId: "client-1", articleId: "article-a" },
        { clientId: "client-2", articleId: "article-b" },
      ]);
      assert.deepEqual(JSON.parse(notice.summary_json), {
        noticeCode: "PAID_SELECTION_RESELECT_REQUIRED",
        action: "reselect_paid_submission",
        articleCount: 2,
        sourceSchemaVersion: 6,
        targetSchemaVersion: 7,
      });
      assert.equal(notice.summary_json.includes("media-secret"), false);
      assert.equal(
        db
          .prepare("SELECT COUNT(*) AS count FROM paid_submission_batches")
          .get().count,
        0,
      );
      assert.equal(
        db.prepare("SELECT COUNT(*) AS count FROM publication_records").get()
          .count,
        0,
      );
    } finally {
      db.close();
    }
    fs.rmSync(root, { recursive: true, force: true });
  }
});
