const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const { DIRS } = require("../../../scripts/config");
const { log } = require("../../core/logger");

function resolveHepanRuntime(workspaceRoot, environment) {
  var root = workspaceRoot || DIRS.rootDir;
  var env = environment || process.env;
  var configured = {};
  try { configured = JSON.parse(fs.readFileSync(path.join(root, "config", "hepan.json"), "utf8")); } catch (_) {}
  return {
    cookiePath: configured.cookiePath || env.HEPAN_COOKIE_PATH || path.join(root, "config", "hepan-cookie.txt"),
    pythonPath: configured.pythonPath || env.HEPAN_PYTHON || "python"
  };
}

var batchRuntime = null;

function currentRuntime() {
  if (batchRuntime) return Object.assign({}, batchRuntime);
  var resolved = resolveHepanRuntime(DIRS.rootDir, process.env);
  return {
    cookiePath: resolved.cookiePath,
    pythonPath: resolved.pythonPath,
    categoryId: Number(process.env.HEPAN_CATEGORY_ID || 121),
    vendorDir: process.env.HEPAN_VENDOR_DIR || "",
    siteOrigin: "https://www.hepan.com"
  };
}

function setRuntimeConfig(runtime) {
  if (!runtime || typeof runtime !== "object") {
    batchRuntime = null;
    return;
  }
  batchRuntime = {
    cookiePath: runtime.cookiePath || "",
    pythonPath: runtime.pythonPath || "",
    categoryId: Number(runtime.categoryId || 121),
    vendorDir: runtime.vendorDir || "",
    siteOrigin: "https://www.hepan.com"
  };
}

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
  var runtime = currentRuntime();
  if (!runtime.pythonPath || !runtime.cookiePath) {
    var unavailable = new Error("Hepan publishing is not configured");
    unavailable.code = "HEPAN_CONFIG_NOT_SET";
    throw unavailable;
  }
  var result = spawnSync(runtime.pythonPath, [scriptPath()].concat(args), {
    cwd: DIRS.rootDir,
    encoding: "utf-8",
    timeout: 240000,
    env: Object.assign({}, process.env, {
      PYTHONIOENCODING: "utf-8",
      PYTHONPATH: runtime.vendorDir || process.env.PYTHONPATH || ""
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
  var runtime = currentRuntime();
  if (!runtime.pythonPath || !runtime.cookiePath || !fs.existsSync(runtime.cookiePath)) {
    log("[hepan] Cookie configuration is unavailable", "WARN");
    return;
  }

  var cookie = fs.readFileSync(runtime.cookiePath, "utf-8").trim();
  if (!cookie) {
    log("[hepan] Cookie configuration is empty", "WARN");
    return;
  }

  log("[hepan] Cookie configuration is ready", "INFO");
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
  var runtime = currentRuntime();
  log("[hepan] Publishing via HTTP: " + article.filename, "INFO");
  var payload = runHepan([
    "--article", article.sourceFile,
    "--image-dir", imageDir(),
    "--cookie-path", runtime.cookiePath,
    "--category-id", String(runtime.categoryId),
    ...(runtime.vendorDir ? ["--vendor-dir", runtime.vendorDir] : [])
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
  contentQueueImport: true,
  scanDir: "hepan",
  ensureSession: ensureSession,
  ensureLoggedIn: ensureLoggedIn,
  publishArticle: publishArticle,
  closeSession: closeSession,
  scanArticles: scanArticles,
  parseArticleFiles: parseArticleFiles,
  resolveHepanRuntime: resolveHepanRuntime,
  setRuntimeConfig: setRuntimeConfig,
  clearRuntimeConfig: function() { batchRuntime = null; }
};
