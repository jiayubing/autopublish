"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const MIGRATION_VERSION = 2;
const MANIFEST_NAME = "content-library-v2-migration-manifest.json";
const COMPLETION_MARKER_NAME = "content-library-v2-migration-complete.json";

// These are the only legacy locations that are allowed to cross the install
// boundary. Unknown folders are intentionally left in place and unreported.
const MAPPINGS = [
  { source: "clients", target: "clients", destination: "content", category: "portable" },
  { source: "generated", target: "generated", destination: "content", category: "portable" },
  { source: "templates", target: "templates", destination: "content", category: "portable" },
  { source: "research", target: ".autopublish/research", destination: "content", category: "portable" },
  { source: "data/research", target: ".autopublish/research", destination: "content", category: "portable" },
  { source: "data/content-generation-batches", target: ".autopublish/batches", destination: "content", category: "portable" },
  { source: "data/submission-queues", target: ".autopublish/queue", destination: "content", category: "portable" },
  { source: "data/submission-records", target: ".autopublish/submission-records", destination: "content", category: "portable" },
  { source: "logs", target: "logs", destination: "local", category: "local" },
  { source: "work/client-material-cache", target: "cache/client-material", destination: "local", category: "local" },
  { source: "work/playwright-cli", target: "browser-profile/playwright-cli", destination: "local", category: "local" },
  { source: "browser", target: "browser", destination: "local", category: "local" },
  { source: "tmp", target: "tmp", destination: "local", category: "local" }
];

// AI provider settings are application-owned and are never imported from a
// workspace .env. The platform settings below are written to the separately
// supplied application configuration file, not to the migration log.
const ALLOWED_ENV_KEYS = new Set([
  "HEPAN_PYTHON",
  "HEPAN_COOKIE_PATH",
  "HEPAN_VENDOR_DIR",
  "XQW_API_KEY",
  "XQW_BASE_URL",
  "MARKITDOWN_CMD",
  "PLAYWRIGHT_CLI_JS",
  "AUTO_PUBLISH_NODE_EXEC_PATH"
]);

function migrationError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function absolute(value, name) {
  if (typeof value !== "string" || !value.trim() || !path.isAbsolute(value)) {
    throw migrationError("MIGRATION_PATH_INVALID", name + " must be an absolute path");
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
  return relative === "" || (relative !== ".." && !relative.startsWith(".." + path.sep) && !path.isAbsolute(relative));
}

function validateMigrationPaths(options) {
  const sourceRoot = absolute(options.sourceRoot, "sourceRoot");
  const contentLibraryRoot = absolute(options.contentLibraryRoot, "contentLibraryRoot");
  const localStateRoot = absolute(options.localStateRoot, "localStateRoot");
  const appConfigPath = absolute(options.appConfigPath, "appConfigPath");
  const roots = [
    ["sourceRoot", sourceRoot],
    ["contentLibraryRoot", contentLibraryRoot],
    ["localStateRoot", localStateRoot],
    ["appConfigPath", appConfigPath]
  ];
  for (let i = 0; i < roots.length; i += 1) {
    for (let j = i + 1; j < roots.length; j += 1) {
      if (isWithin(roots[i][1], roots[j][1]) || isWithin(roots[j][1], roots[i][1])) {
        throw migrationError("MIGRATION_PATH_OVERLAP", roots[i][0] + " and " + roots[j][0] + " must not overlap");
      }
    }
  }
  const volumes = new Set(roots.map(function(item) { return volumeOf(item[1]); }).filter(Boolean));
  return { sourceRoot, contentLibraryRoot, localStateRoot, appConfigPath, crossVolume: volumes.size > 1 };
}

function rejectSymlink(filename) {
  let stats;
  try {
    stats = fs.lstatSync(filename);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
  if (stats.isSymbolicLink()) throw migrationError("MIGRATION_SYMLINK_UNSAFE", "Migration refuses symbolic links");
  return stats;
}

function ensureDestinationRoot(root) {
  const stats = rejectSymlink(root);
  if (stats && !stats.isDirectory()) throw migrationError("MIGRATION_TARGET_INVALID", "Migration target is not a directory");
}

function sha256(filename) {
  return crypto.createHash("sha256").update(fs.readFileSync(filename)).digest("hex");
}

function parseEnv(contents) {
  const values = {};
  for (const line of String(contents).split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match) continue;
    let value = match[2];
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
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
          sha256: sha256(current),
          bytes: currentStats.size
        });
      }
      return;
    }
    if (!currentStats.isDirectory()) throw migrationError("MIGRATION_SOURCE_INVALID", "Migration source entry is not a regular file or directory");
    for (const entry of fs.readdirSync(current, { withFileTypes: true }).sort(function(a, b) { return a.name.localeCompare(b.name); })) {
      const child = path.join(current, entry.name);
      const childRelative = relative ? path.join(relative, entry.name) : entry.name;
      if (entry.isSymbolicLink()) throw migrationError("MIGRATION_SYMLINK_UNSAFE", "Migration refuses symbolic links");
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
      duplicates.push({ target, sources: matches.map(function(item) { return item.source; }) });
      const hashes = new Set(matches.map(function(item) { return item.sha256; }));
      if (hashes.size > 1) conflicts.push({ code: "DUPLICATE_CONFLICT", target });
      else matches.splice(1);
    }
  }
  for (const record of records) {
    const stats = rejectSymlink(record.targetPath);
    if (!stats) continue;
    if (!stats.isFile() || sha256(record.targetPath) !== record.sha256) conflicts.push({ code: "TARGET_CONFLICT", target: record.target });
  }
  if (fs.existsSync(roots.contentLibraryRoot) && fs.readdirSync(roots.contentLibraryRoot).length) roots.destinationNonEmpty = true;
  if (fs.existsSync(roots.localStateRoot) && fs.readdirSync(roots.localStateRoot).length) roots.destinationNonEmpty = true;
  return { conflicts, duplicates, records: records.filter(function(record) { return byTarget.get(record.target)[0] === record; }) };
}

function atomicWrite(filename, contents) {
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  const temp = filename + ".tmp-" + process.pid + "-" + crypto.randomBytes(6).toString("hex");
  try {
    fs.writeFileSync(temp, contents, "utf8");
    fs.renameSync(temp, filename);
  } finally {
    try { fs.unlinkSync(temp); } catch (_) {}
  }
}

function parseArguments(argv) {
  const args = Array.from(argv || []);
  const options = {};
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (["--source", "--content-library", "--local-state", "--app-config"].includes(arg)) {
      if (!args[i + 1] || args[i + 1].startsWith("--")) throw migrationError("MIGRATION_ARGUMENT_INVALID", arg + " requires a value");
      options[arg.slice(2).replace(/-([a-z])/g, function(_, letter) { return letter.toUpperCase(); })] = args[++i];
    } else if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--execute") options.execute = true;
    else throw migrationError("MIGRATION_ARGUMENT_INVALID", "Unknown migration argument");
  }
  for (const key of ["source", "contentLibrary", "localState", "appConfig"]) {
    if (!options[key]) throw migrationError("MIGRATION_ARGUMENT_INVALID", "--" + key.replace(/[A-Z]/g, function(letter) { return "-" + letter.toLowerCase(); }) + " is required");
  }
  if (options.dryRun === options.execute) throw migrationError("MIGRATION_ARGUMENT_INVALID", "Choose exactly one of --dry-run or --execute");
  return {
    sourceRoot: options.source,
    contentLibraryRoot: options.contentLibrary,
    localStateRoot: options.localState,
    appConfigPath: options.appConfig,
    mode: options.execute ? "execute" : "dry-run"
  };
}

function createContentLibraryMigrator(options) {
  const opts = options || {};
  const roots = validateMigrationPaths(opts);
  const clock = typeof opts.clock === "function" ? opts.clock : function() { return new Date().toISOString(); };
  const copyFile = typeof opts.copyFile === "function" ? opts.copyFile : fs.copyFileSync;
  const manifestPath = path.join(roots.contentLibraryRoot, ".autopublish", MANIFEST_NAME);
  const completionMarkerPath = path.join(roots.contentLibraryRoot, ".autopublish", COMPLETION_MARKER_NAME);

  function plan() {
    rejectSymlink(roots.sourceRoot);
    ensureDestinationRoot(roots.contentLibraryRoot);
    ensureDestinationRoot(roots.localStateRoot);
    const records = [];
    const missing = [];
    for (const mapping of MAPPINGS) {
      const destinationRoot = mapping.destination === "content" ? roots.contentLibraryRoot : roots.localStateRoot;
      if (!collectFiles(roots.sourceRoot, mapping, destinationRoot, records)) missing.push({ source: mapping.source, target: mapping.target });
    }
    const envPath = path.join(roots.sourceRoot, ".env");
    if (!rejectSymlink(envPath)) missing.push({ source: ".env", target: "appConfigPath" });
    const inspected = inspectDestination(records, roots);
    if (fs.existsSync(roots.appConfigPath)) {
      const stats = rejectSymlink(roots.appConfigPath);
      if (!stats || !stats.isFile()) inspected.conflicts.push({ code: "APP_CONFIG_CONFLICT", target: "appConfigPath" });
    }
    const envValues = rejectSymlink(envPath) ? parseEnv(fs.readFileSync(envPath, "utf8")) : {};
    const platformRuntime = {};
    for (const key of ALLOWED_ENV_KEYS) if (Object.prototype.hasOwnProperty.call(envValues, key)) platformRuntime[key] = envValues[key];
    const appConfig = { version: 1, values: platformRuntime };
    if (fs.existsSync(roots.appConfigPath) && inspected.conflicts.length === 0) {
      try {
        const existing = JSON.parse(fs.readFileSync(roots.appConfigPath, "utf8"));
        if (JSON.stringify(existing.values || {}) !== JSON.stringify(platformRuntime)) inspected.conflicts.push({ code: "APP_CONFIG_CONFLICT", target: "appConfigPath" });
      } catch (_) {
        inspected.conflicts.push({ code: "APP_CONFIG_CONFLICT", target: "appConfigPath" });
      }
    }
    return {
      records: inspected.records,
      missing,
      duplicates: inspected.duplicates,
      conflicts: inspected.conflicts,
      appConfig,
      envPath,
      destinationNonEmpty: Boolean(roots.destinationNonEmpty),
      crossVolume: roots.crossVolume
    };
  }

  function resultFor(currentPlan, mode, extra) {
    const copied = extra && extra.copied || 0;
    const skipped = extra && extra.skipped || 0;
    return Object.assign({
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
        duplicates: currentPlan.duplicates.length
      },
      missing: currentPlan.missing,
      conflicts: currentPlan.conflicts,
      duplicates: currentPlan.duplicates,
      destinationNonEmpty: currentPlan.destinationNonEmpty,
      crossVolume: currentPlan.crossVolume,
      manifestPath,
      completionMarkerPath
    }, extra || {});
  }

  function dryRun() {
    return resultFor(plan(), "dry-run");
  }

  function migrate(execution) {
    const confirmation = execution || {};
    if (!confirmation.confirmed) throw migrationError("MIGRATION_CONFIRMATION_REQUIRED", "Migration requires explicit execution confirmation");
    const currentPlan = plan();
    if (currentPlan.conflicts.length) throw migrationError("MIGRATION_CONFLICT", "Migration has unresolved destination conflicts");
    fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
    const files = currentPlan.records.map(function(record) { return { source: record.source, target: record.target, category: record.category, bytes: record.bytes, sha256: record.sha256 }; });
    const manifest = { version: MIGRATION_VERSION, status: "in-progress", startedAt: clock(), source: "legacy", files, completedFiles: [] };
    atomicWrite(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
    let copied = 0;
    let skipped = 0;
    try {
      for (const record of currentPlan.records) {
        const current = rejectSymlink(record.targetPath);
        if (current && current.isFile() && sha256(record.targetPath) === record.sha256) {
          skipped += 1;
        } else {
          fs.mkdirSync(path.dirname(record.targetPath), { recursive: true });
          const temporary = record.targetPath + ".tmp-" + process.pid + "-" + crypto.randomBytes(6).toString("hex");
          try {
            copyFile(record.sourcePath, temporary);
            if (sha256(temporary) !== record.sha256) throw migrationError("MIGRATION_CHECKSUM_MISMATCH", "Migration checksum verification failed");
            fs.renameSync(temporary, record.targetPath);
          } finally {
            try { fs.unlinkSync(temporary); } catch (_) {}
          }
          copied += 1;
        }
        manifest.completedFiles.push(record.target);
        atomicWrite(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
      }
      const existingConfig = fs.existsSync(roots.appConfigPath) ? JSON.parse(fs.readFileSync(roots.appConfigPath, "utf8")) : {};
      atomicWrite(roots.appConfigPath, JSON.stringify(Object.assign({}, existingConfig, currentPlan.appConfig), null, 2) + "\n");
      manifest.status = "complete";
      manifest.completedAt = clock();
      manifest.appConfigKeys = Object.keys(currentPlan.appConfig.values).sort();
      atomicWrite(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
      atomicWrite(completionMarkerPath, JSON.stringify({ version: MIGRATION_VERSION, status: "complete", completedAt: manifest.completedAt, manifest: MANIFEST_NAME }, null, 2) + "\n");
      return resultFor(currentPlan, "execute", { copied, skipped, completed: true });
    } catch (error) {
      error.migrationResult = resultFor(currentPlan, "execute", { copied, skipped, completed: false });
      throw error;
    }
  }

  return { dryRun, migrate, plan };
}

function main(argv) {
  const options = parseArguments(argv);
  const migrator = createContentLibraryMigrator(options);
  return options.mode === "dry-run" ? migrator.dryRun() : migrator.migrate({ confirmed: true });
}

if (require.main === module) {
  try {
    process.stdout.write(JSON.stringify(main(process.argv.slice(2))) + "\n");
  } catch (error) {
    process.stderr.write((error.message || "Content library migration failed") + "\n");
    process.exitCode = 1;
  }
}

module.exports = {
  COMPLETION_MARKER_NAME,
  MANIFEST_NAME,
  MAPPINGS,
  createContentLibraryMigrator,
  main,
  parseArguments,
  validateMigrationPaths
};
