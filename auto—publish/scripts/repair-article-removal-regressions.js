const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

function fail(message) {
  const error = new Error(message);
  error.code = "ARTICLE_REMOVAL_REPAIR_INPUT_INVALID";
  throw error;
}

function hash(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");
}

function safeToken(value) {
  return typeof value === "string" && value.trim() !== "" && !/[\\/\0]/.test(value) ? value : null;
}

function contained(parent, child) {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  return relative === "" || (relative !== ".." && !relative.startsWith(".." + path.sep) && !path.isAbsolute(relative));
}

function listJson(directory, pattern) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && pattern.test(entry.name))
    .map((entry) => path.join(directory, entry.name));
}

function readJson(filename) {
  try { return JSON.parse(fs.readFileSync(filename, "utf8")); } catch (_) { return null; }
}

function actionIdentity(action) {
  return {
    clientId: action.clientId || null,
    articleId: action.articleId || null,
    batchId: action.batchId || null,
    publicationId: action.publicationId || null,
    targetPlatformId: action.targetPlatformId || null,
    attemptId: action.attemptId || null,
    action: action.action || null
  };
}

function transactionFingerprint(transaction) {
  if (typeof transaction.fingerprint === "string" && transaction.fingerprint) return transaction.fingerprint;
  const selections = (transaction.selections || []).map((item) => `${item.clientId || ""}\0${item.articleId || ""}`).sort();
  const actions = (transaction.queueActions || []).map(actionIdentity).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  return hash({ selections, actions });
}

function loadPublications(workspace) {
  const directories = [path.join(workspace, ".autopublish", "submission-records", "publications"), path.join(workspace, ".autopublish", "publications")];
  const records = new Map();
  directories.forEach((directory) => listJson(directory, /^publication-[A-Za-z0-9_-]+\.json$/).forEach((file) => {
    const record = readJson(file);
    if (record && safeToken(record.publicationId)) records.set(record.publicationId, record);
  }));
  return records;
}

function loadTrashedIds(workspace) {
  const result = new Set();
  const root = path.join(workspace, ".autopublish", "article-trash");
  if (!fs.existsSync(root)) return result;
  fs.readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isDirectory()).forEach((client) => {
    fs.readdirSync(path.join(root, client.name), { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".tombstone.json"))
      .forEach((entry) => result.add(`${client.name}\0${entry.name.slice(0, -".tombstone.json".length)}`));
  });
  return result;
}

function inspectResidue(workspace) {
  const inputRoot = path.join(workspace, ".autopublish", "input");
  const batchDirectories = [path.join(workspace, ".autopublish", "submission-records"), path.join(workspace, ".autopublish", "submission-batches")];
  const records = loadPublications(workspace);
  const trashed = loadTrashedIds(workspace);
  const seen = new Set();
  const items = [];
  batchDirectories.forEach((directory) => listJson(directory, /^batch-[A-Za-z0-9_-]+\.json$/).forEach((file) => {
    const batch = readJson(file);
    if (!batch || !Array.isArray(batch.items)) return;
    (batch.items || []).forEach((item) => {
      const identity = `${batch.clientId || ""}\0${item.articleId || ""}\0${item.publicationId || ""}\0${item.attemptId || ""}`;
      if (seen.has(identity) || !trashed.has(`${batch.clientId || ""}\0${item.articleId || ""}`) || ["failed-cleaned", "cancelled", "skipped"].includes(item.status)) return;
      seen.add(identity);
      const record = item.publicationId ? records.get(item.publicationId) : null;
      const attempt = record && Array.isArray(record.attempts) ? record.attempts.find((value) => value.attemptId === item.attemptId) : null;
      const latest = record && Array.isArray(record.attempts) ? record.attempts[record.attempts.length - 1] : null;
      const suppliedFile = typeof item.filePath === "string" && path.isAbsolute(item.filePath) && contained(workspace, item.filePath) ? item.filePath : null;
      const suppliedSidecar = typeof item.sidecarPath === "string" && path.isAbsolute(item.sidecarPath) && contained(workspace, item.sidecarPath) ? item.sidecarPath : null;
      const queueFile = suppliedFile || path.join(inputRoot, item.targetPlatformId || "", item.filename || "");
      const sidecarFile = suppliedSidecar || queueFile + ".submission.json";
      const sidecar = readJson(sidecarFile);
      let unchanged = false;
      try {
        unchanged = fs.existsSync(queueFile) && fs.readFileSync(queueFile, "utf8") && crypto.createHash("sha256").update(fs.readFileSync(queueFile, "utf8")).digest("hex") === item.contentHash && sidecar && sidecar.submissionBatchId === batch.id && sidecar.publicationId === item.publicationId && sidecar.attemptId === item.attemptId && sidecar.contentHash === item.contentHash;
      } catch (_) {}
      let action = null;
      let reasonCode = null;
      if (!unchanged) reasonCode = "SUBMISSION_QUEUE_CHANGED";
      else if (!record) reasonCode = "PUBLICATION_RECORD_MISSING";
      else if (["submitting", "submitted", "uncertain"].includes(record.status)) reasonCode = "ARTICLE_SUBMISSION_ACTIVE";
      else if (record.status === "queued") action = latest && latest.attemptId === item.attemptId ? "cancel" : null;
      else if (record.status === "failed") action = attempt && attempt.status === "failed" ? "cleanup" : null;
      else reasonCode = "PUBLICATION_STATUS_NOT_REPAIRABLE";
      if (!action && !reasonCode) reasonCode = record.status === "queued" ? "PUBLICATION_ATTEMPT_MISMATCH" : "PUBLICATION_ATTEMPT_NOT_FAILED";
      const safe = { publicationId: item.publicationId || null, targetPlatformId: item.targetPlatformId || null, status: record && record.status || item.status || "unknown", action, reasonCode };
      safe.actionFingerprint = hash(actionIdentity(Object.assign({}, item, { action })));
      items.push(safe);
    });
  }));
  return {
    totalCount: items.length,
    cleanableCount: items.filter((item) => item.action).length,
    reportedCount: items.filter((item) => !item.action).length,
    items
  };
}

function inspectTransactions(workspace) {
  const directory = path.join(workspace, ".autopublish", "article-removal-transactions");
  const transactions = listJson(directory, /^removal-[A-Za-z0-9_-]+\.json$/).map(readJson).filter(Boolean);
  const groups = new Map();
  transactions.forEach((transaction) => {
    const fingerprint = transactionFingerprint(transaction);
    if (!groups.has(fingerprint)) groups.set(fingerprint, []);
    groups.get(fingerprint).push(transaction);
  });
  const items = transactions.map((transaction) => ({
    transactionId: transaction.id || null,
    status: transaction.status || null,
    phase: transaction.phase || null,
    errorCode: transaction.errorCode || null,
    articleCount: Array.isArray(transaction.articles) ? transaction.articles.length : Array.isArray(transaction.selections) ? transaction.selections.length : 0,
    actionFingerprint: transactionFingerprint(transaction)
  }));
  return {
    totalCount: transactions.length,
    openCount: transactions.filter((transaction) => ["pending_auto_recovery", "pending_recovery", "needs_repair"].includes(transaction.status)).length,
    duplicateGroupCount: [...groups.values()].filter((group) => group.length > 1).length,
    items
  };
}

function parseArguments(argv) {
  const result = { workspace: null, dryRun: false };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--workspace") result.workspace = argv[++index];
    else if (argv[index] === "--dry-run") result.dryRun = true;
    else fail("Usage: node scripts/repair-article-removal-regressions.js --workspace <workspace> --dry-run");
  }
  if (!result.workspace || !result.dryRun) fail("This tool is read-only and requires --workspace and --dry-run");
  return result;
}

function main(argv) {
  const options = parseArguments(argv);
  const workspace = path.resolve(options.workspace);
  if (!fs.existsSync(workspace) || !fs.statSync(workspace).isDirectory()) fail("Workspace directory is invalid");
  const residue = inspectResidue(workspace);
  const transactions = inspectTransactions(workspace);
  return {
    mode: "dry-run",
    residue,
    transactions,
    summary: {
      residueCleanable: residue.cleanableCount,
      residueReported: residue.reportedCount,
      openRemovalTransactions: transactions.openCount,
      duplicateRemovalGroups: transactions.duplicateGroupCount
    }
  };
}

if (require.main === module) {
  try { process.stdout.write(JSON.stringify(main(process.argv.slice(2))) + "\n"); }
  catch (error) { process.stderr.write(`${error.code || "ARTICLE_REMOVAL_REPAIR_FAILED"}: ${error.message}\n`); process.exitCode = 1; }
}

module.exports = { main, inspectResidue, inspectTransactions };
