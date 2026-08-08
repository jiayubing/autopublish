"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const FINGERPRINT = /^[a-f0-9]{64}$/u;
const SAFE_REFERENCE = /^(?![A-Za-z]:[\\/])(?!(?:\\|\/))[A-Za-z0-9._:@+\-/]+$/u;

const SAFE_KEYS = new Set([
  "version",
  "id",
  "recordId",
  "articleId",
  "generatedArticleId",
  "clientId",
  "displayName",
  "clientName",
  "reviewStatus",
  "reviewState",
  "reviewedAt",
  "title",
  "content",
  "body",
  "status",
  "kind",
  "autoExecutable",
  "publicationStatus",
  "outcomeStatus",
  "supplierStatusCode",
  "statusCode",
  "platformId",
  "targetPlatformId",
  "targetPlatform",
  "accountProfileId",
  "accountId",
  "accountLabel",
  "platformName",
  "mediaResourceId",
  "resourceId",
  "resource_id",
  "mediaName",
  "media_name",
  "targetIdentityV1",
  "targetSnapshotV1",
  "target",
  "articleIdentityV1",
  "publicationId",
  "attemptId",
  "orderId",
  "orderNid",
  "orderNumber",
  "orderIdentityV1",
  "orderCreationAttemptId",
  "remoteId",
  "remoteUrl",
  "orderUrl",
  "published",
  "accepted",
  "success",
  "dryRun",
  "remoteBoundaryCrossed",
  "queueState",
  "batchId",
  "submissionBatchId",
  "contentHash",
  "contentFingerprint",
  "submittedContentAvailable",
  "submittedTitle",
  "submittedBody",
  "submittedAt",
  "submittedAtSource",
  "firstPublishedAt",
  "firstPublishedAtSource",
  "publishedAt",
  "uncertain",
  "contentAvailable",
  "resultCode",
  "missingReasons",
  "safeEvidenceRefs",
  "assetFingerprint",
  "layoutSlot",
  "deliveryMode",
  "decisionKind",
  "eventAt",
  "eventAtSource",
  "observedAt",
  "actualAmount",
  "quotedPrice",
  "estimatedTotal",
  "systemSubmissionCode",
  "remoteCallStartedAt",
  "closedAt",
  "closedAtSource",
  "terminalAt",
  "terminalAtSource",
  "reasonCode",
  "closedKind",
  "terminalKind",
  "conflictKind",
  "readmissionReason",
  "deletionConflictKind",
  "freezeReasonCode",
  "deleted",
  "trashed",
  "permanentlyDeleted",
  "state",
  "deletedAt",
  "purgedAt",
  "operationId",
  "transactionId",
  "selectionFingerprint",
  "evidenceFingerprint",
  "sourceRef",
  "sourceKind",
  "imageSummaryV1",
  "tombstoneIdentityV1",
  "deletionTransactionIdentityV1",
  "publicationEvidenceV1",
  "terminalTargetV1",
  "orderSnapshotV1",
  "orderObservationV1",
  "paidTargetV1",
  "orderHistoryV1",
  "terminalObservationV1",
  "sequence",
  "articleIdentitiesV1",
  "legacyQueueEvidenceV1",
  "restoreEligibilityV1",
  "migrationConflictEvidenceV1",
  "migrationDeletionEvidenceV1",
  "legacyStateCodes",
  "contentFingerprints",
  "targetIdentityV1s",
  "orderIdentityV1s",
  "conflictingFactKinds",
  "articles",
  "publications",
  "submissionItems",
  "submissions",
  "orders",
  "queues",
  "items",
  "entries",
  "attempts",
  "images",
  "references",
  "payload",
]);

const COLLECTION_ALIASES = Object.freeze({
  articles: Object.freeze(["articles", "articleRecords"]),
  publications: Object.freeze(["publications", "publicationRecords"]),
  submissions: Object.freeze([
    "submissions",
    "submissionItems",
    "submissionRecords",
  ]),
  queues: Object.freeze(["queues", "queueRecords", "sidecars"]),
  orders: Object.freeze(["orders", "orderRecords"]),
  deletions: Object.freeze(["deletions", "deletionRecords", "trash"]),
  recoveries: Object.freeze([
    "recoveries",
    "recoveryTransactions",
    "removalTransactions",
  ]),
});

function plannerError(code, message) {
  const error = new Error(message || code);
  error.code = code;
  return error;
}

function isPlainObject(value) {
  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype ||
      Object.getPrototypeOf(value) === null),
  );
}

function canonicalize(value) {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(canonicalize);
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalize(value[key])]),
  );
}

function digest(value) {
  return crypto
    .createHash("sha256")
    .update(
      typeof value === "string" ? value : JSON.stringify(canonicalize(value)),
      "utf8",
    )
    .digest("hex");
}

function clone(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function freeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value))
    return value;
  Object.freeze(value);
  Object.keys(value).forEach((key) => freeze(value[key]));
  return value;
}

function safeFingerprint(value, code) {
  if (typeof value !== "string" || !FINGERPRINT.test(value))
    throw plannerError(code || "LEGACY_FINGERPRINT_INVALID");
  return value;
}

function safeReference(value, fallback) {
  if (typeof value === "string") {
    const normalized = value.replace(/\\/g, "/");
    if (
      normalized.length > 0 &&
      normalized.length <= 512 &&
      SAFE_REFERENCE.test(normalized) &&
      !normalized.split("/").includes("..")
    )
      return normalized;
  }
  return `record:${digest(fallback).slice(0, 32)}`;
}

function sanitize(value, depth) {
  const level = depth || 0;
  if (level > 16) return undefined;
  if (value === null) return null;
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (Array.isArray(value))
    return value
      .map((item) => sanitize(item, level + 1))
      .filter((item) => item !== undefined);
  if (!isPlainObject(value)) return undefined;
  const result = {};
  Object.keys(value)
    .sort()
    .filter((key) => SAFE_KEYS.has(key))
    .forEach((key) => {
      const item = sanitize(value[key], level + 1);
      if (item !== undefined) result[key] = item;
    });
  return result;
}

function recordIdentity(value) {
  if (!isPlainObject(value)) return null;
  const candidates = [
    value.recordId,
    value.id,
    value.publicationId,
    value.attemptId,
    value.orderId,
    value.orderNid,
    value.articleId && `${value.clientId || ""}:${value.articleId}`,
  ];
  const candidate = candidates.find(
    (item) => typeof item === "string" && item.trim(),
  );
  return candidate ? candidate.trim() : null;
}

function normalizeRecord(value, kind, index, defaultReference) {
  const safe = sanitize(value);
  if (!safe || !isPlainObject(safe))
    throw plannerError("LEGACY_RECORD_INVALID");
  const original = isPlainObject(value) ? value : {};
  const reference = safeReference(
    original.sourceRef ||
      original.source ||
      recordIdentity(original) ||
      defaultReference,
    original,
  );
  safe.sourceRef = reference;
  safe.sourceKind = kind;
  safe.sourceRecordId =
    recordIdentity(original) || `record-${digest(original).slice(0, 24)}`;
  if (!Number.isSafeInteger(safe.version) || safe.version < 1) safe.version = 1;
  return safe;
}

function collectionFrom(source, name) {
  for (const alias of COLLECTION_ALIASES[name]) {
    if (Array.isArray(source[alias])) return source[alias];
  }
  return [];
}

function sortRecords(records) {
  return [...records].sort((left, right) => {
    const leftKey = `${left.sourceRef}\u0000${left.sourceRecordId}\u0000${digest(left)}`;
    const rightKey = `${right.sourceRef}\u0000${right.sourceRecordId}\u0000${digest(right)}`;
    return leftKey.localeCompare(rightKey);
  });
}

function sourceFingerprintOf(evidence) {
  return digest({
    version: 1,
    articles: evidence.articles,
    publications: evidence.publications,
    submissions: evidence.submissions,
    queues: evidence.queues,
    orders: evidence.orders,
    deletions: evidence.deletions,
    recoveries: evidence.recoveries,
    diagnostics: evidence.diagnostics,
  });
}

function workspaceFingerprintOf(options, source) {
  const explicit = options.workspaceFingerprint || source.workspaceFingerprint;
  if (explicit !== undefined)
    return safeFingerprint(explicit, "WORKSPACE_FINGERPRINT_INVALID");
  return digest({
    version: 1,
    identity:
      options.workspaceIdentity ||
      source.workspaceIdentity ||
      options.workspaceRoot ||
      options.sourceRoot ||
      "legacy-workspace",
  });
}

function addDiagnostic(diagnostics, sourceRef, kind, code) {
  diagnostics.push({
    sourceRef: safeReference(sourceRef, { kind, code }),
    kind,
    code,
  });
}

function relative(root, filename) {
  return path.relative(root, filename).split(path.sep).join("/");
}

function assertSourceRoot(root) {
  if (typeof root !== "string" || !path.isAbsolute(root))
    throw plannerError("LEGACY_SOURCE_ROOT_REQUIRED");
  const resolved = path.resolve(root);
  let stat;
  try {
    stat = fs.lstatSync(resolved);
  } catch (error) {
    if (error && error.code === "ENOENT")
      throw plannerError("LEGACY_SOURCE_NOT_FOUND");
    throw plannerError("LEGACY_SOURCE_UNREADABLE");
  }
  if (!stat.isDirectory() || stat.isSymbolicLink())
    throw plannerError("LEGACY_SOURCE_UNSAFE");
  return resolved;
}

function regularFile(filename) {
  try {
    const stat = fs.lstatSync(filename);
    return stat.isFile() && !stat.isSymbolicLink();
  } catch (error) {
    if (error && (error.code === "ENOENT" || error.code === "ENOTDIR"))
      return false;
    throw plannerError("LEGACY_SOURCE_UNREADABLE");
  }
}

function walkFiles(root, directory, diagnostics) {
  const base = path.join(root, directory);
  if (!fs.existsSync(base)) return [];
  const files = [];
  function visit(current) {
    let entries;
    try {
      entries = fs
        .readdirSync(current, { withFileTypes: true })
        .sort((left, right) => left.name.localeCompare(right.name));
    } catch (error) {
      addDiagnostic(
        diagnostics,
        relative(root, current),
        "source",
        "SOURCE_READ_FAILED",
      );
      return;
    }
    for (const entry of entries) {
      const filename = path.join(current, entry.name);
      const sourceRef = relative(root, filename);
      if (entry.isSymbolicLink()) {
        addDiagnostic(
          diagnostics,
          sourceRef,
          "source",
          "SOURCE_SYMLINK_SKIPPED",
        );
        continue;
      }
      if (entry.isDirectory()) visit(filename);
      else if (entry.isFile()) files.push(filename);
    }
  }
  let stat;
  try {
    stat = fs.lstatSync(base);
  } catch (error) {
    return [];
  }
  if (stat.isSymbolicLink()) {
    addDiagnostic(diagnostics, directory, "source", "SOURCE_SYMLINK_SKIPPED");
    return [];
  }
  if (stat.isDirectory()) visit(base);
  return files;
}

function readJson(filename, root, diagnostics) {
  const sourceRef = relative(root, filename);
  if (!regularFile(filename)) {
    addDiagnostic(diagnostics, sourceRef, "source", "SOURCE_FILE_INVALID");
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(filename, "utf8"));
  } catch (error) {
    addDiagnostic(diagnostics, sourceRef, "source", "SOURCE_JSON_INVALID");
    return null;
  }
}

function articleFromFile(value, sourceRef, relativeParts) {
  const parts = relativeParts || [];
  const generatedIndex = Math.max(
    parts.indexOf("generated"),
    parts.indexOf("published"),
    parts.indexOf("failed"),
  );
  const clientId =
    (value && value.clientId) ||
    (generatedIndex >= 0 ? parts[generatedIndex + 1] : null);
  const filename = parts.at(-1) || "";
  const articleId =
    (value && (value.articleId || value.id)) ||
    filename.replace(/\.json$/u, "");
  return normalizeRecord(
    Object.assign({}, value || {}, {
      clientId,
      articleId,
      sourceRef,
    }),
    "ARTICLE_RECORD",
    0,
    sourceRef,
  );
}

function readArticles(root, diagnostics) {
  const result = [];
  for (const directory of ["generated", "published", "failed"]) {
    for (const filename of walkFiles(root, directory, diagnostics)) {
      if (!filename.endsWith(".json") || filename.endsWith(".tombstone.json"))
        continue;
      const value = readJson(filename, root, diagnostics);
      if (!value) continue;
      try {
        result.push(
          articleFromFile(
            value,
            relative(root, filename),
            relative(root, filename).split("/"),
          ),
        );
      } catch (error) {
        addDiagnostic(
          diagnostics,
          relative(root, filename),
          "article",
          "LEGACY_ARTICLE_INVALID",
        );
      }
    }
  }
  return result;
}

function readPublications(root, diagnostics) {
  const result = [];
  const files = [
    ...walkFiles(
      root,
      ".autopublish/submission-records/publications",
      diagnostics,
    ),
    ...walkFiles(root, ".autopublish/submission-records", diagnostics).filter(
      (filename) => path.basename(filename).startsWith("publication-"),
    ),
  ];
  const seen = new Set();
  for (const filename of files.sort()) {
    if (seen.has(filename)) continue;
    seen.add(filename);
    if (!filename.endsWith(".json")) continue;
    const value = readJson(filename, root, diagnostics);
    if (!value) continue;
    try {
      result.push(
        normalizeRecord(
          value,
          "SUBMISSION_RECORD",
          0,
          relative(root, filename),
        ),
      );
    } catch (error) {
      addDiagnostic(
        diagnostics,
        relative(root, filename),
        "publication",
        "LEGACY_PUBLICATION_INVALID",
      );
    }
  }
  return result;
}

function readBatches(root, diagnostics) {
  const result = [];
  const directories = [
    ".autopublish/submission-batches",
    ".autopublish/batches",
    ".autopublish/submission-records",
  ];
  const seen = new Set();
  for (const directory of directories) {
    for (const filename of walkFiles(root, directory, diagnostics)) {
      if (!/^batch-[^/]+\.json$/iu.test(path.basename(filename))) continue;
      if (seen.has(filename)) continue;
      seen.add(filename);
      const value = readJson(filename, root, diagnostics);
      if (!value || !Array.isArray(value.items)) {
        addDiagnostic(
          diagnostics,
          relative(root, filename),
          "submission",
          "LEGACY_BATCH_INVALID",
        );
        continue;
      }
      const sourceRef = relative(root, filename);
      value.items.forEach((item, index) => {
        try {
          result.push(
            normalizeRecord(
              Object.assign({}, item, {
                batchId: value.id || value.batchId,
                clientId: item.clientId || value.clientId,
                sourceRef: `${sourceRef}#item:${index + 1}`,
                remoteBoundaryCrossed:
                  item.remoteBoundaryCrossed === true ||
                  [
                    "submitting",
                    "submitted",
                    "published",
                    "uncertain",
                  ].includes(String(item.status || "").toLowerCase()),
              }),
              "SUBMISSION_RECORD",
              index,
              `${sourceRef}#item:${index + 1}`,
            ),
          );
        } catch (error) {
          addDiagnostic(
            diagnostics,
            `${sourceRef}#item:${index + 1}`,
            "submission",
            "LEGACY_SUBMISSION_INVALID",
          );
        }
      });
    }
  }
  return result;
}

function readSidecars(root, diagnostics) {
  const result = [];
  for (const filename of walkFiles(root, ".autopublish/input", diagnostics)) {
    if (!filename.endsWith(".submission.json")) continue;
    const value = readJson(filename, root, diagnostics);
    if (!value) continue;
    const sourceRef = relative(root, filename);
    try {
      result.push(
        normalizeRecord(
          Object.assign({}, value, {
            articleId: value.generatedArticleId || value.articleId,
            sourceRef,
            status: value.status || "queued",
            queueState: "QUEUED",
            remoteBoundaryCrossed: false,
          }),
          "QUEUE_RECORD",
          0,
          sourceRef,
        ),
      );
    } catch (error) {
      addDiagnostic(diagnostics, sourceRef, "queue", "LEGACY_QUEUE_INVALID");
    }
  }
  return result;
}

function readQueueRecords(root, diagnostics) {
  const result = [];
  const directories = [
    ".autopublish/queue",
    ".autopublish/submission-queues",
    "data/submission-queues",
    "queue",
  ];
  const seen = new Set();
  for (const directory of directories) {
    for (const filename of walkFiles(root, directory, diagnostics)) {
      if (!filename.endsWith(".json") || seen.has(filename)) continue;
      seen.add(filename);
      const value = readJson(filename, root, diagnostics);
      if (!value) continue;
      const sourceRef = relative(root, filename);
      const records = Array.isArray(value.items) ? value.items : [value];
      records.forEach((item, index) => {
        try {
          result.push(
            normalizeRecord(
              Object.assign({}, item, {
                clientId: item.clientId || value.clientId,
                sourceRef:
                  records.length === 1
                    ? sourceRef
                    : `${sourceRef}#item:${index + 1}`,
                status: item.status || value.status || "queued",
                queueState: "QUEUED",
                remoteBoundaryCrossed: item.remoteBoundaryCrossed === true,
              }),
              "QUEUE_RECORD",
              index,
              sourceRef,
            ),
          );
        } catch (error) {
          addDiagnostic(
            diagnostics,
            sourceRef,
            "queue",
            "LEGACY_QUEUE_INVALID",
          );
        }
      });
    }
  }
  return result;
}

function firstValue(...values) {
  return values.find(
    (value) => value !== undefined && value !== null && value !== "",
  );
}

function orderFromLine(value, sourceRef) {
  const raw = isPlainObject(value) ? value : {};
  const result = isPlainObject(raw.result) ? raw.result : {};
  const data = isPlainObject(result.data) ? result.data : {};
  const sync =
    isPlainObject(result.syncRaw) && Array.isArray(result.syncRaw.data)
      ? result.syncRaw.data[0] || {}
      : {};
  const params = isPlainObject(raw.params) ? raw.params : {};
  const statusCode = firstValue(
    params.statusCode,
    result.statusCode,
    result.syncStatus,
    sync.status,
    data.status,
  );
  const orderId = firstValue(
    params.orderId,
    params.orderNid,
    params.order_nid,
    raw.orderId,
    raw.orderNid,
    data.orderId,
    data.orderNid,
    data.order_nid,
    sync.orderId,
    sync.orderNid,
    sync.order_nid,
  );
  const articleId = firstValue(
    params.articleId,
    params.generatedArticleId,
    raw.articleId,
    raw.generatedArticleId,
    data.articleId,
    data.generatedArticleId,
    data.article && data.article.articleId,
  );
  const mediaResourceId = firstValue(
    params.mediaResourceId,
    params.resourceId,
    params.resource_id,
    data.mediaResourceId,
    data.resourceId,
    data.resource_id,
    sync.mediaResourceId,
    sync.resourceId,
    sync.resource_id,
  );
  const published =
    result.published === true ||
    String(result.syncStatus || "") === "2" ||
    String(sync.status || "") === "2";
  const success = typeof result.success === "boolean" ? result.success : null;
  const status =
    published && success !== false
      ? "published"
      : success === false
        ? "failed"
        : statusCode === undefined
          ? undefined
          : String(statusCode);
  return normalizeRecord(
    {
      version: raw.version,
      clientId: firstValue(params.clientId, raw.clientId, data.clientId),
      articleId,
      mediaResourceId,
      orderId,
      statusCode: statusCode === undefined ? undefined : String(statusCode),
      status,
      publicationStatus: published ? "published" : undefined,
      success,
      published,
      remoteUrl: firstValue(
        sync.orderUrl,
        sync.order_url,
        data.orderUrl,
        data.order_url,
      ),
      observedAt: firstValue(sync.observedAt, data.observedAt, raw.observedAt),
      actualAmount: firstValue(
        sync.actualAmount,
        data.actualAmount,
        raw.actualAmount,
      ),
      submittedTitle: firstValue(
        params.submittedTitle,
        params.title,
        data.submittedTitle,
      ),
      submittedBody: firstValue(params.submittedBody, data.submittedBody),
      quotedPrice: firstValue(params.quotedPrice, data.quotedPrice),
      estimatedTotal: firstValue(params.estimatedTotal, data.estimatedTotal),
      systemSubmissionCode: firstValue(
        params.systemSubmissionCode,
        params.system_submission_code,
        data.systemSubmissionCode,
      ),
      remoteCallStartedAt: firstValue(
        raw.remoteCallStartedAt,
        params.remoteCallStartedAt,
      ),
      sourceRef,
    },
    "ORDER_RECORD",
    0,
    sourceRef,
  );
}

function readOrders(root, diagnostics) {
  const result = [];
  const files = [
    ".autopublish/data/submission-orders.jsonl",
    "data/submission-orders.jsonl",
    "submission-orders.jsonl",
  ];
  const seen = new Set();
  for (const relativeName of files) {
    const filename = path.join(root, relativeName);
    if (!regularFile(filename) || seen.has(filename)) continue;
    seen.add(filename);
    let lines;
    try {
      lines = fs.readFileSync(filename, "utf8").split(/\r?\n/u);
    } catch (error) {
      addDiagnostic(diagnostics, relativeName, "order", "SOURCE_READ_FAILED");
      continue;
    }
    lines.forEach((line, index) => {
      if (!line.trim()) return;
      const sourceRef = `${relativeName}#line:${index + 1}`;
      try {
        const value = JSON.parse(line);
        result.push(orderFromLine(value, sourceRef));
      } catch (error) {
        addDiagnostic(diagnostics, sourceRef, "order", "LEGACY_ORDER_INVALID");
      }
    });
  }
  return result;
}

function readDeletionRecords(root, diagnostics) {
  const result = [];
  for (const filename of walkFiles(
    root,
    ".autopublish/article-trash",
    diagnostics,
  )) {
    const name = path.basename(filename);
    if (!name.endsWith(".tombstone.json") && !name.endsWith(".trash.journal"))
      continue;
    const value = readJson(filename, root, diagnostics);
    if (!value) continue;
    const relativeParts = relative(root, filename).split("/");
    const clientId = relativeParts.at(-2) || value.clientId;
    const articleId = String(relativeParts.at(-1) || "")
      .replace(/\.tombstone\.json$/u, "")
      .replace(/\.trash\.journal$/u, "");
    const sourceRef = relative(root, filename);
    try {
      result.push(
        normalizeRecord(
          Object.assign({}, value, {
            clientId: value.clientId || clientId,
            articleId: value.articleId || articleId,
            deleted: true,
            sourceRef,
          }),
          "DELETION_RECORD",
          0,
          sourceRef,
        ),
      );
    } catch (error) {
      addDiagnostic(
        diagnostics,
        sourceRef,
        "deletion",
        "LEGACY_DELETION_INVALID",
      );
    }
  }
  return result;
}

function readRecoveryRecords(root, diagnostics) {
  const result = [];
  for (const filename of walkFiles(root, ".autopublish/data", diagnostics)) {
    const name = path.basename(filename).toLowerCase();
    if (!/(?:recovery|removal|trash)/u.test(name) || !name.endsWith(".json"))
      continue;
    const value = readJson(filename, root, diagnostics);
    if (!value) continue;
    const sourceRef = relative(root, filename);
    try {
      result.push(
        normalizeRecord(
          Object.assign({}, value, { sourceRef }),
          "DELETION_RECORD",
          0,
          sourceRef,
        ),
      );
    } catch (error) {
      addDiagnostic(
        diagnostics,
        sourceRef,
        "recovery",
        "LEGACY_RECOVERY_INVALID",
      );
    }
  }
  return result;
}

function scanWorkspace(options) {
  const root = assertSourceRoot(options.workspaceRoot || options.sourceRoot);
  const diagnostics = [];
  const evidence = {
    version: 1,
    workspaceFingerprint: options.workspaceFingerprint,
    articles: readArticles(root, diagnostics),
    publications: readPublications(root, diagnostics),
    submissions: readBatches(root, diagnostics),
    queues: [
      ...readQueueRecords(root, diagnostics),
      ...readSidecars(root, diagnostics),
    ],
    orders: readOrders(root, diagnostics),
    deletions: readDeletionRecords(root, diagnostics),
    recoveries: readRecoveryRecords(root, diagnostics),
    diagnostics,
  };
  return evidence;
}

function fromSource(options, source) {
  const diagnostics = [];
  const result = {
    version: 1,
    workspaceFingerprint:
      options.workspaceFingerprint || source.workspaceFingerprint,
    workspaceIdentity: options.workspaceIdentity || source.workspaceIdentity,
    articles: [],
    publications: [],
    submissions: [],
    queues: [],
    orders: [],
    deletions: [],
    recoveries: [],
    diagnostics: [],
  };
  for (const name of Object.keys(COLLECTION_ALIASES)) {
    const kind =
      name === "articles"
        ? "ARTICLE_RECORD"
        : name === "queues"
          ? "QUEUE_RECORD"
          : name === "deletions" || name === "recoveries"
            ? "DELETION_RECORD"
            : name === "orders"
              ? "ORDER_RECORD"
              : "SUBMISSION_RECORD";
    const values = collectionFrom(source, name);
    values.forEach((value, index) => {
      try {
        result[name].push(
          normalizeRecord(value, kind, index, `${name}/${index + 1}`),
        );
      } catch (error) {
        addDiagnostic(
          diagnostics,
          `${name}/${index + 1}`,
          name,
          "LEGACY_RECORD_INVALID",
        );
      }
    });
  }
  if (Array.isArray(source.diagnostics)) {
    source.diagnostics.forEach((item, index) => {
      if (!isPlainObject(item)) return;
      addDiagnostic(
        diagnostics,
        item.sourceRef || `diagnostic/${index + 1}`,
        item.kind || "source",
        item.code || "SOURCE_DIAGNOSTIC",
      );
    });
  }
  result.diagnostics = diagnostics;
  return result;
}

function normalizeEvidence(options, input) {
  const values = input || {};
  const source =
    values.legacySource ||
    values.source ||
    (values.workspaceRoot || values.sourceRoot ? null : values);
  const scanned = source ? fromSource(values, source) : scanWorkspace(values);
  const evidence = {
    version: 1,
    workspaceFingerprint: workspaceFingerprintOf(values, scanned),
    articles: sortRecords(scanned.articles),
    publications: sortRecords(scanned.publications),
    submissions: sortRecords(scanned.submissions),
    queues: sortRecords(scanned.queues),
    orders: sortRecords(scanned.orders),
    deletions: sortRecords(scanned.deletions),
    recoveries: sortRecords(scanned.recoveries),
    diagnostics: [...(scanned.diagnostics || [])].sort((left, right) =>
      `${left.sourceRef}\u0000${left.kind}\u0000${left.code}`.localeCompare(
        `${right.sourceRef}\u0000${right.kind}\u0000${right.code}`,
      ),
    ),
  };
  const explicit = values.sourceFingerprint || source?.sourceFingerprint;
  evidence.sourceFingerprint =
    explicit === undefined
      ? sourceFingerprintOf(evidence)
      : safeFingerprint(explicit, "SOURCE_FINGERPRINT_INVALID");
  return freeze(evidence);
}

function createLegacyMigrationReader(options) {
  const values = options || {};
  return Object.freeze({
    read: () => normalizeEvidence(values, values),
  });
}

function readLegacyEvidence(options) {
  return createLegacyMigrationReader(options).read();
}

module.exports = Object.freeze({
  createLegacyMigrationReader,
  readLegacyEvidence,
});
