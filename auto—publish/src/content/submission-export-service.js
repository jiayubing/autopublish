const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const { createPublicationLedger } = require("../publication/publication-ledger");
const { evaluateArticleSubmissionEligibility } = require("./article-submission-eligibility");
const { resolveArticleIdentity } = require("../publication/article-identity");
const { resolvePublicationTarget } = require("../publication/publication-targets");

const TARGETS = ["media", "lieju", "toutiao", "hepan"];
const BLOCKING_PUBLICATION_STATUSES = ["submitting", "submitted", "published"];

function error(code, message) { const e = new Error(message); e.code = code; return e; }
function clone(value) { return value === undefined ? value : JSON.parse(JSON.stringify(value)); }
function safeFilename(title, id) {
  const base = String(title || "article").replace(/[<>:"/\\|?*\x00-\x1f]/g, "").replace(/\s+/g, "-").replace(/^[. -]+|[. -]+$/g, "").slice(0, 80) || "article";
  return base + "-" + String(id).replace(/[^a-zA-Z0-9_-]/g, "") + ".md";
}
function articleMarkdown(article) { return "# " + String(article.title || "") + "\n\n" + String(article.content || "").trim() + "\n"; }

function publicationContext(article, targetPlatform, mediaResourceId) {
  const identity = resolveArticleIdentity({
    clientId: article.clientId,
    articleId: article.id,
    title: article.title,
    content: article.content
  });
  let target = null;
  let targetError = null;
  try {
    target = mediaResourceId !== undefined && mediaResourceId !== null && String(mediaResourceId).trim() !== ""
      ? resolvePublicationTarget({ mediaResourceId: String(mediaResourceId) })
      : resolvePublicationTarget({ platformId: targetPlatform });
  } catch (caught) {
    targetError = caught;
    // Legacy/custom queue platforms predate the fixed publication target catalog.
    // They remain exportable, but cannot be represented in the publication ledger.
    if (!caught || [
      "PUBLICATION_PLATFORM_UNDECLARED",
      "PUBLICATION_PLATFORM_RESOURCE_REQUIRED",
      "PUBLICATION_TARGET_REQUIRED"
    ].indexOf(caught.code) === -1) throw caught;
  }
  return { identity, target, targetError, tracked: !!target, titleSnapshot: typeof article.title === "string" ? article.title.trim().slice(0, 200) : null };
}

function publicationRecordFor(ledger, context) {
  if (!context || !context.tracked || !ledger) return null;
  if (ledger.store && typeof ledger.store.findByAggregate === "function") {
    const found = ledger.store.findByAggregate(context.identity.articleKey, context.target.targetKey);
    return found && found.record ? clone(found.record) : null;
  }
  if (typeof ledger.list === "function") {
    return (ledger.list() || []).find(function(record) {
      return record.articleKey === context.identity.articleKey && record.targetKey === context.target.targetKey;
    }) || null;
  }
  return null;
}

function latestAttempt(record) {
  return record && Array.isArray(record.attempts) && record.attempts.length ? record.attempts[record.attempts.length - 1] : null;
}

function publicationFields(context, record, reservation) {
  if (!context || !context.tracked) return {};
  const source = reservation || record || {};
  const attempt = latestAttempt(source);
  return {
    publicationId: source.publicationId || null,
    attemptId: source.attemptId || (attempt && attempt.attemptId) || null,
    articleKey: context.identity.articleKey,
    targetKey: context.target.targetKey,
    publicationStatus: source.status || null
  };
}

function sidecarMatchesArticle(sidecar, article, contentHash, targetPlatform) {
  if (!sidecar || sidecar.contentHash !== contentHash || sidecar.generatedArticleId !== article.id || sidecar.clientId !== article.clientId) return false;
  return sidecar.targetPlatformId === targetPlatform || sidecar.targetPlatform === targetPlatform;
}

function sidecarMatchesPublication(sidecar, context, record) {
  if (!sidecar || !record || sidecar.version !== 2) return false;
  const attempt = latestAttempt(record);
  return sidecar.publicationId === record.publicationId &&
    sidecar.attemptId === (attempt && attempt.attemptId) &&
    sidecar.articleKey === context.identity.articleKey &&
    sidecar.targetKey === context.target.targetKey;
}

function isPathInside(rootDir, candidate) {
  if (!rootDir || !candidate) return true;
  const root = path.resolve(rootDir);
  const resolved = path.resolve(candidate);
  const relative = path.relative(root, resolved);
  return relative !== ".." && !relative.startsWith(".." + path.sep) && !path.isAbsolute(relative);
}

function regularFileState(filename) {
  if (!filename || !fs.existsSync(filename)) return { exists: false, unsafe: false };
  try {
    const stat = fs.lstatSync(filename);
    return { exists: true, unsafe: !stat.isFile() || stat.isSymbolicLink() };
  } catch (_) {
    return { exists: true, unsafe: true };
  }
}

function itemIdentityMatches(item, batch, record) {
  if (!item || !batch || batch.id === undefined || batch.clientId === undefined) return false;
  if (item.articleId === undefined || item.targetPlatformId === undefined) return false;
  if (item.clientId && item.clientId !== batch.clientId) return false;
  if (record) {
    if (item.publicationId && record.publicationId && item.publicationId !== record.publicationId) return false;
    if (record.platformId && item.targetPlatformId && record.platformId !== item.targetPlatformId) return false;
  }
  return true;
}

function inspectSubmissionPair(item, batch, providedSidecar, options) {
  const value = item || {};
  const opts = options || {};
  const filePath = value.filePath;
  const sidecarPath = value.sidecarPath;
  const file = regularFileState(filePath);
  const sidecarFile = regularFileState(sidecarPath);
  const unsafePath = !isPathInside(opts.rootDir, filePath) || !isPathInside(opts.rootDir, sidecarPath) || file.unsafe || sidecarFile.unsafe;
  let sidecar = providedSidecar;
  if (sidecar === undefined && sidecarFile.exists && !sidecarFile.unsafe) {
    try { sidecar = JSON.parse(fs.readFileSync(sidecarPath, "utf8")); } catch (_) { sidecar = null; }
  }

  let contentMatched = null;
  if (file.exists && !file.unsafe && typeof value.contentHash === "string") {
    try { contentMatched = crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex") === value.contentHash; } catch (_) { contentMatched = false; }
  }

  const hasBatch = !!(batch && batch.id !== undefined);
  let identityMatched = false;
  if (!sidecarFile.exists && !file.exists) {
    identityMatched = itemIdentityMatches(value, batch, opts.record);
  } else if (sidecar && typeof sidecar === "object") {
    identityMatched = (!hasBatch || sidecar.submissionBatchId === batch.id) &&
      (!batch || !batch.clientId || sidecar.clientId === batch.clientId) &&
      (sidecar.generatedArticleId === value.articleId || sidecar.articleId === value.articleId) &&
      (sidecar.targetPlatformId === value.targetPlatformId || sidecar.targetPlatform === value.targetPlatformId) &&
      (value.contentHash === undefined || sidecar.contentHash === value.contentHash) &&
      (!value.publicationId || sidecar.publicationId === value.publicationId) &&
      (!value.attemptId || sidecar.attemptId === value.attemptId);
  }

  let pairState;
  if (unsafePath) pairState = "unsafe_path";
  else if (!file.exists && !sidecarFile.exists) pairState = "both_absent";
  else if (sidecarFile.exists && !identityMatched) pairState = "identity_conflict";
  else if (!file.exists) pairState = "main_absent";
  else if (!sidecarFile.exists) pairState = "sidecar_absent";
  else if (contentMatched !== true) pairState = "content_changed";
  else pairState = "intact";

  return {
    pairState,
    identityMatched,
    contentMatched,
    mainExists: file.exists,
    sidecarExists: sidecarFile.exists,
    unsafePath,
    sidecar: sidecar || null,
    identity: {
      batchId: hasBatch ? batch.id : null,
      clientId: batch && batch.clientId || value.clientId || null,
      articleId: value.articleId || null,
      targetPlatformId: value.targetPlatformId || null,
      publicationId: value.publicationId || null,
      attemptId: value.attemptId || null
    }
  };
}

function readSubmissionPair(filePath, sidecarPath, markdown, article, contentHash, targetPlatform, context, record, rootDir) {
  const inspected = inspectSubmissionPair({ filePath, sidecarPath, articleId: article.id, clientId: article.clientId, targetPlatformId: targetPlatform, contentHash }, null, undefined, { record, rootDir });
  const fileExists = inspected.mainExists;
  const sidecarExists = inspected.sidecarExists;
  const fileMatches = inspected.contentMatched === true && (function() { try { return fs.readFileSync(filePath, "utf8") === markdown; } catch (_) { return false; } }());
  const sidecar = inspected.sidecar;

  let queueStatus = "missing";
  let conflictCode = null;
  if (inspected.pairState === "unsafe_path") conflictCode = "QUEUE_UNSAFE_PATH";
  else if (fileExists || sidecarExists) {
    if (!fileExists) conflictCode = "QUEUE_SIDECAR_WITHOUT_FILE";
    else if (!fileMatches) conflictCode = "QUEUE_FILE_CONTENT_CONFLICT";
    else if (!sidecar || !sidecarMatchesArticle(sidecar, article, contentHash, targetPlatform)) conflictCode = "QUEUE_SIDECAR_CONFLICT";
    else queueStatus = "idempotent";
  }

  if (context && context.tracked) {
    const publicationSidecar = !!(sidecar && sidecar.publicationId);
    if (record) {
      if (record.status === "queued") {
        if (queueStatus === "missing") conflictCode = "PUBLICATION_RESERVATION_WITHOUT_QUEUE";
        else if (queueStatus === "idempotent" && !sidecarMatchesPublication(sidecar, context, record)) conflictCode = "QUEUE_PUBLICATION_MISMATCH";
      } else if (BLOCKING_PUBLICATION_STATUSES.indexOf(record.status) !== -1 || record.status === "uncertain") {
        // The ledger is authoritative even if the queue material was removed.
        queueStatus = "missing";
      }
    } else if (publicationSidecar && queueStatus === "idempotent") {
      conflictCode = "PUBLICATION_RECORD_MISSING";
    }
  }

  return {
    fileExists,
    sidecarExists,
    fileMatches,
    sidecar,
    queueStatus,
    conflictCode,
    pairState: inspected.pairState,
    identityMatched: inspected.identityMatched,
    contentMatched: inspected.contentMatched,
    record
  };
}

function classifyPublication(context, state) {
  if (!context || !context.tracked) return state.conflictCode ? "conflict" : (state.queueStatus === "idempotent" ? "idempotent" : "queueable");
  const record = state.record;
  if (state.conflictCode) {
    // A queued reservation without its queue file is intentionally visible as a
    // conflict so a second click cannot create a different reservation.
    if (!(record && BLOCKING_PUBLICATION_STATUSES.indexOf(record.status) !== -1 || record && record.status === "uncertain")) return "conflict";
  }
  if (record && record.status === "uncertain") return "blockedUncertain";
  if (record && BLOCKING_PUBLICATION_STATUSES.indexOf(record.status) !== -1) return "blockedPublished";
  if (record && record.status === "queued") return state.queueStatus === "idempotent" ? "idempotent" : "conflict";
  if (state.conflictCode && !(record && ["failed", "cancelled"].indexOf(record.status) !== -1)) return "conflict";
  return state.queueStatus === "idempotent" && !record ? "idempotent" : "queueable";
}

function inspectSubmission(options) {
  const state = readSubmissionPair(options.filePath, options.sidecarPath, options.markdown, options.article, options.contentHash, options.targetPlatform, options.context, options.record, options.rootDir);
  state.status = classifyPublication(options.context, state);
  return state;
}

function makeSidecar(fields) {
  if (!fields.context || !fields.context.tracked) {
    if (fields.submissionBatchId) {
      return {
        submissionBatchId: fields.submissionBatchId,
        generatedArticleId: fields.article.id,
        clientId: fields.article.clientId,
        targetPlatformId: fields.targetPlatform,
        contentHash: fields.contentHash,
        status: "queued",
        queuedAt: fields.queuedAt
      };
    }
    return {
      generatedArticleId: fields.article.id,
      clientId: fields.article.clientId,
      targetPlatform: fields.targetPlatform,
      filename: fields.filename,
      contentHash: fields.contentHash,
      exportedAt: fields.exportedAt,
      status: "queued"
    };
  }
  const sidecar = {
    version: 2,
    generatedArticleId: fields.article.id,
    clientId: fields.article.clientId,
    targetPlatform: fields.targetPlatform,
    filename: fields.filename,
    contentHash: fields.contentHash,
    status: "queued",
    queuedAt: fields.queuedAt
  };
  if (fields.submissionBatchId) sidecar.submissionBatchId = fields.submissionBatchId;
  if (fields.context && fields.context.tracked) {
    sidecar.publicationId = fields.reservation.publicationId;
    sidecar.attemptId = fields.reservation.attemptId;
    sidecar.articleKey = fields.context.identity.articleKey;
    sidecar.targetKey = fields.context.target.targetKey;
  }
  // Keep the old batch-sidecar spelling available to existing queue readers.
  if (fields.targetPlatformId) sidecar.targetPlatformId = fields.targetPlatformId;
  if (fields.exportedAt) sidecar.exportedAt = fields.exportedAt;
  return sidecar;
}

function cancelReservation(ledger, reservation, reasonCode) {
  if (!reservation || !reservation.publicationId || !reservation.attemptId) return null;
  if (typeof ledger.cancel === "function") return ledger.cancel(reservation.publicationId, reservation.attemptId, { reasonCode: reasonCode });
  if (typeof ledger.recordOutcome === "function") {
    try { return ledger.recordOutcome(reservation.publicationId, reservation.attemptId, { status: "cancelled", errorCode: reasonCode }); }
    catch (caught) {
      if (!caught || caught.code !== "PUBLICATION_OUTCOME_INVALID") throw caught;
    }
  }
  // Task 7 cannot change the already-tested publication module. Its store is
  // intentionally used only for this local, pre-remote cancellation fallback.
  if (!ledger.store || typeof ledger.store.update !== "function") throw error("PUBLICATION_CANCEL_UNAVAILABLE", "Publication reservation cannot be cancelled");
  return ledger.store.update(reservation.publicationId, function(record) {
    const attempt = latestAttempt(record);
    if (record.status !== "queued" || !attempt || attempt.attemptId !== reservation.attemptId) return record;
    const timestamp = new Date().toISOString();
    record.status = "cancelled";
    attempt.status = "cancelled";
    attempt.reasonCode = reasonCode;
    attempt.updatedAt = timestamp;
    attempt.finishedAt = timestamp;
    record.updatedAt = timestamp;
    return record;
  });
}

function blockedExportError(status) {
  if (status === "blockedUncertain") return error("CONTENT_EXPORT_BLOCKED_UNCERTAIN", "Publication result must be reconciled before retry");
  return error("CONTENT_EXPORT_BLOCKED_PUBLISHED", "Publication target is already submitted or published");
}

function createSubmissionExportService(options) {
  const opts = options || {};
  const root = path.resolve(opts.rootDir || process.env.AUTO_PUBLISH_WORKSPACE || process.cwd());
  const getArticle = opts.getArticle;
  const inputRoot = path.resolve(opts.paths && opts.paths.input || path.join(root, ".autopublish", "input"));
  const platforms = Array.isArray(opts.platforms) && opts.platforms.length ? opts.platforms : TARGETS.map(function(id) { return { id: id, scanDir: id, contentQueueImport: true }; });
  const platformMap = new Map(platforms.map(function(platform) { return [platform.id, platform]; }));
  const publicationLedger = opts.publicationLedger || createPublicationLedger({ workspaceRoot: root, paths: opts.paths });

  function prepare(input) {
    if (!input || input.confirmed !== true) throw error("CONTENT_EXPORT_CONFIRMATION_REQUIRED", "Manual confirmation is required");
    const platform = platformMap.get(input.targetPlatform);
    if (!platform || platform.contentQueueImport !== true) throw error("CONTENT_EXPORT_TARGET_INVALID", "Invalid export target");
    const article = getArticle(input.generatedArticleId);
    const eligibility = evaluateArticleSubmissionEligibility(article, { targetPlatform: platform });
    if (!eligibility.eligible) {
      const notReady = error("CONTENT_EXPORT_NOT_READY", eligibility.reasons.join("、"));
      notReady.reasonCodes = eligibility.reasonCodes.slice();
      throw notReady;
    }
    const markdown = articleMarkdown(article);
    const contentHash = crypto.createHash("sha256").update(markdown).digest("hex");
    const filename = safeFilename(article.title, article.id);
    const dir = path.join(inputRoot, platform.scanDir || platform.id);
    const filePath = path.join(dir, filename);
    const sidecarPath = filePath + ".submission.json";
    const context = publicationContext(article, input.targetPlatform, input.mediaResourceId);
    const record = publicationRecordFor(publicationLedger, context);
    const state = inspectSubmission({ filePath, sidecarPath, markdown, article, contentHash, targetPlatform: input.targetPlatform, context, record, rootDir: root });
    if (!context.tracked && state.fileExists && state.fileMatches) {
      // The legacy one-file export path historically rebuilt a missing or
      // malformed sidecar without treating the Markdown as a conflict.
      state.status = "idempotent";
      state.conflictCode = null;
    }
    return { article, markdown, contentHash, filename, dir, filePath, sidecarPath, context, record, state };
  }

  function previewExport(input) {
    const value = prepare(input);
    return Object.assign({
      filename: value.filename,
      targetPlatform: input.targetPlatform,
      contentHash: value.contentHash,
      markdown: value.markdown,
      status: value.state.status
    }, {
      pairState: value.state.pairState,
      identityMatched: value.state.identityMatched,
      contentMatched: value.state.contentMatched,
      mainExists: value.state.mainExists,
      sidecarExists: value.state.sidecarExists
    }, publicationFields(value.context, value.record));
  }

  function exportArticle(input) {
    const value = prepare(input);
    if (value.state.status === "conflict") throw error("CONTENT_EXPORT_CONFLICT", "Export file or publication reservation conflicts with the requested article");
    if (value.state.status === "blockedPublished" || value.state.status === "blockedUncertain") throw blockedExportError(value.state.status);

    let reservation = null;
    const shouldReserve = value.context.tracked && (!value.record || ["failed", "cancelled"].indexOf(value.record.status) !== -1);
    try {
      if (shouldReserve) reservation = publicationLedger.reserve(value.context.identity, value.context.target, { displayName: input.targetPlatform, titleSnapshot: value.context.titleSnapshot });
      const effectiveRecord = reservation || value.record;
      const sidecar = makeSidecar({
        article: value.article,
        targetPlatform: input.targetPlatform,
        targetPlatformId: input.targetPlatform,
        filename: value.filename,
        contentHash: value.contentHash,
        queuedAt: new Date().toISOString(),
        exportedAt: new Date().toISOString(),
        context: value.context,
        reservation: reservation || effectiveRecord
      });

      fs.mkdirSync(value.dir, { recursive: true });
      if (value.state.status === "idempotent" && !reservation) {
        // Already queued material remains untouched. A v1 sidecar is upgraded
        // only after a fresh ledger reservation has been made. Legacy export
        // still repairs a missing sidecar for compatibility.
        if (!value.context.tracked || !value.state.sidecar) writeAtomic(value.sidecarPath, JSON.stringify(sidecar, null, 2) + "\n");
      } else if (value.state.status === "idempotent") {
        writeAtomic(value.sidecarPath, JSON.stringify(sidecar, null, 2) + "\n");
      } else {
        writePairAtomic(value.filePath, value.markdown, value.sidecarPath, JSON.stringify(sidecar, null, 2) + "\n");
      }
      const recordFields = Object.assign({
        generatedArticleId: value.article.id,
        clientId: value.article.clientId,
        targetPlatform: input.targetPlatform,
        filename: value.filename,
        contentHash: value.contentHash,
        exportedAt: sidecar.exportedAt,
        status: "queued",
        filePath: value.filePath,
        sidecarPath: value.sidecarPath,
        idempotent: value.state.status === "idempotent"
      }, publicationFields(value.context, effectiveRecord || reservation));
      return recordFields;
    } catch (caught) {
      if (reservation) {
        try { cancelReservation(publicationLedger, reservation, "QUEUE_WRITE_FAILED"); } catch (_) {}
      }
      throw caught;
    }
  }

  return { previewExport, exportArticle };
}

function writeAtomic(filename, content) {
  const temporary = filename + ".tmp-" + process.pid + "-" + Date.now() + "-" + Math.random().toString(16).slice(2);
  try { fs.writeFileSync(temporary, content, "utf8"); fs.renameSync(temporary, filename); }
  finally { try { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); } catch (_) {} }
}

function writePairAtomic(filePath, markdown, sidecarPath, sidecar) {
  const token = process.pid + "-" + Date.now() + "-" + Math.random().toString(16).slice(2);
  const markdownTemp = filePath + ".tmp-" + token;
  const sidecarTemp = sidecarPath + ".tmp-" + token;
  let markdownMoved = false;
  let sidecarMoved = false;
  try {
    fs.writeFileSync(markdownTemp, markdown, "utf8");
    fs.writeFileSync(sidecarTemp, sidecar, "utf8");
    fs.renameSync(markdownTemp, filePath); markdownMoved = true;
    fs.renameSync(sidecarTemp, sidecarPath); sidecarMoved = true;
  } catch (caught) {
    try { if (sidecarMoved) fs.unlinkSync(sidecarPath); } catch (_) {}
    try { if (markdownMoved) fs.unlinkSync(filePath); } catch (_) {}
    throw caught;
  } finally {
    try { if (fs.existsSync(markdownTemp)) fs.unlinkSync(markdownTemp); } catch (_) {}
    try { if (fs.existsSync(sidecarTemp)) fs.unlinkSync(sidecarTemp); } catch (_) {}
  }
}

module.exports = {
  TARGETS,
  createSubmissionExportService,
  cancelReservation,
  inspectSubmissionPair,
  inspectSubmission,
  makeSidecar,
  publicationContext,
  publicationFields,
  publicationRecordFor,
  articleMarkdown,
  safeFilename,
  writeAtomic,
  writePairAtomic
};
