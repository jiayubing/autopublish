const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const VERSION = 1;
const SCHEMA = "content-metadata-v1";
const TRANSACTION_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function fail(code, message) {
  const error = new Error(message || code);
  error.code = code;
  return error;
}
function absolute(value, label) {
  if (typeof value !== "string" || !value.trim() || !path.isAbsolute(value))
    throw fail("CONTENT_METADATA_PATH_INVALID", label + " must be absolute");
  return path.resolve(value);
}
function pathPresent(filename) {
  try {
    fs.lstatSync(filename);
    return true;
  } catch (error) {
    if (error && error.code === "ENOENT") return false;
    throw error;
  }
}
function within(parent, child) {
  const relative = path.relative(parent, child);
  return (
    relative === "" ||
    (relative !== ".." &&
      !relative.startsWith(".." + path.sep) &&
      !path.isAbsolute(relative))
  );
}
function regular(filename) {
  const stat = fs.lstatSync(filename);
  if (stat.isSymbolicLink() || !stat.isFile())
    throw fail(
      "CONTENT_METADATA_SYMLINK_UNSAFE",
      "Metadata path is not a regular file",
    );
}
function digest(filename) {
  return crypto
    .createHash("sha256")
    .update(fs.readFileSync(filename))
    .digest("hex");
}
function jsonFile(filename) {
  regular(filename);
  return JSON.parse(fs.readFileSync(filename, "utf8"));
}
function relative(root, filename) {
  return path.relative(root, filename).split(path.sep).join("/");
}
function safeRelative(value) {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    !path.isAbsolute(value) &&
    !value.split("/").some((part) => part === ".." || part === "")
  );
}
function siblingEvidenceRoot(workspaceRoot, prefix, transactionId, suffix) {
  if (!TRANSACTION_ID_PATTERN.test(transactionId))
    throw fail(
      "CONTENT_METADATA_MANIFEST_INVALID",
      "Migration transaction id is invalid",
    );
  const parent = path.dirname(workspaceRoot);
  const name =
    path.basename(workspaceRoot) + prefix + transactionId + (suffix || "");
  const candidate = path.resolve(parent, name);
  if (
    candidate !== path.join(parent, name) ||
    path.dirname(candidate) !== parent ||
    path.basename(candidate) !== name
  ) {
    throw fail(
      "CONTENT_METADATA_MANIFEST_INVALID",
      "Migration evidence path is not a safe workspace sibling",
    );
  }
  return candidate;
}
function atomicWrite(filename, value) {
  const temporary =
    filename + ".tmp-" + process.pid + "-" + crypto.randomUUID();
  try {
    fs.writeFileSync(temporary, JSON.stringify(value, null, 2) + "\n", "utf8");
    fs.renameSync(temporary, filename);
  } finally {
    try {
      if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
    } catch (_) {}
  }
}

function createReport() {
  return {
    version: VERSION,
    mode: "dry-run",
    schema: SCHEMA,
    scannedClients: 0,
    scannedArticles: 0,
    writes: 0,
    missingIds: [],
    duplicateClientIds: [],
    duplicateArticleIds: [],
    duplicateGenerationTaskIds: [],
    directoryConflicts: [],
    corruptMetadata: [],
    invalidTimes: [],
    symlinks: [],
    repairItems: [],
    actions: [],
  };
}

function validatePaths(options, allowMissingWorkspace) {
  const workspaceRoot = absolute(options.workspaceRoot, "workspace");
  const backupRoot = options.backupRoot
    ? absolute(options.backupRoot, "backup")
    : null;
  if (
    backupRoot &&
    (within(workspaceRoot, backupRoot) || within(backupRoot, workspaceRoot))
  )
    throw fail(
      "CONTENT_METADATA_PATH_OVERLAP",
      "Workspace and backup must be disjoint",
    );
  if (pathPresent(workspaceRoot)) {
    const stat = fs.lstatSync(workspaceRoot);
    if (stat.isSymbolicLink() || !stat.isDirectory())
      throw fail(
        "CONTENT_METADATA_WORKSPACE_INVALID",
        "Workspace must be a real directory",
      );
  } else if (!allowMissingWorkspace)
    throw fail(
      "CONTENT_METADATA_WORKSPACE_INVALID",
      "Workspace must be a real directory",
    );
  if (
    backupRoot &&
    pathPresent(backupRoot) &&
    fs.lstatSync(backupRoot).isSymbolicLink()
  )
    throw fail(
      "CONTENT_METADATA_BACKUP_INVALID",
      "Backup must not be a symlink",
    );
  return { workspaceRoot, backupRoot };
}

function collectFiles(root) {
  const result = [];
  function walk(directory) {
    fs.readdirSync(directory, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach((entry) => {
        const filename = path.join(directory, entry.name);
        if (entry.isSymbolicLink())
          throw fail(
            "CONTENT_METADATA_SYMLINK_UNSAFE",
            "Snapshot contains a symlink",
          );
        if (entry.isDirectory()) return walk(filename);
        if (!entry.isFile())
          throw fail(
            "CONTENT_METADATA_ENTRY_INVALID",
            "Snapshot contains a non-file entry",
          );
        result.push({
          path: relative(root, filename),
          size: fs.statSync(filename).size,
          sha256: digest(filename),
        });
      });
  }
  walk(root);
  return result;
}

function inventoryEqual(left, right, after) {
  const expected = new Map((right || []).map((entry) => [entry.path, entry]));
  if (left.length !== expected.size) return false;
  return left.every((entry) => {
    const found = expected.get(entry.path);
    const hash = after && found.after ? found.after : found;
    return found && entry.size === hash.size && entry.sha256 === hash.sha256;
  });
}

function scan(options) {
  const roots = validatePaths(options);
  const report = createReport();
  const clientsRoot = path.join(roots.workspaceRoot, "clients");
  const generatedRoot = path.join(roots.workspaceRoot, "generated");
  const clientIds = new Map();
  const articleIds = new Map();
  const taskIds = new Map();
  const actions = [];
  function rootDirectory(filename, kind) {
    if (!pathPresent(filename)) return false;
    const stat = fs.lstatSync(filename);
    if (stat.isSymbolicLink()) {
      report.symlinks.push({
        path: relative(roots.workspaceRoot, filename),
        kind,
      });
      return false;
    }
    if (!stat.isDirectory())
      throw fail(
        "CONTENT_METADATA_WORKSPACE_INVALID",
        kind + " root must be a directory",
      );
    return true;
  }
  function walkArticles(directory) {
    fs.readdirSync(directory, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach((entry) => {
        const filename = path.join(directory, entry.name);
        if (entry.isSymbolicLink()) {
          report.symlinks.push({
            path: relative(roots.workspaceRoot, filename),
            kind: "generated-entry",
          });
          return;
        }
        if (entry.isDirectory()) return walkArticles(filename);
        if (
          !entry.isFile() ||
          path.extname(entry.name).toLowerCase() !== ".json" ||
          entry.name.includes(".tmp-") ||
          entry.name.includes(".journal")
        )
          return;
        report.scannedArticles += 1;
        let article;
        try {
          article = jsonFile(filename);
        } catch (_) {
          report.corruptMetadata.push({
            path: relative(roots.workspaceRoot, filename),
            kind: "article",
          });
          return;
        }
        if (typeof article.id !== "string" || !article.id.trim())
          report.missingIds.push({
            path: relative(roots.workspaceRoot, filename),
            kind: "ArticleId",
          });
        else if (articleIds.has(article.id))
          report.duplicateArticleIds.push({
            id: article.id,
            paths: [
              articleIds.get(article.id),
              relative(roots.workspaceRoot, filename),
            ],
          });
        else
          articleIds.set(article.id, relative(roots.workspaceRoot, filename));
        if (article.generationTaskId) {
          if (taskIds.has(article.generationTaskId))
            report.duplicateGenerationTaskIds.push({
              id: article.generationTaskId,
              paths: [
                taskIds.get(article.generationTaskId),
                relative(roots.workspaceRoot, filename),
              ],
            });
          else
            taskIds.set(
              article.generationTaskId,
              relative(roots.workspaceRoot, filename),
            );
        }
        if (
          typeof article.createdAt !== "string" ||
          !Number.isFinite(Date.parse(article.createdAt))
        )
          report.invalidTimes.push({
            path: relative(roots.workspaceRoot, filename),
            field: "createdAt",
          });
        if (article.metadataVersion !== VERSION) {
          actions.push({
            type: "write-metadata-version",
            path: relative(roots.workspaceRoot, filename),
          });
          report.writes += 1;
        }
      });
  }
  const hasClients = rootDirectory(clientsRoot, "clients");
  const hasGenerated = rootDirectory(generatedRoot, "generated");
  if (!hasClients && hasGenerated)
    report.repairItems.push({ path: "clients", kind: "clients-root" });
  if (hasClients)
    fs.readdirSync(clientsRoot, { withFileTypes: true })
      .filter((entry) => !entry.name.startsWith("."))
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach((entry) => {
        const directory = path.join(clientsRoot, entry.name);
        if (entry.isSymbolicLink()) {
          report.symlinks.push({
            path: relative(roots.workspaceRoot, directory),
            kind: "client-directory",
          });
          return;
        }
        if (!entry.isDirectory()) return;
        report.scannedClients += 1;
        const metadataPath = path.join(directory, "client.json");
        if (!pathPresent(metadataPath)) {
          report.missingIds.push({
            path: relative(roots.workspaceRoot, metadataPath),
            kind: "ClientId",
          });
          return;
        }
        let metadata;
        try {
          metadata = jsonFile(metadataPath);
        } catch (_) {
          report.corruptMetadata.push({
            path: relative(roots.workspaceRoot, metadataPath),
            kind: "client",
          });
          return;
        }
        if (typeof metadata.id !== "string" || !metadata.id.trim())
          report.missingIds.push({
            path: relative(roots.workspaceRoot, metadataPath),
            kind: "ClientId",
          });
        else {
          const clientPath = relative(clientsRoot, directory);
          if (clientPath !== metadata.id)
            report.directoryConflicts.push({
              path: relative(roots.workspaceRoot, directory),
              clientId: metadata.id,
            });
          if (clientIds.has(metadata.id))
            report.duplicateClientIds.push({
              id: metadata.id,
              paths: [
                clientIds.get(metadata.id),
                relative(roots.workspaceRoot, metadataPath),
              ],
            });
          else
            clientIds.set(
              metadata.id,
              relative(roots.workspaceRoot, metadataPath),
            );
        }
        if (metadata.metadataVersion !== VERSION) {
          actions.push({
            type: "write-metadata-version",
            path: relative(roots.workspaceRoot, metadataPath),
          });
          report.writes += 1;
        }
      });
  if (hasGenerated) walkArticles(generatedRoot);
  report.actions = actions;
  report.repairItems = report.repairItems.concat(
    report.missingIds,
    report.duplicateClientIds,
    report.duplicateArticleIds,
    report.duplicateGenerationTaskIds,
    report.corruptMetadata,
    report.invalidTimes,
    report.symlinks,
  );
  return { roots, report, actions };
}

function validateManifest(manifest, roots) {
  if (
    !manifest ||
    manifest.version !== VERSION ||
    manifest.schema !== SCHEMA ||
    ![
      "PREPARED",
      "STAGING_VERIFIED",
      "COMMITTING",
      "OLD_ROOT_READY",
      "INSTALLED",
      "CLEANUP_PENDING",
      "COMMITTED",
      "ROLLBACK",
      "ROLLBACK_COMMITTING",
      "ROLLED_BACK",
      "NEEDS_REPAIR",
    ].includes(manifest.state) ||
    typeof manifest.transactionId !== "string" ||
    !TRANSACTION_ID_PATTERN.test(manifest.transactionId) ||
    typeof manifest.createdAt !== "string" ||
    !Number.isFinite(Date.parse(manifest.createdAt)) ||
    manifest.workspace !== roots.workspaceRoot ||
    !Array.isArray(manifest.files) ||
    (manifest.repairIntent !== undefined &&
      !["forward", "rollback"].includes(manifest.repairIntent))
  )
    throw fail(
      "CONTENT_METADATA_MANIFEST_INVALID",
      "Migration manifest is invalid",
    );
  oldRootFor(roots, manifest);
  stagingRootFor(roots, manifest);
  restoreRootFor(roots, manifest);
  rollbackOldRootFor(roots, manifest);
  const seen = new Set();
  manifest.files.forEach((entry) => {
    if (
      !entry ||
      !safeRelative(entry.path) ||
      seen.has(entry.path) ||
      !Number.isSafeInteger(entry.size) ||
      !/^[a-f0-9]{64}$/.test(entry.sha256) ||
      !entry.after ||
      !Number.isSafeInteger(entry.after.size) ||
      !/^[a-f0-9]{64}$/.test(entry.after.sha256)
    )
      throw fail(
        "CONTENT_METADATA_MANIFEST_INVALID",
        "Migration manifest inventory is invalid",
      );
    seen.add(entry.path);
  });
  return manifest;
}

function validateSnapshot(manifest, snapshotRoot) {
  let inventory;
  try {
    inventory = collectFiles(snapshotRoot);
  } catch (error) {
    throw fail("CONTENT_METADATA_BACKUP_HASH_MISMATCH", error.message);
  }
  if (!inventoryEqual(inventory, manifest.files))
    throw fail(
      "CONTENT_METADATA_BACKUP_HASH_MISMATCH",
      "Backup snapshot does not match manifest",
    );
}
function ensureBackupLayout(roots, manifestPath) {
  const entries = fs
    .readdirSync(roots.backupRoot, { withFileTypes: true })
    .map((entry) => entry.name)
    .sort();
  const allowed = ["content-metadata-v1-manifest.json", "snapshot"];
  if (entries.some((entry) => !allowed.includes(entry)))
    throw fail(
      "CONTENT_METADATA_BACKUP_EXTRA_ENTRY",
      "Backup contains an undeclared entry",
    );
  if (
    !pathPresent(manifestPath) ||
    !pathPresent(path.join(roots.backupRoot, "snapshot"))
  )
    throw fail(
      "CONTENT_METADATA_BACKUP_INVALID",
      "Backup snapshot is incomplete",
    );
}

function oldRootFor(roots, manifest) {
  return siblingEvidenceRoot(
    roots.workspaceRoot,
    ".before-",
    manifest.transactionId,
  );
}
function stagingRootFor(roots, manifest) {
  return siblingEvidenceRoot(
    roots.workspaceRoot,
    ".staging-",
    manifest.transactionId,
  );
}
function restoreRootFor(roots, manifest) {
  return siblingEvidenceRoot(
    roots.workspaceRoot,
    ".restore-",
    manifest.transactionId,
  );
}
function rollbackOldRootFor(roots, manifest) {
  return siblingEvidenceRoot(
    roots.workspaceRoot,
    ".before-",
    manifest.transactionId,
    "-rollback",
  );
}
function inventoryAt(root) {
  if (!pathPresent(root)) return null;
  const stat = fs.lstatSync(root);
  if (stat.isSymbolicLink())
    throw fail(
      "CONTENT_METADATA_SYMLINK_UNSAFE",
      "Migration evidence root must not be a symlink",
    );
  if (!stat.isDirectory())
    throw fail(
      "CONTENT_METADATA_ENTRY_INVALID",
      "Migration evidence root must be a directory",
    );
  return collectFiles(root);
}
function matches(root, manifest, after) {
  const inventory = inventoryAt(root);
  return inventory && inventoryEqual(inventory, manifest.files, after);
}
function residualEvidence(root, manifest, allowAfter) {
  if (!pathPresent(root)) return true;
  const stat = fs.lstatSync(root);
  if (stat.isSymbolicLink() || !stat.isDirectory()) return false;
  const expected = new Map(manifest.files.map((entry) => [entry.path, entry]));
  const allowedDirectories = new Set();
  manifest.files.forEach((entry) => {
    const parts = entry.path.split("/");
    for (let index = 1; index < parts.length; index += 1) {
      allowedDirectories.add(parts.slice(0, index).join("/"));
    }
  });
  let safe = true;
  function walk(directory) {
    fs.readdirSync(directory, { withFileTypes: true }).forEach((entry) => {
      if (!safe) return;
      const filename = path.join(directory, entry.name);
      const relativePath = relative(root, filename);
      const current = fs.lstatSync(filename);
      if (current.isSymbolicLink()) {
        safe = false;
        return;
      }
      if (current.isDirectory()) {
        if (!allowedDirectories.has(relativePath)) {
          safe = false;
          return;
        }
        walk(filename);
        return;
      }
      if (!current.isFile()) {
        safe = false;
        return;
      }
      const expectedFile = expected.get(relativePath);
      const actual = { size: current.size, sha256: digest(filename) };
      const beforeMatches =
        expectedFile &&
        expectedFile.size === actual.size &&
        expectedFile.sha256 === actual.sha256;
      const afterMatches =
        allowAfter &&
        expectedFile &&
        expectedFile.after &&
        expectedFile.after.size === actual.size &&
        expectedFile.after.sha256 === actual.sha256;
      if (!beforeMatches && !afterMatches) safe = false;
    });
  }
  walk(root);
  return safe;
}
function residualBefore(root, manifest) {
  return residualEvidence(root, manifest, false);
}
function writeManifest(manifestPath, manifest, state) {
  manifest.state = state;
  if (state !== "NEEDS_REPAIR") delete manifest.repairIntent;
  atomicWrite(manifestPath, manifest);
}
function recoveryConflict(manifestPath, manifest, message, cause, intent) {
  const error = fail("CONTENT_METADATA_RECOVERY_CONFLICT", message);
  if (cause && cause.code) error.causeCode = cause.code;
  manifest.repairIntent =
    intent ||
    manifest.repairIntent ||
    (["ROLLBACK", "ROLLBACK_COMMITTING"].includes(manifest.state)
      ? "rollback"
      : "forward");
  try {
    writeManifest(manifestPath, manifest, "NEEDS_REPAIR");
  } catch (_) {}
  throw error;
}
function removeOldRoot(roots, manifest) {
  const oldRoot = oldRootFor(roots, manifest);
  if (!pathPresent(oldRoot)) return;
  const stat = fs.lstatSync(oldRoot);
  if (
    stat.isSymbolicLink() ||
    !stat.isDirectory() ||
    !residualBefore(oldRoot, manifest)
  )
    throw fail(
      "CONTENT_METADATA_OLDROOT_CONFLICT",
      "Old workspace cleanup evidence is invalid",
    );
  fs.rmSync(oldRoot, { recursive: true });
}

function createMigration(options) {
  const value = options || {};
  const clock = value.now || (() => new Date().toISOString());
  function dryRun() {
    const result = scan(value);
    result.report.mode = "dry-run";
    return result.report;
  }
  function loadRecovery() {
    const roots = validatePaths(value, true);
    if (!roots.backupRoot)
      throw fail(
        "CONTENT_METADATA_BACKUP_REQUIRED",
        "Recovery requires an existing backup",
      );
    const manifestPath = path.join(
      roots.backupRoot,
      "content-metadata-v1-manifest.json",
    );
    if (!pathPresent(manifestPath))
      throw fail(
        "CONTENT_METADATA_MANIFEST_MISSING",
        "Migration manifest is missing",
      );
    let manifest;
    try {
      regular(manifestPath);
      manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    } catch (_) {
      throw fail(
        "CONTENT_METADATA_MANIFEST_INVALID",
        "Migration manifest is invalid",
      );
    }
    validateManifest(manifest, roots);
    ensureBackupLayout(roots, manifestPath);
    validateSnapshot(manifest, path.join(roots.backupRoot, "snapshot"));
    return { roots, manifestPath, manifest };
  }
  function rebuildStaging(roots, manifestPath, manifest) {
    const stagingRoot = stagingRootFor(roots, manifest);
    const snapshotRoot = path.join(roots.backupRoot, "snapshot");
    if (
      !matches(roots.workspaceRoot, manifest, false) ||
      pathPresent(oldRootFor(roots, manifest))
    ) {
      recoveryConflict(
        manifestPath,
        manifest,
        "Early migration workspace evidence is contradictory",
      );
    }
    if (pathPresent(stagingRoot)) {
      if (!residualEvidence(stagingRoot, manifest, true)) {
        recoveryConflict(
          manifestPath,
          manifest,
          "Partial migration staging contains unknown evidence",
        );
      }
      fs.rmSync(stagingRoot, { recursive: true });
    }
    fs.cpSync(snapshotRoot, stagingRoot, {
      recursive: true,
      force: false,
      dereference: false,
    });
    manifest.files.forEach((entry) => {
      if (
        entry.size === entry.after.size &&
        entry.sha256 === entry.after.sha256
      )
        return;
      const filename = path.join(
        stagingRoot,
        entry.path.split("/").join(path.sep),
      );
      const metadata = jsonFile(filename);
      metadata.metadataVersion = VERSION;
      atomicWrite(filename, metadata);
    });
    if (!matches(stagingRoot, manifest, true)) {
      throw fail(
        "CONTENT_METADATA_TARGET_VERIFY_FAILED",
        "Rebuilt migration staging does not match target inventory",
      );
    }
    writeManifest(manifestPath, manifest, "STAGING_VERIFIED");
  }
  function recoverRollback(loaded) {
    const { roots, manifestPath, manifest } = loaded;
    const resultMode = loaded.mode || "recover";
    const rollbackOldRoot = rollbackOldRootFor(roots, manifest);
    const restoreRoot = restoreRootFor(roots, manifest);
    const migrationOldRoot = oldRootFor(roots, manifest);
    const migrationStagingRoot = stagingRootFor(roots, manifest);
    let workspaceBefore;
    let workspaceAfter;
    let oldAfter;
    let restoreBefore;
    let migrationOldSafe;
    try {
      if (pathPresent(migrationStagingRoot))
        recoveryConflict(
          manifestPath,
          manifest,
          "Rollback recovery has residual migration evidence",
        );
      migrationOldSafe = residualBefore(migrationOldRoot, manifest);
      if (!migrationOldSafe)
        recoveryConflict(
          manifestPath,
          manifest,
          "Migration old-root evidence is invalid",
        );
      workspaceBefore = matches(roots.workspaceRoot, manifest, false);
      workspaceAfter = matches(roots.workspaceRoot, manifest, true);
      oldAfter = matches(rollbackOldRoot, manifest, true);
      restoreBefore = matches(restoreRoot, manifest, false);
    } catch (error) {
      recoveryConflict(
        manifestPath,
        manifest,
        "Rollback recovery evidence is unsafe",
        error,
      );
    }
    try {
      if (
        workspaceBefore &&
        !pathPresent(rollbackOldRoot) &&
        !pathPresent(restoreRoot)
      ) {
        // The restore switch already completed. Cleanup below still owns every
        // verified migration/rollback residual before terminal checkpointing.
      } else if (workspaceBefore && oldAfter && !pathPresent(restoreRoot)) {
        fs.rmSync(rollbackOldRoot, { recursive: true });
      } else if (
        workspaceAfter &&
        !pathPresent(rollbackOldRoot) &&
        restoreBefore
      ) {
        fs.renameSync(roots.workspaceRoot, rollbackOldRoot);
        fs.renameSync(restoreRoot, roots.workspaceRoot);
      } else if (
        !pathPresent(roots.workspaceRoot) &&
        oldAfter &&
        restoreBefore
      ) {
        fs.renameSync(restoreRoot, roots.workspaceRoot);
      } else {
        recoveryConflict(
          manifestPath,
          manifest,
          "Rollback recovery evidence is contradictory",
        );
      }
      if (!matches(roots.workspaceRoot, manifest, false))
        recoveryConflict(
          manifestPath,
          manifest,
          "Restored workspace does not match the snapshot inventory",
        );
      if (pathPresent(rollbackOldRoot)) {
        if (!matches(rollbackOldRoot, manifest, true))
          recoveryConflict(
            manifestPath,
            manifest,
            "Rollback old-root evidence is invalid",
          );
        fs.rmSync(rollbackOldRoot, { recursive: true });
      }
      if (pathPresent(restoreRoot)) {
        if (!matches(restoreRoot, manifest, false))
          recoveryConflict(
            manifestPath,
            manifest,
            "Rollback staging evidence is invalid",
          );
        fs.rmSync(restoreRoot, { recursive: true });
      }
      if (pathPresent(migrationOldRoot)) {
        if (!migrationOldSafe || !residualBefore(migrationOldRoot, manifest))
          recoveryConflict(
            manifestPath,
            manifest,
            "Migration old-root evidence is invalid",
          );
        fs.rmSync(migrationOldRoot, { recursive: true });
      }
      if (
        pathPresent(rollbackOldRoot) ||
        pathPresent(restoreRoot) ||
        pathPresent(migrationOldRoot) ||
        pathPresent(migrationStagingRoot) ||
        !matches(roots.workspaceRoot, manifest, false)
      ) {
        recoveryConflict(
          manifestPath,
          manifest,
          "Rollback cleanup did not reach a terminal evidence state",
        );
      }
      writeManifest(manifestPath, manifest, "ROLLED_BACK");
      return {
        version: VERSION,
        mode: resultMode,
        manifestPath,
        state: "ROLLED_BACK",
      };
    } catch (error) {
      if (error.code === "CONTENT_METADATA_RECOVERY_CONFLICT") throw error;
      throw error;
    }
  }
  function recover() {
    const loaded = loadRecovery();
    const { roots, manifestPath, manifest } = loaded;
    if (manifest.state === "NEEDS_REPAIR" && value.repairConfirmed !== true)
      throw fail(
        "CONTENT_METADATA_REPAIR_CONFIRMATION_REQUIRED",
        "Recovery of NEEDS_REPAIR requires explicit repair confirmation",
      );
    if (
      manifest.state === "NEEDS_REPAIR" &&
      manifest.repairIntent === "rollback"
    )
      return recoverRollback(loaded);
    if (manifest.state === "COMMITTED") {
      try {
        if (
          !matches(roots.workspaceRoot, manifest, true) ||
          pathPresent(stagingRootFor(roots, manifest)) ||
          pathPresent(oldRootFor(roots, manifest)) ||
          pathPresent(restoreRootFor(roots, manifest)) ||
          pathPresent(rollbackOldRootFor(roots, manifest))
        )
          recoveryConflict(
            manifestPath,
            manifest,
            "Committed migration evidence is incomplete",
          );
      } catch (error) {
        recoveryConflict(
          manifestPath,
          manifest,
          "Committed migration evidence is unsafe",
          error,
        );
      }
      return {
        version: VERSION,
        mode: "recover",
        manifestPath,
        noOp: true,
        state: manifest.state,
      };
    }
    if (manifest.state === "ROLLED_BACK") {
      try {
        const rollbackOldRoot = rollbackOldRootFor(roots, manifest);
        if (
          !matches(roots.workspaceRoot, manifest, false) ||
          pathPresent(rollbackOldRoot) ||
          pathPresent(restoreRootFor(roots, manifest)) ||
          pathPresent(stagingRootFor(roots, manifest)) ||
          pathPresent(oldRootFor(roots, manifest))
        )
          recoveryConflict(
            manifestPath,
            manifest,
            "Rolled-back migration evidence is incomplete",
          );
      } catch (error) {
        recoveryConflict(
          manifestPath,
          manifest,
          "Rolled-back migration evidence is unsafe",
          error,
        );
      }
      return {
        version: VERSION,
        mode: "recover",
        manifestPath,
        noOp: true,
        state: manifest.state,
      };
    }
    if (manifest.state === "ROLLBACK_COMMITTING")
      return recoverRollback(loaded);
    if (
      pathPresent(restoreRootFor(roots, manifest)) ||
      pathPresent(rollbackOldRootFor(roots, manifest))
    ) {
      recoveryConflict(
        manifestPath,
        manifest,
        "Forward recovery has residual rollback evidence",
        null,
        "forward",
      );
    }
    if (
      manifest.state === "PREPARED" ||
      manifest.state === "STAGING_VERIFIED" ||
      (manifest.state === "NEEDS_REPAIR" &&
        value.repairConfirmed === true &&
        matches(roots.workspaceRoot, manifest, false) &&
        !pathPresent(oldRootFor(roots, manifest)))
    ) {
      try {
        if (
          !matches(roots.workspaceRoot, manifest, false) ||
          pathPresent(oldRootFor(roots, manifest))
        )
          recoveryConflict(
            manifestPath,
            manifest,
            "Prepared migration evidence is contradictory",
          );
        if (!matches(stagingRootFor(roots, manifest), manifest, true))
          rebuildStaging(roots, manifestPath, manifest);
        else if (manifest.state !== "STAGING_VERIFIED")
          writeManifest(manifestPath, manifest, "STAGING_VERIFIED");
        writeManifest(manifestPath, manifest, "COMMITTING");
      } catch (error) {
        recoveryConflict(
          manifestPath,
          manifest,
          "Prepared migration evidence is unsafe",
          error,
        );
      }
    }
    let workspaceBefore;
    let workspaceAfter;
    const oldRoot = oldRootFor(roots, manifest);
    const stagingRoot = stagingRootFor(roots, manifest);
    let oldBefore;
    let oldResidual;
    let stagingAfter;
    try {
      workspaceBefore = matches(roots.workspaceRoot, manifest, false);
      workspaceAfter = matches(roots.workspaceRoot, manifest, true);
      oldBefore = matches(oldRoot, manifest, false);
      oldResidual = residualBefore(oldRoot, manifest);
      stagingAfter = matches(stagingRoot, manifest, true);
      if (workspaceBefore && stagingAfter && !pathPresent(oldRoot)) {
        fs.renameSync(roots.workspaceRoot, oldRoot);
        writeManifest(manifestPath, manifest, "OLD_ROOT_READY");
        fs.renameSync(stagingRoot, roots.workspaceRoot);
        writeManifest(manifestPath, manifest, "INSTALLED");
      } else if (
        !pathPresent(roots.workspaceRoot) &&
        oldBefore &&
        stagingAfter
      ) {
        if (manifest.state !== "OLD_ROOT_READY")
          writeManifest(manifestPath, manifest, "OLD_ROOT_READY");
        fs.renameSync(stagingRoot, roots.workspaceRoot);
        writeManifest(manifestPath, manifest, "INSTALLED");
      } else if (
        workspaceAfter &&
        !pathPresent(stagingRoot) &&
        (oldBefore || oldResidual || !pathPresent(oldRoot))
      ) {
        writeManifest(manifestPath, manifest, "INSTALLED");
      } else
        recoveryConflict(
          manifestPath,
          manifest,
          "Migration recovery evidence is contradictory",
        );
      if (!matches(roots.workspaceRoot, manifest, true))
        recoveryConflict(
          manifestPath,
          manifest,
          "Installed workspace does not match target inventory",
        );
      writeManifest(manifestPath, manifest, "CLEANUP_PENDING");
      removeOldRoot(roots, manifest);
      writeManifest(manifestPath, manifest, "COMMITTED");
      return {
        version: VERSION,
        mode: "recover",
        manifestPath,
        state: "COMMITTED",
      };
    } catch (error) {
      if (error.code === "CONTENT_METADATA_RECOVERY_CONFLICT") {
        throw error;
      }
      if (error.code === "CONTENT_METADATA_OLDROOT_CONFLICT") {
        writeManifest(manifestPath, manifest, "NEEDS_REPAIR");
      } else {
        let installed = false;
        try {
          installed = Boolean(matches(roots.workspaceRoot, manifest, true));
        } catch (_) {}
        if (installed) writeManifest(manifestPath, manifest, "CLEANUP_PENDING");
        else
          recoveryConflict(
            manifestPath,
            manifest,
            "Migration recovery evidence is unsafe",
            error,
          );
      }
      throw error;
    }
  }
  function execute() {
    if (value.confirmed !== true)
      throw fail(
        "CONTENT_METADATA_CONFIRMATION_REQUIRED",
        "Execute requires explicit confirmation",
      );
    const result = scan(value);
    if (result.report.repairItems.length)
      throw fail(
        "CONTENT_METADATA_REPAIR_REQUIRED",
        "Metadata migration has unexplained repair items",
      );
    if (!result.roots.backupRoot)
      throw fail(
        "CONTENT_METADATA_BACKUP_REQUIRED",
        "Execute requires an independent backup path",
      );
    const backupRoot = result.roots.backupRoot;
    const manifestPath = path.join(
      backupRoot,
      "content-metadata-v1-manifest.json",
    );
    const snapshotRoot = path.join(backupRoot, "snapshot");
    if (pathPresent(manifestPath)) {
      const existing = validateManifest(
        JSON.parse(fs.readFileSync(manifestPath, "utf8")),
        result.roots,
      );
      if (existing.state === "COMMITTED" || existing.state === "ROLLED_BACK") {
        validateSnapshot(existing, snapshotRoot);
        if (existing.state === "ROLLED_BACK")
          throw fail(
            "CONTENT_METADATA_ROLLED_BACK_REEXECUTE_REQUIRED",
            "A rolled-back migration requires a new independent backup",
          );
        if (
          result.report.writes !== 0 ||
          !inventoryEqual(
            collectFiles(result.roots.workspaceRoot),
            existing.files,
            true,
          )
        )
          throw fail(
            "CONTENT_METADATA_WORKSPACE_CHANGED",
            "Workspace does not match the committed migration result",
          );
        result.report.mode = "execute";
        result.report.backupPath = backupRoot;
        result.report.manifestPath = manifestPath;
        result.report.noOp = true;
        return result.report;
      }
      return recover();
    }
    if (pathPresent(backupRoot) && fs.readdirSync(backupRoot).length)
      throw fail(
        "CONTENT_METADATA_BACKUP_NOT_EMPTY",
        "Backup path must be empty",
      );
    fs.mkdirSync(snapshotRoot, { recursive: true });
    fs.cpSync(result.roots.workspaceRoot, snapshotRoot, {
      recursive: true,
      force: false,
      dereference: false,
    });
    const before = collectFiles(snapshotRoot);
    const transactionId = crypto.randomUUID();
    const after = before.map((entry) => {
      const action = result.actions.find(
        (candidate) => candidate.path === entry.path,
      );
      if (!action)
        return { path: entry.path, size: entry.size, sha256: entry.sha256 };
      const source = path.join(snapshotRoot, entry.path);
      const metadata = jsonFile(source);
      metadata.metadataVersion = VERSION;
      const encoded = Buffer.from(
        JSON.stringify(metadata, null, 2) + "\n",
        "utf8",
      );
      return {
        path: entry.path,
        size: encoded.length,
        sha256: crypto.createHash("sha256").update(encoded).digest("hex"),
      };
    });
    const manifest = {
      version: VERSION,
      schema: SCHEMA,
      transactionId,
      createdAt: clock(),
      state: "PREPARED",
      workspace: result.roots.workspaceRoot,
      files: before.map((entry, index) => ({
        path: entry.path,
        size: entry.size,
        sha256: entry.sha256,
        after: { size: after[index].size, sha256: after[index].sha256 },
      })),
    };
    atomicWrite(manifestPath, manifest);
    const stagingRoot = stagingRootFor(result.roots, manifest);
    try {
      fs.cpSync(snapshotRoot, stagingRoot, {
        recursive: true,
        force: false,
        dereference: false,
      });
      result.actions.forEach((action) => {
        const filename = path.join(stagingRoot, action.path);
        const metadata = jsonFile(filename);
        metadata.metadataVersion = VERSION;
        atomicWrite(filename, metadata);
      });
      if (!inventoryEqual(collectFiles(stagingRoot), manifest.files, true))
        throw fail(
          "CONTENT_METADATA_TARGET_VERIFY_FAILED",
          "Staged migration inventory does not match manifest",
        );
      writeManifest(manifestPath, manifest, "STAGING_VERIFIED");
      writeManifest(manifestPath, manifest, "COMMITTING");
      const current = collectFiles(result.roots.workspaceRoot);
      if (!inventoryEqual(current, manifest.files))
        throw fail(
          "CONTENT_METADATA_WORKSPACE_CHANGED",
          "Workspace changed during migration preparation",
        );
      const oldRoot = oldRootFor(result.roots, manifest);
      fs.renameSync(result.roots.workspaceRoot, oldRoot);
      writeManifest(manifestPath, manifest, "OLD_ROOT_READY");
      fs.renameSync(stagingRoot, result.roots.workspaceRoot);
      if (
        !inventoryEqual(
          collectFiles(result.roots.workspaceRoot),
          manifest.files,
          true,
        )
      )
        throw fail(
          "CONTENT_METADATA_TARGET_VERIFY_FAILED",
          "Committed migration inventory does not match manifest",
        );
      writeManifest(manifestPath, manifest, "INSTALLED");
      writeManifest(manifestPath, manifest, "CLEANUP_PENDING");
      removeOldRoot(result.roots, manifest);
      writeManifest(manifestPath, manifest, "COMMITTED");
      result.report.mode = "execute";
      result.report.backupPath = backupRoot;
      result.report.manifestPath = manifestPath;
      return result.report;
    } catch (error) {
      error.recovery = { backupPath: backupRoot, manifestPath };
      throw error;
    }
  }
  function rollback() {
    const roots = validatePaths(value, true);
    if (!roots.backupRoot || !pathPresent(roots.backupRoot))
      throw fail(
        "CONTENT_METADATA_BACKUP_REQUIRED",
        "Rollback requires an existing backup",
      );
    const manifestPath = path.join(
      roots.backupRoot,
      "content-metadata-v1-manifest.json",
    );
    if (!pathPresent(manifestPath))
      throw fail(
        "CONTENT_METADATA_MANIFEST_MISSING",
        "Migration manifest is missing",
      );
    let manifest;
    try {
      regular(manifestPath);
      manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    } catch (_) {
      throw fail(
        "CONTENT_METADATA_MANIFEST_INVALID",
        "Migration manifest is invalid",
      );
    }
    validateManifest(manifest, roots);
    ensureBackupLayout(roots, manifestPath);
    const snapshotRoot = path.join(roots.backupRoot, "snapshot");
    validateSnapshot(manifest, snapshotRoot);
    if (manifest.state === "NEEDS_REPAIR") {
      if (value.repairConfirmed !== true)
        throw fail(
          "CONTENT_METADATA_REPAIR_CONFIRMATION_REQUIRED",
          "Rollback of NEEDS_REPAIR requires explicit repair confirmation",
        );
      if (manifest.repairIntent === "rollback")
        return recoverRollback({
          roots,
          manifestPath,
          manifest,
          mode: "rollback",
        });
    }
    if (manifest.state === "ROLLBACK_COMMITTING")
      return recoverRollback({
        roots,
        manifestPath,
        manifest,
        mode: "rollback",
      });
    if (manifest.state === "ROLLED_BACK") {
      if (
        !matches(roots.workspaceRoot, manifest, false) ||
        pathPresent(rollbackOldRootFor(roots, manifest)) ||
        pathPresent(restoreRootFor(roots, manifest)) ||
        pathPresent(stagingRootFor(roots, manifest)) ||
        pathPresent(oldRootFor(roots, manifest))
      )
        throw fail(
          "CONTENT_METADATA_ROLLBACK_CONFLICT",
          "Rolled-back migration evidence is incomplete",
        );
      return {
        version: VERSION,
        mode: "rollback",
        backupPath: roots.backupRoot,
        manifestPath,
        noOp: true,
      };
    }
    if (["PREPARED", "STAGING_VERIFIED"].includes(manifest.state)) {
      const migrationStaging = stagingRootFor(roots, manifest);
      if (
        !matches(roots.workspaceRoot, manifest, false) ||
        pathPresent(oldRootFor(roots, manifest)) ||
        !residualEvidence(migrationStaging, manifest, true)
      ) {
        throw fail(
          "CONTENT_METADATA_ROLLBACK_CONFLICT",
          "Early migration evidence is not safe to abort",
        );
      }
      if (pathPresent(migrationStaging))
        fs.rmSync(migrationStaging, { recursive: true });
      writeManifest(manifestPath, manifest, "ROLLED_BACK");
      return {
        version: VERSION,
        mode: "rollback",
        backupPath: roots.backupRoot,
        manifestPath,
        state: "ROLLED_BACK",
      };
    }
    if (!["COMMITTED", "CLEANUP_PENDING", "INSTALLED"].includes(manifest.state))
      throw fail(
        "CONTENT_METADATA_RECOVERY_REQUIRED",
        "Migration was not committed and requires explicit recovery",
      );
    if (!matches(roots.workspaceRoot, manifest, true))
      throw fail(
        "CONTENT_METADATA_ROLLBACK_CONFLICT",
        "Workspace differs from the committed migration result",
      );
    const stagingRoot = restoreRootFor(roots, manifest);
    if (
      pathPresent(stagingRoot) ||
      pathPresent(stagingRootFor(roots, manifest))
    )
      throw fail(
        "CONTENT_METADATA_ROLLBACK_CONFLICT",
        "Rollback has residual restore or staging evidence",
      );
    fs.cpSync(snapshotRoot, stagingRoot, {
      recursive: true,
      force: false,
      dereference: false,
    });
    if (!matches(stagingRoot, manifest, false))
      throw fail(
        "CONTENT_METADATA_RESTORE_VERIFY_FAILED",
        "Restore staging does not match backup snapshot",
      );
    writeManifest(manifestPath, manifest, "ROLLBACK_COMMITTING");
    return recoverRollback({ roots, manifestPath, manifest, mode: "rollback" });
  }
  return { dryRun, execute, rollback, recover };
}

function main(argv) {
  const args = argv || process.argv.slice(2);
  const value = {
    dryRun: args.includes("--dry-run"),
    execute: args.includes("--execute"),
    rollback: args.includes("--rollback"),
    recover: args.includes("--recover"),
    confirmed: args.includes("--confirm"),
    repairConfirmed: args.includes("--confirm-repair"),
  };
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--workspace") value.workspaceRoot = args[++i];
    if (args[i] === "--backup") value.backupRoot = args[++i];
  }
  if (
    [value.dryRun, value.execute, value.rollback, value.recover].filter(Boolean)
      .length !== 1
  )
    throw fail("CONTENT_METADATA_ARGUMENT_INVALID", "Choose exactly one mode");
  const migration = createMigration(value);
  return value.rollback
    ? migration.rollback()
    : value.recover
      ? migration.recover()
      : value.execute
        ? migration.execute()
        : migration.dryRun();
}
if (require.main === module) {
  try {
    process.stdout.write(JSON.stringify(main()) + "\n");
  } catch (error) {
    process.stderr.write(
      JSON.stringify({
        code: error.code || "CONTENT_METADATA_MIGRATION_FAILED",
        message: error.message,
      }) + "\n",
    );
    process.exitCode = 1;
  }
}
module.exports = { VERSION, createMigration, main };
