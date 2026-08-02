"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const {
  SqliteAuthRepository,
} = require("../src/repositories/sqlite-auth-repository");
const { verifyDatabaseFile } = require("../src/auth-database-verifier");

function evidenceError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function parseArguments(argv) {
  const args = Array.from(argv || []);
  const options = {};
  while (args.length) {
    const arg = args.shift();
    if (arg === "--output") {
      const value = args.shift();
      if (!value || value.startsWith("--"))
        throw evidenceError(
          "AUTH_MIGRATION_EVIDENCE_ARGUMENT_INVALID",
          "output is required",
        );
      options.output = path.resolve(value);
    } else {
      throw evidenceError(
        "AUTH_MIGRATION_EVIDENCE_ARGUMENT_INVALID",
        "unknown option",
      );
    }
  }
  return options;
}

function createLegacyDatabase(filename) {
  const database = new DatabaseSync(filename);
  try {
    const migration = fs.readFileSync(
      path.join(__dirname, "../migrations/001-auth.sql"),
      "utf8",
    );
    database.exec(migration);
    database
      .prepare(
        "INSERT INTO users (id, login_name, password_hash, enabled, created_at, last_login_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(
        "evidence-user",
        "evidence-user",
        "scrypt$fixture",
        1,
        "2026-01-01T00:00:00.000Z",
        null,
      );
    database
      .prepare(
        "INSERT INTO entitlements (user_id, product, enabled, expires_at) VALUES (?, ?, ?, ?)",
      )
      .run("evidence-user", "desktop", 1, null);
    database.exec(
      "CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)",
    );
    database
      .prepare(
        "INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)",
      )
      .run(1, "001-auth", "2026-01-01T00:00:00.000Z");
  } finally {
    database.close();
  }
}

function writeReport(output, report) {
  const filename = path.resolve(output);
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  fs.writeFileSync(filename, JSON.stringify(report, null, 2) + "\n", {
    encoding: "utf8",
    mode: 0o600,
  });
  return report;
}

function createMigrationRoundtripEvidence(options) {
  const opts = options || {};
  const temporaryRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "autopublish-auth-migration-"),
  );
  const databasePath = path.join(temporaryRoot, "legacy.db");
  const startedAt = Date.now();
  try {
    createLegacyDatabase(databasePath);
    let legacyRejected = false;
    try {
      verifyDatabaseFile(databasePath);
    } catch (error) {
      legacyRejected = error && error.code === "AUTH_DB_LEGACY_SCHEMA";
    }
    if (!legacyRejected)
      throw evidenceError(
        "AUTH_MIGRATION_LEGACY_NOT_REJECTED",
        "legacy schema was not gated",
      );

    const repository = new SqliteAuthRepository({ filePath: databasePath });
    const migrated = repository.migrationResult;
    repository.close();
    const afterMigration = verifyDatabaseFile(databasePath);
    const retry = new SqliteAuthRepository({ filePath: databasePath });
    const repeated = retry.migrationResult;
    retry.close();
    if (
      migrated.schemaVersion !== 2 ||
      migrated.migrated !== true ||
      repeated.migrated !== false ||
      afterMigration.schemaVersion !== 2 ||
      afterMigration.integrity !== "ok"
    ) {
      throw evidenceError(
        "AUTH_MIGRATION_ROUNDTRIP_FAILED",
        "migration roundtrip did not converge",
      );
    }
    return writeReport(
      opts.output ||
        path.join(
          process.cwd(),
          "build",
          "evidence",
          "migration-roundtrip.json",
        ),
      {
        status: "PASSED",
        operation: "auth-migration-roundtrip",
        sourceSchemaVersion: 1,
        schemaVersion: 2,
        durationMs: Date.now() - startedAt,
        count: 3,
        passed: 3,
        failed: 0,
        skipped: 0,
        sha256: afterMigration.contentHash,
      },
    );
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

if (require.main === module) {
  try {
    process.stdout.write(
      JSON.stringify(
        createMigrationRoundtripEvidence(parseArguments(process.argv.slice(2))),
      ) + "\n",
    );
  } catch (error) {
    process.stderr.write(
      (error.code || "AUTH_MIGRATION_EVIDENCE_FAILED") +
        ":migration evidence failed\n",
    );
    process.exitCode = 1;
  }
}

module.exports = {
  createMigrationRoundtripEvidence,
  createLegacyDatabase,
  parseArguments,
};
