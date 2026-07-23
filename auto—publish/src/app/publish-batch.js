const path = require("path");

const { DIRS } = require("../../scripts/config");
const { log } = require("../core/logger");
const { ensureAllDirs } = require("../core/files");
const { scanArticles } = require("../core/articles");
const { loadPlatforms } = require("../core/platforms");

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

  if (hasOwnScan) return adapter.scanArticles(adapter.scanDir);
  return scanArticles(adapter.scanDir);
}

function summarizeArticle(article) {
  return {
    title: article.title || article.fileBaseName || path.basename(article.filename || article.file || ""),
    filename: article.filename,
    sourceFile: article.sourceFile || article.file
  };
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
        queueCount: items.filter(function(item) { return item.platformId === adapter.id; })[0].count
      };
    }),
    queue: items,
    totalJobs: totalJobs,
    inputDir: DIRS.inputDir,
    logsFile: path.join(DIRS.logsDir, "publish.log")
  };
}

module.exports = { getPlatforms, createQueueSnapshot };
