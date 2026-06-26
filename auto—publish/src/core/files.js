const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const { DIRS, PW } = require("../../scripts/config");
const { log } = require("./logger");

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function ensureAllDirs() {
  Object.keys(DIRS).forEach(function(key) {
    ensureDir(DIRS[key]);
  });
  ensureDir(PW.home);
  ensureDir(path.dirname(PW.profileDir));
  ensureDir(path.dirname(PW.daemonDir));
}

function sleep(ms) {
  execSync("ping 127.0.0.1 -n " + (Math.ceil(ms / 1000) + 1) + " > nul", { timeout: ms + 2000 });
}

function quoteArg(value) {
  return "\"" + String(value).replace(/"/g, "\"\"") + "\"";
}

function copyToFailed(sourceFile, filename) {
  try {
    ensureDir(DIRS.failedDir);
    fs.copyFileSync(sourceFile, path.join(DIRS.failedDir, filename));
    var sidecar = sourceFile + ".meta.json";
    if (fs.existsSync(sidecar)) {
      fs.copyFileSync(sidecar, path.join(DIRS.failedDir, filename + ".meta.json"));
    }
  } catch (e) {}
}

function archivePublishedArticle(article) {
  var target = path.join(DIRS.publishedDir, article.normalizedFilename || article.filename);
  if (!fs.existsSync(article.sourceFile)) {
    log("源文件不存在，跳过移动: " + article.filename, "WARN");
    return;
  }

  var sidecar = article.sourceFile + ".meta.json";
  var hasSidecar = fs.existsSync(sidecar);
  var sidecarTarget = path.join(DIRS.publishedDir, path.basename(target) + ".meta.json");

  if (fs.existsSync(target)) {
    fs.unlinkSync(target);
  }
  fs.renameSync(article.sourceFile, target);

  if (hasSidecar) {
    if (fs.existsSync(sidecarTarget)) {
      fs.unlinkSync(sidecarTarget);
    }
    fs.renameSync(sidecar, sidecarTarget);
  }
  log("已移动到 published: " + path.basename(target), "INFO");
}

module.exports = { ensureDir, ensureAllDirs, sleep, quoteArg, copyToFailed, archivePublishedArticle };
