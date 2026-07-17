const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const SOURCE_ROOT = path.resolve(__dirname, "..");
const CLEANUP_ROOTS = ["clients", "generated", "research", "templates", "data", "input", "published", "failed", "logs", "tmp", "work", "workspace", ".playwright-cli", ".env"];

function cleanupError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function hash(filename) {
  return crypto.createHash("sha256").update(fs.readFileSync(filename)).digest("hex");
}

function within(parent, candidate) {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative === "" || (relative !== ".." && !relative.startsWith(".." + path.sep) && !path.isAbsolute(relative));
}

function options(argv) {
  const values = { source: SOURCE_ROOT, execute: false };
  const args = Array.from(argv || []);
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (["--source", "--manifest", "--backup", "--content-library", "--local-state"].includes(arg)) {
      if (!args[index + 1] || args[index + 1].startsWith("--")) throw cleanupError("CLEANUP_ARGUMENT_INVALID", arg + " requires a value");
      values[arg.slice(2).replace(/-([a-z])/g, function(_, letter) { return letter.toUpperCase(); })] = path.resolve(args[++index]);
    } else if (arg === "--execute") values.execute = true;
    else throw cleanupError("CLEANUP_ARGUMENT_INVALID", "Unknown cleanup argument");
  }
  ["manifest", "backup", "contentLibrary", "localState"].forEach(function(key) { if (!values[key]) throw cleanupError("CLEANUP_ARGUMENT_INVALID", "--" + key + " is required"); });
  return values;
}

function readManifest(filename) {
  let value;
  try { value = JSON.parse(fs.readFileSync(filename, "utf8")); } catch (_) { throw cleanupError("CLEANUP_MANIFEST_INVALID", "Migration manifest cannot be read"); }
  if (!value || value.version !== 2 || value.status !== "complete" || !Array.isArray(value.files) || value.completedFiles.length !== value.files.length) throw cleanupError("CLEANUP_MANIFEST_INCOMPLETE", "Migration manifest is not complete");
  return value;
}

function collectFiles(root, relative, output) {
  const filename = path.join(root, relative || "");
  if (!fs.existsSync(filename)) return;
  const stat = fs.lstatSync(filename);
  if (stat.isSymbolicLink()) throw cleanupError("CLEANUP_SYMLINK_UNSAFE", "Source cleanup refuses symbolic links");
  if (stat.isFile()) { output.push({ filename, relative: (relative || "").replace(/\\/g, "/"), bytes: stat.size }); return; }
  if (!stat.isDirectory()) throw cleanupError("CLEANUP_SOURCE_INVALID", "Source cleanup found a non-file entry");
  fs.readdirSync(filename, { withFileTypes: true }).forEach(function(entry) {
    collectFiles(root, path.join(relative || "", entry.name), output);
  });
}

function verify(optionsValue) {
  const opts = optionsValue;
  const manifest = readManifest(opts.manifest);
  if (within(opts.source, opts.manifest) || within(opts.source, opts.backup)) throw cleanupError("CLEANUP_PATH_INVALID", "Backup and manifest must be outside the source directory");
  if (!fs.existsSync(opts.backup)) throw cleanupError("CLEANUP_BACKUP_MISSING", "Cleanup backup directory is missing");
  const records = new Map(manifest.files.map(function(record) { return [record.source, record]; }));
  const unmanaged = new Set(["data/.gitkeep"]);
  const files = [];
  CLEANUP_ROOTS.forEach(function(root) {
    const filename = path.join(opts.source, root);
    if (fs.existsSync(filename) && fs.lstatSync(filename).isSymbolicLink()) throw cleanupError("CLEANUP_SYMLINK_UNSAFE", "Source cleanup refuses symbolic links");
    collectFiles(opts.source, root, files);
  });
  files.forEach(function(entry) {
    if (unmanaged.has(entry.relative) || entry.relative === ".env" || entry.relative.startsWith("tmp/") || entry.relative.startsWith(".playwright-cli/")) return;
    const record = records.get(entry.relative);
    if (!record) throw cleanupError("CLEANUP_UNMIGRATED_SOURCE", "Source file is not in the verified migration manifest");
    if (hash(entry.filename) !== record.sha256) throw cleanupError("CLEANUP_SOURCE_CHANGED", "Source file changed after migration verification");
    const destinationRoot = record.category === "local" ? opts.localState : opts.contentLibrary;
    const target = path.join(destinationRoot, record.target);
    if (!fs.existsSync(target) || !fs.lstatSync(target).isFile() || hash(target) !== record.sha256) throw cleanupError("CLEANUP_TARGET_UNVERIFIED", "Migrated target does not match the manifest");
  });
  CLEANUP_ROOTS.forEach(function(root) {
    const backup = path.join(opts.backup, root);
    const source = path.join(opts.source, root);
    if (fs.existsSync(source) && !fs.existsSync(backup)) throw cleanupError("CLEANUP_BACKUP_MISSING", "Source backup is missing for " + root);
  });
  return { files: files.length, manifestFiles: manifest.files.length, source: opts.source, manifest: opts.manifest, backup: opts.backup };
}

function executeCleanup(opts) {
  const result = verify(opts);
  const quarantine = path.join(opts.backup, "removed-source-artifacts");
  fs.mkdirSync(quarantine, { recursive: true });
  CLEANUP_ROOTS.forEach(function(root) {
    const source = path.join(opts.source, root);
    if (!fs.existsSync(source)) return;
    const target = path.join(quarantine, root);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.renameSync(source, target);
  });
  return Object.assign({}, result, { execute: true, quarantine: quarantine });
}

if (require.main === module) {
  try {
    const opts = options(process.argv.slice(2));
    process.stdout.write(JSON.stringify(opts.execute ? executeCleanup(opts) : Object.assign({ execute: false }, verify(opts))) + "\n");
  } catch (error) {
    process.stderr.write((error.code || "CLEANUP_FAILED") + ":" + (error.message || "Source cleanup failed") + "\n");
    process.exitCode = 1;
  }
}

module.exports = { CLEANUP_ROOTS, verify, executeCleanup };
