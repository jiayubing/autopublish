const crypto = require("node:crypto");

const { fail, text } = require("./operational-store-utils");

const V4_CREATE_SCHEMA = `CREATE TABLE IF NOT EXISTS article_active_targets(article_id TEXT PRIMARY KEY NOT NULL, publication_id TEXT NOT NULL UNIQUE REFERENCES publication_records(publication_id), attempt_id TEXT NOT NULL UNIQUE REFERENCES publication_attempts(attempt_id), target_key TEXT NOT NULL, target_json TEXT NOT NULL, state TEXT NOT NULL CHECK(state IN('queued','remote_started','submitting','submitted','uncertain')), created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS active_target_attempt ON article_active_targets(attempt_id);
CREATE TABLE IF NOT EXISTS submission_queue_groups(queue_group_id TEXT PRIMARY KEY NOT NULL, platform_id TEXT NOT NULL, account_profile_id TEXT NOT NULL REFERENCES account_profiles(account_profile_id), pause_intent TEXT NOT NULL CHECK(pause_intent IN('none','manual','system')), revision INTEGER NOT NULL CHECK(revision > 0), created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(platform_id,account_profile_id));
CREATE INDEX IF NOT EXISTS queue_group_pause_intent ON submission_queue_groups(pause_intent,updated_at,queue_group_id);
CREATE TABLE IF NOT EXISTS submission_queue_items(item_id TEXT PRIMARY KEY NOT NULL REFERENCES submission_items(item_id), queue_group_id TEXT NOT NULL REFERENCES submission_queue_groups(queue_group_id), position INTEGER NOT NULL CHECK(position > 0), created_at TEXT NOT NULL, UNIQUE(queue_group_id,position));
CREATE INDEX IF NOT EXISTS queue_item_article ON submission_queue_items(item_id,queue_group_id);
CREATE TABLE IF NOT EXISTS paid_submission_batches(batch_id TEXT PRIMARY KEY NOT NULL REFERENCES submission_batches(batch_id), media_resource_id TEXT NOT NULL, confirmation_fingerprint TEXT NOT NULL, confirmation_json TEXT NOT NULL, system_submission_code TEXT NOT NULL, quoted_price REAL NOT NULL CHECK(quoted_price >= 0), estimated_total REAL NOT NULL CHECK(estimated_total >= 0), article_count INTEGER NOT NULL CHECK(article_count > 0), pause_intent TEXT NOT NULL CHECK(pause_intent IN('none','manual','system')), created_at TEXT NOT NULL, confirmed_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS paid_batch_pause_intent ON paid_submission_batches(pause_intent,updated_at,batch_id);
CREATE TABLE IF NOT EXISTS manual_reconciliation_facts(reconciliation_id TEXT PRIMARY KEY NOT NULL, attempt_id TEXT NOT NULL UNIQUE REFERENCES publication_attempts(attempt_id), article_id TEXT NOT NULL, decision TEXT NOT NULL CHECK(decision IN('accepted','not_accepted','order_bound','no_order')), evidence_json TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS manual_reconciliation_article ON manual_reconciliation_facts(article_id,created_at,reconciliation_id);`;

const V4_SCHEMA = `${V4_CREATE_SCHEMA}
ALTER TABLE order_display_snapshots ADD COLUMN media_resource_id TEXT;
ALTER TABLE order_display_snapshots ADD COLUMN estimated_total REAL;
ALTER TABLE order_display_snapshots ADD COLUMN system_submission_code TEXT;`;

function columns(db, name) {
  return db.prepare(`PRAGMA table_info(${JSON.stringify(name)})`).all().map(({ name: column, type, notnull, pk }) => ({
    name: column,
    type: String(type || "").toUpperCase(),
    notnull,
    pk,
  }));
}

function hasIndex(db, table, expected, unique) {
  return db.prepare(`PRAGMA index_list(${JSON.stringify(table)})`).all()
    .filter((index) => unique === undefined || index.unique === (unique ? 1 : 0))
    .some((index) => JSON.stringify(db.prepare(`PRAGMA index_info(${JSON.stringify(index.name)})`).all().map((column) => column.name)) === JSON.stringify(expected));
}

function hasForeignKey(db, table, from, target, to) {
  return db.prepare(`PRAGMA foreign_key_list(${JSON.stringify(table)})`).all().some((key) => key.from === from && key.table === target && key.to === to);
}

function sqlOf(db, name) {
  const row = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name=?").get(name);
  return row && row.sql ? row.sql : "";
}

function verifyV4Structure(db, errorCode) {
  const required = {
    article_active_targets: [["article_id", "TEXT", 1, 1], ["publication_id", "TEXT", 1, 0], ["attempt_id", "TEXT", 1, 0], ["target_key", "TEXT", 1, 0], ["target_json", "TEXT", 1, 0], ["state", "TEXT", 1, 0], ["created_at", "TEXT", 1, 0], ["updated_at", "TEXT", 1, 0]],
    submission_queue_groups: [["queue_group_id", "TEXT", 1, 1], ["platform_id", "TEXT", 1, 0], ["account_profile_id", "TEXT", 1, 0], ["pause_intent", "TEXT", 1, 0], ["revision", "INTEGER", 1, 0], ["created_at", "TEXT", 1, 0], ["updated_at", "TEXT", 1, 0]],
    submission_queue_items: [["item_id", "TEXT", 1, 1], ["queue_group_id", "TEXT", 1, 0], ["position", "INTEGER", 1, 0], ["created_at", "TEXT", 1, 0]],
    paid_submission_batches: [["batch_id", "TEXT", 1, 1], ["media_resource_id", "TEXT", 1, 0], ["confirmation_fingerprint", "TEXT", 1, 0], ["confirmation_json", "TEXT", 1, 0], ["system_submission_code", "TEXT", 1, 0], ["quoted_price", "REAL", 1, 0], ["estimated_total", "REAL", 1, 0], ["article_count", "INTEGER", 1, 0], ["pause_intent", "TEXT", 1, 0], ["created_at", "TEXT", 1, 0], ["confirmed_at", "TEXT", 1, 0], ["updated_at", "TEXT", 1, 0]],
    manual_reconciliation_facts: [["reconciliation_id", "TEXT", 1, 1], ["attempt_id", "TEXT", 1, 0], ["article_id", "TEXT", 1, 0], ["decision", "TEXT", 1, 0], ["evidence_json", "TEXT", 1, 0], ["created_at", "TEXT", 1, 0]],
  };
  const validTables = Object.entries(required).every(([name, expected]) => {
    const actual = columns(db, name);
    return actual.length === expected.length && expected.every(([column, type, notnull, pk], index) => actual[index] && actual[index].name === column && actual[index].type === type && actual[index].notnull === notnull && actual[index].pk === pk);
  });
  const order = columns(db, "order_display_snapshots");
  const orderExpected = [["attempt_id", "TEXT", 1, 1], ["title_snapshot", "TEXT", 1, 0], ["filename", "TEXT", 1, 0], ["resource_name_snapshot", "TEXT", 1, 0], ["quoted_price", "REAL", 0, 0], ["created_at", "TEXT", 1, 0], ["media_resource_id", "TEXT", 0, 0], ["estimated_total", "REAL", 0, 0], ["system_submission_code", "TEXT", 0, 0]];
  const validOrder = order.length === orderExpected.length && orderExpected.every(([column, type, notnull, pk], index) => order[index] && order[index].name === column && order[index].type === type && order[index].notnull === notnull && order[index].pk === pk);
  const validForeignKeys = hasForeignKey(db, "article_active_targets", "publication_id", "publication_records", "publication_id") && hasForeignKey(db, "article_active_targets", "attempt_id", "publication_attempts", "attempt_id") && hasForeignKey(db, "submission_queue_groups", "account_profile_id", "account_profiles", "account_profile_id") && hasForeignKey(db, "submission_queue_items", "item_id", "submission_items", "item_id") && hasForeignKey(db, "submission_queue_items", "queue_group_id", "submission_queue_groups", "queue_group_id") && hasForeignKey(db, "paid_submission_batches", "batch_id", "submission_batches", "batch_id") && hasForeignKey(db, "manual_reconciliation_facts", "attempt_id", "publication_attempts", "attempt_id") && hasForeignKey(db, "order_display_snapshots", "attempt_id", "publication_attempts", "attempt_id");
  const validIndexes = hasIndex(db, "article_active_targets", ["article_id"], true) && hasIndex(db, "article_active_targets", ["publication_id"], true) && hasIndex(db, "article_active_targets", ["attempt_id"], true) && hasIndex(db, "submission_queue_groups", ["platform_id", "account_profile_id"], true) && hasIndex(db, "submission_queue_items", ["queue_group_id", "position"], true) && hasIndex(db, "manual_reconciliation_facts", ["attempt_id"], true);
  const validChecks = /CHECK\s*\(\s*state\s+IN\s*\(\s*'queued'\s*,\s*'remote_started'\s*,\s*'submitting'\s*,\s*'submitted'\s*,\s*'uncertain'\s*\)\s*\)/i.test(sqlOf(db, "article_active_targets")) && /CHECK\s*\(\s*pause_intent\s+IN\s*\(\s*'none'\s*,\s*'manual'\s*,\s*'system'\s*\)\s*\)/i.test(sqlOf(db, "submission_queue_groups")) && /CHECK\s*\(\s*decision\s+IN\s*\(\s*'accepted'\s*,\s*'not_accepted'\s*,\s*'order_bound'\s*,\s*'no_order'\s*\)\s*\)/i.test(sqlOf(db, "manual_reconciliation_facts"));
  if (!validTables || !validOrder || !validForeignKeys || !validIndexes || !validChecks) throw fail(errorCode);
}

function installV4Schema(db, errorCode) {
  db.exec(V4_CREATE_SCHEMA);
  const existing = new Set(columns(db, "order_display_snapshots").map((column) => column.name));
  for (const [name, type] of [["media_resource_id", "TEXT"], ["estimated_total", "REAL"], ["system_submission_code", "TEXT"]])
    if (!existing.has(name)) db.exec(`ALTER TABLE order_display_snapshots ADD COLUMN ${name} ${type}`);
  verifyV4Structure(db, errorCode);
}

function orderDisplayDataHash(db) {
  return crypto.createHash("sha256").update(text(db.prepare("SELECT attempt_id,title_snapshot,filename,resource_name_snapshot,quoted_price,created_at FROM order_display_snapshots ORDER BY attempt_id").all())).digest("hex");
}

function migrateV4Schema(db, migrationHook, helpers) {
  const { tableDataHashes, verifyTableDataHashes, verifyMigrationHistory } = helpers;
  const fault = (point) => { if (migrationHook) migrationHook(point, db); };
  helpers.runTransaction(db, () => {
    const before = tableDataHashes(db, ["order_display_snapshots"]);
    const beforeOrderDisplay = orderDisplayDataHash(db);
    fault("before-v4");
    installV4Schema(db, "OPERATIONAL_SCHEMA_MIGRATION_INVALID");
    fault("after-v4-create");
    verifyTableDataHashes(db, before, "OPERATIONAL_SCHEMA_MIGRATION_INVALID");
    if (orderDisplayDataHash(db) !== beforeOrderDisplay) throw fail("OPERATIONAL_SCHEMA_MIGRATION_INVALID");
    verifyV4Structure(db, "OPERATIONAL_SCHEMA_MIGRATION_INVALID");
    fault("after-v4-verify");
    verifyTableDataHashes(db, before, "OPERATIONAL_SCHEMA_MIGRATION_INVALID");
    if (orderDisplayDataHash(db) !== beforeOrderDisplay) throw fail("OPERATIONAL_SCHEMA_MIGRATION_INVALID");
    db.prepare("INSERT INTO schema_migrations VALUES(4,?)").run(new Date().toISOString());
    fault("after-v4-record");
    verifyMigrationHistory(db, [1, 2, 3, 4], "OPERATIONAL_SCHEMA_MIGRATION_INVALID");
  });
}

module.exports = { V4_SCHEMA, V4_CREATE_SCHEMA, installV4Schema, verifyV4Structure, migrateV4Schema };
