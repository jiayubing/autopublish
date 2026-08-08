const fs = require("fs");
const path = require("path");
const readline = require("readline");
const { DIRS, PW } = require("../../../scripts/config");
const { reportDiagnostic } = require("../../diagnostics/diagnostic-producer");
const domain = require("../../domain");
const { ensureDir, sleep } = require("../../core/files");
const {
  pwSessionConfig,
  pwInvokeSync,
  runCode,
} = require("../../core/playwright");
const { extractDocxArticle } = require("../../core/docx-text-extractor");
const { parseArticle } = require("../../core/article-text");
const {
  resolveInteractive,
  throwIfStopped,
  waitForCondition,
} = require("../../core/operator-flow");
const {
  createBrowserSessionLifecycle,
} = require("../shared/browser-session-lifecycle");

var SESSION = pwSessionConfig("toutiao");
var SESSION_OPTS = { session: SESSION };
var LOGIN_WAIT_TIMEOUT_MS = 5 * 60 * 1000;
var LOGIN_STATE_SETTLE_MS = 5000;
var PUBLISH_PAGE_LOGIN_CHECK_MS = 2500;
var FAST_POLL_MS = 500;

function diagnose(code, category, action) {
  reportDiagnostic({
    code,
    module: "platform-toutiao",
    category,
    operationId: "platform-toutiao",
    metadata: { platformId: "toutiao", action: action },
  });
}

var TOUTIAO = {
  base: "https://mp.toutiao.com",
  loginUrl: "https://mp.toutiao.com",
  publishUrl: "https://mp.toutiao.com/profile_v4/graphic/publish",
  articleListUrl: "https://mp.toutiao.com/profile_v4/graphic/articles",
  successUrlPattern: /\/profile_v4\/graphic\/articles(?:[/?#]|$)/,
};

var SESSION_LIFECYCLE = createBrowserSessionLifecycle({
  session: SESSION,
  stateDir: DIRS.stateDir,
  run: pwInvokeSync,
  ensureDir: ensureDir,
  sleep: sleep,
  start: function () {
    pwInvokeSync(
      [
        "open",
        TOUTIAO.base,
        "--browser=" + PW.browserChannel,
        "--headed",
        "--persistent",
        "--profile=" + SESSION.profileDir,
      ],
      { timeout: 20000, session: SESSION },
    );
  },
});
function daemonAlive() {
  return SESSION_LIFECYCLE.isAlive();
}
function ensureDaemon() {
  return SESSION_LIFECYCLE.ensureStarted();
}
function loadSavedState() {
  return SESSION_LIFECYCLE.loadSavedState();
}
function saveCurrentState() {
  return SESSION_LIFECYCLE.saveState();
}
function closeBrowserSession() {
  return SESSION_LIFECYCLE.close();
}

function getCurrentPageUrl() {
  return runCode("  return page.url();\n", SESSION_OPTS).trim();
}

function getCurrentPageText() {
  try {
    return runCode(
      "  return document.body ? document.body.innerText : '';\n",
      SESSION_OPTS,
    );
  } catch (e) {
    return "";
  }
}

function checkLogin() {
  try {
    pwInvokeSync(["goto", TOUTIAO.base], {
      timeout: 25000,
      session: SESSION,
    });
    return waitForLoginState(LOGIN_STATE_SETTLE_MS);
  } catch (e) {
    return false;
  }
}

function openLogin() {
  ensureDaemon();
  try {
    loadSavedState();
  } catch (e) {
    diagnose("PLATFORM_LOGIN_STATE_LOAD_FAILED", "storage", "state-load");
  }
  pwInvokeSync(["goto", TOUTIAO.loginUrl], {
    timeout: 15000,
    session: SESSION,
  });
}

function checkLoginInCurrentPage() {
  try {
    var url = getCurrentPageUrl();
    return url.indexOf("/profile_v4/") !== -1;
  } catch (e) {
    return false;
  }
}

function inspectAccount() {
  try {
    var evidence = runCode(
      [
        "  var selectors = ['[data-user-id]', '[data-uid]', '[data-account-id]', 'a[href*=\"uid=\"]', 'a[href*=\"user_id=\"]'];",
        "  var node = null;",
        "  for (var i = 0; i < selectors.length && !node; i += 1) node = document.querySelector(selectors[i]);",
        "  if (!node) return { verified: false };",
        "  var href = String(node.getAttribute('href') || '');",
        "  var match = href.match(/[?&](?:uid|user_id|userId)=([A-Za-z0-9_-]{1,128})/);",
        "  var remoteAccountId = String(node.getAttribute('data-user-id') || node.getAttribute('data-uid') || node.getAttribute('data-account-id') || (match && match[1]) || '').trim();",
        "  var displayName = String(node.getAttribute('data-user-name') || node.textContent || '').replace(/[\\u0000-\\u001f\\u007f]/g, '').trim();",
        "  return remoteAccountId && displayName && displayName.length <= 128 ? { verified: true, remoteAccountId: remoteAccountId, displayName: displayName } : { verified: false };",
      ].join("\n"),
      SESSION_OPTS,
    );
    return evidence && evidence.verified === true
      ? evidence
      : { verified: false };
  } catch (_) {
    return { verified: false };
  }
}

function waitForLoginState(timeoutMs) {
  return waitForCondition(checkLoginInCurrentPage, {
    timeoutMs: timeoutMs,
    intervalMs: FAST_POLL_MS,
  });
}

function waitForLoginCompletion(timeoutMs) {
  return waitForCondition(checkLoginInCurrentPage, {
    timeoutMs: timeoutMs || LOGIN_WAIT_TIMEOUT_MS,
    intervalMs: FAST_POLL_MS,
  });
}

function doLogin(options) {
  var opts = options || {};
  var interactive = resolveInteractive(opts);
  diagnose("PLATFORM_LOGIN_REQUIRED", "authentication", "login-required");
  try {
    pwInvokeSync(["goto", TOUTIAO.loginUrl], {
      timeout: 15000,
      session: SESSION,
    });
  } catch (e) {
    diagnose(
      "PLATFORM_LOGIN_NAVIGATION_FAILED",
      "transport",
      "login-navigation",
    );
  }

  if (!interactive) {
    diagnose("PLATFORM_LOGIN_WAITING", "authentication", "login-wait");
    return Promise.resolve(waitForLoginCompletion(opts.timeoutMs));
  }

  return new Promise(function (resolve) {
    var rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question("Press Enter after login...", function () {
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
    diagnose("PLATFORM_LOGIN_STATE_LOAD_FAILED", "storage", "state-load");
  }

  if (checkLogin()) {
    diagnose("PLATFORM_LOGIN_COMPLETED", "authentication", "login");
    return;
  }

  var relogged = await doLogin({
    interactive: interactive,
    timeoutMs: opts.timeoutMs,
  });
  if (!relogged || !checkLogin()) {
    throw new Error("Login failed");
  }

  saveCurrentState();
  diagnose("PLATFORM_LOGIN_COMPLETED", "authentication", "login");
}

function dismissAssistantDrawer() {
  try {
    runCode(
      "  var mask = page.locator('div.byte-drawer-mask').first();\n" +
        "  if (await mask.count()) {\n" +
        "    var vis = await mask.evaluate(function(el) { return el.offsetParent !== null && el.getBoundingClientRect().width > 0; });\n" +
        "    if (vis) {\n" +
        "      await mask.click({ timeout: 3000 }).catch(function() { return false; });\n" +
        "      await page.waitForTimeout(500);\n" +
        "    }\n" +
        "  }\n" +
        "  return 'ok';\n",
      { timeout: 10000, session: SESSION },
    );
  } catch (e) {
    diagnose("PLATFORM_DRAWER_DISMISS_FAILED", "remote", "drawer-dismiss");
  }
}

function fillTitle(title) {
  runCode(
    "  var titleInput = page.locator('textarea[placeholder*=\"文章标题\"]').first();\n" +
      "  await titleInput.waitFor({ state: 'visible', timeout: 15000 });\n" +
      "  await titleInput.fill(" +
      JSON.stringify(title || "") +
      ");\n" +
      "  await page.waitForTimeout(300);\n",
    { timeout: 20000, session: SESSION },
  );
}

function fillBody(body) {
  runCode(
    "  var editor = page.locator('div.ProseMirror').first();\n" +
      "  await editor.waitFor({ state: 'visible', timeout: 15000 });\n" +
      "  await editor.click({ timeout: 10000 });\n" +
      "  await page.waitForTimeout(200);\n" +
      "  await page.keyboard.type(" +
      JSON.stringify(body || "") +
      ");\n" +
      "  await page.waitForTimeout(300);\n",
    { timeout: 60000, session: SESSION },
  );
}

function selectCoverMode(coverMode) {
  var mode =
    coverMode === "single"
      ? "单图"
      : coverMode === "triple"
        ? "三图"
        : "无封面";
  runCode(
    "  var option = page.getByText(" +
      JSON.stringify(mode) +
      ", { exact: true }).first();\n" +
      "  if (await option.count()) {\n" +
      "    await option.click({ timeout: 10000 });\n" +
      "    await page.waitForTimeout(300);\n" +
      "  }\n",
    { timeout: 15000, session: SESSION },
  );
}

function selectAdEnabled(adEnabled) {
  var label = adEnabled ? "投放广告赚收益" : "不投放广告";
  runCode(
    "  var option = page.getByText(" +
      JSON.stringify(label) +
      ", { exact: true }).first();\n" +
      "  if (await option.count()) {\n" +
      "    await option.click({ timeout: 10000 });\n" +
      "    await page.waitForTimeout(300);\n" +
      "  }\n",
    { timeout: 15000, session: SESSION },
  );
}

function clickPreviewAndPublish() {
  runCode(
    "  var button = page.getByRole('button', { name: '预览并发布' }).first();\n" +
      "  await button.click({ timeout: 15000 });\n" +
      "  await page.waitForTimeout(1000);\n",
    { timeout: 20000, session: SESSION },
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
      { timeout: 15000, session: SESSION },
    );
  } catch (e) {
    diagnose(
      "PLATFORM_AD_DIALOG_CONFIRM_FAILED",
      "remote",
      "ad-dialog-confirm",
    );
  }
}

function clickConfirmPublish() {
  return (
    runCode(
      "  var button = page.getByRole('button', { name: '确认发布' }).first();\n" +
        "  await button.waitFor({ state: 'visible', timeout: 10000 });\n" +
        "  await button.click({ timeout: 15000 });\n" +
        "  await page.waitForTimeout(1000);\n" +
        "  return true;\n",
      { timeout: 25000, session: SESSION },
    ) === true
  );
}

function confirmPublishReady() {
  return (
    runCode(
      "  var button = page.getByRole('button', { name: '确认发布' }).first();\n" +
        "  await button.waitFor({ state: 'visible', timeout: 10000 });\n" +
        "  return true;\n",
      { timeout: 15000, session: SESSION },
    ) === true
  );
}

function preparedContentMatches(article) {
  try {
    return (
      runCode(
        "  var title = await page.locator('textarea[placeholder*=\"文章标题\"]').first().inputValue();\n" +
          "  var body = await page.locator('div.ProseMirror').first().innerText();\n" +
          "  return title === " +
          JSON.stringify(article.title) +
          " && body === " +
          JSON.stringify(article.body) +
          ";\n",
        { timeout: 20000, session: SESSION },
      ) === true
    );
  } catch (_) {
    return false;
  }
}

async function prepareArticleSubmission(article, options) {
  var opts = options || {};
  var interactive = resolveInteractive(opts);
  var sidecar = article.sidecar || {};
  var coverMode = sidecar.coverMode || "none";
  var adEnabled = !!sidecar.adEnabled;
  throwIfStopped();
  pwInvokeSync(["goto", TOUTIAO.publishUrl], {
    timeout: 25000,
    session: SESSION,
  });
  waitForLoginState(PUBLISH_PAGE_LOGIN_CHECK_MS);
  throwIfStopped();

  if (!checkLoginInCurrentPage()) {
    diagnose("PLATFORM_LOGIN_REQUIRED", "authentication", "publish-auth-check");
    var relogged = await doLogin({
      interactive: interactive,
      timeoutMs: opts.timeoutMs,
    });
    if (!relogged || !checkLogin()) {
      var loginError = new Error("Login failed");
      loginError.code = "LOGIN_FAILED";
      throw loginError;
    }
    throwIfStopped();
    saveCurrentState();
    pwInvokeSync(["goto", TOUTIAO.publishUrl], {
      timeout: 25000,
      session: SESSION,
    });
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
  diagnose("PLATFORM_FORM_FILLED", "remote", "form-fill");
  if (!preparedContentMatches(article)) {
    var driftError = new Error("Prepared content drifted before preview");
    driftError.code = "PREPARED_CONTENT_DRIFT";
    throw driftError;
  }
  clickPreviewAndPublish();
  throwIfStopped();
  confirmAdDialog();
  throwIfStopped();
  if (!confirmPublishReady()) {
    var confirmationError = new Error("Publish confirmation is unavailable");
    confirmationError.code = "PREPARED_CONFIRMATION_UNAVAILABLE";
    throw confirmationError;
  }

  return Object.freeze({
    submitPreparedPublication: async function () {
      diagnose("PLATFORM_SUBMIT_STARTED", "remote", "submit");
      try {
        throwIfStopped();
        if (!preparedContentMatches(article))
          return { status: "uncertain", errorCode: "PREPARED_CONTENT_DRIFT" };
        if (!clickConfirmPublish())
          return {
            status: "uncertain",
            errorCode: "PREPARED_SESSION_DRIFT",
          };
        throwIfStopped();

        // Navigation to a generic list cannot bind a remote record to this
        // article/attempt. Browser submission has no response evidence yet.
        return { status: "uncertain", errorCode: "REMOTE_RESULT_UNKNOWN" };
      } catch (_) {
        return { status: "uncertain", errorCode: "REMOTE_RESULT_UNKNOWN" };
      }
    },
  });
}

async function publishArticle(article, options) {
  var opts = options || {};
  try {
    var prepared = await prepareArticleSubmission(article, opts);
    if (opts.autoSubmit === false) {
      diagnose("PLATFORM_MANUAL_SUBMIT_WAIT", "remote", "manual-submit");
      return { status: "group_blocked", errorCode: "MANUAL_SUBMIT_REQUIRED" };
    }
    return prepared.submitPreparedPublication();
  } catch (error) {
    if (isStopError(error))
      return { status: "group_blocked", errorCode: "STOP_REQUESTED" };
    return {
      status: "group_blocked",
      errorCode: error && error.code ? error.code : "ADAPTER_FAILED",
    };
  }
}

async function preparePlatformSubmission(claim) {
  const evidence = domain.createTextOnlyPreparedSubmissionEvidenceV1(claim);
  const preparedArticle = Object.freeze({
    title: evidence.title,
    body: evidence.body,
    sidecar: Object.freeze({ coverMode: "none", adEnabled: false }),
  });
  const prepared = await prepareArticleSubmission(preparedArticle, {
    autoSubmit: true,
  });
  return domain.createPreparedSubmission({
    preparedSubmissionEvidenceV1: evidence,
    submitPreparedPublication: prepared.submitPreparedPublication,
  });
}

function isStopError(error) {
  return !!(
    error &&
    error.message &&
    error.message.indexOf("Stop requested") !== -1
  );
}

function scanArticles(scanDir) {
  var inputDir = path.join(DIRS.inputDir, scanDir);
  if (!fs.existsSync(inputDir)) {
    return [];
  }

  return fs
    .readdirSync(inputDir)
    .filter(function (name) {
      if (name.indexOf("~$") === 0) {
        return false;
      }
      return name.endsWith(".docx") || name.endsWith(".md");
    })
    .map(function (name) {
      var ext = path.extname(name);
      var baseName = path.basename(name, ext).trim();
      return {
        file: path.join(inputDir, name),
        filename: name,
        fileBaseName: baseName,
      };
    });
}

async function parseArticleFiles(articles) {
  var parsed = [];

  for (var i = 0; i < articles.length; i++) {
    var article = articles[i];
    try {
      var data =
        path.extname(article.file).toLowerCase() === ".docx"
          ? await extractDocxArticle({
              buffer: fs.readFileSync(article.file),
              fallbackTitle: article.fileBaseName,
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
      diagnose("PLATFORM_ARTICLE_PARSED", "validation", "article-parse");
    } catch (e) {
      diagnose("PLATFORM_ARTICLE_PARSE_FAILED", "validation", "article-parse");
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
    diagnose("PLATFORM_SIDECAR_PARSE_FAILED", "validation", "sidecar-parse");
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
  openLogin: openLogin,
  checkLogin: checkLogin,
  inspectAccount: inspectAccount,
  publishArticle: publishArticle,
  preparePlatformSubmission: preparePlatformSubmission,
  saveSession: saveCurrentState,
  closeSession: closeBrowserSession,
  scanArticles: scanArticles,
  parseArticleFiles: parseArticleFiles,
};
