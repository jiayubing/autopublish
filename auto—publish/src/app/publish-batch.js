const path = require("path");

const { DIRS } = require("../../scripts/config");
const { ensureAllDirs } = require("../core/files");
const { scanArticles } = require("../core/articles");
const { loadPlatforms } = require("../core/platforms");

function getPlatforms(options) {
  return loadPlatforms(options);
}

function scanOnlyForPlatform(adapter) {
  const hasOwnScan = typeof adapter.scanArticles === "function";
  const hasOwnParse = typeof adapter.parseArticleFiles === "function";
  if (hasOwnScan !== hasOwnParse) return [];
  return hasOwnScan ? adapter.scanArticles(adapter.scanDir) : scanArticles(adapter.scanDir);
}

function summarizeArticle(article) {
  return {
    title: article.title || article.fileBaseName || path.basename(article.filename || article.file || ""),
    filename: article.filename,
    sourceFile: article.sourceFile || article.file,
  };
}

function createQueueSnapshot(options) {
  const opts = options || {};
  ensureAllDirs();
  const platforms = getPlatforms({ platformIds: opts.platformIds });
  const queue = platforms.map((adapter) => {
    const articles = scanOnlyForPlatform(adapter);
    return {
      platformId: adapter.id,
      scanDir: adapter.scanDir,
      count: articles.length,
      articles: articles.map(summarizeArticle),
    };
  });
  return {
    generatedAt: new Date().toISOString(),
    platforms: queue.map((item) => ({ id: item.platformId, scanDir: item.scanDir, queueCount: item.count })),
    queue,
    totalJobs: queue.reduce((total, item) => total + item.count, 0),
    inputDir: DIRS.inputDir,
  };
}

module.exports = { getPlatforms, createQueueSnapshot };
