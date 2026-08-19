"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const { DatabaseSync } = require("node:sqlite");

const domainPath = require.resolve("../src/domain");
require.cache[domainPath] = {
  id: domainPath,
  filename: domainPath,
  loaded: true,
  exports: {
    AccountProfileId: {
      parse(value) {
        if (typeof value !== "string" || !/^account-[A-Za-z0-9-]+$/.test(value)) {
          const error = new Error("ACCOUNT_PROFILE_ID_INVALID");
          error.code = "ACCOUNT_PROFILE_ID_INVALID";
          throw error;
        }
        return value;
      },
      serialize(value) {
        return value;
      },
    },
  },
};

const {
  createPublicationAggregate,
} = require("../src/infrastructure/operational-store/internal/operational-store-publication-aggregate");

function fail(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function harness() {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    PRAGMA foreign_keys=ON;
    CREATE TABLE account_profiles(
      account_profile_id TEXT PRIMARY KEY,
      platform_id TEXT NOT NULL,
      display_name TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE submission_queue_groups(
      queue_group_id TEXT PRIMARY KEY,
      platform_id TEXT NOT NULL,
      account_profile_id TEXT NOT NULL REFERENCES account_profiles(account_profile_id)
    );
    CREATE TABLE submission_queue_items(
      item_id TEXT PRIMARY KEY,
      queue_group_id TEXT NOT NULL REFERENCES submission_queue_groups(queue_group_id)
    );
    CREATE TABLE article_active_targets(
      article_id TEXT PRIMARY KEY,
      target_json TEXT NOT NULL
    );
    CREATE TABLE publication_records(
      publication_id TEXT PRIMARY KEY,
      target_json TEXT NOT NULL,
      status TEXT NOT NULL
    );
  `);
  const context = {
    db,
    open() {},
    transaction(operation) {
      db.exec("BEGIN IMMEDIATE");
      try {
        const result = operation();
        db.exec("COMMIT");
        return result;
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
    clock: () => new Date("2026-08-18T00:00:00.000Z"),
    randomUUID: () => "fixture",
    fail,
    iso: (clock) => clock().toISOString(),
  };
  const aggregate = createPublicationAggregate(context, {
    settle() {},
    activate() {},
    clear() {},
  });
  return { db, aggregate };
}

function insertProfile(db, id = "account-profile-1") {
  db.prepare(
    "INSERT INTO account_profiles(account_profile_id,platform_id,display_name,created_at) VALUES(?,?,?,?)",
  ).run(id, "lieju", "列举账号", "2026-08-18T00:00:00.000Z");
  return id;
}

test("unused account profile can be deleted, empty queue groups are removed, and history is preserved", () => {
  const { db, aggregate } = harness();
  try {
    const id = insertProfile(db);
    db.prepare(
      "INSERT INTO submission_queue_groups(queue_group_id,platform_id,account_profile_id) VALUES(?,?,?)",
    ).run("group-empty", "lieju", id);
    db.prepare(
      "INSERT INTO publication_records(publication_id,target_json,status) VALUES(?,?,?)",
    ).run(
      "publication-history-1",
      JSON.stringify({ kind: "platform", platformId: "lieju", accountProfileId: id }),
      "accepted",
    );
    const deleted = aggregate.deleteAccountProfile({ accountProfileId: id });
    assert.equal(deleted.accountProfileId, id);
    assert.equal(db.prepare("SELECT count(*) AS n FROM account_profiles").get().n, 0);
    assert.equal(db.prepare("SELECT count(*) AS n FROM submission_queue_groups").get().n, 0);
    assert.equal(db.prepare("SELECT count(*) AS n FROM publication_records").get().n, 1);
    assert.equal(
      JSON.parse(
        db.prepare("SELECT target_json FROM publication_records WHERE publication_id=?")
          .get("publication-history-1").target_json,
      ).accountProfileId,
      id,
    );
  } finally {
    db.close();
  }
});

test("account profile deletion is blocked while queue items still reference it", () => {
  const { db, aggregate } = harness();
  try {
    const id = insertProfile(db);
    db.prepare(
      "INSERT INTO submission_queue_groups(queue_group_id,platform_id,account_profile_id) VALUES(?,?,?)",
    ).run("group-active", "lieju", id);
    db.prepare(
      "INSERT INTO submission_queue_items(item_id,queue_group_id) VALUES(?,?)",
    ).run("item-1", "group-active");
    assert.throws(
      () => aggregate.deleteAccountProfile({ accountProfileId: id }),
      { code: "ACCOUNT_PROFILE_IN_USE" },
    );
    assert.equal(db.prepare("SELECT count(*) AS n FROM account_profiles").get().n, 1);
  } finally {
    db.close();
  }
});

test("account profile deletion is blocked while an active publication target references it", () => {
  const { db, aggregate } = harness();
  try {
    const id = insertProfile(db);
    db.prepare(
      "INSERT INTO article_active_targets(article_id,target_json) VALUES(?,?)",
    ).run(
      "article-1",
      JSON.stringify({ kind: "platform", platformId: "lieju", accountProfileId: id }),
    );
    assert.throws(
      () => aggregate.deleteAccountProfile({ accountProfileId: id }),
      { code: "ACCOUNT_PROFILE_IN_USE" },
    );
    assert.equal(db.prepare("SELECT count(*) AS n FROM account_profiles").get().n, 1);
  } finally {
    db.close();
  }
});
