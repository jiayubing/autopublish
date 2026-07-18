const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const childProcess = require("node:child_process");

const { resolveArticleIdentity } = require("../src/publication/article-identity");
const { resolvePublicationTarget } = require("../src/publication/publication-targets");
const { aggregateFilename, validatePublicationRecord } = require("../src/publication/publication-ledger-store");
const { createPublicationLedger } = require("../src/publication/publication-ledger");

const MIGRATION_VERSION = 1;
const MIGRATION_CONFIRMATION_TOKEN = "MIGRATE_PUBLICATION_LEDGER_V1";
const MANIFEST_NAME = "publication-ledger-v1-migration.json";
const SAFE_ID = /^[A-Za-z0-9_.-]+$/;
const SHA256 = /^[a-f0-9]{64}$/;
const COMMIT = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
const PLATFORM_IDS = new Set(["lieju", "toutiao", "hepan"]);
const STATUS_RANK = Object.freeze({ failed: 1, queued: 2, submitted: 3, published: 4 });

function migrationError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function fileDigest(filename) {
  const bytes = fs.readFileSync(filename);
  return { bytes: bytes.length, sha256: sha256(bytes) };
}

function isSafeId(value) {
  return typeof value === "string" && SAFE_ID.test(value.trim()) && value.trim() !== "." && value.trim() !== "..";
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function firstValue() {
  for (const value of arguments) {
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return "";
}

function isContained(parent, child) {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  return relative === "" || (relative !== ".." && !relative.startsWith(".." + path.sep) && !path.isAbsolute(relative));
}

function normalizeRelative(root, filename) {
  if (!isContained(root, filename)) throw migrationError("MIGRATION_PATH_INVALID");
  return path.relative(root, filename).replace(/\\/g, "/");
}

function safePath(root, value, code) {
  if (typeof value !== "string" || !value.trim() || value.includes("\0")) throw migrationError(code || "MIGRATION_PATH_INVALID");
  const resolved = path.resolve(value);
  if (!isContained(root, resolved)) throw migrationError(code || "MIGRATION_PATH_INVALID");
  return resolved;
}

function readJson(filename, code) {
  let raw;
  try { raw = fs.readFileSync(filename, "utf8"); } catch (_) { throw migrationError(code || "MIGRATION_SOURCE_READ_FAILED"); }
  try { return JSON.parse(raw); } catch (_) { throw migrationError(code || "MIGRATION_JSON_INVALID"); }
}

function lstat(filename) {
  try { return fs.lstatSync(filename); } catch (error) {
    if (error && error.code === "ENOENT") return null;
    throw migrationError("MIGRATION_SOURCE_READ_FAILED");
  }
}

function assertRegularFile(filename) {
  const stat = lstat(filename);
  if (!stat) return false;
  if (stat.isSymbolicLink()) throw migrationError("MIGRATION_SYMLINK_UNSAFE");
  if (!stat.isFile()) throw migrationError("MIGRATION_SOURCE_INVALID");
  return true;
}

function walkFiles(root) {
  const stat = lstat(root);
  if (!stat) return [];
  if (stat.isSymbolicLink()) throw migrationError("MIGRATION_SYMLINK_UNSAFE");
  if (!stat.isDirectory()) throw migrationError("MIGRATION_SOURCE_INVALID");
  const files = [];
  function visit(directory) {
    const entries = fs.readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const filename = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw migrationError("MIGRATION_SYMLINK_UNSAFE");
      if (entry.isDirectory()) visit(filename);
      else if (entry.isFile()) files.push(filename);
      else throw migrationError("MIGRATION_SOURCE_INVALID");
    }
  }
  visit(root);
  return files;
}

function uniquePaths(root, values) {
  const output = [];
  const seen = new Set();
  for (const value of values) {
    if (!value) continue;
    const resolved = safePath(root, value);
    const key = resolved.toLowerCase();
    if (!seen.has(key)) { seen.add(key); output.push(resolved); }
  }
  return output;
}

function defaultPaths(root, options) {
  const values = options || {};
  const autopublish = path.join(root, ".autopublish");
  const input = path.join(autopublish, "input");
  const data = path.join(autopublish, "data");
  const records = path.join(autopublish, "submission-records");
  return {
    queueRoots: uniquePaths(root, values.queueRoots || values.queueRoot ? (values.queueRoots || [values.queueRoot]) : [input, path.join(root, "input"), path.join(autopublish, "queue"), path.join(root, "queue")]),
    batchRoots: uniquePaths(root, values.batchRoots || values.batchRoot ? (values.batchRoots || [values.batchRoot]) : [records, path.join(autopublish, "batches"), path.join(autopublish, "submission-batches"), path.join(root, "data", "submission-records"), path.join(root, "data", "submission-batches")]),
    orderPaths: uniquePaths(root, values.orderPaths || values.ordersPath ? (values.orderPaths || [values.ordersPath]) : [path.join(data, "submission-orders.jsonl"), path.join(root, "data", "submission-orders.jsonl"), path.join(root, "submission-orders.jsonl")]),
    publishedRoots: uniquePaths(root, values.publishedRoots || values.publishedRoot ? (values.publishedRoots || [values.publishedRoot]) : [path.join(autopublish, "published"), path.join(root, "published")]),
    publications: safePath(root, values.publications || path.join(records, "publications")),
    manifest: safePath(root, values.manifest || path.join(records, MANIFEST_NAME))
  };
}

function sourceInfo(root, filename, extra) {
  const info = fileDigest(filename);
  return Object.assign({ source: normalizeRelative(root, filename), bytes: info.bytes, sha256: info.sha256 }, extra || {});
}

function lineInfo(root, filename, lineNumber, line) {
  const info = { bytes: Buffer.byteLength(line, "utf8"), sha256: sha256(Buffer.from(line, "utf8")) };
  return { source: normalizeRelative(root, filename) + "#line:" + lineNumber, bytes: info.bytes, sha256: info.sha256 };
}

function sourceVersion(value) {
  if (Number.isInteger(value) && value >= 1 && value <= 1000) return value;
  if (typeof value === "string" && /^[0-9]{1,4}$/.test(value)) return Number(value);
  return MIGRATION_VERSION;
}

function resolveCommit(root, supplied) {
  const value = text(supplied || process.env.GIT_COMMIT || process.env.SOURCE_COMMIT);
  if (COMMIT.test(value)) return value;
  try {
    const commit = childProcess.execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    return COMMIT.test(commit) ? commit : "unknown";
  } catch (_) {
    return "unknown";
  }
}

function targetForSidecar(sidecar) {
  const platformId = text(firstValue(sidecar.targetPlatformId, sidecar.targetPlatform, sidecar.platformId));
  const resourceId = text(firstValue(sidecar.mediaResourceId, sidecar.resourceId, sidecar.resource_id));
  try {
    if (platformId === "media" || resourceId) return resolvePublicationTarget({ mediaResourceId: resourceId });
    if (!PLATFORM_IDS.has(platformId)) throw migrationError("QUEUE_TARGET_INVALID");
    return resolvePublicationTarget({ platformId: platformId });
  } catch (error) {
    if (error && error.code === "MIGRATION_QUEUED") throw error;
    throw migrationError("QUEUE_TARGET_INVALID");
  }
}

function articleFromGenerated(clientId, articleId, contentHash) {
  if (!isSafeId(clientId) || !isSafeId(articleId)) throw migrationError("MIGRATION_ARTICLE_UNSTABLE");
  const identity = resolveArticleIdentity({ clientId: clientId.trim(), articleId: articleId.trim() });
  return Object.assign({}, identity, { contentHash: SHA256.test(contentHash || "") ? contentHash : null });
}

function articleFromExplicit(value) {
  const input = value || {};
  const clientId = text(firstValue(input.clientId, input.client_id));
  const articleId = text(firstValue(input.generatedArticleId, input.generated_article_id, input.articleId, input.article_id));
  const contentHash = text(firstValue(input.contentHash, input.content_hash));
  if (clientId && articleId) return articleFromGenerated(clientId, articleId, contentHash);
  const articleKey = text(input.articleKey || input.article_key);
  if (clientId && /^content:[a-f0-9]{64}$/.test(articleKey) && SHA256.test(contentHash)) {
    return { kind: "manual", articleKey, clientId, articleId: null, contentHash };
  }
  return null;
}

function aggregateKey(article, target) {
  return article.articleKey + "\0" + target.targetKey;
}

function findBatchMatch(batches, sidecar, queueFile) {
  const clientId = text(sidecar.clientId);
  const articleId = text(sidecar.generatedArticleId);
  const platformId = text(firstValue(sidecar.targetPlatformId, sidecar.targetPlatform, sidecar.platformId));
  const contentHash = text(sidecar.contentHash);
  const requested = text(firstValue(sidecar.submissionBatchId, sidecar.batchId));
  let candidates = batches;
  if (requested) candidates = candidates.filter((item) => item.batch.id === requested);
  candidates = candidates.filter((item) => item.batch.clientId === clientId && item.batch.items.some((entry) => {
    const entryArticleId = text(firstValue(entry.generatedArticleId, entry.articleId));
    const entryPlatform = text(firstValue(entry.targetPlatformId, entry.targetPlatform, entry.platformId));
    return entryArticleId === articleId && entryPlatform === platformId && text(entry.contentHash) === contentHash;
  }));
  if (requested && candidates.length !== 1) throw migrationError("QUEUE_BATCH_MISMATCH");
  if (!requested && candidates.length > 1) throw migrationError("QUEUE_BATCH_AMBIGUOUS");
  if (!candidates.length) return null;
  const found = candidates[0];
  const matchingItem = found.batch.items.find((entry) => {
    const entryArticleId = text(firstValue(entry.generatedArticleId, entry.articleId));
    const entryPlatform = text(firstValue(entry.targetPlatformId, entry.targetPlatform, entry.platformId));
    return entryArticleId === articleId && entryPlatform === platformId && text(entry.contentHash) === contentHash;
  });
  if (!matchingItem) throw migrationError("QUEUE_BATCH_MISMATCH");
  if (matchingItem.filePath && path.basename(String(matchingItem.filePath)) !== path.basename(queueFile)) throw migrationError("QUEUE_BATCH_MISMATCH");
  return found;
}

function loadBatches(root, paths, reports, commit) {
  const batches = [];
  const seen = new Set();
  for (const directory of paths.batchRoots) {
    for (const filename of walkFiles(directory)) {
      if (!/^batch-[A-Za-z0-9_-]+\.json$/i.test(path.basename(filename))) continue;
      const key = path.resolve(filename).toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      let batch;
      try { batch = readJson(filename, "BATCH_JSON_INVALID"); } catch (error) {
        reports.push(Object.assign(sourceInfo(root, filename), { kind: "batch", code: error.code, version: MIGRATION_VERSION, commit }));
        continue;
      }
      const id = text(firstValue(batch.id, batch.batchId));
      if (!isSafeId(id) || !isSafeId(text(batch.clientId)) || !Array.isArray(batch.items)) continue;
      batches.push({ batch, filename, source: sourceInfo(root, filename), version: sourceVersion(batch.version) });
    }
  }
  return batches;
}

function queueEntry(root, filename, batches, reports, commit, identitiesByPath) {
  const sidecarFile = filename + ".submission.json";
  if (!assertRegularFile(sidecarFile)) return null;
  const mainSource = sourceInfo(root, filename);
  const sidecarSource = sourceInfo(root, sidecarFile);
  let sidecar;
  try { sidecar = readJson(sidecarFile, "QUEUE_SIDECAR_INVALID"); } catch (error) {
    reports.push(Object.assign(mainSource, { kind: "queue", code: error.code, version: MIGRATION_VERSION, commit }));
    return null;
  }
  const clientId = text(sidecar.clientId);
  const articleId = text(firstValue(sidecar.generatedArticleId, sidecar.articleId));
  const contentHash = text(sidecar.contentHash);
  if (!isSafeId(clientId) || !isSafeId(articleId)) {
    reports.push(Object.assign(mainSource, { kind: "queue", code: "QUEUE_ARTICLE_UNSTABLE", version: sourceVersion(sidecar.version), commit }));
    return null;
  }
  if (!SHA256.test(contentHash) || contentHash !== mainSource.sha256) {
    reports.push(Object.assign(mainSource, { kind: "queue", code: "QUEUE_SIDECAR_HASH_MISMATCH", version: sourceVersion(sidecar.version), commit }));
    return null;
  }
  if (sidecar.status !== undefined && sidecar.status !== "queued") {
    reports.push(Object.assign(mainSource, { kind: "queue", code: "QUEUE_STATUS_UNSUPPORTED", version: sourceVersion(sidecar.version), commit }));
    return null;
  }
  let target;
  try { target = targetForSidecar(sidecar); } catch (error) {
    reports.push(Object.assign(mainSource, { kind: "queue", code: error.code, version: sourceVersion(sidecar.version), commit }));
    return null;
  }
  let batch;
  try { batch = findBatchMatch(batches, sidecar, filename); } catch (error) {
    reports.push(Object.assign(mainSource, { kind: "queue", code: error.code, version: sourceVersion(sidecar.version), commit }));
    return null;
  }
  const article = articleFromGenerated(clientId, articleId, contentHash);
  const item = {
    kind: "queue",
    article,
    target,
    status: "queued",
    batchId: batch ? batch.batch.id : null,
    version: sourceVersion(sidecar.version),
    evidence: [{ source: mainSource.source, bytes: mainSource.bytes, sha256: mainSource.sha256, sidecar: sidecarSource, batch: batch ? batch.source : null }],
    remoteId: null,
    remoteUrl: null,
    errorCode: null
  };
  identitiesByPath.set(path.resolve(filename).toLowerCase(), article);
  return item;
}

function scanQueues(root, paths, batches, reports, commit, identitiesByPath) {
  const items = [];
  const seen = new Set();
  for (const directory of paths.queueRoots) {
    for (const filename of walkFiles(directory)) {
      if (filename.endsWith(".submission.json") || filename.endsWith(".meta.json") || /\.tmp-|\.stage$/.test(filename)) continue;
      const key = path.resolve(filename).toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      try {
        const item = queueEntry(root, filename, batches, reports, commit, identitiesByPath);
        if (item) items.push(item);
      } catch (error) {
        reports.push(Object.assign(sourceInfo(root, filename), { kind: "queue", code: error.code || "QUEUE_SCAN_FAILED", version: MIGRATION_VERSION, commit }));
      }
    }
  }
  return items;
}

function syncItem(result) {
  const raw = result && result.syncRaw;
  return raw && Array.isArray(raw.data) && raw.data.length ? raw.data[0] : null;
}

function orderData(record) {
  const result = record && record.result && typeof record.result === "object" ? record.result : {};
  const data = result.data && typeof result.data === "object" ? result.data : {};
  const nested = data.result && data.result.data && typeof data.result.data === "object" ? data.result.data : {};
  const synced = syncItem(result) || {};
  return { result, data, nested, synced };
}

function orderArticle(record) {
  const values = record || {};
  const data = orderData(values);
  const params = values.params && typeof values.params === "object" ? values.params : {};
  const candidates = [
    params,
    values,
    data.data,
    data.data.article,
    data.result.article,
    data.nested.article
  ];
  for (const candidate of candidates) {
    const article = articleFromExplicit(candidate);
    if (article) return { article, via: "explicit" };
  }
  return null;
}

function orderFile(record) {
  const values = record || {};
  const data = orderData(values);
  const params = values.params && typeof values.params === "object" ? values.params : {};
  return text(firstValue(
    params.content_file,
    params.contentFile,
    values.content_file,
    data.data.content_file,
    data.data.contentFile,
    data.data.article && (data.data.article.filePath || data.data.article.sourceFile),
    data.result.article && (data.result.article.filePath || data.result.article.sourceFile)
  ));
}

function orderResourceId(record) {
  const values = record || {};
  const data = orderData(values);
  const params = values.params && typeof values.params === "object" ? values.params : {};
  const candidate = text(firstValue(
    params.resource_id,
    params.resourceId,
    values.resource_id,
    data.data.resourceId,
    data.data.resource_id,
    data.data.resource && data.data.resource.resourceId,
    data.nested.resource_id,
    data.synced.resource_id
  ));
  return isSafeId(candidate) ? candidate : "";
}

function orderId(record) {
  const values = record || {};
  const data = orderData(values);
  const params = values.params && typeof values.params === "object" ? values.params : {};
  const candidate = text(firstValue(
    params.order_nid,
    params.orderNid,
    values.order_nid,
    data.data.orderNid,
    data.data.order_nid,
    data.nested.order_nid,
    data.synced.order_nid
  ));
  return isSafeId(candidate) ? candidate : null;
}

function safeRemoteUrl(record) {
  const data = orderData(record);
  const candidate = text(firstValue(
    data.synced.order_url,
    data.data.orderUrl,
    data.data.order_url,
    data.nested.order_url
  ));
  if (!candidate) return null;
  try {
    const url = new URL(candidate);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.origin + url.pathname;
  } catch (_) {
    return null;
  }
}

function explicitPublished(record) {
  const data = orderData(record);
  const result = data.result;
  const statusValues = [
    result.syncStatus,
    data.data.syncStatus,
    data.synced.status,
    data.data.status,
    data.nested.status
  ].map((value) => String(value == null ? "" : value).toLowerCase());
  return result.published === true || data.data.published === true || statusValues.includes("2") || statusValues.includes("published");
}

function orderStatus(record) {
  const values = record || {};
  const result = values.result;
  if (!result || typeof result.success !== "boolean") return null;
  if (values.dryRun === true) return null;
  if (result.success === false) return "failed";
  return explicitPublished(values) ? "published" : "submitted";
}

function pathCandidates(root, reference, identitiesByPath) {
  const value = text(reference);
  if (!value) return [];
  const candidates = [];
  const resolved = path.isAbsolute(value) ? path.resolve(value) : path.resolve(root, value);
  const exact = identitiesByPath.get(resolved.toLowerCase());
  if (exact) candidates.push(exact);
  const basename = path.basename(value.replace(/\\/g, "/")).toLowerCase();
  for (const [filename, article] of identitiesByPath.entries()) {
    if (path.basename(filename).toLowerCase() === basename && !candidates.includes(article)) candidates.push(article);
  }
  return candidates;
}

function addEvidence(candidate, evidence, status, orderRecord) {
  candidate.evidence.push(evidence);
  if ((STATUS_RANK[status] || 0) > (STATUS_RANK[candidate.status] || 0)) candidate.status = status;
  if (orderRecord) {
    candidate.remoteId = candidate.remoteId || orderId(orderRecord);
    candidate.remoteUrl = candidate.remoteUrl || safeRemoteUrl(orderRecord);
    if (status === "failed") candidate.errorCode = candidate.errorCode || "LEGACY_REMOTE_REJECTED";
  }
}

function scanOrders(root, paths, reports, commit, identitiesByPath, candidates) {
  const seen = new Set();
  for (const filename of paths.orderPaths) {
    if (!assertRegularFile(filename)) continue;
    const key = path.resolve(filename).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    let raw;
    try { raw = fs.readFileSync(filename, "utf8"); } catch (_) {
      reports.push(Object.assign({ source: normalizeRelative(root, filename), kind: "order", bytes: 0, sha256: sha256(Buffer.alloc(0)) }, { code: "ORDER_READ_FAILED", version: MIGRATION_VERSION, commit }));
      continue;
    }
    const lines = raw.split(/\n/);
    lines.forEach((line, index) => {
      if (!line.trim()) return;
      const evidence = Object.assign(lineInfo(root, filename, index + 1, line), { kind: "order" });
      let record;
      try { record = JSON.parse(line); } catch (_) {
        reports.push(Object.assign(evidence, { kind: "order", code: "ORDER_JSON_INVALID", version: MIGRATION_VERSION, commit }));
        return;
      }
      const status = orderStatus(record);
      if (!status) {
        reports.push(Object.assign(evidence, { kind: "order", code: record.dryRun === true ? "ORDER_DRY_RUN_IGNORED" : "ORDER_REMOTE_RESULT_UNCLEAR", version: sourceVersion(record.version), commit }));
        return;
      }
      const resourceId = orderResourceId(record);
      if (!resourceId) {
        reports.push(Object.assign(evidence, { kind: "order", code: "ORDER_RESOURCE_UNSTABLE", version: sourceVersion(record.version), commit }));
        return;
      }
      let articleResult = orderArticle(record);
      if (!articleResult) {
        const linked = pathCandidates(root, orderFile(record), identitiesByPath);
        if (linked.length === 1) articleResult = { article: linked[0], via: "sidecar" };
        else if (linked.length > 1) {
          reports.push(Object.assign(evidence, { kind: "order", code: "ORDER_ARTICLE_AMBIGUOUS", version: sourceVersion(record.version), commit }));
          return;
        }
      }
      if (!articleResult) {
        reports.push(Object.assign(evidence, { kind: "order", code: "ORDER_ARTICLE_UNSTABLE", version: sourceVersion(record.version), commit }));
        return;
      }
      let target;
      try { target = resolvePublicationTarget({ mediaResourceId: resourceId }); } catch (_) {
        reports.push(Object.assign(evidence, { kind: "order", code: "ORDER_RESOURCE_UNSTABLE", version: sourceVersion(record.version), commit }));
        return;
      }
      const keyForCandidate = aggregateKey(articleResult.article, target);
      let candidate = candidates.get(keyForCandidate);
      if (!candidate) {
        candidate = {
          kind: "order",
          article: articleResult.article,
          target,
          status,
          batchId: null,
          version: sourceVersion(record.version),
          evidence: [],
          remoteId: orderId(record),
          remoteUrl: safeRemoteUrl(record),
          errorCode: status === "failed" ? "LEGACY_REMOTE_REJECTED" : null,
          commit
        };
        candidates.set(keyForCandidate, candidate);
      }
      addEvidence(candidate, evidence, status, record);
    });
  }
}

function scanPublished(root, paths, reports, commit) {
  const seen = new Set();
  for (const directory of paths.publishedRoots) {
    for (const filename of walkFiles(directory)) {
      const basename = path.basename(filename);
      if (basename.endsWith(".meta.json") || /\.tmp-|\.stage$/.test(filename)) continue;
      const key = path.resolve(filename).toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      let linked = false;
      const metaFile = filename + ".meta.json";
      if (assertRegularFile(metaFile)) {
        try {
          const meta = readJson(metaFile, "ARCHIVE_META_INVALID");
          linked = !!articleFromExplicit(meta);
        } catch (_) { linked = false; }
      }
      const source = sourceInfo(root, filename);
      reports.push(Object.assign(source, {
        kind: "archive",
        code: "LEGACY_UNLINKED",
        reason: "legacy_unlinked",
        metadata: linked ? "stable_only" : "none",
        version: MIGRATION_VERSION,
        commit
      }));
    }
  }
}

function readExistingPublications(root, directory, reports, commit) {
  const found = new Map();
  const stat = lstat(directory);
  if (!stat) return found;
  if (stat.isSymbolicLink() || !stat.isDirectory()) throw migrationError("MIGRATION_PUBLICATION_STORAGE_INVALID");
  for (const filename of fs.readdirSync(directory).sort().map((name) => path.join(directory, name))) {
    const entry = lstat(filename);
    if (!entry) continue;
    if (entry.isSymbolicLink()) throw migrationError("MIGRATION_PUBLICATION_STORAGE_INVALID");
    if (!entry.isFile() || !/^publication-[a-f0-9]{64}\.json$/.test(path.basename(filename))) continue;
    let record;
    try { record = readJson(filename, "MIGRATION_PUBLICATION_RECORD_INVALID"); validatePublicationRecord(record); } catch (error) {
      reports.push(Object.assign(sourceInfo(root, filename), { kind: "publication", code: error.code || "MIGRATION_PUBLICATION_RECORD_INVALID", version: MIGRATION_VERSION, commit }));
      continue;
    }
    found.set(record.articleKey + "\0" + record.targetKey, record);
  }
  return found;
}

function safeSourceFiles(evidence) {
  const files = [{ source: evidence.source, bytes: evidence.bytes, sha256: evidence.sha256 }];
  if (evidence.sidecar) files.push({ source: evidence.sidecar.source, bytes: evidence.sidecar.bytes, sha256: evidence.sidecar.sha256 });
  if (evidence.batch) files.push({ source: evidence.batch.source, bytes: evidence.batch.bytes, sha256: evidence.batch.sha256 });
  return files;
}

function targetPath(root, publications, candidate) {
  const filename = path.join(publications, aggregateFilename(candidate.article.articleKey, candidate.target.targetKey));
  return normalizeRelative(root, filename);
}

function manifestEntry(root, publications, candidate, evidence, action) {
  const entry = {
    kind: evidence.kind || candidate.kind,
    action: action,
    source: evidence.source,
    target: targetPath(root, publications, candidate),
    publicationId: candidate.publicationId || null,
    articleKey: candidate.article.articleKey,
    targetKey: candidate.target.targetKey,
    status: candidate.status,
    bytes: evidence.bytes,
    sha256: evidence.sha256,
    sourceFiles: safeSourceFiles(evidence),
    version: candidate.version,
    commit: candidate.commit
  };
  if (candidate.batchId) entry.batchId = candidate.batchId;
  return entry;
}

function candidateResult(root, paths, candidate, existing) {
  const key = aggregateKey(candidate.article, candidate.target);
  const record = existing.get(key);
  candidate.publicationId = record ? record.publicationId : null;
  candidate.existing = !!record;
  candidate.commit = candidate.commit;
  return candidate;
}

function buildPlan(root, paths, commit) {
  const reports = [];
  const identitiesByPath = new Map();
  const batches = loadBatches(root, paths, reports, commit);
  const queueItems = scanQueues(root, paths, batches, reports, commit, identitiesByPath);
  const candidates = new Map();
  for (const item of queueItems) {
    item.commit = commit;
    const key = aggregateKey(item.article, item.target);
    const current = candidates.get(key);
    if (!current) candidates.set(key, item);
    else addEvidence(current, item.evidence[0], item.status, null);
  }
  scanOrders(root, paths, reports, commit, identitiesByPath, candidates);
  scanPublished(root, paths, reports, commit);
  const existing = readExistingPublications(root, paths.publications, reports, commit);
  const planned = Array.from(candidates.values()).sort((left, right) => aggregateKey(left.article, left.target).localeCompare(aggregateKey(right.article, right.target)));
  const entries = [];
  for (const candidate of planned) {
    candidateResult(root, paths, candidate, existing);
    for (const evidence of candidate.evidence) {
      entries.push(manifestEntry(root, paths.publications, candidate, evidence, candidate.existing ? "already_exists" : "would_create"));
    }
  }
  const summary = {
    planned: planned.length,
    existing: planned.filter((item) => item.existing).length,
    queued: planned.filter((item) => item.status === "queued").length,
    submitted: planned.filter((item) => item.status === "submitted").length,
    published: planned.filter((item) => item.status === "published").length,
    failed: planned.filter((item) => item.status === "failed").length,
    legacyUnlinked: reports.filter((item) => item.reason === "legacy_unlinked" || item.code === "LEGACY_UNLINKED").length,
    reports: reports.length
  };
  return { root, paths, commit, candidates: planned, entries, reports, summary, batches };
}

function manifestSafe(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw migrationError("MIGRATION_MANIFEST_CORRUPT");
  if (value.version !== MIGRATION_VERSION || value.status !== "complete" || !Array.isArray(value.entries) || !Array.isArray(value.reports)) throw migrationError("MIGRATION_MANIFEST_CORRUPT");
  return value;
}

function existingManifest(filename) {
  const stat = lstat(filename);
  if (!stat) return null;
  if (stat.isSymbolicLink() || !stat.isFile()) throw migrationError("MIGRATION_MANIFEST_CORRUPT");
  try { return manifestSafe(readJson(filename, "MIGRATION_MANIFEST_CORRUPT")); } catch (error) {
    if (error.code === "MIGRATION_MANIFEST_CORRUPT") throw error;
    throw migrationError("MIGRATION_MANIFEST_CORRUPT");
  }
}

function resultFor(plan, mode, extra) {
  return Object.assign({
    mode,
    completed: mode === "execute",
    writes: 0,
    idempotent: false,
    manifestPath: plan.paths.manifest,
    commit: plan.commit,
    version: MIGRATION_VERSION,
    summary: clone(plan.summary),
    entries: clone(plan.entries),
    reports: clone(plan.reports)
  }, extra || {});
}

function writeManifest(filename, manifest) {
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  const serialized = JSON.stringify(manifest, null, 2) + "\n";
  try {
    fs.writeFileSync(filename, serialized, { encoding: "utf8", flag: "wx" });
  } catch (error) {
    if (error && error.code === "EEXIST") return manifestSafe(readJson(filename, "MIGRATION_MANIFEST_CORRUPT"));
    throw migrationError("MIGRATION_MANIFEST_WRITE_FAILED");
  }
  try {
    if (fs.readFileSync(filename, "utf8") !== serialized) throw migrationError("MIGRATION_MANIFEST_WRITE_FAILED");
  } catch (error) {
    if (error && error.code && error.code.startsWith("MIGRATION_")) throw error;
    throw migrationError("MIGRATION_MANIFEST_WRITE_FAILED");
  }
  return manifest;
}

function createPublicationLedgerMigration(options) {
  const values = options || {};
  const workspaceRoot = path.resolve(values.workspaceRoot || values.root || process.env.AUTO_PUBLISH_WORKSPACE || process.cwd());
  if (!path.isAbsolute(workspaceRoot) || workspaceRoot.includes("\0")) throw migrationError("MIGRATION_WORKSPACE_REQUIRED");
  const paths = defaultPaths(workspaceRoot, values);
  const commit = resolveCommit(workspaceRoot, values.commit);

  function plan() {
    return buildPlan(workspaceRoot, paths, commit);
  }

  function dryRun() {
    return resultFor(plan(), "dry-run", { completed: false, writes: 0 });
  }

  function execute(input) {
    const confirmation = input || {};
    const token = firstValue(confirmation.confirmationToken, confirmation.confirm, confirmation.token);
    if (token !== MIGRATION_CONFIRMATION_TOKEN) throw migrationError("MIGRATION_CONFIRMATION_REQUIRED");
    const already = existingManifest(paths.manifest);
    if (already) return {
      mode: "execute",
      completed: true,
      writes: 0,
      idempotent: true,
      manifestPath: paths.manifest,
      commit: already.commit,
      version: already.version,
      summary: already.summary,
      entries: already.entries,
      reports: already.reports
    };
    const currentPlan = plan();
    const ledger = createPublicationLedger({ workspaceRoot, paths: { publications: paths.publications } });
    let writes = 0;
    const entries = [];
    for (const candidate of currentPlan.candidates) {
      let record = ledger.store.findByAggregate(candidate.article.articleKey, candidate.target.targetKey);
      let action = "already_exists";
      if (!record) {
        try {
          record = { record: ledger.reserve(candidate.article, candidate.target).publicationId };
          const publicationId = record.record;
          const reserved = ledger.get(publicationId);
          if (candidate.status !== "queued") {
            ledger.markSubmitting(publicationId, reserved.attempts.at(-1).attemptId);
            ledger.recordOutcome(publicationId, reserved.attempts.at(-1).attemptId, {
              status: candidate.status,
              remoteId: candidate.remoteId,
              remoteUrl: candidate.remoteUrl,
              errorCode: candidate.errorCode
            });
          }
          record = { record: ledger.get(publicationId) };
          writes += 1;
          action = "created";
        } catch (error) {
          if (error && error.code === "PUBLICATION_DUPLICATE") {
            record = ledger.store.findByAggregate(candidate.article.articleKey, candidate.target.targetKey);
            if (!record) throw migrationError("MIGRATION_LEDGER_WRITE_FAILED");
          } else if (error && error.code && error.code.startsWith("PUBLICATION_")) {
            throw migrationError("MIGRATION_LEDGER_WRITE_FAILED");
          } else {
            throw migrationError("MIGRATION_LEDGER_WRITE_FAILED");
          }
        }
      }
      candidate.publicationId = record.record.publicationId;
      for (const evidence of candidate.evidence) entries.push(manifestEntry(workspaceRoot, paths.publications, candidate, evidence, action));
    }
    const manifest = {
      version: MIGRATION_VERSION,
      tool: "publication-ledger-v1",
      status: "complete",
      commit,
      createdAt: new Date().toISOString(),
      summary: currentPlan.summary,
      entries,
      reports: currentPlan.reports
    };
    const written = writeManifest(paths.manifest, manifest);
    return resultFor(currentPlan, "execute", {
      completed: true,
      writes,
      idempotent: writes === 0,
      manifestPath: paths.manifest,
      entries: written.entries,
      reports: written.reports,
      summary: written.summary
    });
  }

  return { plan, dryRun, execute, paths, commit };
}

function parseArguments(argv) {
  const args = Array.isArray(argv) ? argv.slice() : [];
  const options = { mode: "dry-run" };
  const valueFlags = new Map([
    ["--workspace", "workspaceRoot"], ["--root", "workspaceRoot"], ["--confirm", "confirmationToken"], ["--token", "confirmationToken"],
    ["--queue", "queueRoot"], ["--batch", "batchRoot"], ["--orders", "ordersPath"], ["--published", "publishedRoot"], ["--publications", "publications"], ["--manifest", "manifest"], ["--commit", "commit"]
  ]);
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--execute") { options.mode = "execute"; continue; }
    if (arg === "--dry-run") { if (options.mode === "execute") throw migrationError("MIGRATION_ARGUMENTS_INVALID"); options.mode = "dry-run"; continue; }
    const key = valueFlags.get(arg);
    if (!key || index + 1 >= args.length || String(args[index + 1]).startsWith("--")) throw migrationError("MIGRATION_ARGUMENTS_INVALID");
    options[key] = args[++index];
  }
  if (options.queueRoot) options.queueRoots = [options.queueRoot];
  if (options.batchRoot) options.batchRoots = [options.batchRoot];
  if (options.publishedRoot) options.publishedRoots = [options.publishedRoot];
  return options;
}

function main(argv) {
  const options = parseArguments(argv);
  const migrator = createPublicationLedgerMigration(options);
  if (options.mode === "execute") return migrator.execute({ confirmationToken: options.confirmationToken });
  return migrator.dryRun();
}

if (require.main === module) {
  try {
    process.stdout.write(JSON.stringify(main(process.argv.slice(2))) + "\n");
  } catch (error) {
    process.stderr.write((error && error.code) || "MIGRATION_FAILED");
    process.stderr.write("\n");
    process.exitCode = 1;
  }
}

module.exports = {
  MANIFEST_NAME,
  MIGRATION_CONFIRMATION_TOKEN,
  MIGRATION_VERSION,
  createPublicationLedgerMigration,
  main,
  parseArguments
};
