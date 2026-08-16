const path = require("path");

const { DIRS } = require("../../scripts/config");
const { ensureAllDirs } = require("../core/files");
const { loadPlatforms } = require("../core/platforms");

function getPlatforms(options) {
  return loadPlatforms(options);
}

function scanOnlyForPlatform(platform) {
  return platform.legacyQueue.scan();
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
  const platforms = getPlatforms({ platformIds: opts.platformIds }).filter((platform) => platform.legacyQueue);
  const queue = platforms.map((platform) => {
    const articles = scanOnlyForPlatform(platform);
    return {
      platformId: platform.definition.id,
      scanDir: platform.definition.scanDir,
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
