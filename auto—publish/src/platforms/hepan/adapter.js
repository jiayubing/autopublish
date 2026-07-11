const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const { DIRS } = require("../../../scripts/config");
const { log } = require("../../core/logger");

function workspaceHepanConfig() {
  try { return JSON.parse(fs.readFileSync(path.join(DIRS.rootDir, "config", "hepan.json"), "utf8")); } catch (_) { return {}; }
}

var configuredHepan = workspaceHepanConfig();
var HEPAN = {
  cookiePath: process.env.HEPAN_COOKIE_PATH || configuredHepan.cookiePath || path.join(DIRS.rootDir, "config", "hepan-cookie.txt"),
  pythonPath: process.env.HEPAN_PYTHON || configuredHepan.pythonPath || "python"
};

function scriptPath() {
  return path.join(__dirname, "hepan_publish.py");
}

function imageDir() {
  return path.join(DIRS.inputDir, "hepan", "images");
}

function inputDir() {
  return path.join(DIRS.inputDir, "hepan");
}

function ensureSession() {
  if (!fs.existsSync(imageDir())) {
    fs.mkdirSync(imageDir(), { recursive: true });
  }
}

function parseJsonOutput(output) {
  var lines = String(output || "").split(/\r?\n/).map(function(line) {
    return line.trim();
  }).filter(Boolean);

  for (var i = lines.length - 1; i >= 0; i--) {
    try {
      return JSON.parse(lines[i]);
    } catch (e) {}
  }

  throw new Error("Hepan script did not return JSON");
}

function runHepan(args) {
  var result = spawnSync(HEPAN.pythonPath, [scriptPath()].concat(args), {
    cwd: DIRS.rootDir,
    encoding: "utf-8",
    timeout: 240000,
    env: Object.assign({}, process.env, {
      PYTHONIOENCODING: "utf-8"
    })
  });

  if (result.error) {
    throw result.error;
  }

  var payload = parseJsonOutput(result.stdout);
  if (result.status !== 0 && payload && !payload.error) {
    payload.error = result.stderr || "Hepan script failed";
  }
  return payload;
}

async function ensureLoggedIn() {
  if (!fs.existsSync(HEPAN.cookiePath)) {
    log("[hepan] Cookie file not found: " + HEPAN.cookiePath, "WARN");
    return;
  }

  var cookie = fs.readFileSync(HEPAN.cookiePath, "utf-8").trim();
  if (!cookie) {
    log("[hepan] Cookie file is empty", "WARN");
    return;
  }

  log("[hepan] Cookie file is ready", "INFO");
}

function closeSession() {}

function scanArticles() {
  var dir = inputDir();
  if (!fs.existsSync(dir)) {
    return [];
  }

  return fs.readdirSync(dir).filter(function(name) {
    if (name.indexOf("~$") === 0) {
      return false;
    }
    return name.toLowerCase().endsWith(".docx");
  }).map(function(name) {
    var ext = path.extname(name);
    return {
      file: path.join(dir, name),
      filename: name,
      fileBaseName: path.basename(name, ext).trim()
    };
  });
}

function parseArticleFiles(articles) {
  return articles.map(function(article) {
    return {
      title: article.fileBaseName,
      body: "",
      sourceFile: article.file,
      filename: article.filename,
      normalizedFilename: article.filename
    };
  });
}

async function publishArticle(article) {
  log("[hepan] Publishing via HTTP: " + article.filename, "INFO");
  var payload = runHepan([
    "--article", article.sourceFile,
    "--image-dir", imageDir(),
    "--cookie-path", HEPAN.cookiePath
  ]);

  if (payload.needsLogin) {
    log("[hepan] Cookie needs update: " + payload.error, "WARN");
    return "pending";
  }

  if (!payload.ok) {
    throw new Error(payload.error || "Hepan publish failed");
  }

  article.title = payload.title || article.title;
  article.publishUrl = payload.url;
  log("[hepan] Published: " + payload.url, "INFO");
  return true;
}

module.exports = {
  id: "hepan",
  scanDir: "hepan",
  ensureSession: ensureSession,
  ensureLoggedIn: ensureLoggedIn,
  publishArticle: publishArticle,
  closeSession: closeSession,
  scanArticles: scanArticles,
  parseArticleFiles: parseArticleFiles
};
