const { log } = require("./logger");
const { sleep, copyToFailed, archivePublishedArticle } = require("./files");
const { isStopRequested } = require("./stop-signal");

var STATUSES = {
  PENDING: "pending",
  RUNNING: "running",
  SUCCEEDED: "succeeded",
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
  if (result === true) return STATUSES.SUCCEEDED;
  if (result === "submitted") return STATUSES.SUBMITTED;
  if (result === "pending") return STATUSES.NEEDS_LOGIN;
  return STATUSES.FAILED;
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
  job.status = STATUSES.RUNNING;
  log("[" + job.adapterId + "] Publish: " + article.title, "INFO");

  try {
    var adapterOptions = {};
    Object.keys(opts).forEach(function(key) {
      adapterOptions[key] = opts[key];
    });
    adapterOptions.autoSubmit = autoSubmit;

    var result = await job.adapter.publishArticle(article, adapterOptions);
    job.result = result;
    job.status = statusForResult(result);

    if (job.status === STATUSES.SUCCEEDED) {
      try {
        archivePublishedArticle(article);
        log("[" + job.adapterId + "] OK: " + article.title, "INFO");
      } catch (archiveError) {
        job.status = STATUSES.PUBLISHED_ARCHIVE_FAILED;
        job.error = archiveError.code || "PUBLISHED_ARCHIVE_FAILED";
        log("[" + job.adapterId + "] Remote publish succeeded but local archive failed [" + job.error + "]: " + article.title, "ERROR");
      }
    } else if (job.status === STATUSES.SUBMITTED) {
      log("[" + job.adapterId + "] Submitted (pending review): " + article.title, "INFO");
    } else if (job.status === STATUSES.NEEDS_LOGIN) {
      log("[" + job.adapterId + "] Waiting for manual completion: " + article.title, "INFO");
    } else {
      copyToFailed(article.sourceFile, article.filename);
      log("[" + job.adapterId + "] FAIL: " + article.title, "ERROR");
    }
  } catch (e) {
    job.error = e.message;

    if (isStopError(e) || shouldStop(opts)) {
      job.status = STATUSES.STOPPED;
      log("[" + job.adapterId + "] Stopped: " + article.title, "WARN");
      return job;
    }

    job.status = STATUSES.FAILED;
    copyToFailed(article.sourceFile, article.filename);
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

  return { ok: ok, fail: fail, needsLogin: needsLogin, jobs: jobs, stopped: stopped };
}

module.exports = { STATUSES, createJob, runJob, runJobs };
