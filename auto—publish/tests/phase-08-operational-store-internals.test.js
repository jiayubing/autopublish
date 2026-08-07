const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const facadePath = path.join(
  root,
  "src/infrastructure/operational-store/operational-store.js",
);
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

const PRODUCTION_ROOTS = [
  "src",
  "desktop",
  "media-workbench/src",
  "scripts",
  "auth-server/src",
  "auth-server/scripts",
];
const INTERNAL_PREFIX = "src/infrastructure/operational-store/internal";
const MIGRATION_IMPORTER = "scripts/migrate-operational-store-v1.js";
const RECOVERY_GUARD_IMPORT = `${INTERNAL_PREFIX}/operational-store-recovery-guard`;

const PUBLIC_SURFACE = [
  "databasePath",
  "createAccountProfile",
  "listAccountProfiles",
  "assertExecutableAccountProfile",
  "reservePublicationTarget",
  "commitRemoteOutcome",
  "listActionableRecovery",
  "markRecoveryUncertain",
  "createSubmissionBatch",
  "queueSubmissionBatch",
  "discardPreparedSubmissionBatch",
  "prepareSubmissionItemAction",
  "getSubmissionItemAction",
  "checkpointSubmissionItemAction",
  "claimSubmissionItem",
  "claimSubmissionItemById",
  "renewSubmissionItemClaim",
  "updateSubmissionItem",
  "cancelQueuedSubmissionItem",
  "markSubmissionItemCleaned",
  "getSubmissionBatch",
  "listSubmissionBatches",
  "findSubmissionItem",
  "getArchiveEligibility",
  "attachRemoteOrderEvidence",
  "claimPostProcessing",
  "completePostProcessing",
  "retryPostProcessing",
  "listPostProcessingAttention",
  "listPublicationAttention",
  "listPublicationRecords",
  "listRemoteOrders",
  "listOrderDisplayViews",
  "createSubmissionQueueGroup",
  "setSubmissionQueueGroupPause",
  "listSubmissionQueueGroups",
  "enqueueSubmissionQueueItem",
  "listSubmissionQueueItems",
  "createPaidSubmissionBatch",
  "getPaidSubmissionBatch",
  "listPaidSubmissionBatches",
  "setPaidSubmissionBatchPause",
  "beginOrderCreationRemoteCall",
  "claimPaidSubmissionBatchItem",
  "listPaidSubmissionBatchSnapshots",
  "pauseAllPaidSubmissionBatches",
  "pausePaidSubmissionBatchesOnStartup",
  "releasePaidOrderCreationClaim",
  "renewPaidOrderCreationClaim",
  "setPaidSubmissionBatchRunIntent",
  "startAllPaidSubmissionBatches",
  "recordPaidOrderCreationArticleRejection",
  "recordPaidOrderCreationSystemRejection",
  "recordPaidOrderCreationSuccess",
  "recordPaidOrderCreationUncertain",
  "recordManualReconciliation",
  "listManualReconciliations",
  "listArticleLifecycleFacts",
  "deriveAttentionInput",
  "verify",
  "backup",
  "close",
];

const INTERNAL_MODULES = [
  "src/infrastructure/operational-store/internal/operational-store-context.js",
  "src/infrastructure/operational-store/internal/operational-store-active-target-aggregate.js",
  "src/infrastructure/operational-store/internal/operational-store-maintenance.js",
  "src/infrastructure/operational-store/internal/operational-store-schema-v4.js",
  "src/infrastructure/operational-store/internal/operational-store-order-aggregate.js",
  "src/infrastructure/operational-store/internal/operational-store-order-link.js",
  "src/infrastructure/operational-store/internal/operational-store-order-observation-aggregate.js",
  "src/infrastructure/operational-store/internal/order-transition-guard.js",
  "src/infrastructure/operational-store/internal/operational-store-outcome-writer.js",
  "src/infrastructure/operational-store/internal/operational-store-paid-execution-aggregate.js",
  "src/infrastructure/operational-store/internal/operational-store-queue-aggregate.js",
  "src/infrastructure/operational-store/internal/operational-store-reconciliation-aggregate.js",
  "src/infrastructure/operational-store/internal/operational-store-fact-reader.js",
  "src/infrastructure/operational-store/internal/operational-store-owner-lease.js",
  "src/infrastructure/operational-store/internal/operational-store-publication-aggregate.js",
  "src/infrastructure/operational-store/internal/operational-store-publication-success.js",
  "src/infrastructure/operational-store/internal/operational-store-regular-outcome-aggregate.js",
  "src/infrastructure/operational-store/internal/operational-store-recovery-guard.js",
  "src/infrastructure/operational-store/internal/operational-store-recovery-aggregate.js",
  "src/infrastructure/operational-store/internal/operational-store-runtime.js",
  "src/infrastructure/operational-store/internal/operational-store-schema.js",
  "src/infrastructure/operational-store/internal/operational-store-submission-aggregate.js",
  "src/infrastructure/operational-store/internal/operational-store-submission-preparation.js",
  "src/infrastructure/operational-store/internal/operational-store-transaction.js",
  "src/infrastructure/operational-store/internal/operational-store-transition-ports.js",
  "src/infrastructure/operational-store/internal/operational-store-utils.js",
  "src/infrastructure/operational-store/internal/operational-store-verifier.js",
];

const ALLOWED_INTERNAL_IMPORTERS = new Set([
  "src/infrastructure/operational-store/operational-store.js",
  ...INTERNAL_MODULES,
]);

const IMPORT_PATTERNS = [
  /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
  /\bfrom\s*["']([^"']+)["']/g,
  /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
  /\bimport\s+["']([^"']+)["']/g,
];

function sourceFiles(directory) {
  const result = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...sourceFiles(filename));
    else if (/\.(?:cjs|js|mjs|ts|tsx)$/.test(entry.name)) result.push(filename);
  }
  return result;
}

function resolvedRelativeImport(filename, specifier) {
  if (!specifier.startsWith(".")) return specifier;
  return path
    .relative(root, path.resolve(path.dirname(filename), specifier))
    .replace(/\\/g, "/");
}

function isInternalImport(resolved) {
  return (
    resolved === INTERNAL_PREFIX || resolved.startsWith(`${INTERNAL_PREFIX}/`)
  );
}

function isAllowedInternalImport(importer, resolved) {
  if (importer === MIGRATION_IMPORTER)
    return resolved === RECOVERY_GUARD_IMPORT;
  return ALLOWED_INTERNAL_IMPORTERS.has(importer);
}

test("OperationalStore facade preserves the frozen caller surface", () => {
  const {
    createOperationalStore,
    SCHEMA_VERSION,
  } = require("../src/infrastructure/operational-store/operational-store");
  const workspaceRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "operational-store-facade-"),
  );
  let store;
  try {
    store = createOperationalStore({ workspaceRoot });
    assert.equal(SCHEMA_VERSION, 4);
    assert.deepEqual(Object.keys(store), PUBLIC_SURFACE);
    assert.equal(Object.isFrozen(store), true);
    assert.equal("db" in store, false);
    assert.equal("transaction" in store, false);
    assert.equal(typeof store.verify, "function");
    assert.equal(typeof store.backup, "function");
  } finally {
    if (store) store.close();
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test("OperationalStore facade hides SQL, table names, and transaction choreography", () => {
  const source = fs.readFileSync(facadePath, "utf8");
  assert.ok(source.trimEnd().split(/\r?\n/).length <= 160);
  assert.doesNotMatch(
    source,
    /DatabaseSync|\.prepare\(|CREATE TABLE|BEGIN IMMEDIATE/,
  );
  assert.doesNotMatch(
    source,
    /\b(?:publication_records|submission_items|remote_orders|recovery_intents|order_display_snapshots)\b/,
  );
  for (const relative of INTERNAL_MODULES)
    assert.equal(fs.existsSync(path.join(root, relative)), true, relative);
  assert.match(source, /createPublicationAggregate/);
  assert.match(source, /createSubmissionAggregate/);
  assert.match(source, /createOrderAggregate/);
  assert.match(source, /createRecoveryAggregate/);
  assert.match(source, /createMaintenanceAggregate/);
});

test("production callers cannot bypass the OperationalStore facade", () => {
  assert.equal(isInternalImport(INTERNAL_PREFIX), true);
  assert.equal(
    isInternalImport(`${INTERNAL_PREFIX}/operational-store-runtime.js`),
    true,
  );
  assert.equal(isInternalImport(`${INTERNAL_PREFIX}-sibling.js`), false);
  const violations = [];
  for (const relativeRoot of PRODUCTION_ROOTS) {
    for (const filename of sourceFiles(path.join(root, relativeRoot))) {
      const relative = path.relative(root, filename).replace(/\\/g, "/");
      const source = read(relative);
      for (const pattern of IMPORT_PATTERNS) {
        let match;
        while ((match = pattern.exec(source))) {
          const resolved = resolvedRelativeImport(filename, match[1]);
          if (
            isInternalImport(resolved) &&
            !isAllowedInternalImport(relative, resolved)
          )
            violations.push({
              file: relative,
              line: source.slice(0, match.index).split(/\r?\n/).length,
              specifier: match[1],
            });
        }
      }
    }
  }
  assert.deepEqual(violations, []);
});

test("production importer scan recognizes static side-effect imports", () => {
  const source =
    'import "./internal";\n' +
    'import "./internal/operational-store-runtime.js";\n';
  const specifiers = [];
  for (const pattern of IMPORT_PATTERNS) {
    let match;
    while ((match = pattern.exec(source))) specifiers.push(match[1]);
  }
  assert.deepEqual(specifiers, [
    "./internal",
    "./internal/operational-store-runtime.js",
  ]);
});

test("migration importer allow-list is specific to the recovery guard", () => {
  assert.equal(
    isAllowedInternalImport(MIGRATION_IMPORTER, RECOVERY_GUARD_IMPORT),
    true,
  );
  assert.equal(
    isAllowedInternalImport(
      MIGRATION_IMPORTER,
      `${INTERNAL_PREFIX}/operational-store-schema.js`,
    ),
    false,
  );
});
