const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const mammoth = require("mammoth");

const { throwIfStopped } = require("../../src/core/operator-flow");
const { archivePublishedArticle } = require("../../src/core/files");
const { normalizePublicationOutcome } = require("../../src/core/jobs");
const { createPublicationLedger } = require("../../src/publication/publication-ledger");
const { resolveArticleIdentity } = require("../../src/publication/article-identity");
const { resolvePublicationTarget } = require("../../src/publication/publication-targets");
const { createSubmissionBatchStore } = require("../../src/content/submission-batch-store");

const ARTICLE_EXTENSIONS = [".md", ".txt", ".docx"];
const SAFE_ID = /^[^<>:"/\\|?*\x00-\x1f]+$/;

function firstTitle(raw, fallback) {
  var lines = String(raw || "").split(/\n/);
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].replace(/^#+\s*/, "").trim();
    if (line) return line;
  }
  return fallback;
}

function submissionInputError(code, message) {
  var error = new Error(message || "Invalid submission input");
  error.code = code || "SUBMISSION_INPUT_INVALID";
  return error;
}

function isSafeToken(value) {
  return typeof value === "string" && value.trim() !== "" && value.trim() !== "." && value.trim() !== ".." && SAFE_ID.test(value.trim());
}

function isTemporaryQueueArtifact(name) {
  return name === ".gitkeep" || name.indexOf("~$") === 0 ||
    /\.meta\.json$/i.test(name) || /\.submission\.json$/i.test(name) ||
    /(?:\.tmp-|\.stage(?:$|\.)|\.deleting-|\.autopublish-archive-)/i.test(name);
}

function isPrimaryArticle(name) {
  return ARTICLE_EXTENSIONS.indexOf(path.extname(name).toLowerCase()) !== -1;
}

function hashFile(filename) {
  return crypto.createHash("sha256").update(fs.readFileSync(filename)).digest("hex");
}

function readSubmissionMetadata(filePath, strict) {
  var sidecarPath = filePath + ".submission.json";
  if (!fs.existsSync(sidecarPath)) return { path: null, data: null, valid: true };

  var data;
  try {
    var stat = fs.lstatSync(sidecarPath);
    if (stat.isSymbolicLink() || !stat.isFile()) throw new Error("sidecar is not a file");
    data = JSON.parse(fs.readFileSync(sidecarPath, "utf8"));
  } catch (_) {
    return { path: sidecarPath, data: null, valid: false, reason: "SUBMISSION_SIDECAR_INVALID" };
  }

  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return { path: sidecarPath, data: data, valid: false, reason: "SUBMISSION_SIDECAR_INVALID" };
  }

  // Legacy sidecars remain readable. Once a version is declared, it must be v2
  // and the sidecar must prove that it belongs to the scanned main file.
  if (data.version === undefined) return { path: sidecarPath, data: data, valid: true, legacy: true };
  if (data.version !== 2 || typeof data.contentHash !== "string" || !/^[a-f0-9]{64}$/.test(data.contentHash)) {
    return { path: sidecarPath, data: data, valid: false, reason: "SUBMISSION_SIDECAR_VERSION_INVALID" };
  }
  if (data.filename !== undefined && data.filename !== path.basename(filePath)) {
    return { path: sidecarPath, data: data, valid: false, reason: "SUBMISSION_SIDECAR_FILE_MISMATCH" };
  }
  if (data.contentHash !== hashFile(filePath)) {
    return { path: sidecarPath, data: data, valid: false, reason: "SUBMISSION_SIDECAR_CONTENT_MISMATCH" };
  }
  if (!isSafeToken(data.clientId) ||
      (!isSafeToken(data.generatedArticleId) && !isSafeToken(data.articleId) && !isSafeToken(data.articleKey))) {
    return { path: sidecarPath, data: data, valid: false, reason: "SUBMISSION_SIDECAR_IDENTITY_INVALID" };
  }
  if ((data.publicationId !== undefined && !isSafeToken(data.publicationId)) ||
      (data.attemptId !== undefined && !isSafeToken(data.attemptId))) {
    return { path: sidecarPath, data: data, valid: false, reason: "SUBMISSION_SIDECAR_PUBLICATION_INVALID" };
  }
  if ((data.publicationId === undefined) !== (data.attemptId === undefined)) {
    return { path: sidecarPath, data: data, valid: false, reason: "SUBMISSION_SIDECAR_PUBLICATION_INVALID" };
  }
  return { path: sidecarPath, data: data, valid: true, version: 2 };
}

function resolvePlatformSubmissionFile(inputRoot, platforms, sourcePlatformId, filename, validateSidecar) {
  if (typeof sourcePlatformId !== "string" || !sourcePlatformId || typeof filename !== "string" ||
      !filename || filename.trim() !== filename || path.basename(filename) !== filename ||
      path.isAbsolute(filename) || filename.indexOf("/") !== -1 || filename.indexOf("\\") !== -1 ||
      !isPrimaryArticle(filename) || isTemporaryQueueArtifact(filename)) {
    throw submissionInputError();
  }
  var source = platforms.filter(function(platform) { return platform.id === sourcePlatformId; })[0];
  if (!source) throw submissionInputError();
  var inputDir = path.resolve(inputRoot, source.scanDir || source.id);
  var filePath = path.resolve(inputDir, filename);
  if (path.dirname(filePath) !== inputDir) throw submissionInputError();
  var stat;
  try { stat = fs.lstatSync(filePath); } catch (_) { throw submissionInputError(); }
  if (!stat.isFile() || stat.isSymbolicLink()) throw submissionInputError();
  if (validateSidecar) {
    var metadata = readSubmissionMetadata(filePath, true);
    if (!metadata.valid) throw submissionInputError(metadata.reason, "Submission sidecar is invalid");
  }
  return filePath;
}

function safeTask(task) {
  if (!task || typeof task !== "object") throw submissionInputError();
  if (!isSafeToken(task.sourcePlatformId) || !isSafeToken(task.filename) || !isSafeToken(task.targetPlatformId) ||
      path.basename(task.filename) !== task.filename || path.isAbsolute(task.filename) ||
      task.filename.indexOf("/") !== -1 || task.filename.indexOf("\\") !== -1) {
    throw submissionInputError();
  }
  return {
    sourcePlatformId: task.sourcePlatformId,
    filename: task.filename,
    targetPlatformId: task.targetPlatformId
  };
}

function isStopError(error) {
  return !!(error && error.message && error.message.indexOf("Stop requested") !== -1);
}

function safeOutcomeError(error, fallback) {
  var code = error && typeof error.code === "string" ? error.code : fallback;
  return /^[A-Z0-9][A-Z0-9_.:-]{0,127}$/.test(code || "") ? code : fallback;
}

function createPlatformWorkbenchService(opts) {
  var options = opts || {};
  var rootDir = options.rootDir || path.resolve(__dirname, "..", "..");
  var inputRoot = options.paths && typeof options.paths.input === "string"
    ? path.resolve(options.paths.input)
    : path.join(rootDir, "input");
  var platforms = options.platforms || [];
  var adapters = options.adapters || {};
  var ledger = options.publicationLedger || createPublicationLedger({ workspaceRoot: rootDir, paths: options.paths });
  var submissionBatchStore = options.submissionBatchStore || createSubmissionBatchStore({
    workspaceRoot: rootDir,
    directory: options.paths && options.paths.submissionRecords
  });

  function scanQueue() {
    return platforms.filter(function(platform) {
      return platform.id !== "media";
    }).map(function(platform) {
      var platformId = platform.id;
      var scanDir = platform.scanDir || platform.id;
      var inputDir = path.join(inputRoot, scanDir);
      var articles = [];
      if (fs.existsSync(inputDir)) {
        articles = fs.readdirSync(inputDir).filter(function(name) {
          if (isTemporaryQueueArtifact(name) || !isPrimaryArticle(name)) return false;
          var stat;
          try { stat = fs.lstatSync(path.join(inputDir, name)); } catch (_) { return false; }
          if (!stat.isFile() || stat.isSymbolicLink()) return false;
          var metadata = readSubmissionMetadata(path.join(inputDir, name), true);
          return metadata.valid;
        }).map(function(filename) {
          var filePath = path.join(inputDir, filename);
          var title = path.basename(filename, path.extname(filename));
          if (filename.endsWith(".txt") || filename.endsWith(".md")) {
            title = firstTitle(fs.readFileSync(filePath, "utf-8"), title);
          }
          return {
            filename: filename,
            filePath: filePath,
            file: filePath,
            sourceFile: filePath,
            fileBaseName: path.basename(filename, path.extname(filename)),
            title: title
          };
        });
      }
      return { platformId: platformId, scanDir: scanDir, articles: articles };
    });
  }

  function resolveSelectedFilePath(article, validateSidecar) {
    return resolvePlatformSubmissionFile(inputRoot, platforms, article.sourcePlatformId, article.filename, validateSidecar !== false);
  }

  function buildSelectedPlan(input) {
    var selectedArticles = input.selectedArticles || [];
    var targetPlatformIds = input.targetPlatformIds || [];
    if (!Array.isArray(selectedArticles) || !Array.isArray(targetPlatformIds) || targetPlatformIds.length === 0) throw submissionInputError();
    for (var targetIndex = 0; targetIndex < targetPlatformIds.length; targetIndex++) {
      if (typeof targetPlatformIds[targetIndex] !== "string" || !targetPlatformIds[targetIndex] ||
          (!platforms.some(function(platform) { return platform.id === targetPlatformIds[targetIndex] && platform.id !== "media"; }) && !adapters[targetPlatformIds[targetIndex]])) throw submissionInputError();
    }
    var tasks = [];
    for (var i = 0; i < selectedArticles.length; i++) {
      var selected = safeTask({ sourcePlatformId: selectedArticles[i].sourcePlatformId, filename: selectedArticles[i].filename, targetPlatformId: targetPlatformIds[0] });
      var filePath = resolveSelectedFilePath(selectedArticles[i]);
      for (var j = 0; j < targetPlatformIds.length; j++) {
        tasks.push({
          sourcePlatformId: selected.sourcePlatformId,
          filename: selected.filename,
          filePath: filePath,
          sourceArticle: Object.assign({}, selectedArticles[i], {
            file: filePath,
            filePath: filePath,
            sourceFile: filePath,
            fileBaseName: path.basename(selected.filename, path.extname(selected.filename))
          }),
          targetPlatformId: targetPlatformIds[j]
        });
      }
    }
    return { taskCount: tasks.length, tasks: tasks };
  }

  function toWorkerPlan(plan) {
    var tasks = plan && Array.isArray(plan.tasks) ? plan.tasks : [];
    return { taskCount: tasks.length, tasks: tasks.map(safeTask) };
  }

  function fallbackParseArticle(sourceArticle, filePath) {
    var article = {
      sourceFile: filePath,
      file: filePath,
      filePath: filePath,
      filename: sourceArticle.filename,
      title: sourceArticle.title || sourceArticle.fileBaseName || path.basename(filePath, path.extname(filePath))
    };
    var ext = path.extname(filePath).toLowerCase();
    if (ext === ".txt" || ext === ".md") {
      var raw = fs.readFileSync(filePath, "utf8");
      var lines = raw.split(/\n/);
      var first = 0;
      for (var i = 0; i < lines.length; i++) {
        if (lines[i].replace(/^#+\s*/, "").trim()) { first = i; break; }
      }
      article.title = article.title || lines[first].replace(/^#+\s*/, "").trim();
      article.body = lines.slice(first + 1).join("\n").trim();
    } else if (ext === ".docx") {
      return mammoth.extractRawText({ buffer: fs.readFileSync(filePath) }).then(function(result) {
        var fullText = String(result && result.value || "");
        var breakAt = fullText.indexOf("\n\n");
        article.body = breakAt > 0 ? fullText.substring(breakAt + 2).trim() : fullText;
        article.title = article.title || firstTitle(fullText, article.title);
        return article;
      });
    }
    return article;
  }

  function articleIdentity(article, metadata, filePath) {
    var sidecar = metadata.data || {};
    var clientId = sidecar.clientId || article.clientId || "legacy-platform-queue";
    var generatedArticleId = sidecar.generatedArticleId || sidecar.articleId || article.articleId;
    if (generatedArticleId) {
      return resolveArticleIdentity({ clientId: clientId, articleId: generatedArticleId });
    }
    var content = typeof article.body === "string" ? article.body : "";
    if (!content) {
      content = fs.readFileSync(filePath, "utf8");
    }
    return resolveArticleIdentity({
      clientId: clientId,
      title: article.title || path.basename(filePath, path.extname(filePath)),
      content: content
    });
  }

  function cancelQueuedReservation(reference) {
    if (!reference || !reference.publicationId || !ledger.store || typeof ledger.store.update !== "function") return;
    try {
      ledger.store.update(reference.publicationId, function(record) {
        if (record.status !== "queued") return record;
        var timestamp = new Date().toISOString();
        var attempt = record.attempts[record.attempts.length - 1];
        record.status = "cancelled";
        attempt.status = "cancelled";
        attempt.updatedAt = timestamp;
        attempt.finishedAt = timestamp;
        record.updatedAt = timestamp;
        return record;
      });
    } catch (_) {}
  }

  function reservePublication(identity, target, metadata) {
    var sidecar = metadata.data || {};
    var suppliedPublicationId = sidecar.publicationId;
    var suppliedAttemptId = sidecar.attemptId;
    if (suppliedPublicationId && suppliedAttemptId) {
      try {
        var existing = ledger.get(suppliedPublicationId);
        if (existing.articleKey === identity.articleKey && existing.targetKey === target.targetKey &&
            existing.status === "queued" && existing.attempts[existing.attempts.length - 1].attemptId === suppliedAttemptId) {
          return { publicationId: existing.publicationId, attemptId: suppliedAttemptId, status: existing.status, record: existing };
        }
      } catch (_) {}
    }

    try {
      var reserved = ledger.reserve(identity, target, { displayName: target.platformId });
      return { publicationId: reserved.publicationId, attemptId: reserved.attemptId, status: reserved.status, record: reserved };
    } catch (error) {
      if (error && (error.code === "PUBLICATION_DUPLICATE" || error.code === "PUBLICATION_UNCERTAIN")) {
        if (suppliedPublicationId && suppliedAttemptId) {
          try {
            var current = ledger.get(suppliedPublicationId);
            if (current.articleKey === identity.articleKey && current.targetKey === target.targetKey &&
                current.status === "queued" && current.attempts[current.attempts.length - 1].attemptId === suppliedAttemptId) {
              return { publicationId: current.publicationId, attemptId: suppliedAttemptId, status: current.status, record: current };
            }
          } catch (_) {}
        }
      }
      throw error;
    }
  }

  function updateSubmissionBatch(metadata, reference, targetPlatformId, outcome) {
    var sidecar = metadata.data || {};
    var batchId = sidecar.submissionBatchId;
    if (!batchId || !reference || !reference.publicationId || !reference.attemptId) return;
    try {
      submissionBatchStore.updateItem(batchId, { publicationId: reference.publicationId, attemptId: reference.attemptId, targetPlatformId: targetPlatformId }, {
        status: outcome.status,
        publicationStatus: outcome.status,
        errorCode: outcome.errorCode,
        remoteId: outcome.remoteId,
        remoteUrl: outcome.remoteUrl,
        reasonCode: outcome.reasonCode
      });
    } catch (error) {
      if (typeof options.onBatchSyncError === "function") options.onBatchSyncError({ code: error && error.code || "SUBMISSION_BATCH_SYNC_FAILED", batchId: batchId });
    }
  }

  async function submitSelectedPlanSerially(plan, submitOptions) {
    var opts = submitOptions || {};
    var tasks = plan && Array.isArray(plan.tasks) ? plan.tasks : [];
    var results = [];
    var sourceGroups = new Map();

    for (var i = 0; i < tasks.length; i++) {
      var task;
      try { task = safeTask(tasks[i]); } catch (error) {
        results.push({ task: {}, status: "failed", error: error.code || "SUBMISSION_INPUT_INVALID" });
        continue;
      }
      var adapter = adapters[task.targetPlatformId];
      var filePath;
      var metadata;
      var group = sourceGroups.get(task.sourcePlatformId + "\0" + task.filename);
      if (!group) {
        group = { filePath: null, article: null, results: [] };
        sourceGroups.set(task.sourcePlatformId + "\0" + task.filename, group);
      }

      try {
        filePath = resolveSelectedFilePath(task, true);
        metadata = readSubmissionMetadata(filePath, true);
        group.filePath = filePath;
        if (!adapter) throw submissionInputError("SUBMISSION_ADAPTER_MISSING", "Missing adapter: " + task.targetPlatformId);
        var sourceArticle = {
          file: filePath,
          filePath: filePath,
          sourceFile: filePath,
          filename: task.filename,
          fileBaseName: path.basename(task.filename, path.extname(task.filename))
        };
        var parsed = adapter.parseArticleFiles
          ? await adapter.parseArticleFiles([sourceArticle])
          : [await fallbackParseArticle(sourceArticle, filePath)];
        if (!parsed.length) throw new Error("Article parse returned no publishable article");
        var article = parsed[0];
        article.sourceFile = article.sourceFile || filePath;
        article.file = article.file || filePath;
        article.filePath = filePath;
        article.filename = article.filename || task.filename;
        article.normalizedFilename = article.normalizedFilename || task.filename;
        if (!article.title) article.title = firstTitle(fs.readFileSync(filePath, "utf8"), path.basename(task.filename, path.extname(task.filename)));
        group.article = article;

        var identity = articleIdentity(article, metadata, filePath);
        var target = resolvePublicationTarget({ platformId: task.targetPlatformId });
        var reference = reservePublication(identity, target, metadata);
        var result = { task: task, publicationId: reference.publicationId, attemptId: reference.attemptId, articleKey: identity.articleKey, targetKey: target.targetKey };

        try {
          throwIfStopped();
        } catch (stopError) {
          cancelQueuedReservation(reference);
          updateSubmissionBatch(metadata, reference, task.targetPlatformId, { status: "cancelled", errorCode: "STOP_REQUESTED" });
          result.status = "skipped";
          result.publicationStatus = "cancelled";
          result.error = "STOP_REQUESTED";
          results.push(result);
          group.results.push(result);
          break;
        }

        try {
          adapter.ensureSession();
          await adapter.ensureLoggedIn({ interactive: opts.interactive, timeoutMs: opts.timeoutMs });
          throwIfStopped();
        } catch (error) {
          if (isStopError(error)) {
            cancelQueuedReservation(reference);
            updateSubmissionBatch(metadata, reference, task.targetPlatformId, { status: "cancelled", errorCode: "STOP_REQUESTED" });
            result.status = "skipped";
            result.publicationStatus = "cancelled";
            result.error = "STOP_REQUESTED";
          } else {
            var loginOutcome = { status: "failed", errorCode: safeOutcomeError(error, "ADAPTER_PREPARE_FAILED") };
            try { ledger.markSubmitting(reference.publicationId, reference.attemptId); } catch (_) {}
            try { ledger.recordOutcome(reference.publicationId, reference.attemptId, loginOutcome); } catch (_) {}
            updateSubmissionBatch(metadata, reference, task.targetPlatformId, loginOutcome);
            result.status = "failed";
            result.publicationStatus = "failed";
            result.error = loginOutcome.errorCode;
          }
          results.push(result);
          group.results.push(result);
          if (adapter.closeSession && opts.closeAfterEach !== false) { try { adapter.closeSession(); } catch (_) {} }
          continue;
        }

        if (typeof opts.onTaskState === "function") opts.onTaskState({ phase: "before-remote", task: task });
        var submitting = ledger.markSubmitting(reference.publicationId, reference.attemptId);
        updateSubmissionBatch(metadata, reference, task.targetPlatformId, { status: "submitting" });
        if (typeof opts.onTaskState === "function") opts.onTaskState({ phase: "remote-started", task: task, publicationId: reference.publicationId, attemptId: reference.attemptId });
        var rawOutcome;
        try {
          rawOutcome = await adapter.publishArticle(article, {
            autoSubmit: opts.autoSubmit !== false,
            interactive: opts.interactive,
            timeoutMs: opts.timeoutMs,
            publication: { publicationId: reference.publicationId, attemptId: reference.attemptId, articleKey: identity.articleKey, targetKey: target.targetKey }
          });
        } catch (error) {
          error.remoteCallStarted = true;
          rawOutcome = error;
        }
        var outcome = normalizePublicationOutcome(rawOutcome, rawOutcome && rawOutcome.message ? rawOutcome : null);
        try { ledger.recordOutcome(reference.publicationId, reference.attemptId, outcome); } catch (ledgerError) {
          // A remote result is already known. Keep it in the task result and do
          // not manufacture a retryable failure when the local ledger is busy.
          result.ledgerError = safeOutcomeError(ledgerError, "PUBLICATION_RECORD_FAILED");
        }
        updateSubmissionBatch(metadata, reference, task.targetPlatformId, outcome);
        result.status = outcome.status === "published" ? "success" : outcome.status === "submitted" ? (outcome.legacyStatus === "pending" ? "pending" : "submitted") : outcome.status;
        result.publicationStatus = outcome.status;
        if (outcome.errorCode) result.error = outcome.errorCode;
        if (outcome.remoteId) result.remoteId = outcome.remoteId;
        if (outcome.remoteUrl) result.remoteUrl = outcome.remoteUrl;
        result.publicationId = submitting.publicationId;
        result.attemptId = submitting.attemptId;
        results.push(result);
        group.results.push(result);
      } catch (error) {
        var failed = { task: task, status: isStopError(error) ? "skipped" : "failed", error: safeOutcomeError(error, "PLATFORM_SUBMISSION_FAILED"), publicationStatus: isStopError(error) ? "cancelled" : "failed" };
        if (isStopError(error)) break;
        results.push(failed);
        group.results.push(failed);
      } finally {
        if (adapter && adapter.closeSession && opts.closeAfterEach !== false) {
          try { adapter.closeSession(); } catch (_) {}
        }
      }
    }

    sourceGroups.forEach(function(group) {
      if (!group.filePath || !group.article || !group.results.length) return;
      var allPublished = group.results.every(function(result) {
        return result.publicationStatus === "published" || result.publicationStatus === "cancelled" && result.status === "skipped";
      });
      if (!allPublished) return;
      try {
        archivePublishedArticle(group.article, options.paths || { published: path.join(rootDir, "published") });
      } catch (error) {
        group.results.forEach(function(result) {
          result.archiveError = safeOutcomeError(error, "PUBLISHED_ARCHIVE_FAILED");
        });
      }
    });

    var published = results.filter(function(item) { return item.publicationStatus === "published"; }).length;
    var submitted = results.filter(function(item) { return item.publicationStatus === "submitted"; }).length;
    var uncertain = results.filter(function(item) { return item.publicationStatus === "uncertain"; }).length;
    var skipped = results.filter(function(item) { return item.status === "skipped"; }).length;
    return {
      ok: published + submitted,
      fail: results.filter(function(item) { return item.publicationStatus === "failed"; }).length,
      pending: results.filter(function(item) { return item.status === "pending"; }).length,
      uncertain: uncertain,
      skipped: skipped,
      results: results
    };
  }

  return {
    scanQueue: scanQueue,
    buildSelectedPlan: buildSelectedPlan,
    toWorkerPlan: toWorkerPlan,
    submitSelectedPlanSerially: submitSelectedPlanSerially,
    resolveSubmissionFile: function(sourcePlatformId, filename) { return resolvePlatformSubmissionFile(inputRoot, platforms, sourcePlatformId, filename, false); },
    readSubmissionMetadata: function(sourcePlatformId, filename) {
      var filePath = resolvePlatformSubmissionFile(inputRoot, platforms, sourcePlatformId, filename, false);
      return readSubmissionMetadata(filePath, true);
    }
  };
}

module.exports = { createPlatformWorkbenchService, readSubmissionMetadata, resolvePlatformSubmissionFile };
