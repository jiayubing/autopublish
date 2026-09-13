const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { DatabaseSync } = require("node:sqlite");
const {
  createOperationalStore,
} = require("../src/infrastructure/operational-store/operational-store");
const {
  createRegularQueueGroupQuery,
} = require("../desktop/services/regular-queue-group-query");
const {
  createSubmissionCenterSnapshot,
} = require("../desktop/services/submission-center-snapshot");
const {
  productionIpcRegistry,
} = require("../desktop/ipc/contracts/production-registry");

const BODY = "SYNTHETIC_BODY_MUST_NOT_REACH_LIST".repeat(40);
const REMAINING_PREVIEW_MAX = 50;

function fixture(itemCount, groupCount, prepare) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "regular-pagination-"));
  let ports = {};
  let store = createOperationalStore({
    workspaceRoot: root,
    transitionPorts: ports,
  });
  const account = store.createAccountProfile({
    platformId: "hepan",
    displayName: "Synthetic account",
  });
  const admitted = ports.regularQueueTransitions.admitRegularQueueItems([
    {
      clientId: "CLIENTSEED",
      articleId: "ARTICLESEED",
      batchId: "BATCHSEED",
      itemId: "ITEMSEED",
      publicationId: "PUBLICATIONSEED",
      attemptId: "ATTEMPTSEED",
      payload: { clientId: "CLIENTSEED" },
      publicationSnapshot: {
        articleId: "ARTICLESEED",
        title: "Synthetic title",
        body: BODY,
        fingerprint: "a".repeat(64),
      },
      target: {
        kind: "platform",
        platformId: "hepan",
        accountProfileId: account.accountProfileId,
      },
    },
  ])[0];
  if (admitted.error) throw admitted.error;
  const groupId = admitted.result.queueGroupId;
  const accountId = account.accountProfileId;
  const filename = store.databasePath;
  store.close();
  const db = new DatabaseSync(filename);
  try {
    const tables = [
      "account_profiles",
      "submission_queue_groups",
      "submission_batches",
      "publication_records",
      "publication_attempts",
      "recovery_intents",
      "submission_items",
      "article_active_targets",
      "submission_queue_items",
    ];
    const template = Object.fromEntries(
      tables.map((table) => [table, db.prepare(`SELECT * FROM ${table}`).all()]),
    );
    const generatedIntent = template.recovery_intents[0].intent_id;
    db.exec("PRAGMA foreign_keys=OFF; BEGIN");
    for (const table of tables) db.exec(`DELETE FROM ${table}`);
    const inserts = Object.fromEntries(
      tables.map((table) => {
        const keys = Object.keys(template[table][0]);
        return [
          table,
          {
            keys,
            statement: db.prepare(
              `INSERT INTO ${table}(${keys.join(",")}) VALUES(${keys
                .map(() => "?")
                .join(",")})`,
            ),
          },
        ];
      }),
    );
    function replace(value, i, g) {
      if (typeof value !== "string") return value;
      const suffix = String(i).padStart(6, "0");
      const groupSuffix = String(g).padStart(6, "0");
      return Object.entries({
        [generatedIntent]: `intent-${suffix}`,
        CLIENTSEED: `client-${i % 2}`,
        ARTICLESEED: `article-${suffix}`,
        BATCHSEED: `batch-${suffix}`,
        ITEMSEED: `item-${suffix}`,
        PUBLICATIONSEED: `publication-${suffix}`,
        ATTEMPTSEED: `attempt-${suffix}`,
        [accountId]: `account-${groupSuffix}`,
        [groupId]: `group-${groupSuffix}`,
      }).reduce(
        (text, [from, to]) => text.split(from).join(to),
        value,
      );
    }
    for (let g = 0; g < groupCount; g++) {
      for (const table of ["account_profiles", "submission_queue_groups"]) {
        const { keys, statement } = inserts[table];
        statement.run(
          ...keys.map((key) => replace(template[table][0][key], g, g)),
        );
      }
    }
    for (let i = 0; i < itemCount; i++) {
      const g = i % groupCount;
      for (const table of [
        "submission_batches",
        "publication_records",
        "publication_attempts",
        "recovery_intents",
        "submission_items",
        "article_active_targets",
        "submission_queue_items",
      ]) {
        const { keys, statement } = inserts[table];
        statement.run(
          ...keys.map((key) =>
            table === "submission_queue_items" && key === "position"
              ? Math.floor(i / groupCount) + 1
              : replace(template[table][0][key], i, g),
          ),
        );
      }
    }
    if (prepare) prepare(db);
    db.exec("COMMIT; PRAGMA foreign_keys=ON");
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  } finally {
    db.close();
  }
  ports = {};
  store = createOperationalStore({
    workspaceRoot: root,
    transitionPorts: ports,
  });
  const query = createRegularQueueGroupQuery({
    groupTransitions: ports.regularQueueGroupTransitions,
  });
  const center = createSubmissionCenterSnapshot({
    getRevision: () => 1,
    getWorkspaceRuntimeId: () => "test",
    validateClient: () => {},
    listRegularQueueGroups: query.listRegularQueueGroups,
    listPaidMediaBatches: (input) => ({
      items: [],
      total: 0,
      page: (input && input.page) || 1,
      pageSize: (input && input.pageSize) || 10,
    }),
    listAttention: () => ({ items: [] }),
  });
  return {
    store,
    ports,
    query,
    center,
    close() {
      store.close();
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
}

function instrumentSql() {
  const originalPrepare = DatabaseSync.prototype.prepare;
  const stats = { calls: 0, rows: 0, bytes: 0, remainingRows: 0, clientIds: [] };
  DatabaseSync.prototype.prepare = function (sql) {
    const statement = originalPrepare.call(this, sql);
    const remainingQuery = /submission_queue_items/.test(sql) && /queued/.test(sql);
    for (const method of ["get", "all"]) {
      const original = statement[method];
      statement[method] = function (...args) {
        const result = original.apply(this, args);
        stats.calls += 1;
        const rows = Array.isArray(result) ? result : result ? [result] : [];
        stats.rows += rows.length;
        const json = JSON.stringify(result);
        assert.equal(json.includes("SYNTHETIC_BODY_MUST_NOT_REACH_LIST"), false);
        stats.bytes += Buffer.byteLength(json);
        if (remainingQuery && method === "all") {
          stats.remainingRows += rows.length;
          for (const row of rows) {
            const clientId = row.client_id || row.clientId;
            if (typeof clientId === "string") stats.clientIds.push(clientId);
          }
        }
        return result;
      };
    }
    return statement;
  };
  return {
    stats,
    restore() {
      DatabaseSync.prototype.prepare = originalPrepare;
    },
  };
}

test("regular pages reach beyond 20000 groups with correct counts, client filtering and bounded remaining", async () => {
  const value = fixture(20003, 20003);
  const sql = instrumentSql();
  try {
    const first = await value.center.get({ page: 1, pageSize: 10 });
    assert.equal(first.counts.regularItems, 20003);
    assert.equal(first.regular.groups.length, 10);
    assert.equal(first.regular.groups[0].queueGroupId, "group-000000");
    assert.equal(first.regular.groups[0].remainingCount, 1);
    assert.equal(first.regular.groups[0].remaining.length, 1);
    assert.equal(first.hasMore, true);
    assert.ok(sql.stats.remainingRows <= 500, `remaining SQL rows: ${sql.stats.remainingRows}`);
    assert.ok(sql.stats.bytes < 500000, `Unexpected list read bytes: ${sql.stats.bytes}`);

    const last = await value.center.get({ page: 2001, pageSize: 10 });
    assert.deepEqual(
      last.regular.groups.map((row) => row.queueGroupId),
      ["group-020000", "group-020001", "group-020002"],
    );
    assert.equal(last.counts.regularItems, 20003);
    assert.equal(last.counts.total, 20003);
    assert.equal(last.hasMore, false);
    assert.ok(last.regular.groups.every((group) => group.remainingCount === 1));
    assert.ok(last.regular.groups.every((group) => group.remaining.length === 1));

    const empty = await value.center.get({ page: 2002, pageSize: 10 });
    assert.equal(empty.regular.groups.length, 0);
    assert.equal(empty.counts.regularItems, 20003);
    assert.equal(empty.hasMore, false);

    sql.stats.clientIds.length = 0;
    sql.stats.remainingRows = 0;
    const client = await value.center.get({
      clientId: "client-0",
      page: 1001,
      pageSize: 10,
    });
    assert.equal(client.counts.regularItems, 10002);
    assert.deepEqual(
      client.regular.groups.map((row) => row.queueGroupId),
      ["group-020000", "group-020002"],
    );
    assert.equal(client.hasMore, false);
    assert.ok(sql.stats.clientIds.every((id) => id === "client-0"));
    assert.ok(sql.stats.remainingRows < 20003);

    const wire = productionIpcRegistry.success(
      productionIpcRegistry.byChannel("content:get-submission-center-snapshot"),
      last,
    );
    assert.equal(wire.ok, true);
  } finally {
    sql.restore();
    value.close();
  }
});

test("a long regular queue keeps remaining bounded while remainingCount stays complete", async () => {
  const value = fixture(120, 1);
  const sql = instrumentSql();
  try {
    const first = await value.center.get({ page: 1, pageSize: 10 });
    assert.equal(first.counts.regularItems, 120);
    assert.equal(first.regular.groups.length, 1);
    assert.equal(first.regular.groups[0].remainingCount, 120);
    assert.ok(first.regular.groups[0].remaining.length <= REMAINING_PREVIEW_MAX);
    assert.equal(first.regular.groups[0].remaining[0].itemId, "item-000000");
    assert.equal(first.hasMore, false);
    assert.ok(
      sql.stats.remainingRows < 120,
      `remaining SQL rows should not load the full long queue: ${sql.stats.remainingRows}`,
    );
    const unpaged = value.ports.regularQueueGroupTransitions.listRegularQueueGroupSnapshots(
      {},
    );
    assert.equal(unpaged[0].remainingCount, 120);
    assert.ok(unpaged[0].remaining.length <= REMAINING_PREVIEW_MAX);
  } finally {
    sql.restore();
    value.close();
  }
});

test("regular page metadata rejects unsafe offsets and does not mix group id with paging", () => {
  const value = fixture(3, 3);
  try {
    for (const input of [
      { page: 0 },
      { page: 1, pageSize: 501 },
      { page: Number.MAX_SAFE_INTEGER, pageSize: 500 },
      { page: 1, pageSize: 10, queueGroupId: "group-000000" },
    ])
      assert.throws(
        () =>
          value.ports.regularQueueGroupTransitions.listRegularQueueGroupSnapshots(
            input,
          ),
        { code: "OPERATIONAL_QUEUE_PAGE_INVALID" },
      );
  } finally {
    value.close();
  }
});
