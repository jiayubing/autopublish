const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const {
  SCHEMA_VERSION,
  createOperationalStore,
} = require("../src/infrastructure/operational-store/operational-store");
const {
  runTransaction,
} = require("../src/infrastructure/operational-store/internal/operational-store-transaction");
const {
  setDiagnosticReporter,
} = require("../src/diagnostics/diagnostic-producer");
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
const FACADE_RELATIVE =
  "src/infrastructure/operational-store/operational-store.js";
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
  "addPaidStagingItems",
  "removePaidStagingItems",
  "listPaidStagingItems",
  "setPaidStagingMedia",
  "hasPaidStagingItem",
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
  return (
    importer === FACADE_RELATIVE || importer.startsWith(`${INTERNAL_PREFIX}/`)
  );
}

test("OperationalStore facade persists caller-visible facts through its public contract", () => {
  const workspaceRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "operational-store-facade-"),
  );
  let store;
  try {
    store = createOperationalStore({ workspaceRoot });
    assert.equal(SCHEMA_VERSION, 6);
    assert.deepEqual(Object.keys(store), PUBLIC_SURFACE);
    assert.equal(Object.isFrozen(store), true);
    assert.equal("db" in store, false);
    assert.equal("transaction" in store, false);
    assert.equal(typeof store.verify, "function");
    assert.equal(typeof store.backup, "function");

    const profile = store.createAccountProfile({
      platformId: "toutiao",
      displayName: "Public facade fixture",
    });
    const projectProfile = (value) =>
      value && {
        accountProfileId: value.accountProfileId,
        platformId: value.platformId,
        displayName: value.displayName,
      };
    assert.deepEqual(
      store.listAccountProfiles().map(projectProfile),
      [profile].map(projectProfile),
    );

    const databasePath = store.databasePath;
    store.close();
    store = createOperationalStore({ workspaceRoot });
    assert.equal(store.databasePath, databasePath);
    assert.deepEqual(
      store.listAccountProfiles().map(projectProfile),
      [profile].map(projectProfile),
    );
    assert.equal(store.verify().schemaVersion, SCHEMA_VERSION);
  } finally {
    if (store) store.close();
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test("OperationalStore facade hides SQL, table names, and transaction choreography", () => {
  const source = fs.readFileSync(facadePath, "utf8");
  assert.doesNotMatch(
    source,
    /DatabaseSync|\.prepare\(|CREATE TABLE|BEGIN IMMEDIATE/,
  );
  assert.doesNotMatch(
    source,
    /\b(?:publication_records|submission_items|remote_orders|recovery_intents|order_display_snapshots)\b/,
  );
});

test("transaction rollback cleanup preserves the primary failure and records a safe code", () => {
  const events = [];
  const restore = setDiagnosticReporter(function (record) {
    events.push(record);
    return true;
  });
  const primary = new Error("primary transaction failure");
  const db = {
    exec(statement) {
      if (statement === "ROLLBACK") throw new Error("rollback unavailable");
    },
  };
  try {
    assert.throws(
      () =>
        runTransaction(db, () => {
          throw primary;
        }),
      (error) =>
        error === primary &&
        error.cleanupCode === "OPERATIONAL_TRANSACTION_ROLLBACK_FAILED",
    );
    assert.deepEqual(
      events.map((record) => record.code),
      ["OPERATIONAL_TRANSACTION_ROLLBACK_FAILED"],
    );
    assert.equal(
      JSON.stringify(events).includes("primary transaction failure"),
      false,
    );
  } finally {
    restore();
  }
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
  assert.deepEqual(
    violations,
    [],
    "production modules must not import OperationalStore internal modules",
  );
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

test("retired operational migration script cannot write lifecycle facts", () => {
  const source = read(MIGRATION_IMPORTER);
  for (const capability of [
    "reservePublicationTarget",
    "commitRemoteOutcome",
    "attachRemoteOrderEvidence",
    "createSubmissionBatch",
    "importLifecycleFacts",
  ]) {
    assert.equal(source.includes(capability), false, capability);
  }
});

test("internal dependency permission follows the module boundary", () => {
  assert.equal(
    isAllowedInternalImport(
      FACADE_RELATIVE,
      `${INTERNAL_PREFIX}/operational-store-context`,
    ),
    true,
  );
  assert.equal(
    isAllowedInternalImport(
      `${INTERNAL_PREFIX}/future-internal-owner.js`,
      `${INTERNAL_PREFIX}/operational-store-utils`,
    ),
    true,
  );
  assert.equal(
    isAllowedInternalImport(
      "src/content/article-mutation-coordinator.js",
      `${INTERNAL_PREFIX}/operational-store-context`,
    ),
    false,
  );
});
