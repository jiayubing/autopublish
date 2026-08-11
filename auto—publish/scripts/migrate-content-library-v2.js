"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const MIGRATION_VERSION = 2;
const MANIFEST_NAME = "content-library-v2-migration-manifest.json";
const COMPLETION_MARKER_NAME = "content-library-v2-migration-complete.json";
const APP_CONFIG_BACKUP_SUFFIX = ".content-library-v2-migration-backup";
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

// These are the only legacy locations that are allowed to cross the install
// boundary. Unknown folders are intentionally left in place and unreported.
const MAPPINGS = [
  {
    source: "clients",
    target: "clients",
    destination: "content",
    category: "portable",
  },
  {
    source: "generated",
    target: "generated",
    destination: "content",
    category: "portable",
  },
  {
    source: "templates",
    target: "templates",
    destination: "content",
    category: "portable",
  },
  {
    source: "research",
    target: ".autopublish/research",
    destination: "content",
    category: "portable",
  },
  {
    source: "data/research",
    target: ".autopublish/research",
    destination: "content",
    category: "portable",
  },
  {
    source: "data/content-generation-batches",
    target: ".autopublish/batches",
    destination: "content",
    category: "portable",
  },
  {
    source: "data/submission-queues",
    target: ".autopublish/queue",
    destination: "content",
    category: "portable",
  },
  {
    source: "data/submission-records",
    target: ".autopublish/submission-records",
    destination: "content",
    category: "portable",
  },
  {
    source: "data/media-resources.json",
    target: ".autopublish/data/media-resources.json",
    destination: "content",
    category: "portable",
  },
  {
    source: "data/media-pool.json",
    target: ".autopublish/data/media-pool.json",
    destination: "content",
    category: "portable",
  },
  {
    source: "data/media-drafts.json",
    target: ".autopublish/data/media-drafts.json",
    destination: "content",
    category: "portable",
  },
  {
    source: "data/submission-orders.jsonl",
    target: ".autopublish/data/submission-orders.jsonl",
    destination: "content",
    category: "portable",
  },
  {
    source: "input",
    target: ".autopublish/input",
    destination: "content",
    category: "portable",
  },
  {
    source: "published",
    target: ".autopublish/published",
    destination: "content",
    category: "portable",
  },
  { source: "logs", target: "logs", destination: "local", category: "local" },
  {
    source: "work/client-material-cache",
    target: "cache/client-material",
    destination: "local",
    category: "local",
  },
  {
    source: "work/playwright-cli/profiles/doubao",
    target: "browser/doubao",
    destination: "local",
    category: "local",
  },
  {
    source: "work/playwright-cli/profiles/lieju",
    target: "browser/profiles/lieju",
    destination: "local",
    category: "local",
  },
  {
    source: "work/playwright-cli/profiles/toutiao",
    target: "browser/profiles/toutiao",
    destination: "local",
    category: "local",
  },
  {
    source: "work/playwright-cli/state",
    target: "browser/state",
    destination: "local",
    category: "local",
  },
  {
    source: "browser",
    target: "browser",
    destination: "local",
    category: "local",
  },
  { source: "tmp", target: "tmp", destination: "local", category: "local" },
];

// Only non-secret runtime tools may cross the content-library boundary. AI and
// platform provider credentials are reported for the desktop's explicit,
// safeStorage-backed import flow and are never written by this CLI migrator.
const ALLOWED_ENV_KEYS = new Set([
  "PLAYWRIGHT_CLI_JS",
  "AUTO_PUBLISH_NODE_EXEC_PATH",
]);
const LEGACY_PROVIDER_ENV_KEYS = new Set([
  "HEPAN_PYTHON",
  "HEPAN_COOKIE_PATH",
  "HEPAN_VENDOR_DIR",
  "HEPAN_CATEGORY_ID",
  "XQW_API_KEY",
  "XQW_BASE_URL",
  "XQW_TIMEOUT_MS",
  "XQW_ALLOW_INSECURE",
]);

function migrationError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function cleanupFailure(code) {
  return migrationError(code, "Migration cleanup could not be verified");
}

function attachCleanupFailure(primary, cleanup) {
  if (!cleanup) return primary;
  if (primary) {
    primary.cleanupCode = cleanup.code;
    return primary;
  }
  return cleanup;
}

function removeTemporary(filename) {
  try {
    fs.unlinkSync(filename);
    return null;
  } catch (error) {
    if (error && error.code === "ENOENT") return null;
    return cleanupFailure("MIGRATION_TEMP_CLEANUP_FAILED");
  }
}

function absolute(value, name) {
  if (typeof value !== "string" || !value.trim() || !path.isAbsolute(value)) {
    throw migrationError(
      "MIGRATION_PATH_INVALID",
      name + " must be an absolute path",
    );
  }
  return path.resolve(value);
}

function volumeOf(filename) {
  const win = path.win32.parse(filename).root;
  if (win) return win.toLowerCase();
  return path.parse(filename).root.toLowerCase();
}

function isWithin(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return (
    relative === "" ||
    (relative !== ".." &&
      !relative.startsWith(".." + path.sep) &&
      !path.isAbsolute(relative))
  );
}

function validateMigrationPaths(options) {
  const sourceRoot = absolute(options.sourceRoot, "sourceRoot");
  const contentLibraryRoot = absolute(
    options.contentLibraryRoot,
    "contentLibraryRoot",
  );
  const localStateRoot = absolute(options.localStateRoot, "localStateRoot");
  const appConfigPath = absolute(options.appConfigPath, "appConfigPath");
  const roots = [
    ["sourceRoot", sourceRoot],
    ["contentLibraryRoot", contentLibraryRoot],
    ["localStateRoot", localStateRoot],
    ["appConfigPath", appConfigPath],
  ];
  for (let i = 0; i < roots.length; i += 1) {
    for (let j = i + 1; j < roots.length; j += 1) {
      if (
        isWithin(roots[i][1], roots[j][1]) ||
        isWithin(roots[j][1], roots[i][1])
      ) {
        throw migrationError(
          "MIGRATION_PATH_OVERLAP",
          roots[i][0] + " and " + roots[j][0] + " must not overlap",
        );
      }
    }
  }
  const volumes = new Set(
    roots
      .map(function (item) {
        return volumeOf(item[1]);
      })
      .filter(Boolean),
  );
  return {
    sourceRoot,
    contentLibraryRoot,
    localStateRoot,
    appConfigPath,
    crossVolume: volumes.size > 1,
  };
}

function rejectSymlink(filename) {
  let stats;
  try {
    stats = fs.lstatSync(filename);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
  if (stats.isSymbolicLink())
    throw migrationError(
      "MIGRATION_SYMLINK_UNSAFE",
      "Migration refuses symbolic links",
    );
  return stats;
}

function ensureDestinationRoot(root) {
  const stats = rejectSymlink(root);
  if (stats && !stats.isDirectory())
    throw migrationError(
      "MIGRATION_TARGET_INVALID",
      "Migration target is not a directory",
    );
}

function sha256(filename) {
  return crypto
    .createHash("sha256")
    .update(fs.readFileSync(filename))
    .digest("hex");
}

function parseEnv(contents) {
  const values = {};
  for (const line of String(contents).split(/\r?\n/)) {
    const match = line.match(
      /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/,
    );
    if (!match) continue;
    let value = match[2];
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    )
      value = value.slice(1, -1);
    values[match[1]] = value;
  }
  return values;
}

function relativeTarget(root, filename) {
  return path.relative(root, filename).replace(/\\/g, "/");
}

function collectFiles(sourceRoot, mapping, destinationRoot, records) {
  const sourceBase = path.join(sourceRoot, mapping.source);
  const sourceStats = rejectSymlink(sourceBase);
  if (!sourceStats) return false;
  function visit(current, relative) {
    const currentStats = rejectSymlink(current);
    if (!currentStats || currentStats.isFile()) {
      if (currentStats && currentStats.isFile()) {
        const target = path.join(destinationRoot, mapping.target, relative);
        records.push({
          source: path.relative(sourceRoot, current).replace(/\\/g, "/"),
          target: relativeTarget(destinationRoot, target),
          sourcePath: current,
          targetPath: target,
          category: mapping.category,
          destination: mapping.destination,
          sha256: sha256(current),
          bytes: currentStats.size,
        });
      }
      return;
    }
    if (!currentStats.isDirectory())
      throw migrationError(
        "MIGRATION_SOURCE_INVALID",
        "Migration source entry is not a regular file or directory",
      );
    for (const entry of fs
      .readdirSync(current, { withFileTypes: true })
      .sort(function (a, b) {
        return a.name.localeCompare(b.name);
      })) {
      const child = path.join(current, entry.name);
      const childRelative = relative
        ? path.join(relative, entry.name)
        : entry.name;
      if (entry.isSymbolicLink())
        throw migrationError(
          "MIGRATION_SYMLINK_UNSAFE",
          "Migration refuses symbolic links",
        );
      visit(child, childRelative);
    }
  }
  visit(sourceBase, "");
  return true;
}

function inspectDestination(records, roots) {
  const conflicts = [];
  const duplicates = [];
  const byTarget = new Map();
  for (const record of records) {
    if (!byTarget.has(record.target)) byTarget.set(record.target, []);
    byTarget.get(record.target).push(record);
  }
  for (const [target, matches] of byTarget.entries()) {
    if (matches.length > 1) {
      duplicates.push({
        target,
        sources: matches.map(function (item) {
          return item.source;
        }),
      });
      const hashes = new Set(
        matches.map(function (item) {
          return item.sha256;
        }),
      );
      if (hashes.size > 1)
        conflicts.push({ code: "DUPLICATE_CONFLICT", target });
      else matches.splice(1);
    }
  }
  for (const record of records) {
    const stats = rejectSymlink(record.targetPath);
    if (!stats) continue;
    if (!stats.isFile() || sha256(record.targetPath) !== record.sha256)
      conflicts.push({ code: "TARGET_CONFLICT", target: record.target });
  }
  if (
    fs.existsSync(roots.contentLibraryRoot) &&
    fs.readdirSync(roots.contentLibraryRoot).length
  )
    roots.destinationNonEmpty = true;
  if (
    fs.existsSync(roots.localStateRoot) &&
    fs.readdirSync(roots.localStateRoot).length
  )
    roots.destinationNonEmpty = true;
  return {
    conflicts,
    duplicates,
    records: records.filter(function (record) {
      return byTarget.get(record.target)[0] === record;
    }),
  };
}

function atomicWrite(filename, contents) {
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  const retryable = new Set(["EPERM", "EACCES", "EBUSY", "UNKNOWN"]);
  let lastError;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const temp =
      filename +
      ".tmp-" +
      process.pid +
      "-" +
      crypto.randomBytes(6).toString("hex");
    let primaryError = null;
    try {
      fs.writeFileSync(temp, contents, "utf8");
      // A locked destination may make Windows rename fail temporarily. Retry
      // the atomic replacement, but never fall back to copy/write: both
      // operations can truncate or overwrite the last valid migration proof.
      fs.renameSync(temp, filename);
    } catch (error) {
      primaryError = error;
    }
    const cleanup = removeTemporary(temp);
    if (primaryError) {
      lastError = attachCleanupFailure(primaryError, cleanup);
      if (cleanup) throw lastError;
      if (!retryable.has(primaryError.code) || attempt === 19) throw lastError;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
      continue;
    }
    if (cleanup) throw cleanup;
    return;
  }
  throw lastError;
}

function appConfigBackupPath(filename) {
  return filename + APP_CONFIG_BACKUP_SUFFIX;
}

function copyAtomic(source, target) {
  const temporary =
    target +
    ".tmp-" +
    process.pid +
    "-" +
    crypto.randomBytes(6).toString("hex");
  let primaryError = null;
  try {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, temporary);
    fs.renameSync(temporary, target);
  } catch (error) {
    primaryError = error;
  }
  const cleanup = removeTemporary(temporary);
  if (primaryError) throw attachCleanupFailure(primaryError, cleanup);
  if (cleanup) throw cleanup;
}

function readJson(filename, code) {
  try {
    return JSON.parse(fs.readFileSync(filename, "utf8"));
  } catch (_) {
    throw migrationError(code, "Migration proof is unavailable or invalid");
  }
}

function validateManifestProvenance(manifest, expectedStatus, code) {
  function fail() {
    throw migrationError(code, "Migration provenance is incomplete or invalid");
  }

  if (!manifest || !Array.isArray(manifest.files)) fail();
  const targets = new Set();
  for (const file of manifest.files) {
    if (
      !file ||
      typeof file.source !== "string" ||
      !file.source ||
      typeof file.target !== "string" ||
      !file.target ||
      typeof file.category !== "string" ||
      !["content", "local"].includes(file.destination) ||
      !Number.isInteger(file.bytes) ||
      file.bytes < 0 ||
      !SHA256_PATTERN.test(file.sha256) ||
      targets.has(file.target)
    )
      fail();
    targets.add(file.target);
  }

  const rollback = manifest.rollback;
  if (
    !rollback ||
    !Array.isArray(rollback.preexistingTargets) ||
    !Array.isArray(rollback.createdTargets) ||
    !rollback.appConfig
  )
    fail();
  const preexistingTargets = new Set(rollback.preexistingTargets);
  const createdTargets = new Set(rollback.createdTargets);
  if (
    preexistingTargets.size !== rollback.preexistingTargets.length ||
    createdTargets.size !== rollback.createdTargets.length ||
    rollback.preexistingTargets.some(
      (target) => typeof target !== "string" || !targets.has(target),
    ) ||
    rollback.createdTargets.some(
      (target) => typeof target !== "string" || !targets.has(target),
    )
  )
    fail();
  for (const target of preexistingTargets)
    if (createdTargets.has(target)) fail();

  const completedFiles = manifest.completedFiles;
  if (!Array.isArray(completedFiles)) fail();
  const completed = new Set(completedFiles);
  if (
    completed.size !== completedFiles.length ||
    completedFiles.some(
      (target) => typeof target !== "string" || !targets.has(target),
    )
  )
    fail();
  for (const target of completed)
    if (!preexistingTargets.has(target) && !createdTargets.has(target)) fail();

  for (const target of preexistingTargets) if (!targets.has(target)) fail();
  for (const target of createdTargets) if (!targets.has(target)) fail();

  const appConfig = rollback.appConfig;
  if (
    typeof appConfig.existed !== "boolean" ||
    typeof appConfig.backup !== "boolean" ||
    appConfig.backup !== appConfig.existed ||
    (appConfig.existed
      ? !SHA256_PATTERN.test(appConfig.beforeSha256)
      : appConfig.beforeSha256 !== null) ||
    (appConfig.migratedSha256 !== null &&
      !SHA256_PATTERN.test(appConfig.migratedSha256)) ||
    typeof appConfig.pending !== "boolean"
  )
    fail();

  if (expectedStatus === "complete") {
    if (
      completed.size !== targets.size ||
      preexistingTargets.size + createdTargets.size !== targets.size
    )
      fail();
  }

  return {
    targets,
    preexistingTargets,
    createdTargets,
    completed,
  };
}

function readVerifiedCompletionMarker(
  markerPath,
  manifestPath,
  expectedStatus,
  code,
) {
  const marker = readJson(markerPath, code);
  let actualManifestSha256;
  try {
    actualManifestSha256 = sha256(manifestPath);
  } catch (_) {
    throw migrationError(code, "Migration completion proof is unavailable");
  }
  if (
    marker.version !== MIGRATION_VERSION ||
    marker.status !== expectedStatus ||
    marker.manifest !== MANIFEST_NAME ||
    !SHA256_PATTERN.test(marker.manifestSha256) ||
    marker.manifestSha256 !== actualManifestSha256
  )
    throw migrationError(code, "Migration completion proof does not match");
  return marker;
}

function parseArguments(argv) {
  const args = Array.from(argv || []);
  const options = {};
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (
      [
        "--source",
        "--content-library",
        "--local-state",
        "--app-config",
      ].includes(arg)
    ) {
      if (!args[i + 1] || args[i + 1].startsWith("--"))
        throw migrationError(
          "MIGRATION_ARGUMENT_INVALID",
          arg + " requires a value",
        );
      options[
        arg.slice(2).replace(/-([a-z])/g, function (_, letter) {
          return letter.toUpperCase();
        })
      ] = args[++i];
    } else if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--execute") options.execute = true;
    else if (arg === "--rollback") options.rollback = true;
    else
      throw migrationError(
        "MIGRATION_ARGUMENT_INVALID",
        "Unknown migration argument",
      );
  }
  for (const key of ["source", "contentLibrary", "localState", "appConfig"]) {
    if (!options[key])
      throw migrationError(
        "MIGRATION_ARGUMENT_INVALID",
        "--" +
          key.replace(/[A-Z]/g, function (letter) {
            return "-" + letter.toLowerCase();
          }) +
          " is required",
      );
  }
  const selectedModes = [
    options.dryRun,
    options.execute,
    options.rollback,
  ].filter(Boolean).length;
  if (selectedModes !== 1)
    throw migrationError(
      "MIGRATION_ARGUMENT_INVALID",
      "Choose exactly one of --dry-run, --execute, or --rollback",
    );
  return {
    sourceRoot: options.source,
    contentLibraryRoot: options.contentLibrary,
    localStateRoot: options.localState,
    appConfigPath: options.appConfig,
    mode: options.execute
      ? "execute"
      : options.rollback
        ? "rollback"
        : "dry-run",
  };
}

function createContentLibraryMigrator(options) {
  const opts = options || {};
  const roots = validateMigrationPaths(opts);
  const clock =
    typeof opts.clock === "function"
      ? opts.clock
      : function () {
          return new Date().toISOString();
        };
  const copyFile =
    typeof opts.copyFile === "function" ? opts.copyFile : fs.copyFileSync;
  const manifestPath = path.join(
    roots.contentLibraryRoot,
    ".autopublish",
    MANIFEST_NAME,
  );
  const completionMarkerPath = path.join(
    roots.contentLibraryRoot,
    ".autopublish",
    COMPLETION_MARKER_NAME,
  );

  function plan() {
    rejectSymlink(roots.sourceRoot);
    ensureDestinationRoot(roots.contentLibraryRoot);
    ensureDestinationRoot(roots.localStateRoot);
    const records = [];
    const missing = [];
    for (const mapping of MAPPINGS) {
      const destinationRoot =
        mapping.destination === "content"
          ? roots.contentLibraryRoot
          : roots.localStateRoot;
      if (!collectFiles(roots.sourceRoot, mapping, destinationRoot, records))
        missing.push({ source: mapping.source, target: mapping.target });
    }
    const envPath = path.join(roots.sourceRoot, ".env");
    if (!rejectSymlink(envPath))
      missing.push({ source: ".env", target: "appConfigPath" });
    const inspected = inspectDestination(records, roots);
    if (fs.existsSync(roots.appConfigPath)) {
      const stats = rejectSymlink(roots.appConfigPath);
      if (!stats || !stats.isFile())
        inspected.conflicts.push({
          code: "APP_CONFIG_CONFLICT",
          target: "appConfigPath",
        });
    }
    const envValues = rejectSymlink(envPath)
      ? parseEnv(fs.readFileSync(envPath, "utf8"))
      : {};
    const platformRuntime = {};
    for (const key of ALLOWED_ENV_KEYS)
      if (Object.prototype.hasOwnProperty.call(envValues, key))
        platformRuntime[key] = envValues[key];
    const legacyProviderConfig = {
      media: Object.keys(envValues).some(
        (key) => LEGACY_PROVIDER_ENV_KEYS.has(key) && key.startsWith("XQW_"),
      ),
      hepan: Object.keys(envValues).some(
        (key) => LEGACY_PROVIDER_ENV_KEYS.has(key) && key.startsWith("HEPAN_"),
      ),
      source: Object.keys(envValues).some((key) =>
        LEGACY_PROVIDER_ENV_KEYS.has(key),
      )
        ? "workspace-env"
        : null,
    };
    const appConfig = { version: 1, values: platformRuntime };
    if (
      fs.existsSync(roots.appConfigPath) &&
      inspected.conflicts.length === 0
    ) {
      try {
        const existing = JSON.parse(
          fs.readFileSync(roots.appConfigPath, "utf8"),
        );
        const existingValues =
          existing && existing.values && typeof existing.values === "object"
            ? existing.values
            : {};
        const existingSafe = {};
        for (const key of ALLOWED_ENV_KEYS)
          if (Object.prototype.hasOwnProperty.call(existingValues, key))
            existingSafe[key] = existingValues[key];
        if (JSON.stringify(existingSafe) !== JSON.stringify(platformRuntime))
          inspected.conflicts.push({
            code: "APP_CONFIG_CONFLICT",
            target: "appConfigPath",
          });
      } catch (_) {
        inspected.conflicts.push({
          code: "APP_CONFIG_CONFLICT",
          target: "appConfigPath",
        });
      }
    }
    return {
      records: inspected.records,
      missing,
      duplicates: inspected.duplicates,
      conflicts: inspected.conflicts,
      appConfig,
      legacyProviderConfig,
      envPath,
      destinationNonEmpty: Boolean(roots.destinationNonEmpty),
      crossVolume: roots.crossVolume,
    };
  }

  function resultFor(currentPlan, mode, extra) {
    const copied = (extra && extra.copied) || 0;
    const skipped = (extra && extra.skipped) || 0;
    return Object.assign(
      {
        mode,
        safe: currentPlan.conflicts.length === 0,
        completed: mode === "execute" && !currentPlan.conflicts.length,
        writes: mode === "execute" ? copied : 0,
        summary: {
          planned: currentPlan.records.length,
          copied,
          skipped,
          missing: currentPlan.missing.length,
          conflicts: currentPlan.conflicts.length,
          duplicates: currentPlan.duplicates.length,
        },
        missing: currentPlan.missing,
        conflicts: currentPlan.conflicts,
        duplicates: currentPlan.duplicates,
        destinationNonEmpty: currentPlan.destinationNonEmpty,
        crossVolume: currentPlan.crossVolume,
        legacyProviderConfig: currentPlan.legacyProviderConfig,
        manifestPath,
        completionMarkerPath,
      },
      extra || {},
    );
  }

  function dryRun() {
    return resultFor(plan(), "dry-run");
  }

  function migrate(execution) {
    const confirmation = execution || {};
    if (!confirmation.confirmed)
      throw migrationError(
        "MIGRATION_CONFIRMATION_REQUIRED",
        "Migration requires explicit execution confirmation",
      );
    const currentPlan = plan();
    if (currentPlan.conflicts.length)
      throw migrationError(
        "MIGRATION_CONFLICT",
        "Migration has unresolved destination conflicts",
      );
    const files = currentPlan.records.map(function (record) {
      return {
        source: record.source,
        target: record.target,
        category: record.category,
        destination: record.destination,
        bytes: record.bytes,
        sha256: record.sha256,
      };
    });
    const existingManifest = fs.existsSync(manifestPath)
      ? readJson(manifestPath, "MIGRATION_MANIFEST_INVALID")
      : null;
    const resuming = Boolean(
      existingManifest && existingManifest.status === "in-progress",
    );
    if (
      resuming &&
      (existingManifest.version !== MIGRATION_VERSION ||
        JSON.stringify(existingManifest.files) !== JSON.stringify(files) ||
        !Array.isArray(existingManifest.completedFiles) ||
        !existingManifest.rollback)
    )
      throw migrationError(
        "MIGRATION_IN_PROGRESS_CONFLICT",
        "Existing in-progress migration proof cannot be resumed safely",
      );
    if (resuming)
      validateManifestProvenance(
        existingManifest,
        "in-progress",
        "MIGRATION_IN_PROGRESS_CONFLICT",
      );
    const completed = Boolean(
      existingManifest && existingManifest.status === "complete",
    );
    if (
      completed &&
      (existingManifest.version !== MIGRATION_VERSION ||
        JSON.stringify(existingManifest.files) !== JSON.stringify(files) ||
        !Array.isArray(existingManifest.completedFiles) ||
        !existingManifest.rollback)
    )
      throw migrationError(
        "MIGRATION_COMPLETED_CONFLICT",
        "Existing completed migration proof cannot be replaced",
      );
    if (completed) {
      validateManifestProvenance(
        existingManifest,
        "complete",
        "MIGRATION_COMPLETED_CONFLICT",
      );
      readVerifiedCompletionMarker(
        completionMarkerPath,
        manifestPath,
        "complete",
        "MIGRATION_COMPLETED_CONFLICT",
      );
      const appConfig = existingManifest.rollback.appConfig;
      const backupPath = appConfigBackupPath(roots.appConfigPath);
      const backupStats = rejectSymlink(backupPath);
      const configStats = rejectSymlink(roots.appConfigPath);
      const targetsIntact = currentPlan.records.every((record) => {
        const stats = rejectSymlink(record.targetPath);
        return Boolean(
          stats &&
          stats.isFile() &&
          sha256(record.targetPath) === record.sha256,
        );
      });
      const backupIntact = appConfig.existed
        ? Boolean(
            backupStats &&
            backupStats.isFile() &&
            sha256(backupPath) === appConfig.beforeSha256,
          )
        : !backupStats;
      const configIntact = Boolean(
        configStats &&
        configStats.isFile() &&
        appConfig.migratedSha256 &&
        sha256(roots.appConfigPath) === appConfig.migratedSha256,
      );
      if (!targetsIntact || !backupIntact || !configIntact)
        throw migrationError(
          "MIGRATION_COMPLETED_CONFLICT",
          "Completed migration outputs no longer match rollback proof",
        );
      return resultFor(currentPlan, "execute", {
        copied: 0,
        skipped: currentPlan.records.length,
        completed: true,
      });
    }
    const rollbackPath = appConfigBackupPath(roots.appConfigPath);
    const appConfigExists = Boolean(rejectSymlink(roots.appConfigPath));
    const appConfigHash = appConfigExists ? sha256(roots.appConfigPath) : null;
    let manifest;
    if (resuming) {
      const appConfig = existingManifest.rollback.appConfig;
      const backupStats = rejectSymlink(rollbackPath);
      if (
        (appConfig.existed &&
          (!backupStats ||
            !backupStats.isFile() ||
            sha256(rollbackPath) !== appConfig.beforeSha256)) ||
        (!appConfig.existed && backupStats)
      )
        throw migrationError(
          "MIGRATION_ROLLBACK_BACKUP_CONFLICT",
          "Existing app config rollback proof does not match",
        );
      const configStats = rejectSymlink(roots.appConfigPath);
      const currentConfigHash = configStats
        ? sha256(roots.appConfigPath)
        : null;
      const allowedConfigHashes = [
        appConfig.beforeSha256,
        appConfig.migratedSha256,
      ].filter(Boolean);
      if (
        (appConfig.existed && !currentConfigHash) ||
        (currentConfigHash && !allowedConfigHashes.includes(currentConfigHash))
      )
        throw migrationError(
          "MIGRATION_IN_PROGRESS_CONFLICT",
          "App config changed while migration was in progress",
        );
      manifest = existingManifest;
    } else {
      const existingBackup = rejectSymlink(rollbackPath);
      if (appConfigExists) {
        if (
          existingBackup &&
          (!existingBackup.isFile() || sha256(rollbackPath) !== appConfigHash)
        )
          throw migrationError(
            "MIGRATION_ROLLBACK_BACKUP_CONFLICT",
            "Existing app config rollback backup does not match",
          );
        if (!existingBackup) copyAtomic(roots.appConfigPath, rollbackPath);
      } else if (existingBackup) {
        throw migrationError(
          "MIGRATION_ROLLBACK_BACKUP_CONFLICT",
          "An unexpected app config rollback backup already exists",
        );
      }
      const preexistingTargets = currentPlan.records
        .filter((record) => {
          const stats = rejectSymlink(record.targetPath);
          return Boolean(
            stats &&
            stats.isFile() &&
            sha256(record.targetPath) === record.sha256,
          );
        })
        .map((record) => record.target);
      fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
      manifest = {
        version: MIGRATION_VERSION,
        status: "in-progress",
        startedAt: clock(),
        source: "legacy",
        files,
        completedFiles: [],
        rollback: {
          status: "prepared",
          preexistingTargets,
          createdTargets: [],
          appConfig: {
            existed: appConfigExists,
            beforeSha256: appConfigHash,
            backup: appConfigExists,
            migratedSha256: null,
            pending: false,
          },
        },
      };
      atomicWrite(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
    }
    let copied = 0;
    let skipped = 0;
    try {
      for (const record of currentPlan.records) {
        const current = rejectSymlink(record.targetPath);
        if (
          current &&
          current.isFile() &&
          sha256(record.targetPath) === record.sha256
        ) {
          if (
            !manifest.rollback.preexistingTargets.includes(record.target) &&
            !manifest.rollback.createdTargets.includes(record.target)
          )
            throw migrationError(
              resuming
                ? "MIGRATION_IN_PROGRESS_CONFLICT"
                : "MIGRATION_ROLLBACK_PROOF_INVALID",
              "Existing target ownership is not recorded",
            );
          skipped += 1;
        } else {
          if (manifest.rollback.preexistingTargets.includes(record.target))
            throw migrationError(
              "MIGRATION_IN_PROGRESS_CONFLICT",
              "A pre-existing migration target is missing or changed",
            );
          fs.mkdirSync(path.dirname(record.targetPath), { recursive: true });
          const temporary =
            record.targetPath +
            ".tmp-" +
            process.pid +
            "-" +
            crypto.randomBytes(6).toString("hex");
          let copyError = null;
          try {
            copyFile(record.sourcePath, temporary);
            if (sha256(temporary) !== record.sha256)
              throw migrationError(
                "MIGRATION_CHECKSUM_MISMATCH",
                "Migration checksum verification failed",
              );
            if (!manifest.rollback.createdTargets.includes(record.target)) {
              manifest.rollback.createdTargets.push(record.target);
              atomicWrite(
                manifestPath,
                JSON.stringify(manifest, null, 2) + "\n",
              );
            }
            fs.renameSync(temporary, record.targetPath);
          } catch (error) {
            copyError = error;
          }
          const cleanup = removeTemporary(temporary);
          if (copyError) throw attachCleanupFailure(copyError, cleanup);
          if (cleanup) throw cleanup;
          copied += 1;
        }
        if (!manifest.completedFiles.includes(record.target))
          manifest.completedFiles.push(record.target);
        atomicWrite(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
      }
      const existingConfig = fs.existsSync(roots.appConfigPath)
        ? JSON.parse(fs.readFileSync(roots.appConfigPath, "utf8"))
        : {};
      const existingValues =
        existingConfig &&
        existingConfig.values &&
        typeof existingConfig.values === "object"
          ? existingConfig.values
          : {};
      const safeExistingValues = {};
      for (const key of ALLOWED_ENV_KEYS)
        if (Object.prototype.hasOwnProperty.call(existingValues, key))
          safeExistingValues[key] = existingValues[key];
      const nextConfigContents =
        JSON.stringify(
          {
            version: 1,
            values: Object.assign(
              {},
              safeExistingValues,
              currentPlan.appConfig.values,
            ),
          },
          null,
          2,
        ) + "\n";
      manifest.rollback.appConfig.migratedSha256 = crypto
        .createHash("sha256")
        .update(nextConfigContents)
        .digest("hex");
      manifest.rollback.appConfig.pending = true;
      atomicWrite(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
      atomicWrite(roots.appConfigPath, nextConfigContents);
      manifest.rollback.appConfig.migratedSha256 = sha256(roots.appConfigPath);
      manifest.rollback.appConfig.pending = false;
      manifest.status = "complete";
      manifest.completedAt = clock();
      manifest.appConfigKeys = Object.keys(currentPlan.appConfig.values).sort();
      validateManifestProvenance(
        manifest,
        "complete",
        "MIGRATION_COMPLETED_CONFLICT",
      );
      atomicWrite(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
      const manifestSha256 = sha256(manifestPath);
      atomicWrite(
        completionMarkerPath,
        JSON.stringify(
          {
            version: MIGRATION_VERSION,
            status: "complete",
            completedAt: manifest.completedAt,
            manifest: MANIFEST_NAME,
            manifestSha256,
          },
          null,
          2,
        ) + "\n",
      );
      return resultFor(currentPlan, "execute", {
        copied,
        skipped,
        completed: true,
      });
    } catch (error) {
      error.migrationResult = resultFor(currentPlan, "execute", {
        copied,
        skipped,
        completed: false,
      });
      throw error;
    }
  }

  function rollback() {
    const manifest = readJson(manifestPath, "MIGRATION_ROLLBACK_UNAVAILABLE");
    if (
      manifest.version !== MIGRATION_VERSION ||
      manifest.status !== "complete" ||
      !manifest.rollback
    )
      throw migrationError(
        "MIGRATION_ROLLBACK_UNAVAILABLE",
        "A completed migration with rollback proof is required",
      );
    validateManifestProvenance(
      manifest,
      "complete",
      "MIGRATION_ROLLBACK_PROOF_INVALID",
    );
    readVerifiedCompletionMarker(
      completionMarkerPath,
      manifestPath,
      "complete",
      "MIGRATION_ROLLBACK_PROOF_INVALID",
    );
    const files = new Map(
      (manifest.files || []).map((file) => [
        file.target + "\u0000" + file.destination,
        file,
      ]),
    );
    const createdTargets = manifest.rollback.createdTargets;
    const appConfig = manifest.rollback.appConfig || {};
    const backupPath = appConfigBackupPath(roots.appConfigPath);
    const conflicts = [];
    const targetPathFor = (file) => {
      const destinationRoot =
        file && file.destination === "local"
          ? roots.localStateRoot
          : file && file.destination === "content"
            ? roots.contentLibraryRoot
            : null;
      const targetPath =
        destinationRoot && typeof file.target === "string"
          ? path.resolve(destinationRoot, file.target)
          : null;
      if (
        !destinationRoot ||
        !targetPath ||
        !isWithin(destinationRoot, targetPath)
      )
        throw migrationError(
          "MIGRATION_ROLLBACK_PROOF_INVALID",
          "Migration rollback target is outside its destination root",
        );
      return targetPath;
    };
    for (const target of createdTargets) {
      const file = ["content", "local"]
        .map((destination) => files.get(target + "\u0000" + destination))
        .find(Boolean);
      if (!file) {
        conflicts.push({ code: "MIGRATION_ROLLBACK_PROOF_INVALID", target });
        continue;
      }
      const targetPath = targetPathFor(file);
      const stats = rejectSymlink(targetPath);
      if (!stats) continue;
      if (!stats.isFile() || sha256(targetPath) !== file.sha256)
        conflicts.push({ code: "MIGRATION_ROLLBACK_CONFLICT", target });
    }
    if (appConfig.existed) {
      const backupStats = rejectSymlink(backupPath);
      if (
        !backupStats ||
        !backupStats.isFile() ||
        sha256(backupPath) !== appConfig.beforeSha256
      )
        conflicts.push({
          code: "MIGRATION_ROLLBACK_BACKUP_INVALID",
          target: "appConfigPath",
        });
      const currentStats = rejectSymlink(roots.appConfigPath);
      if (
        !currentStats ||
        !currentStats.isFile() ||
        !appConfig.migratedSha256 ||
        sha256(roots.appConfigPath) !== appConfig.migratedSha256
      )
        conflicts.push({
          code: "MIGRATION_ROLLBACK_CONFLICT",
          target: "appConfigPath",
        });
    } else {
      const backupStats = rejectSymlink(backupPath);
      if (backupStats)
        conflicts.push({
          code: "MIGRATION_ROLLBACK_BACKUP_INVALID",
          target: "appConfigPath",
        });
      const currentStats = rejectSymlink(roots.appConfigPath);
      if (
        !currentStats ||
        !currentStats.isFile() ||
        !appConfig.migratedSha256 ||
        sha256(roots.appConfigPath) !== appConfig.migratedSha256
      )
        conflicts.push({
          code: "MIGRATION_ROLLBACK_CONFLICT",
          target: "appConfigPath",
        });
    }
    if (conflicts.length)
      throw migrationError(
        "MIGRATION_ROLLBACK_CONFLICT",
        JSON.stringify(conflicts),
      );
    let removedTargets = 0;
    for (const target of createdTargets) {
      const file = ["content", "local"]
        .map((destination) => files.get(target + "\u0000" + destination))
        .find(Boolean);
      const targetPath = targetPathFor(file);
      if (fs.existsSync(targetPath)) {
        fs.unlinkSync(targetPath);
        removedTargets += 1;
      }
    }
    if (appConfig.existed) copyAtomic(backupPath, roots.appConfigPath);
    else if (fs.existsSync(roots.appConfigPath))
      fs.unlinkSync(roots.appConfigPath);
    if (fs.existsSync(backupPath)) fs.unlinkSync(backupPath);
    manifest.status = "rolled-back";
    manifest.rolledBackAt = clock();
    manifest.rollback.status = "complete";
    manifest.rollback.removedTargets = removedTargets;
    atomicWrite(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
    const manifestSha256 = sha256(manifestPath);
    atomicWrite(
      completionMarkerPath,
      JSON.stringify(
        {
          version: MIGRATION_VERSION,
          status: "rolled-back",
          rolledBackAt: manifest.rolledBackAt,
          manifest: MANIFEST_NAME,
          manifestSha256,
        },
        null,
        2,
      ) + "\n",
    );
    return {
      mode: "rollback",
      safe: true,
      completed: true,
      writes: removedTargets,
      summary: {
        planned: createdTargets.length,
        copied: 0,
        skipped: 0,
        removed: removedTargets,
        missing: 0,
        conflicts: 0,
        duplicates: 0,
      },
      missing: [],
      conflicts: [],
      duplicates: [],
      manifestPath,
      completionMarkerPath,
      rollback: { status: "complete", removedTargets },
    };
  }

  return { dryRun, migrate, rollback, plan };
}

function main(argv) {
  const options = parseArguments(argv);
  const migrator = createContentLibraryMigrator(options);
  if (options.mode === "dry-run") return migrator.dryRun();
  if (options.mode === "rollback") return migrator.rollback();
  return migrator.migrate({ confirmed: true });
}

function isPackagedRuntime() {
  return (
    process.env.AUTO_PUBLISH_PACKAGED === "1" ||
    fs.existsSync(path.join(__dirname, "..", "production-artifact-manifest.json"))
  );
}

function createMigrationProvenance(startedAt) {
  if (isPackagedRuntime()) return {};
  const { createExecutionProvenance } = require("./release-evidence-inputs");
  return createExecutionProvenance({
    root: path.resolve(__dirname, ".."),
    command: "node scripts/migrate-content-library-v2.js",
    startedAt,
  });
}

if (require.main === module) {
  try {
    const startedAt = Date.now();
    const result = main(process.argv.slice(2));
    const provenance = createMigrationProvenance(startedAt);
    process.stdout.write(JSON.stringify({ ...result, ...provenance }) + "\n");
  } catch (error) {
    const code =
      error &&
      typeof error.code === "string" &&
      /^MIGRATION_[A-Z0-9_]{1,72}$/.test(error.code)
        ? error.code
        : "MIGRATION_FAILED";
    process.stderr.write(code + "\n");
    process.exitCode = 1;
  }
}

module.exports = {
  COMPLETION_MARKER_NAME,
  APP_CONFIG_BACKUP_SUFFIX,
  MANIFEST_NAME,
  MAPPINGS,
  createContentLibraryMigrator,
  main,
  parseArguments,
  validateMigrationPaths,
};
