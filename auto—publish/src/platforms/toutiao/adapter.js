const fs = require("fs");
const path = require("path");
const readline = require("readline");
const { execSync } = require("child_process");

const { DIRS, PW } = require("../../../scripts/config");
const { log } = require("../../core/logger");
const { ensureDir, sleep, quoteArg } = require("../../core/files");
const { pwSessionConfig, pwEnv, pwCmd, pwRun, runCode } = require("../../core/playwright");
const { extractDocxArticle } = require("../../core/docx-text-extractor");
const { parseArticle } = require("../../core/article-text");
const { resolveInteractive, throwIfStopped, waitForCondition } = require("../../core/operator-flow");
const { createBrowserSessionLifecycle } = require("../shared/browser-session-lifecycle");

var SESSION = pwSessionConfig("toutiao");
var SESSION_OPTS = { session: SESSION };
var LOGIN_WAIT_TIMEOUT_MS = 5 * 60 * 1000;
var LOGIN_STATE_SETTLE_MS = 5000;
var PUBLISH_PAGE_LOGIN_CHECK_MS = 2500;
var FAST_POLL_MS = 500;

var TOUTIAO = {
  base: "https://mp.toutiao.com",
  loginUrl: "https://mp.toutiao.com",
  publishUrl: "https://mp.toutiao.com/profile_v4/graphic/publish",
  articleListUrl: "https://mp.toutiao.com/profile_v4/graphic/articles",
  successUrlPattern: /\/profile_v4\/graphic\/articles(?:[/?#]|$)/
};

var SESSION_LIFECYCLE = createBrowserSessionLifecycle({
  session: SESSION,
  stateDir: DIRS.stateDir,
  pwRun: pwRun,
  quoteArg: quoteArg,
  ensureDir: ensureDir,
  sleep: sleep,
  log: log,
  start: function() {
    execSync(pwCmd("open " + TOUTIAO.base + " --browser=" + PW.browserChannel + " --headed --persistent --profile=" + quoteArg(SESSION.profileDir), SESSION), { encoding: "utf-8", timeout: 20000, env: pwEnv(SESSION) });
  }
});
function daemonAlive() { return SESSION_LIFECYCLE.isAlive(); }
function ensureDaemon() { return SESSION_LIFECYCLE.ensureStarted(); }
function loadSavedState() { return SESSION_LIFECYCLE.loadSavedState(); }
function saveCurrentState() { return SESSION_LIFECYCLE.saveState(); }
function closeBrowserSession() { return SESSION_LIFECYCLE.close(); }

function getCurrentPageUrl() {
  return runCode("  return page.url();\n", SESSION_OPTS).trim();
}

function getCurrentPageText() {
  try {
    return runCode(
      "  return document.body ? document.body.innerText : '';\n",
      SESSION_OPTS
    );
  } catch (e) {
    return "";
  }
}

function checkLogin() {
  try {
    pwRun("goto " + TOUTIAO.base, { timeout: 25000, session: SESSION });
    return waitForLoginState(LOGIN_STATE_SETTLE_MS);
  } catch (e) {
    return false;
  }
}

function checkLoginInCurrentPage() {
  try {
    var url = getCurrentPageUrl();
    return url.indexOf("/profile_v4/") !== -1;
  } catch (e) {
    return false;
  }
}

function waitForLoginState(timeoutMs) {
  return waitForCondition(checkLoginInCurrentPage, {
    timeoutMs: timeoutMs,
    intervalMs: FAST_POLL_MS
  });
}

function waitForLoginCompletion(timeoutMs) {
  return waitForCondition(checkLoginInCurrentPage, {
    timeoutMs: timeoutMs || LOGIN_WAIT_TIMEOUT_MS,
    intervalMs: FAST_POLL_MS
  });
}

function doLogin(options) {
  var opts = options || {};
  var interactive = resolveInteractive(opts);
  log("Please log in to Toutiao in the opened browser...", "INFO");
  try {
    pwRun("goto " + TOUTIAO.loginUrl, { timeout: 15000, session: SESSION });
  } catch (e) {}

  if (!interactive) {
    log("Desktop mode detected; the batch will resume automatically after login", "INFO");
    return Promise.resolve(waitForLoginCompletion(opts.timeoutMs));
  }

  return new Promise(function(resolve) {
    var rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question("Press Enter after login...", function() {
      rl.close();
      resolve(waitForLoginCompletion(opts.timeoutMs));
    });
  });
}

async function ensureLoggedIn(options) {
  var opts = options || {};
  var interactive = resolveInteractive(opts);
  var loaded = false;

  try {
    loaded = loadSavedState();
  } catch (e) {
    log("Failed to load login state: " + e.message, "WARN");
  }

  if (checkLogin()) {
    log("Logged in", "INFO");
    return;
  }

  var relogged = await doLogin({ interactive: interactive, timeoutMs: opts.timeoutMs });
  if (!relogged || !checkLogin()) {
    throw new Error("Login failed");
  }

  saveCurrentState();
  log("Logged in", "INFO");
}

function dismissAssistantDrawer() {
  try {
    runCode(
      "  var mask = page.locator('div.byte-drawer-mask').first();\n" +
      "  if (await mask.count()) {\n" +
      "    var vis = await mask.evaluate(function(el) { return el.offsetParent !== null && el.getBoundingClientRect().width > 0; });\n" +
      "    if (vis) {\n" +
      "      await mask.click({ timeout: 3000 }).catch(function() {});\n" +
      "      await page.waitForTimeout(500);\n" +
      "    }\n" +
      "  }\n" +
      "  return 'ok';\n",
      { timeout: 10000, session: SESSION }
    );
  } catch (e) {}
}

function fillTitle(title) {
  runCode(
    "  var titleInput = page.locator('textarea[placeholder*=\"文章标题\"]').first();\n" +
    "  await titleInput.waitFor({ state: 'visible', timeout: 15000 });\n" +
    "  await titleInput.fill(" + JSON.stringify(title || "") + ");\n" +
    "  await page.waitForTimeout(300);\n",
    { timeout: 20000, session: SESSION }
  );
}

function fillBody(body) {
  runCode(
    "  var editor = page.locator('div.ProseMirror').first();\n" +
    "  await editor.waitFor({ state: 'visible', timeout: 15000 });\n" +
    "  await editor.click({ timeout: 10000 });\n" +
    "  await page.waitForTimeout(200);\n" +
    "  await page.keyboard.type(" + JSON.stringify(body || "") + ");\n" +
    "  await page.waitForTimeout(300);\n",
    { timeout: 60000, session: SESSION }
  );
}

function selectCoverMode(coverMode) {
  var mode = coverMode === "single" ? "单图" : coverMode === "triple" ? "三图" : "无封面";
  runCode(
    "  var option = page.getByText(" + JSON.stringify(mode) + ", { exact: true }).first();\n" +
    "  if (await option.count()) {\n" +
    "    await option.click({ timeout: 10000 });\n" +
    "    await page.waitForTimeout(300);\n" +
    "  }\n",
    { timeout: 15000, session: SESSION }
  );
}

function selectAdEnabled(adEnabled) {
  var label = adEnabled ? "投放广告赚收益" : "不投放广告";
  runCode(
    "  var option = page.getByText(" + JSON.stringify(label) + ", { exact: true }).first();\n" +
    "  if (await option.count()) {\n" +
    "    await option.click({ timeout: 10000 });\n" +
    "    await page.waitForTimeout(300);\n" +
    "  }\n",
    { timeout: 15000, session: SESSION }
  );
}

function clickPreviewAndPublish() {
  runCode(
    "  var button = page.getByRole('button', { name: '预览并发布' }).first();\n" +
    "  await button.click({ timeout: 15000 });\n" +
    "  await page.waitForTimeout(1000);\n",
    { timeout: 20000, session: SESSION }
  );
}

function confirmAdDialog() {
  try {
    runCode(
      "  var modal = page.locator('div.byte-modal').first();\n" +
      "  var ok = modal.locator('text=确定').first();\n" +
      "  if (await ok.count()) {\n" +
      "    await ok.click({ timeout: 10000 });\n" +
      "    await page.waitForTimeout(1500);\n" +
      "  }\n",
      { timeout: 15000, session: SESSION }
    );
  } catch (e) {}
}

function clickConfirmPublish() {
  runCode(
    "  var button = page.getByRole('button', { name: '确认发布' });\n" +
    "  try {\n" +
    "    await button.first().waitFor({ state: 'visible', timeout: 10000 });\n" +
    "  } catch (e) {\n" +
    "    return;\n" +
    "  }\n" +
    "  await button.first().click({ timeout: 15000 });\n" +
    "  await page.waitForTimeout(1000);\n",
    { timeout: 25000, session: SESSION }
  );
}

function waitForPublishSuccess(timeoutMs) {
  return waitForCondition(function() {
    try {
      return TOUTIAO.successUrlPattern.test(getCurrentPageUrl());
    } catch (e) {
      return false;
    }
  }, {
    timeoutMs: timeoutMs || 25000,
    intervalMs: 2000
  });
}

function articleListShowsPublished(articleTitle) {
  var title = String(articleTitle || "").trim();
  if (!title) {
    return false;
  }

  var text = getCurrentPageText();
  if (!text || text.indexOf(title) === -1) {
    return false;
  }

  return text.indexOf("已发布") !== -1 || text.indexOf("已推送") !== -1 || text.indexOf("审核中") !== -1;
}

function verifyPublishFromArticleList(articleTitle, timeoutMs) {
  var title = String(articleTitle || "").trim();
  if (!title) {
    return false;
  }

  try {
    pwRun("goto " + TOUTIAO.articleListUrl, { timeout: 25000, session: SESSION });
  } catch (e) {}

  return waitForCondition(function() {
    return articleListShowsPublished(title);
  }, {
    timeoutMs: timeoutMs || 15000,
    intervalMs: FAST_POLL_MS
  });
}

async function publishArticle(article, options) {
  var opts = options || {};
  var autoSubmit = opts.autoSubmit !== false;
  var interactive = resolveInteractive(opts);
  var sidecar = article.sidecar || {};
  var coverMode = sidecar.coverMode || "none";
  var adEnabled = !!sidecar.adEnabled;
  var remoteCallStarted = false;

  try {
    throwIfStopped();
    pwRun("goto " + TOUTIAO.publishUrl, { timeout: 25000, session: SESSION });
    waitForLoginState(PUBLISH_PAGE_LOGIN_CHECK_MS);
    throwIfStopped();

    if (!checkLoginInCurrentPage()) {
      log("Toutiao publish page requires login", "WARN");
      var relogged = await doLogin({ interactive: interactive, timeoutMs: opts.timeoutMs });
      if (!relogged || !checkLogin()) {
        return { status: "failed", errorCode: "LOGIN_FAILED" };
      }
      throwIfStopped();
      saveCurrentState();
      pwRun("goto " + TOUTIAO.publishUrl, { timeout: 25000, session: SESSION });
      waitForLoginState(PUBLISH_PAGE_LOGIN_CHECK_MS);
      throwIfStopped();
    }

    dismissAssistantDrawer();
    throwIfStopped();
    fillTitle(article.title);
    throwIfStopped();
    fillBody(article.body);
    throwIfStopped();
    selectCoverMode(coverMode);
    throwIfStopped();
    selectAdEnabled(adEnabled);
    log("Form filled", "INFO");

    if (!autoSubmit) {
      log("Form filled; waiting for manual submission", "INFO");
      return { status: "submitted", legacyStatus: "pending" };
    }

    throwIfStopped();
    log("Submitting automatically...", "INFO");
    remoteCallStarted = true;
    try {
      clickPreviewAndPublish();
      throwIfStopped();
      confirmAdDialog();
      throwIfStopped();
      clickConfirmPublish();
      throwIfStopped();

      if (await waitForPublishSuccess(10000)) {
        var url = "";
        try { url = getCurrentPageUrl(); } catch (_) {}
        return { status: "published", remoteUrl: url || undefined };
      }

      if (await verifyPublishFromArticleList(article.title, 15000)) {
        var verifiedUrl = "";
        try { verifiedUrl = getCurrentPageUrl(); } catch (_) {}
        return { status: "published", remoteUrl: verifiedUrl || undefined };
      }

      return { status: "uncertain", errorCode: "REMOTE_RESULT_UNKNOWN" };
    } catch (remoteError) {
      return { status: "uncertain", errorCode: "REMOTE_RESULT_UNKNOWN" };
    }
  } catch (error) {
    if (remoteCallStarted) return { status: "uncertain", errorCode: "REMOTE_RESULT_UNKNOWN" };
    if (isStopError(error)) return { status: "failed", errorCode: "STOP_REQUESTED" };
    return { status: "failed", errorCode: "ADAPTER_FAILED" };
  }
}

function isStopError(error) {
  return !!(error && error.message && error.message.indexOf("Stop requested") !== -1);
}

function scanArticles(scanDir) {
  var inputDir = path.join(DIRS.inputDir, scanDir);
  if (!fs.existsSync(inputDir)) {
    return [];
  }

  return fs.readdirSync(inputDir).filter(function(name) {
    if (name.indexOf("~$") === 0) {
      return false;
    }
    return name.endsWith(".docx") || name.endsWith(".md");
  }).map(function(name) {
    var ext = path.extname(name);
    var baseName = path.basename(name, ext).trim();
    return {
      file: path.join(inputDir, name),
      filename: name,
      fileBaseName: baseName
    };
  });
}

async function parseArticleFiles(articles) {
  var parsed = [];

  for (var i = 0; i < articles.length; i++) {
    var article = articles[i];
    try {
      var data = path.extname(article.file).toLowerCase() === ".docx"
        ? await extractDocxArticle({
            buffer: fs.readFileSync(article.file),
            fallbackTitle: article.fileBaseName
          })
        : parseArticle(article.file);
      var mdTitle = (data.title || "").trim();
      var fileTitle = (article.fileBaseName || "").trim();
      data.title = mdTitle || fileTitle;
      data.body = data.body;
      data.sourceFile = article.file;
      data.filename = article.filename;
      data.normalizedFilename = article.filename;
      data.sidecar = loadSidecar(article.file);
      parsed.push(data);
      log("Article: " + data.title, "INFO");
    } catch (e) {
      log("Conversion failed: " + article.filename + " - " + e.message, "ERROR");
    }
  }

  return parsed;
}

function loadSidecar(articleFile) {
  var sidecarPath = articleFile + ".meta.json";
  if (!fs.existsSync(sidecarPath)) {
    return {};
  }
  try {
    return JSON.parse(fs.readFileSync(sidecarPath, "utf-8")) || {};
  } catch (e) {
    log("Failed to parse sidecar: " + path.basename(sidecarPath) + " - " + e.message, "WARN");
    return {};
  }
}

module.exports = {
  id: "toutiao",
  publicationTarget: { kind: "platform", granularity: "platform" },
  contentQueueImport: true,
  scanDir: "toutiao",
  ensureSession: ensureDaemon,
  ensureLoggedIn: ensureLoggedIn,
  checkLogin: checkLogin,
  publishArticle: publishArticle,
  saveSession: saveCurrentState,
  closeSession: closeBrowserSession,
  scanArticles: scanArticles,
  parseArticleFiles: parseArticleFiles
};
