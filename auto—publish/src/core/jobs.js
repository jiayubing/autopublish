const { log } = require("./logger");
const { sleep, copyToFailed, archivePublishedArticle } = require("./files");
const { isStopRequested } = require("./stop-signal");
const { resolveArticleIdentity } = require("../publication/article-identity");
const { resolvePublicationTarget } = require("../publication/publication-targets");

var STATUSES = {
  PENDING: "pending",
  RUNNING: "running",
  SUCCEEDED: "succeeded",
  UNCERTAIN: "uncertain",
  SKIPPED: "skipped",
  PUBLISHED_ARCHIVE_FAILED: "published_archive_failed",
  SUBMITTED: "submitted",
  FAILED: "failed",
  NEEDS_LOGIN: "needs_login",
  STOPPED: "stopped"
};

var seq = 0;

function createJob(article, adapter) {
  seq += 1;
  return {
    id: "job-" + seq,
    adapterId: adapter.id,
    article: article,
    adapter: adapter,
    status: STATUSES.PENDING,
    result: null,
    error: null
  };
}

function statusForResult(result) {
  var outcome = normalizePublicationOutcome(result);
  if (outcome.status === "published") return STATUSES.SUCCEEDED;
  if (outcome.status === "submitted") return outcome.legacyStatus === "pending" ? STATUSES.NEEDS_LOGIN : STATUSES.SUBMITTED;
  if (outcome.status === "uncertain") return STATUSES.UNCERTAIN;
  return STATUSES.FAILED;
}

function safeOutcomeCode(value, fallback) {
  return typeof value === "string" && /^[A-Z0-9][A-Z0-9_.:-]{0,127}$/.test(value) ? value : fallback;
}

function isResultUnknownError(error) {
  if (!error || error.remoteCallStarted !== true) return false;
  var code = String(error.code || "");
  var message = String(error.message || "");
  return /TIMEOUT|TIMED_OUT|UNKNOWN|CRASH|CLOSED|DISCONNECT|ECONNRESET|NETWORK|BROWSER|PAGE/i.test(code + " " + message);
}

function normalizePublicationOutcome(result, error) {
  if (error) {
    var uncertain = isResultUnknownError(error);
    return {
      status: uncertain ? "uncertain" : "failed",
      errorCode: safeOutcomeCode(error.code, uncertain ? "REMOTE_RESULT_UNKNOWN" : "ADAPTER_FAILED")
    };
  }
  if (result && typeof result === "object" && ["published", "submitted", "uncertain", "failed"].indexOf(result.status) !== -1) {
    var structured = { status: result.status };
    if (result.remoteId !== undefined) structured.remoteId = String(result.remoteId);
    if (result.remoteUrl !== undefined) structured.remoteUrl = String(result.remoteUrl);
    if (result.errorCode !== undefined) structured.errorCode = safeOutcomeCode(result.errorCode, "REMOTE_RESULT_UNKNOWN");
    if (result.legacyStatus) structured.legacyStatus = result.legacyStatus;
    return structured;
  }
  if (result === true) return { status: "published" };
  if (result === "submitted") return { status: "submitted" };
  if (result === "pending") return { status: "submitted", legacyStatus: "pending", errorCode: "MANUAL_FOLLOW_UP" };
  return { status: "failed", errorCode: "REMOTE_REJECTED" };
}

function readLedgerSidecar(article) {
  var sourceFile = article && article.sourceFile;
  if (!sourceFile) return article && article.sidecar && article.sidecar.version === 2 ? article.sidecar : {};
  try {
    var fs = require("fs");
    var filename = sourceFile + ".submission.json";
    if (fs.existsSync(filename)) return JSON.parse(fs.readFileSync(filename, "utf8"));
  } catch (_) {}
  return article && article.sidecar && typeof article.sidecar === "object" ? article.sidecar : {};
}

function publicationInput(article, adapter) {
  var sidecar = readLedgerSidecar(article);
  var clientId = sidecar.clientId || article.clientId;
  var articleId = sidecar.generatedArticleId || sidecar.articleId || article.articleId;
  if (!clientId) return null;
  try {
    var identity = article.articleKey
      ? { articleKey: article.articleKey, clientId: clientId, articleId: articleId || null, contentHash: article.contentHash || null }
      : articleId
        ? resolveArticleIdentity({ clientId: clientId, articleId: articleId })
        : resolveArticleIdentity({ clientId: clientId, title: article.title || article.filename, content: article.body || "" });
    return { identity: identity, target: resolvePublicationTarget({ platformId: adapter.id }), sidecar: sidecar };
  } catch (_) {
    return null;
  }
}

function cancelQueuedReservation(ledger, reference) {
  if (!ledger || !reference || !reference.publicationId || !ledger.store || typeof ledger.store.update !== "function") return;
  try {
    ledger.store.update(reference.publicationId, function(record) {
      if (record.status !== "queued") return record;
      var now = new Date().toISOString();
      var attempt = record.attempts[record.attempts.length - 1];
      record.status = "cancelled";
      attempt.status = "cancelled";
      attempt.updatedAt = now;
      attempt.finishedAt = now;
      record.updatedAt = now;
      return record;
    });
  } catch (_) {}
}

function reservePublication(ledger, input) {
  if (!ledger || !input) return null;
  var sidecar = input.sidecar || {};
  if (sidecar.publicationId && sidecar.attemptId) {
    try {
      var current = ledger.get(sidecar.publicationId);
      if (current.articleKey === input.identity.articleKey && current.targetKey === input.target.targetKey && current.status === "queued" && current.attempts[current.attempts.length - 1].attemptId === sidecar.attemptId) {
        return { publicationId: current.publicationId, attemptId: sidecar.attemptId };
      }
    } catch (_) {}
  }
  try {
    var reserved = ledger.reserve(input.identity, input.target);
    return { publicationId: reserved.publicationId, attemptId: reserved.attemptId };
  } catch (error) {
    if (error && (error.code === "PUBLICATION_DUPLICATE" || error.code === "PUBLICATION_UNCERTAIN")) {
      error.publicationStatus = error.code === "PUBLICATION_UNCERTAIN" ? "uncertain" : "duplicate";
    }
    throw error;
  }
}

function shouldStop(options) {
  if (isStopRequested()) {
    return true;
  }
  return !!(options && typeof options.shouldStop === "function" && options.shouldStop());
}

function isStopError(error) {
  return !!(error && error.message === "Stop requested");
}

async function runJob(job, options) {
  var opts = options || {};
  var autoSubmit = opts.autoSubmit !== false;
  var article = job.article;
  var ledger = opts.publicationLedger || null;
  var publicationReference = null;
  var submitting = false;
  job.status = STATUSES.RUNNING;
  log("[" + job.adapterId + "] Publish: " + article.title, "INFO");

  try {
    if (ledger) {
      var publication = publicationInput(article, job.adapter);
      if (publication) {
        publicationReference = reservePublication(ledger, publication);
        job.publicationId = publicationReference.publicationId;
        job.attemptId = publicationReference.attemptId;
        job.articleKey = publication.identity.articleKey;
        job.targetKey = publication.target.targetKey;
      }
    }

    if (shouldStop(opts)) {
      cancelQueuedReservation(ledger, publicationReference);
      job.status = STATUSES.STOPPED;
      return job;
    }

    var adapterOptions = {};
    Object.keys(opts).forEach(function(key) {
      adapterOptions[key] = opts[key];
    });
    adapterOptions.autoSubmit = autoSubmit;

    if (ledger && publicationReference) {
      ledger.markSubmitting(publicationReference.publicationId, publicationReference.attemptId);
      submitting = true;
      adapterOptions.publication = {
        publicationId: publicationReference.publicationId,
        attemptId: publicationReference.attemptId,
        articleKey: job.articleKey,
        targetKey: job.targetKey
      };
    }

    var result;
    var thrown = null;
    try {
      result = await job.adapter.publishArticle(article, adapterOptions);
    } catch (error) {
      thrown = error;
      error.remoteCallStarted = true;
    }
    var outcome = normalizePublicationOutcome(result, thrown);
    job.result = result;
    job.outcome = outcome;
    job.publicationStatus = outcome.status;
    if (ledger && publicationReference) {
      try { ledger.recordOutcome(publicationReference.publicationId, publicationReference.attemptId, outcome); } catch (ledgerError) {
        job.ledgerError = safeOutcomeCode(ledgerError.code, "PUBLICATION_RECORD_FAILED");
      }
    }
    job.status = statusForResult(outcome);

    if (job.status === STATUSES.SUCCEEDED) {
      try {
        archivePublishedArticle(article, opts.paths);
        log("[" + job.adapterId + "] OK: " + article.title, "INFO");
      } catch (archiveError) {
        job.status = STATUSES.PUBLISHED_ARCHIVE_FAILED;
        job.error = archiveError.code || "PUBLISHED_ARCHIVE_FAILED";
        job.publicationStatus = "published";
        job.retryable = false;
        log("[" + job.adapterId + "] Remote publish succeeded but local archive failed [" + job.error + "]: " + article.title, "ERROR");
      }
    } else if (job.status === STATUSES.SUBMITTED) {
      log("[" + job.adapterId + "] Submitted (pending review): " + article.title, "INFO");
    } else if (job.status === STATUSES.UNCERTAIN) {
      log("[" + job.adapterId + "] Result needs confirmation: " + article.title, "WARN");
    } else if (job.status === STATUSES.NEEDS_LOGIN) {
      log("[" + job.adapterId + "] Waiting for manual completion: " + article.title, "INFO");
    } else if (job.status === STATUSES.NEEDS_LOGIN) {
      log("[" + job.adapterId + "] Waiting for manual completion: " + article.title, "INFO");
    } else {
      if (job.status === STATUSES.FAILED) copyToFailed(article.sourceFile, article.filename);
      log("[" + job.adapterId + "] FAIL: " + article.title, "ERROR");
    }
  } catch (e) {
    job.error = e.message;

    if (isStopError(e) || shouldStop(opts)) {
      if (submitting) {
        var uncertain = normalizePublicationOutcome(null, Object.assign(e, { remoteCallStarted: true }));
        job.outcome = uncertain;
        job.publicationStatus = "uncertain";
        job.status = STATUSES.UNCERTAIN;
        if (ledger && publicationReference) {
          try { ledger.recordOutcome(publicationReference.publicationId, publicationReference.attemptId, uncertain); } catch (_) {}
        }
        log("[" + job.adapterId + "] Stopped after remote call; result needs confirmation: " + article.title, "WARN");
      } else {
        cancelQueuedReservation(ledger, publicationReference);
        job.status = STATUSES.STOPPED;
        log("[" + job.adapterId + "] Stopped: " + article.title, "WARN");
      }
      return job;
    }

    job.status = STATUSES.FAILED;
    if (!submitting) copyToFailed(article.sourceFile, article.filename);
    log("[" + job.adapterId + "] Error: " + article.title + " - " + e.message, "ERROR");
  }

  return job;
}

async function runJobs(jobs, options) {
  var opts = options || {};
  var intervalMs = typeof opts.intervalMs === "number" && opts.intervalMs >= 0 ? opts.intervalMs : 3000;
  var ok = 0;
  var fail = 0;
  var needsLogin = 0;
  var uncertain = 0;
  var skipped = 0;
  var stopped = false;

  for (var i = 0; i < jobs.length; i++) {
    if (shouldStop(opts)) {
      stopped = true;
      log("Stop requested; ending the batch at a safe point", "WARN");
      break;
    }

    var job = jobs[i];
    console.log("");
    log("[" + (i + 1) + "/" + jobs.length + "] " + job.article.title + " -> " + job.adapterId, "INFO");

    await runJob(job, opts);

    if (job.status === STATUSES.SUCCEEDED) {
      ok++;
    } else if (job.status === STATUSES.SUBMITTED) {
      ok++;
    } else if (job.status === STATUSES.NEEDS_LOGIN) {
      needsLogin++;
    } else if (job.status === STATUSES.UNCERTAIN) {
      uncertain++;
    } else if (job.status === STATUSES.SKIPPED) {
      skipped++;
    } else if (job.status === STATUSES.STOPPED) {
      stopped = true;
      log("Stop requested; ending the batch at a safe point", "WARN");
      break;
    } else {
      fail++;
    }

    if (jobs.length > 1 && i < jobs.length - 1) {
      sleep(intervalMs);
    }
  }

  return { ok: ok, fail: fail, needsLogin: needsLogin, uncertain: uncertain, skipped: skipped, jobs: jobs, stopped: stopped };
}

module.exports = { STATUSES, createJob, normalizePublicationOutcome, statusForResult, runJob, runJobs };
