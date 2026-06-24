const path = require("path");

const { DIRS } = require("../../scripts/config");
const { log } = require("../core/logger");
const { ensureAllDirs } = require("../core/files");
const { scanArticles, parseArticleFiles } = require("../core/articles");
const { createJob, runJobs } = require("../core/jobs");
const { loadPlatforms } = require("../core/platforms");

function getModeName(autoSubmit) {
  if (autoSubmit !== false) return "auto mode";
  return "manual confirmation mode";
}

function getPlatforms(options) {
  return loadPlatforms(options);
}

function scanOnlyForPlatform(adapter) {
  var hasOwnScan = typeof adapter.scanArticles === "function";
  var hasOwnParse = typeof adapter.parseArticleFiles === "function";

  if (hasOwnScan !== hasOwnParse) {
    log("[" + adapter.id + "] adapter contract error: scanArticles and parseArticleFiles must be provided together; skipping platform", "ERROR");
    return [];
  }

  if (hasOwnScan) {
    return adapter.scanArticles(adapter.scanDir);
  }

  return scanArticles(adapter.scanDir);
}

function summarizeArticle(article) {
  return {
    title: article.title || article.fileBaseName || path.basename(article.filename || article.file || ""),
    filename: article.filename,
    sourceFile: article.sourceFile || article.file
  };
}

function scanAndParseForPlatform(adapter, limit) {
  var hasOwnScan = typeof adapter.scanArticles === "function";
  var hasOwnParse = typeof adapter.parseArticleFiles === "function";

  if (hasOwnScan !== hasOwnParse) {
    log("[" + adapter.id + "] adapter contract error: scanArticles and parseArticleFiles must be provided together; skipping platform", "ERROR");
    return [];
  }

  if (hasOwnScan) {
    var scanned = applyArticleLimit(adapter.scanArticles(adapter.scanDir), limit);
    if (!scanned.length) {
      return [];
    }
    log("[" + adapter.id + "] Found " + scanned.length + " article(s)", "INFO");
    return adapter.parseArticleFiles(scanned);
  }

  var sharedScanned = applyArticleLimit(scanArticles(adapter.scanDir), limit);
  if (!sharedScanned.length) {
    return [];
  }
  log("[" + adapter.id + "] Found " + sharedScanned.length + " article(s)", "INFO");
  return parseArticleFiles(sharedScanned);
}

function normalizePositiveInt(value) {
  var number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    return null;
  }
  return Math.floor(number);
}

function remainingSlots(totalLimit, currentCount) {
  if (totalLimit === null) {
    return null;
  }
  return Math.max(totalLimit - currentCount, 0);
}

function applyArticleLimit(articles, limit) {
  if (limit === null) {
    return articles;
  }
  return articles.slice(0, limit);
}

function buildJobsForPlatform(adapter, parsed) {
  var jobs = [];
  for (var i = 0; i < parsed.length; i++) {
    jobs.push(createJob(parsed[i], adapter));
  }
  return jobs;
}

function buildBatchPlan(options) {
  var opts = options || {};
  var totalLimit = normalizePositiveInt(opts.maxJobs);
  var perPlatformLimit = normalizePositiveInt(opts.limitPerPlatform);

  ensureAllDirs();

  var platforms = getPlatforms({ platformIds: opts.platformIds });
  var jobs = [];
  var items = [];
  var activeAdapters = [];
  var seen = {};

  for (var i = 0; i < platforms.length; i++) {
    var adapter = platforms[i];
    var platformLimit = perPlatformLimit;
    var totalRemaining = remainingSlots(totalLimit, jobs.length);

    if (totalRemaining === 0) {
      items.push({
        platformId: adapter.id,
        scanDir: adapter.scanDir,
        count: 0,
        articles: []
      });
      continue;
    }

    if (totalRemaining !== null) {
      platformLimit = platformLimit === null ? totalRemaining : Math.min(platformLimit, totalRemaining);
    }

    var parsed = scanAndParseForPlatform(adapter, platformLimit);
    items.push({
      platformId: adapter.id,
      scanDir: adapter.scanDir,
      count: parsed.length,
      articles: parsed.map(function(article) {
        return {
          title: article.title,
          filename: article.filename,
          sourceFile: article.sourceFile
        };
      })
    });

    if (parsed.length === 0) {
      continue;
    }

    var adapterJobs = buildJobsForPlatform(adapter, parsed);
    for (var j = 0; j < adapterJobs.length; j++) {
      jobs.push(adapterJobs[j]);
      if (!seen[adapter.id]) {
        seen[adapter.id] = true;
        activeAdapters.push(adapter);
      }
    }
  }

  return {
    platforms: platforms,
    items: items,
    jobs: jobs,
    activeAdapters: activeAdapters
  };
}

async function ensurePlatformsReady(activeAdapters, options) {
  var opts = options || {};

  for (var i = 0; i < activeAdapters.length; i++) {
    console.log("Connecting to " + activeAdapters[i].id + " daemon...");
    activeAdapters[i].ensureSession();
    await activeAdapters[i].ensureLoggedIn({
      interactive: opts.interactive,
      timeoutMs: opts.timeoutMs
    });
  }
}

function closePlatforms(activeAdapters) {
  for (var i = 0; i < activeAdapters.length; i++) {
    try {
      activeAdapters[i].closeSession();
    } catch (e) {
      log("Failed to close " + activeAdapters[i].id + " session: " + e.message, "WARN");
    }
  }
}

function createQueueSnapshot(options) {
  var opts = options || {};
  ensureAllDirs();

  var platforms = getPlatforms({ platformIds: opts.platformIds });
  var items = [];
  var totalJobs = 0;

  for (var i = 0; i < platforms.length; i++) {
    var adapter = platforms[i];
    var scanned = scanOnlyForPlatform(adapter);
    totalJobs += scanned.length;
    items.push({
      platformId: adapter.id,
      scanDir: adapter.scanDir,
      count: scanned.length,
      articles: scanned.map(summarizeArticle)
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    platforms: platforms.map(function(adapter) {
      return {
        id: adapter.id,
        scanDir: adapter.scanDir,
        queueCount: items.filter(function(item) {
          return item.platformId === adapter.id;
        })[0].count
      };
    }),
    queue: items,
    totalJobs: totalJobs,
    inputDir: DIRS.inputDir,
    logsFile: path.join(DIRS.logsDir, "publish.log")
  };
}

async function runPublicationBatch(options) {
  var opts = options || {};
  var autoSubmit = opts.autoSubmit !== false;
  var plan = buildBatchPlan(opts);

  log("Auto publish batch started [" + getModeName(autoSubmit) + "]", "INFO");

  for (var i = 0; i < plan.items.length; i++) {
    if (plan.items[i].count === 0) {
      log("[" + plan.items[i].platformId + "] No articles ready to publish", "WARN");
    }
  }

  if (plan.jobs.length === 0) {
    log("No enabled platform has any pending articles", "WARN");
    return {
      ok: 0,
      fail: 0,
      needsLogin: 0,
      jobs: [],
      total: 0,
      stopped: false
    };
  }

  await ensurePlatformsReady(plan.activeAdapters, opts);

  var result;
  try {
    result = await runJobs(plan.jobs, {
      autoSubmit: autoSubmit,
      interactive: opts.interactive,
      shouldStop: opts.shouldStop,
      intervalMs: opts.intervalMs,
      timeoutMs: opts.timeoutMs
    });
  } finally {
    if (autoSubmit) {
      closePlatforms(plan.activeAdapters);
    }
  }

  console.log("");
  log("Finished: " + result.ok + " succeeded, " + result.needsLogin + " need manual follow-up, " + result.fail + " failed", "INFO");
  result.total = plan.jobs.length;
  return result;
}

module.exports = {
  getPlatforms,
  buildBatchPlan,
  createQueueSnapshot,
  runPublicationBatch
};
