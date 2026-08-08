"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const FINGERPRINT = /^[a-f0-9]{64}$/u;

function digestBuffer(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function backupError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function validateRequest(input) {
  const value = input || {};
  if (
    !SAFE_ID.test(value.migrationRunId || "") ||
    !FINGERPRINT.test(value.workspaceFingerprint || "") ||
    !FINGERPRINT.test(value.sourceFingerprint || "") ||
    !FINGERPRINT.test(value.planFingerprint || "")
  )
    throw backupError("MIGRATION_BACKUP_REQUEST_INVALID");
  return value;
}

function createWorkspaceMigrationBackup(options) {
  const values = options || {};
  const io = values.fs || fs;
  if (
    typeof values.workspaceRoot !== "string" ||
    !path.isAbsolute(values.workspaceRoot)
  )
    throw backupError("MIGRATION_BACKUP_ROOT_INVALID");
  const workspaceRoot = path.resolve(values.workspaceRoot);
  const databasePath = path.join(
    workspaceRoot,
    ".autopublish",
    "operations",
    "operations.db",
  );
  const walPath = `${databasePath}-wal`;
  const backupsRoot = path.join(
    workspaceRoot,
    ".autopublish",
    "migration-backups",
  );

  function assertSafeDirectory(filename, allowMissing) {
    try {
      const stat = io.lstatSync(filename);
      if (!stat.isDirectory() || stat.isSymbolicLink())
        throw backupError("MIGRATION_BACKUP_PATH_UNSAFE");
      return true;
    } catch (error) {
      if (allowMissing && error && error.code === "ENOENT") return false;
      throw error;
    }
  }

  function assertSafeParents() {
    assertSafeDirectory(workspaceRoot, false);
    const dataRoot = path.join(workspaceRoot, ".autopublish");
    if (assertSafeDirectory(dataRoot, true)) {
      assertSafeDirectory(path.join(dataRoot, "operations"), true);
      assertSafeDirectory(backupsRoot, true);
    }
  }

  function assertRegularOrMissing(filename) {
    try {
      const stat = io.lstatSync(filename);
      if (!stat.isFile() || stat.isSymbolicLink())
        throw backupError("MIGRATION_BACKUP_SOURCE_UNSAFE");
      return true;
    } catch (error) {
      if (error && error.code === "ENOENT") return false;
      throw error;
    }
  }

  function manifestIdentity(request, databaseHash, walHash) {
    return `backup-${digestBuffer(
      Buffer.from(
        JSON.stringify({
          version: 1,
          migrationRunId: request.migrationRunId,
          workspaceFingerprint: request.workspaceFingerprint,
          sourceFingerprint: request.sourceFingerprint,
          planFingerprint: request.planFingerprint,
          databaseHash,
          walHash,
        }),
        "utf8",
      ),
    ).slice(0, 32)}`;
  }

  function artifactDirectory(backupIdentity) {
    if (!SAFE_ID.test(backupIdentity || ""))
      throw backupError("MIGRATION_BACKUP_IDENTITY_INVALID");
    return path.join(backupsRoot, backupIdentity);
  }

  function readManifest(backupIdentity) {
    const directory = artifactDirectory(backupIdentity);
    if (!assertSafeDirectory(directory, true)) return null;
    const manifestPath = path.join(directory, "manifest.json");
    let stat;
    try {
      stat = io.lstatSync(manifestPath);
    } catch (error) {
      return null;
    }
    if (!stat.isFile() || stat.isSymbolicLink()) return null;
    try {
      return JSON.parse(io.readFileSync(manifestPath, "utf8"));
    } catch (error) {
      return null;
    }
  }

  function verify(input) {
    const request = validateRequest(input);
    assertSafeParents();
    const manifest = readManifest(request.backupIdentity);
    if (
      !manifest ||
      manifest.version !== 1 ||
      manifest.backupIdentity !== request.backupIdentity ||
      manifest.migrationRunId !== request.migrationRunId ||
      manifest.workspaceFingerprint !== request.workspaceFingerprint ||
      manifest.sourceFingerprint !== request.sourceFingerprint ||
      manifest.planFingerprint !== request.planFingerprint ||
      typeof manifest.databasePresent !== "boolean" ||
      typeof manifest.databaseHash !== "string" ||
      typeof manifest.walPresent !== "boolean" ||
      typeof manifest.walHash !== "string"
    )
      return Object.freeze({ valid: false });
    if (!manifest.databasePresent)
      return Object.freeze({
        valid:
          manifest.walPresent === false &&
          manifest.databaseHash === digestBuffer(Buffer.alloc(0)) &&
          manifest.walHash === digestBuffer(Buffer.alloc(0)),
      });
    const backupPath = path.join(
      artifactDirectory(request.backupIdentity),
      "operations.db",
    );
    if (!assertRegularOrMissing(backupPath))
      return Object.freeze({ valid: false });
    const actualHash = digestBuffer(io.readFileSync(backupPath));
    if (actualHash !== manifest.databaseHash)
      return Object.freeze({ valid: false });
    const backupWalPath = path.join(
      artifactDirectory(request.backupIdentity),
      "operations.db-wal",
    );
    const walPresent = assertRegularOrMissing(backupWalPath);
    if (walPresent !== manifest.walPresent)
      return Object.freeze({ valid: false });
    const actualWalHash = walPresent
      ? digestBuffer(io.readFileSync(backupWalPath))
      : digestBuffer(Buffer.alloc(0));
    return Object.freeze({ valid: actualWalHash === manifest.walHash });
  }

  function findExisting(request) {
    if (!assertSafeDirectory(backupsRoot, true)) return null;
    const candidates = io
      .readdirSync(backupsRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !entry.isSymbolicLink())
      .map((entry) => entry.name)
      .filter((name) => SAFE_ID.test(name))
      .sort();
    return (
      candidates.find(
        (candidate) =>
          verify({ ...request, backupIdentity: candidate }).valid === true,
      ) || null
    );
  }

  function ensure(input) {
    const request = validateRequest(input);
    assertSafeParents();
    const reusableIdentity = findExisting(request);
    if (reusableIdentity)
      return Object.freeze({
        backupIdentity: reusableIdentity,
        reused: true,
      });
    const databasePresent = assertRegularOrMissing(databasePath);
    const walPresent = assertRegularOrMissing(walPath);
    if (!databasePresent && walPresent)
      throw backupError("MIGRATION_BACKUP_SOURCE_UNSAFE");
    const databaseBytes = databasePresent
      ? io.readFileSync(databasePath)
      : Buffer.alloc(0);
    const walBytes = walPresent ? io.readFileSync(walPath) : Buffer.alloc(0);
    const databaseHash = digestBuffer(databaseBytes);
    const walHash = digestBuffer(walBytes);
    const baseIdentity = manifestIdentity(request, databaseHash, walHash);
    const existing = verify({ ...request, backupIdentity: baseIdentity });
    if (existing.valid)
      return Object.freeze({ backupIdentity: baseIdentity, reused: true });

    const baseDirectoryExists = assertSafeDirectory(
      artifactDirectory(baseIdentity),
      true,
    );
    const backupIdentity = baseDirectoryExists
      ? `${baseIdentity}-repair-${crypto.randomBytes(4).toString("hex")}`
      : baseIdentity;

    const directory = artifactDirectory(backupIdentity);
    try {
      io.mkdirSync(backupsRoot, { recursive: true });
      assertSafeParents();
      io.mkdirSync(directory, { recursive: false });
    } catch (error) {
      if (!error || error.code !== "EEXIST")
        throw backupError("MIGRATION_BACKUP_CREATE_FAILED");
      throw backupError("MIGRATION_BACKUP_INTEGRITY_FAILED");
    }
    try {
      if (databasePresent)
        io.writeFileSync(path.join(directory, "operations.db"), databaseBytes, {
          flag: "wx",
          mode: 0o600,
        });
      if (walPresent)
        io.writeFileSync(path.join(directory, "operations.db-wal"), walBytes, {
          flag: "wx",
          mode: 0o600,
        });
      const manifest = {
        version: 1,
        backupIdentity,
        migrationRunId: request.migrationRunId,
        workspaceFingerprint: request.workspaceFingerprint,
        sourceFingerprint: request.sourceFingerprint,
        planFingerprint: request.planFingerprint,
        databasePresent,
        databaseHash,
        walPresent,
        walHash,
      };
      io.writeFileSync(
        path.join(directory, "manifest.json"),
        JSON.stringify(manifest),
        { flag: "wx", mode: 0o600 },
      );
    } catch (error) {
      throw backupError("MIGRATION_BACKUP_CREATE_FAILED");
    }
    if (!verify({ ...request, backupIdentity }).valid)
      throw backupError("MIGRATION_BACKUP_INTEGRITY_FAILED");
    return Object.freeze({ backupIdentity, reused: false });
  }

  return Object.freeze({ ensure, verify });
}

module.exports = { createWorkspaceMigrationBackup };
