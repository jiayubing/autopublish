"use strict";

const crypto = require("node:crypto");

const domain = require("../../../domain");
const { SCHEMA_VERSION } = require("./operational-store-schema");
const { text, fromText } = require("./operational-store-utils");

const FINGERPRINT = /^[a-f0-9]{64}$/u;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const JOURNAL_PHASES = new Set([
  "detected",
  "backed_up",
  "confirmed",
  "import_committed",
  "verified",
]);

function createOperationalStoreMigrationImport(context) {
  const { db, open, transaction, clock, fail, iso } = context;
  const faultHook = context.internalMigrationImportFault;

  function fault(point, detail) {
    if (faultHook) faultHook(point, Object.freeze(detail || {}));
  }

  function exact(input, fields, code) {
    if (
      !input ||
      typeof input !== "object" ||
      Array.isArray(input) ||
      Object.keys(input).sort().join("\u0000") !==
        [...fields].sort().join("\u0000")
    )
      throw fail(code);
  }

  function safeId(value, code) {
    if (typeof value !== "string" || !SAFE_ID.test(value)) throw fail(code);
    return value;
  }

  function fingerprint(value, code, nullable = false) {
    if (nullable && value === null) return null;
    if (typeof value !== "string" || !FINGERPRINT.test(value)) throw fail(code);
    return value;
  }

  function optionalId(value, code) {
    if (value === null) return null;
    return safeId(value, code);
  }

  function projectJournal(row) {
    if (!row) return null;
    return Object.freeze({
      migrationRunId: row.migration_run_id,
      workspaceFingerprint: row.workspace_fingerprint,
      sourceFingerprint: row.source_fingerprint,
      planFingerprint: row.plan_fingerprint,
      sourceVersion: row.source_version,
      phase: row.phase,
      backupIdentity: row.backup_identity,
      confirmationFingerprint: row.confirmation_fingerprint,
      importCommitFingerprint: row.import_commit_fingerprint,
      verificationFingerprint: row.verification_fingerprint,
      importedSchemaVersion: row.imported_schema_version,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  }

  function journalRow(migrationRunId) {
    return db
      .prepare("SELECT * FROM migration_journals WHERE migration_run_id=?")
      .get(migrationRunId);
  }

  function bootstrapMigrationJournal(input) {
    open();
    const code = "MIGRATION_JOURNAL_BOOTSTRAP_INVALID";
    exact(
      input,
      [
        "migrationRunId",
        "workspaceFingerprint",
        "sourceFingerprint",
        "planFingerprint",
        "sourceVersion",
      ],
      code,
    );
    const value = {
      migrationRunId: safeId(input.migrationRunId, code),
      workspaceFingerprint: fingerprint(input.workspaceFingerprint, code),
      sourceFingerprint: fingerprint(input.sourceFingerprint, code),
      planFingerprint: fingerprint(input.planFingerprint, code),
      sourceVersion: input.sourceVersion,
    };
    if (!Number.isSafeInteger(value.sourceVersion) || value.sourceVersion < 1)
      throw fail(code);
    const stamp = iso(clock);
    return transaction(() => {
      const existing = journalRow(value.migrationRunId);
      if (existing) {
        if (
          existing.workspace_fingerprint !== value.workspaceFingerprint ||
          existing.source_fingerprint !== value.sourceFingerprint ||
          existing.plan_fingerprint !== value.planFingerprint ||
          existing.source_version !== value.sourceVersion
        )
          throw fail("MIGRATION_JOURNAL_IDENTITY_CONFLICT");
        return projectJournal(existing);
      }
      db.prepare(
        "INSERT INTO migration_journals(migration_run_id,workspace_fingerprint,source_fingerprint,plan_fingerprint,source_version,phase,backup_identity,confirmation_fingerprint,import_commit_fingerprint,verification_fingerprint,imported_schema_version,created_at,updated_at) VALUES(?,?,?,?,?,'detected',NULL,NULL,NULL,NULL,NULL,?,?)",
      ).run(
        value.migrationRunId,
        value.workspaceFingerprint,
        value.sourceFingerprint,
        value.planFingerprint,
        value.sourceVersion,
        stamp,
        stamp,
      );
      return projectJournal(journalRow(value.migrationRunId));
    });
  }

  function readMigrationJournal(input) {
    open();
    exact(input, ["migrationRunId"], "MIGRATION_JOURNAL_READ_INVALID");
    return projectJournal(
      journalRow(
        safeId(input.migrationRunId, "MIGRATION_JOURNAL_READ_INVALID"),
      ),
    );
  }

  function persistMigrationJournalMetadata(input) {
    open();
    const code = "MIGRATION_JOURNAL_METADATA_INVALID";
    exact(
      input,
      [
        "migrationRunId",
        "expectedPhase",
        "phase",
        "backupIdentity",
        "confirmationFingerprint",
        "verificationFingerprint",
      ],
      code,
    );
    const migrationRunId = safeId(input.migrationRunId, code);
    if (
      !JOURNAL_PHASES.has(input.expectedPhase) ||
      !JOURNAL_PHASES.has(input.phase) ||
      input.phase === "import_committed"
    )
      throw fail(code);
    const backupIdentity = optionalId(input.backupIdentity, code);
    const confirmationFingerprint = fingerprint(
      input.confirmationFingerprint,
      code,
      true,
    );
    const verificationFingerprint = fingerprint(
      input.verificationFingerprint,
      code,
      true,
    );
    if (
      (["backed_up", "confirmed", "verified"].includes(input.phase) &&
        backupIdentity === null) ||
      (["confirmed", "verified"].includes(input.phase) &&
        confirmationFingerprint === null) ||
      (input.phase === "verified" && verificationFingerprint === null)
    )
      throw fail(code);
    const stamp = iso(clock);
    return transaction(() => {
      const row = journalRow(migrationRunId);
      if (!row) throw fail("MIGRATION_JOURNAL_NOT_FOUND");
      if (row.phase !== input.expectedPhase)
        throw fail("MIGRATION_JOURNAL_PHASE_CONFLICT");
      if (input.phase === "verified" && !row.import_commit_fingerprint)
        throw fail("MIGRATION_JOURNAL_IMPORT_REQUIRED");
      const changed = db
        .prepare(
          "UPDATE migration_journals SET phase=?,backup_identity=?,confirmation_fingerprint=?,verification_fingerprint=?,updated_at=? WHERE migration_run_id=? AND phase=?",
        )
        .run(
          input.phase,
          backupIdentity,
          confirmationFingerprint,
          verificationFingerprint,
          stamp,
          migrationRunId,
          input.expectedPhase,
        ).changes;
      if (changed !== 1) throw fail("MIGRATION_JOURNAL_PHASE_CONFLICT");
      return projectJournal(journalRow(migrationRunId));
    });
  }

  function hashId(prefix, value) {
    return `${prefix}-${crypto.createHash("sha256").update(value).digest("hex").slice(0, 32)}`;
  }

  function targetOf(identity) {
    const { version: _version, ...target } = identity;
    return domain.parsePublicationTarget(target);
  }

  function identities(entry, targetIdentityV1, attemptId) {
    const articleId = entry.articleIdentityV1.articleId;
    const target = targetOf(targetIdentityV1);
    return {
      articleId,
      target,
      targetKey: domain.publicationTargetKey(target),
      publicationId: hashId("migration-publication", entry.entryId),
      attemptId: attemptId || hashId("migration-attempt", entry.entryId),
    };
  }

  function assertArticleVacant(entry) {
    const articleId = entry.articleIdentityV1.articleId;
    if (
      db
        .prepare("SELECT 1 FROM publication_records WHERE article_id=? LIMIT 1")
        .get(articleId) ||
      db
        .prepare(
          "SELECT 1 FROM migration_import_entries WHERE article_id=? LIMIT 1",
        )
        .get(articleId) ||
      db
        .prepare("SELECT 1 FROM submission_items WHERE article_id=? LIMIT 1")
        .get(articleId)
    )
      throw fail("MIGRATION_IMPORT_ARTICLE_CONFLICT");
  }

  function insertPublication(
    entry,
    targetIdentityV1,
    attemptId,
    status,
    stamp,
  ) {
    const ids = identities(entry, targetIdentityV1, attemptId);
    db.prepare("INSERT INTO publication_records VALUES(?,?,?,?,?,?,?)").run(
      ids.publicationId,
      ids.articleId,
      ids.targetKey,
      text(ids.target),
      status,
      stamp,
      stamp,
    );
    db.prepare("INSERT INTO publication_attempts VALUES(?,?,?,?,?)").run(
      ids.attemptId,
      ids.publicationId,
      status,
      stamp,
      ["published", "failed"].includes(status) ? stamp : null,
    );
    return ids;
  }

  function writeEvidence(attemptId, remoteId, value, stamp) {
    db.prepare(
      "INSERT INTO remote_evidence(evidence_id,attempt_id,remote_id,remote_url,evidence_json,created_at) VALUES(?,?,?,?,?,?)",
    ).run(
      hashId("migration-evidence", `${attemptId}\u0000${remoteId}`),
      attemptId,
      remoteId,
      value && value.remoteUrl ? value.remoteUrl : null,
      text(value),
      stamp,
    );
  }

  function orderHistoryFromObservation(observation) {
    return domain.parseOrderHistoryV1({
      version: 1,
      orderIdentityV1: observation.orderIdentityV1,
      entries: [
        { sequence: 1, kind: "observation", orderObservationV1: observation },
      ],
    });
  }

  function writeOrder(ids, snapshot, history, stamp) {
    const orderId = snapshot.orderIdentityV1.orderId;
    db.prepare("INSERT INTO remote_orders VALUES(?,?,?,?,?)").run(
      orderId,
      ids.attemptId,
      orderId,
      text(snapshot),
      stamp,
    );
    db.prepare(
      "INSERT INTO order_display_snapshots(attempt_id,title_snapshot,filename,resource_name_snapshot,quoted_price,created_at,media_resource_id,estimated_total,system_submission_code) VALUES(?,?,?,?,?,?,?,?,?)",
    ).run(
      ids.attemptId,
      snapshot.submittedTitle,
      "",
      snapshot.mediaName,
      snapshot.quotedPrice,
      stamp,
      snapshot.targetIdentityV1.mediaResourceId,
      snapshot.estimatedTotal,
      snapshot.systemSubmissionCode,
    );
    writeEvidence(ids.attemptId, `order-history:${orderId}`, history, stamp);
  }

  function importPublished(entry, stamp) {
    const payload = entry.payload;
    const ids = insertPublication(
      entry,
      payload.terminalTargetV1.targetIdentityV1,
      payload.terminalTargetV1.attemptId,
      "published",
      stamp,
    );
    writeEvidence(
      ids.attemptId,
      `publication-success:${ids.attemptId}`,
      payload.publicationEvidenceV1,
      stamp,
    );
    if (payload.orderHistoryV1)
      writeEvidence(
        ids.attemptId,
        `migration-order-history:${payload.orderHistoryV1.orderIdentityV1.orderId}`,
        payload.orderHistoryV1,
        stamp,
      );
  }

  function importTrackable(entry, stamp) {
    const payload = entry.payload;
    const ids = insertPublication(
      entry,
      payload.paidTargetV1.targetIdentityV1,
      payload.paidTargetV1.orderCreationAttemptId,
      "submitted",
      stamp,
    );
    writeOrder(
      ids,
      payload.orderSnapshotV1,
      orderHistoryFromObservation(payload.orderObservationV1),
      stamp,
    );
    db.prepare(
      "INSERT INTO article_active_targets(article_id,publication_id,attempt_id,target_key,target_json,state,created_at,updated_at) VALUES(?,?,?,?,?,'submitted',?,?)",
    ).run(
      ids.articleId,
      ids.publicationId,
      ids.attemptId,
      ids.targetKey,
      text(ids.target),
      stamp,
      stamp,
    );
    if (payload.orderObservationV1.statusCode === "9")
      db.prepare(
        "INSERT INTO recovery_intents(intent_id,attempt_id,state,payload_json,created_at,updated_at) VALUES(?,?,'manual_check',?,?,?)",
      ).run(
        hashId("migration-attention", entry.entryId),
        ids.attemptId,
        text({ detail: { code: "MIGRATION_PAID_STATUS_9" } }),
        stamp,
        stamp,
      );
  }

  function importClosed(entry, closedTargetV1, orderHistoryV1, stamp) {
    const ids = insertPublication(
      entry,
      closedTargetV1.targetIdentityV1,
      closedTargetV1.attemptId,
      "failed",
      stamp,
    );
    writeEvidence(
      ids.attemptId,
      `migration-closed-target:${entry.entryId}`,
      closedTargetV1,
      stamp,
    );
    if (orderHistoryV1)
      writeEvidence(
        ids.attemptId,
        `migration-order-history:${orderHistoryV1.orderIdentityV1.orderId}`,
        orderHistoryV1,
        stamp,
      );
  }

  function importEntry(entry, migrationRunId, stamp) {
    assertArticleVacant(entry);
    if (entry.variant === "publishedEvidence") importPublished(entry, stamp);
    else if (entry.variant === "trackablePaidOrder")
      importTrackable(entry, stamp);
    else if (entry.variant === "pendingReadmission")
      importClosed(entry, entry.payload.closedTargetV1, null, stamp);
    else if (entry.variant === "nonPublishedTerminal")
      importClosed(
        entry,
        entry.payload.closedTargetV1,
        entry.payload.orderHistoryV1,
        stamp,
      );
    db.prepare(
      "INSERT INTO migration_import_entries(entry_id,migration_run_id,article_id,variant,entry_json,imported_at) VALUES(?,?,?,?,?,?)",
    ).run(
      entry.entryId,
      migrationRunId,
      entry.articleIdentityV1.articleId,
      entry.variant,
      text(entry),
      stamp,
    );
    for (const orderId of orderIdsOfEntry(entry))
      db.prepare(
        "INSERT INTO migration_import_order_identities(order_id,entry_id) VALUES(?,?)",
      ).run(orderId, entry.entryId);
  }

  function orderIdsOfEntry(entry) {
    const ids = [];
    if (entry.variant === "trackablePaidOrder")
      ids.push(entry.payload.orderSnapshotV1.orderIdentityV1.orderId);
    else if (
      ["publishedEvidence", "nonPublishedTerminal"].includes(entry.variant) &&
      entry.payload.orderHistoryV1
    )
      ids.push(entry.payload.orderHistoryV1.orderIdentityV1.orderId);
    else if (entry.variant === "needsAttentionConflict")
      ids.push(
        ...entry.payload.migrationConflictEvidenceV1.orderIdentityV1s.map(
          (identity) => identity.orderId,
        ),
      );
    return ids;
  }

  function orderIdsOf(plan) {
    return plan.entries.flatMap(orderIdsOfEntry);
  }

  function assertIndependentInvariants(plan) {
    for (const entry of plan.entries) assertArticleVacant(entry);
    for (const orderId of orderIdsOf(plan))
      if (
        db
          .prepare("SELECT 1 FROM remote_orders WHERE order_id=?")
          .get(orderId) ||
        db
          .prepare(
            "SELECT 1 FROM migration_import_order_identities WHERE order_id=?",
          )
          .get(orderId)
      )
        throw fail("MIGRATION_IMPORT_ORDER_CONFLICT");
  }

  function commitFingerprint(plan) {
    return crypto
      .createHash("sha256")
      .update(
        JSON.stringify({
          version: 1,
          migrationRunId: plan.migrationRunId,
          planFingerprint: plan.planFingerprint,
          schemaVersion: SCHEMA_VERSION,
          entries: plan.entries,
        }),
      )
      .digest("hex");
  }

  function assertCommittedImportMatches(plan) {
    const rows = db
      .prepare(
        "SELECT entry_id,entry_json FROM migration_import_entries WHERE migration_run_id=? ORDER BY entry_id",
      )
      .all(plan.migrationRunId);
    const expected = [...plan.entries]
      .sort((left, right) => left.entryId.localeCompare(right.entryId))
      .map((entry) => [entry.entryId, JSON.stringify(entry)]);
    const actual = rows.map((row) => [row.entry_id, row.entry_json]);
    const expectedOrderIds = orderIdsOf(plan).sort();
    const actualOrderIds = db
      .prepare(
        "SELECT o.order_id FROM migration_import_order_identities o JOIN migration_import_entries e ON e.entry_id=o.entry_id WHERE e.migration_run_id=? ORDER BY o.order_id",
      )
      .all(plan.migrationRunId)
      .map((row) => row.order_id);
    if (
      JSON.stringify(actual) !== JSON.stringify(expected) ||
      JSON.stringify(actualOrderIds) !== JSON.stringify(expectedOrderIds)
    )
      throw fail("MIGRATION_IMPORT_COMMIT_INVALID");
  }

  function importLifecycleFacts(input) {
    open();
    exact(input, ["plan"], "MIGRATION_IMPORT_REQUEST_INVALID");
    let plan;
    try {
      plan = domain.parseImportPlanV1(input.plan);
    } catch (_) {
      throw fail("MIGRATION_IMPORT_PLAN_INVALID");
    }
    const expectedCommit = commitFingerprint(plan);
    const existing = journalRow(plan.migrationRunId);
    if (
      existing &&
      ["import_committed", "verified"].includes(existing.phase) &&
      existing.workspace_fingerprint === plan.workspaceFingerprint &&
      existing.source_fingerprint === plan.sourceFingerprint &&
      existing.plan_fingerprint === plan.planFingerprint &&
      existing.import_commit_fingerprint === expectedCommit
    ) {
      assertCommittedImportMatches(plan);
      return Object.freeze({
        migrationRunId: plan.migrationRunId,
        importCommitFingerprint: expectedCommit,
        importedEntries: plan.entries.length,
        idempotent: true,
      });
    }
    const stamp = iso(clock);
    const result = transaction(() => {
      const journal = journalRow(plan.migrationRunId);
      if (!journal) throw fail("MIGRATION_JOURNAL_NOT_FOUND");
      if (
        journal.phase !== "confirmed" ||
        !journal.backup_identity ||
        !journal.confirmation_fingerprint
      )
        throw fail("MIGRATION_IMPORT_NOT_CONFIRMED");
      if (
        journal.workspace_fingerprint !== plan.workspaceFingerprint ||
        journal.source_fingerprint !== plan.sourceFingerprint ||
        journal.plan_fingerprint !== plan.planFingerprint
      )
        throw fail("MIGRATION_IMPORT_FINGERPRINT_MISMATCH");
      assertIndependentInvariants(plan);
      fault("before-facts", { migrationRunId: plan.migrationRunId });
      for (const entry of plan.entries) {
        importEntry(entry, plan.migrationRunId, stamp);
        fault("after-entry", { entryId: entry.entryId });
      }
      fault("before-journal-commit", { migrationRunId: plan.migrationRunId });
      const changed = db
        .prepare(
          "UPDATE migration_journals SET phase='import_committed',import_commit_fingerprint=?,imported_schema_version=?,updated_at=? WHERE migration_run_id=? AND phase='confirmed'",
        )
        .run(
          expectedCommit,
          SCHEMA_VERSION,
          stamp,
          plan.migrationRunId,
        ).changes;
      if (changed !== 1) throw fail("MIGRATION_JOURNAL_PHASE_CONFLICT");
      fault("after-journal-commit", { migrationRunId: plan.migrationRunId });
      return Object.freeze({
        migrationRunId: plan.migrationRunId,
        importCommitFingerprint: expectedCommit,
        importedEntries: plan.entries.length,
        idempotent: false,
      });
    });
    fault("after-commit", { migrationRunId: plan.migrationRunId });
    return result;
  }

  function listImportedLifecycleFacts(input) {
    open();
    exact(input, ["migrationRunId"], "MIGRATION_IMPORT_READ_INVALID");
    const migrationRunId = safeId(
      input.migrationRunId,
      "MIGRATION_IMPORT_READ_INVALID",
    );
    return Object.freeze(
      db
        .prepare(
          "SELECT entry_json FROM migration_import_entries WHERE migration_run_id=? ORDER BY entry_id",
        )
        .all(migrationRunId)
        .map((row) => Object.freeze(fromText(row.entry_json))),
    );
  }

  return Object.freeze({
    bootstrapMigrationJournal,
    readMigrationJournal,
    persistMigrationJournalMetadata,
    importLifecycleFacts,
    listImportedLifecycleFacts,
  });
}

module.exports = { createOperationalStoreMigrationImport };
