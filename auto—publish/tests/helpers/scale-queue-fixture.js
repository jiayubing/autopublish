"use strict";
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { DatabaseSync } = require("node:sqlite");
const {
  createOperationalStore,
} = require("../../src/infrastructure/operational-store/operational-store");
function seedQueue({ count: n, groups, kind = "regular", prepare }) {
  const workspace = fs.mkdtempSync(
    path.join(os.tmpdir(), "autopublish-scale-audit-"),
  );
  const ports = {};
  const store = createOperationalStore({
    workspaceRoot: workspace,
    transitionPorts: ports,
  });
  const body = "x".repeat(4096);
  const input = {
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
      body,
      fingerprint: "a".repeat(64),
    },
  };
  let accountId, groupId;
  if (kind === "regular") {
    accountId = store.createAccountProfile({
      platformId: "hepan",
      displayName: "Synthetic account",
    }).accountProfileId;
    input.target = {
      kind: "platform",
      platformId: "hepan",
      accountProfileId: accountId,
    };
    const result = ports.regularQueueTransitions.admitRegularQueueItems([
      input,
    ])[0];
    if (result.error) throw result.error;
    groupId = result.result.queueGroupId;
    if (
      ports.regularQueueGroupTransitions.listRegularQueueGroupSnapshots({})[0]
        .remaining.length !== 1
    )
      throw new Error("SEED_QUERY_INVALID");
  } else {
    input.articleRef = { clientId: input.clientId, articleId: input.articleId };
    input.customerSnapshotV1 = {
      version: 1,
      clientId: input.clientId,
      displayName: "Synthetic customer",
    };
    ports.paidAdmissionTransitions.admitPaidBatch({
      batchId: "BATCHSEED",
      articleCount: 1,
      target: { kind: "media", mediaResourceId: "MEDIASEED" },
      confirmationFingerprint: "b".repeat(64),
      confirmation: {
        version: 1,
        articleRefs: [input.articleRef],
        mediaResourceId: "MEDIASEED",
        quotedPrice: 12.5,
        confirmedAt: "2026-09-12T00:00:00.000Z",
      },
      systemSubmissionCode: "SYSTEMSEED",
      quotedPrice: 12.5,
      estimatedTotal: 12.5,
      items: [input],
    });
    if (store.listPaidSubmissionBatchSnapshots({})[0].items.length !== 1)
      throw new Error("SEED_QUERY_INVALID");
  }
  const filename = store.databasePath;
  store.close();
  const db = new DatabaseSync(filename);
  const tables = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
    )
    .all()
    .map((x) => x.name);
  const template = Object.fromEntries(
    tables.map((t) => [t, db.prepare(`SELECT * FROM "${t}"`).all()]),
  );
  const perTask = [
    "submission_batches",
    "publication_records",
    "publication_attempts",
    "submission_items",
    "recovery_intents",
    "article_active_targets",
    "submission_queue_items",
  ];
  if (kind === "paid") perTask.push("paid_submission_batches");
  const groupTables =
    kind === "regular" ? ["account_profiles", "submission_queue_groups"] : [];
  const generatedIds = [
    ...new Set(
      perTask.flatMap((t) =>
        (template[t] || []).flatMap((row) =>
          Object.entries(row)
            .filter(
              ([key, value]) =>
                key.endsWith("_id") &&
                typeof value === "string" &&
                value !== accountId &&
                value !== groupId &&
                !value.includes("SEED"),
            )
            .map(([, value]) => value),
        ),
      ),
    ),
  ];
  const replace = (v, i, g) => {
    if (typeof v !== "string") return v;
    const replacements = {
      CLIENTSEED: `client-${i % 10}`,
      ARTICLESEED: `article-${i}`,
      BATCHSEED: `batch-${i}`,
      ITEMSEED: `item-${i}`,
      PUBLICATIONSEED: `publication-${i}`,
      ATTEMPTSEED: `attempt-${i}`,
      SYSTEMSEED: `system-${i}`,
      MEDIASEED: `media-${g}`,
    };
    if (kind === "regular" && false)
      replacements.hepan = g % 2 ? "lieju" : "hepan";
    generatedIds.forEach((id, index) => {
      replacements[id] = `generated-${index}-${i}`;
    });
    if (accountId) replacements[accountId] = `account-${g}`;
    if (groupId) replacements[groupId] = `group-${String(g).padStart(6, "0")}`;
    for (const [from, to] of Object.entries(replacements))
      v = v.split(from).join(to);
    return v;
  };
  const insert = (t) => {
    const columns = Object.keys(template[t]?.[0] || {});
    if (!columns.length) return null;
    return {
      columns,
      statement: db.prepare(
        `INSERT INTO "${t}" (${columns.map((x) => `"${x}"`).join(",")}) VALUES (${columns.map(() => "?").join(",")})`,
      ),
    };
  };
  const statements = Object.fromEntries(
    [...groupTables, ...perTask].map((t) => [t, insert(t)]),
  );
  db.exec("PRAGMA foreign_keys=OFF; BEGIN");
  for (const t of [...groupTables, ...perTask]) db.exec(`DELETE FROM "${t}"`);
  const add = (t, i, g) => {
    const stmt = statements[t];
    if (!stmt) return;
    for (const row of template[t])
      stmt.statement.run(
        ...stmt.columns.map((c) => {
          if (t === "submission_queue_items" && c === "position")
            return Math.floor(i / groups) + 1;
          return replace(row[c], i, g);
        }),
      );
  };
  for (let g = 0; g < groups; g++) for (const t of groupTables) add(t, g, g);
  for (let i = 0; i < n; i++) for (const t of perTask) add(t, i, i % groups);
  if (prepare) prepare(db);
  db.exec("COMMIT; PRAGMA foreign_keys=ON");
  const violations = db.prepare("PRAGMA foreign_key_check").all();
  db.close();
  if (violations.length) throw new Error("INVALID_SYNTHETIC_FOREIGN_KEYS");
  return workspace;
}
module.exports = { seedQueue };
