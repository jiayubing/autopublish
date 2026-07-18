const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");

const { DIRS } = require("../../../scripts/config");
const { log } = require("../../core/logger");
const { parseArticle, scanArticles: scanArticleSources } = require("./article-source");

function resolveHepanRuntime(workspaceRoot, environment) {
  const root = workspaceRoot || DIRS.rootDir;
  const env = environment || process.env;
  let configured = {};
  try { configured = JSON.parse(fs.readFileSync(path.join(root, "config", "hepan.json"), "utf8")); } catch (_) {}
  return {
    cookiePath: configured.cookiePath || env.HEPAN_COOKIE_PATH || path.join(root, "config", "hepan-cookie.txt"),
    pythonPath: configured.pythonPath || env.HEPAN_PYTHON || "python"
  };
}

let batchRuntime = null;

function currentRuntime() {
  if (batchRuntime) return Object.assign({}, batchRuntime);
  const resolved = resolveHepanRuntime(DIRS.rootDir, process.env);
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

function parseJsonOutput(output) {
  const lines = String(output || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try { return JSON.parse(lines[index]); } catch (_) {}
  }
  throw new Error("Hepan script did not return JSON");
}

function createHepanAdapter(options) {
  const values = options || {};
  const io = values.fs || fs;
  const pathApi = values.path || path;
  const cryptoApi = values.crypto || crypto;
  const inputDirectory = values.inputDir || pathApi.join(DIRS.inputDir, "hepan");
  const imagesDirectory = values.imageDir || pathApi.join(inputDirectory, "images");
  const payloadDirectory = values.tempDir || pathApi.join(DIRS.tmpDir, "hepan");
  const runtimeValue = values.runtime;
  const getRuntime = typeof values.getRuntime === "function"
    ? values.getRuntime
    : function() { return runtimeValue ? Object.assign({}, runtimeValue) : currentRuntime(); };
  const commandRunner = values.runCommand || function(command, args, commandOptions) {
    return spawnSync(command, args, Object.assign({ encoding: "utf8", timeout: 240000, windowsHide: true }, commandOptions || {}));
  };
  const script = values.scriptPath || scriptPath();

  function runtime() {
    const value = getRuntime() || {};
    return {
      cookiePath: value.cookiePath || "",
      pythonPath: value.pythonPath || "",
      categoryId: Number(value.categoryId || 121),
      vendorDir: value.vendorDir || "",
      siteOrigin: "https://www.hepan.com"
    };
  }

  function ensureSession() {
    if (!io.existsSync(imagesDirectory)) io.mkdirSync(imagesDirectory, { recursive: true });
  }

  function runHepan(args) {
    const config = runtime();
    if (!config.pythonPath || !config.cookiePath) {
      const error = new Error("Hepan publishing is not configured");
      error.code = "HEPAN_CONFIG_NOT_SET";
      throw error;
    }
    const result = commandRunner(config.pythonPath, [script].concat(args), {
      cwd: DIRS.rootDir,
      encoding: "utf8",
      timeout: 240000,
      env: Object.assign({}, process.env, {
        PYTHONIOENCODING: "utf-8",
        PYTHONPATH: config.vendorDir || process.env.PYTHONPATH || ""
      })
    });
    if (result && result.error) throw result.error;
    const payload = parseJsonOutput(result && result.stdout);
    if (result && result.status !== 0 && payload && !payload.error) payload.error = "Hepan script failed";
    return payload;
  }

  function createTemporaryPayload(article) {
    const existed = io.existsSync(payloadDirectory);
    if (!existed) io.mkdirSync(payloadDirectory, { recursive: true });
    const name = ".hepan-payload-" + cryptoApi.randomUUID() + ".json";
    const filename = pathApi.join(payloadDirectory, name);
    try {
      io.writeFileSync(filename, JSON.stringify({
        title: article.title,
        contentHtml: article.contentHtml,
        sourceStem: article.sourceStem
      }), { encoding: "utf8", mode: 0o600 });
    } catch (error) {
      try { if (io.existsSync(filename)) io.unlinkSync(filename); } catch (_) {}
      if (!existed) {
        try { if (io.existsSync(payloadDirectory) && io.readdirSync(payloadDirectory).length === 0) io.rmdirSync(payloadDirectory); } catch (_) {}
      }
      throw error;
    }
    return {
      filename,
      cleanup: function() {
        try { if (io.existsSync(filename)) io.unlinkSync(filename); } catch (_) {}
        if (!existed) {
          try { if (io.existsSync(payloadDirectory) && io.readdirSync(payloadDirectory).length === 0) io.rmdirSync(payloadDirectory); } catch (_) {}
        }
      }
    };
  }

  async function ensureLoggedIn() {
    const config = runtime();
    if (!config.pythonPath || !config.cookiePath || !io.existsSync(config.cookiePath)) {
      log("[hepan] Cookie configuration is unavailable", "WARN");
      return;
    }
    const cookie = io.readFileSync(config.cookiePath, "utf8").trim();
    if (!cookie) {
      log("[hepan] Cookie configuration is empty", "WARN");
      return;
    }
    log("[hepan] Cookie configuration is ready", "INFO");
  }

  async function validatePayload(article) {
    const config = runtime();
    if (!config.pythonPath) return { ok: false, errorCode: "HEPAN_CONFIG_NOT_SET" };
    const sourceFile = article && (article.sourceFile || article.file || article.filePath);
    let temporaryPayload = null;
    try {
      const parsed = article && article.contentHtml ? article : parseArticle(sourceFile, { fs: io, path: pathApi });
      temporaryPayload = createTemporaryPayload(parsed);
      const result = commandRunner(config.pythonPath, [script, "--validate-payload", temporaryPayload.filename], {
        cwd: DIRS.rootDir,
        encoding: "utf8",
        timeout: 120000,
        env: Object.assign({}, process.env, {
          PYTHONIOENCODING: "utf-8",
          PYTHONPATH: config.vendorDir || process.env.PYTHONPATH || ""
        })
      });
      if (result && result.error) throw result.error;
      let payload;
      try { payload = parseJsonOutput(result && result.stdout); } catch (_) { payload = null; }
      const validLengths = payload && Number.isInteger(payload.titleLength) && Number.isInteger(payload.contentHtmlLength);
      if (!payload || (result && result.status !== 0) || !payload.ok || !validLengths) {
        return { ok: false, errorCode: payload && payload.errorCode || "HEPAN_PAYLOAD_RUNTIME_FAILED" };
      }
      return { ok: true, titleLength: payload.titleLength, contentHtmlLength: payload.contentHtmlLength };
    } catch (error) {
      if (error && /^HEPAN_/.test(error.code || "")) return { ok: false, errorCode: error.code };
      return { ok: false, errorCode: "HEPAN_PAYLOAD_RUNTIME_FAILED" };
    } finally {
      if (temporaryPayload) temporaryPayload.cleanup();
    }
  }

  function parseArticleFiles(articles) {
    return (articles || []).map(function(article) {
      try {
        const parsed = parseArticle(article.file, { fs: io, path: pathApi });
        return Object.assign({}, parsed, {
          body: parsed.contentHtml,
          sourceFile: article.file,
          file: article.file,
          filePath: article.file,
          filename: article.filename || pathApi.basename(article.file),
          normalizedFilename: article.filename || pathApi.basename(article.file)
        });
      } catch (error) {
        log("[hepan] Article conversion failed: " + (article.filename || "article") + " - " + (error.code || "HEPAN_ARTICLE_INVALID"), "ERROR");
        throw error;
      }
    });
  }

  async function publishArticle(article) {
    const config = runtime();
    const filename = article && (article.filename || article.sourceFile) || "article";
    log("[hepan] Publishing via HTTP: " + pathApi.basename(filename), "INFO");
    if (!config.pythonPath || !config.cookiePath) return { status: "failed", errorCode: "HEPAN_CONFIG_NOT_SET" };

    const sourceFile = article && (article.sourceFile || article.file || article.filePath);
    const sourceFormat = article && article.sourceFormat || pathApi.extname(sourceFile || "").toLowerCase();
    let temporaryPayload = null;
    let remoteCallStarted = false;
    try {
      const args = [
        "--image-dir", imagesDirectory,
        "--cookie-path", config.cookiePath,
        "--category-id", String(config.categoryId),
        ...(config.vendorDir ? ["--vendor-dir", config.vendorDir] : [])
      ];
      if (sourceFormat === "markdown" || sourceFormat === "txt" || sourceFormat === ".md" || sourceFormat === ".markdown" || sourceFormat === ".txt") {
        const parsed = article && article.contentHtml ? article : parseArticle(sourceFile, { fs: io, path: pathApi });
        temporaryPayload = createTemporaryPayload(parsed);
        args.push("--payload-path", temporaryPayload.filename);
      } else {
        args.push("--article", sourceFile);
      }
      remoteCallStarted = true;
      const payload = await runHepan(args);
      if (payload.errorCode && /^HEPAN_/.test(payload.errorCode)) return { status: "failed", errorCode: payload.errorCode };
      if (payload.needsLogin) {
        log("[hepan] Cookie needs update", "WARN");
        return { status: "submitted", legacyStatus: "pending", errorCode: "LOGIN_REQUIRED" };
      }
      if (!payload.ok) return { status: "failed", errorCode: "REMOTE_REJECTED" };
      article.title = payload.title || article.title;
      article.publishUrl = payload.url;
      log("[hepan] Published: " + (payload.url || ""), "INFO");
      return { status: "published", remoteUrl: payload.url || undefined };
    } catch (error) {
      if (error && /^HEPAN_/.test(error.code || "")) return { status: "failed", errorCode: error.code };
      if (remoteCallStarted) return { status: "uncertain", errorCode: "REMOTE_RESULT_UNKNOWN" };
      return { status: "failed", errorCode: "ADAPTER_FAILED" };
    } finally {
      if (temporaryPayload) temporaryPayload.cleanup();
    }
  }

  return {
    id: "hepan",
    publicationTarget: { kind: "platform", granularity: "platform" },
    contentQueueImport: true,
    scanDir: "hepan",
    ensureSession,
    ensureLoggedIn,
    validatePayload,
    publishArticle,
    closeSession: function() {},
    scanArticles: function() { return scanArticleSources(inputDirectory, { fs: io, path: pathApi }); },
    parseArticleFiles,
    resolveHepanRuntime,
    setRuntimeConfig,
    clearRuntimeConfig: function() { batchRuntime = null; }
  };
}

const defaultAdapter = createHepanAdapter();

module.exports = Object.assign({}, defaultAdapter, {
  createHepanAdapter,
  resolveHepanRuntime,
  setRuntimeConfig,
  clearRuntimeConfig: function() { batchRuntime = null; }
});
