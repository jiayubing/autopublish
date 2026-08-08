const fs = require("fs");
const readline = require("readline");
const path = require("path");
const { DIRS, PW, LIEJU } = require("../../../scripts/config");
const { reportDiagnostic } = require("../../diagnostics/diagnostic-producer");
const domain = require("../../domain");
const { ensureDir, sleep } = require("../../core/files");
const {
  pwSessionConfig,
  pwInvokeSync,
  runCode,
} = require("../../core/playwright");
const {
  resolveInteractive,
  throwIfStopped,
  waitForCondition,
} = require("../../core/operator-flow");
const {
  createBrowserSessionLifecycle,
} = require("../shared/browser-session-lifecycle");

var SESSION = pwSessionConfig("lieju");
var SESSION_OPTS = { session: SESSION };

var DEFAULT_CITY = "北京";
var LOGIN_WAIT_TIMEOUT_MS = 5 * 60 * 1000;
var LOGIN_STATE_SETTLE_MS = 5000;
var PUBLISH_PAGE_LOGIN_CHECK_MS = 2500;
var FAST_POLL_MS = 500;

function diagnose(code, category, action) {
  reportDiagnostic({
    code,
    module: "platform-lieju",
    category,
    operationId: "platform-lieju",
    metadata: { platformId: "lieju", action: action },
  });
}

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
        LIEJU.base,
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

function hasLoginIndicator() {
  try {
    return !!runCode(
      "  var locator = page.locator(" +
        JSON.stringify(LIEJU.selectors.loginIndicator) +
        ").first();\n" +
        "  return await locator.count() > 0;\n",
      SESSION_OPTS,
    );
  } catch (e) {
    return false;
  }
}

function getCurrentPageUrl() {
  return runCode("  return page.url();\n", SESSION_OPTS).trim();
}

function checkLogin() {
  try {
    pwInvokeSync(["goto", LIEJU.base], { timeout: 20000, session: SESSION });
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
  pwInvokeSync(["goto", LIEJU.loginUrl], {
    timeout: 15000,
    session: SESSION,
  });
}

function checkLoginInCurrentPage() {
  return hasLoginIndicator();
}

function inspectAccount() {
  try {
    var evidence = runCode(
      [
        "  var selectors = ['#um a[href*=\"uid=\"]', '.vwmy a[href*=\"uid=\"]', '.user-name a[href*=\"uid=\"]', '[data-uid]'];",
        "  var node = null;",
        "  for (var i = 0; i < selectors.length && !node; i += 1) node = document.querySelector(selectors[i]);",
        "  if (!node) return { verified: false };",
        "  var href = String(node.getAttribute('href') || '');",
        "  var match = href.match(/[?&]uid=([0-9]{1,20})/);",
        "  var remoteAccountId = String(node.getAttribute('data-uid') || (match && match[1]) || '').trim();",
        "  var displayName = String(node.textContent || '').replace(/[\\u0000-\\u001f\\u007f]/g, '').trim();",
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
    pwInvokeSync(["goto", LIEJU.loginUrl], {
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

function switchCity(cityName) {
  var targetCity = (cityName || "").trim() || DEFAULT_CITY;
  diagnose("PLATFORM_CITY_SWITCH_STARTED", "remote", "city-switch");

  var switchedCity = runCode(
    "  var targetCity = " +
      JSON.stringify(targetCity) +
      ";\n" +
      "  var fallbackCity = " +
      JSON.stringify(DEFAULT_CITY) +
      ";\n" +
      "  await page.waitForLoadState('domcontentloaded');\n" +
      "  await page.locator('a[href*=\"city.php?post=239\"]').filter({ hasText: '切换' }).first().click();\n" +
      "  await page.waitForLoadState('domcontentloaded');\n" +
      "  var cityLinks = page.locator('a');\n" +
      "  var targetLink = cityLinks.filter({ hasText: targetCity }).first();\n" +
      "  if (await targetLink.count()) {\n" +
      "    await targetLink.click();\n" +
      "    await page.waitForLoadState('domcontentloaded');\n" +
      "    await page.waitForTimeout(2000);\n" +
      "    return targetCity;\n" +
      "  }\n" +
      "  var fallbackLink = cityLinks.filter({ hasText: fallbackCity }).first();\n" +
      "  if (await fallbackLink.count()) {\n" +
      "    await fallbackLink.click();\n" +
      "    await page.waitForLoadState('domcontentloaded');\n" +
      "    await page.waitForTimeout(2000);\n" +
      "    return fallbackCity;\n" +
      "  }\n" +
      "  return '';\n",
    SESSION_OPTS,
  ).trim();

  if (!switchedCity) {
    throw new Error("City switch failed: " + targetCity);
  }

  if (switchedCity !== targetCity) {
    diagnose("PLATFORM_CITY_SWITCH_FALLBACK", "remote", "city-fallback");
  }

  diagnose("PLATFORM_CITY_SWITCH_COMPLETED", "remote", "city-switch");
}

function buildFillScript(article) {
  var code = "";
  code += "  await page.waitForSelector('#atc_title');\n";
  code += "  await page.waitForSelector('#atc_content');\n";
  code += "  await page.waitForSelector('#atc_mobphone');\n";
  code += "  await page.waitForSelector('#atc_linkman');\n";
  code +=
    "  var zoneOptions = await page.locator('#atc_zone_id option').evaluateAll(function(options) {\n";
  code += "    return options.map(function(option) {\n";
  code +=
    "      return { value: option.value, text: option.textContent && option.textContent.trim() };\n";
  code += "    });\n";
  code += "  });\n";
  code +=
    "  var fallbackZone = zoneOptions.filter(function(option) { return option.value; }).slice(-1)[0];\n";
  code +=
    "  if (fallbackZone) await page.locator('#atc_zone_id').selectOption(fallbackZone.value);\n";

  if (article.title) {
    code +=
      "  await page.locator('#atc_title').fill(" +
      JSON.stringify(article.title) +
      ");\n";
  }
  if (article.body) {
    code +=
      "  await page.locator('#atc_content').fill(" +
      JSON.stringify(article.body) +
      ");\n";
  }
  if (article.phone) {
    code +=
      "  await page.locator('#atc_mobphone').fill(" +
      JSON.stringify(article.phone) +
      ");\n";
  }
  if (article.contact) {
    code +=
      "  await page.locator('#atc_linkman').fill(" +
      JSON.stringify(article.contact) +
      ");\n";
  }

  return code;
}

function preparedContentMatches(article) {
  try {
    return (
      runCode(
        "  var title = await page.locator('#atc_title').inputValue();\n" +
          "  var body = await page.locator('#atc_content').inputValue();\n" +
          "  return title === " +
          JSON.stringify(article.title) +
          " && body === " +
          JSON.stringify(article.body) +
          ";\n",
        SESSION_OPTS,
      ) === true
    );
  } catch (_) {
    return false;
  }
}

async function prepareArticleSubmission(article, options) {
  var opts = options || {};
  var interactive = resolveInteractive(opts);
  throwIfStopped();
  pwInvokeSync(["goto", LIEJU.publishUrl], {
    timeout: 20000,
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
    pwInvokeSync(["goto", LIEJU.publishUrl], {
      timeout: 20000,
      session: SESSION,
    });
    waitForLoginState(PUBLISH_PAGE_LOGIN_CHECK_MS);
    throwIfStopped();
  }

  switchCity(article.city);
  throwIfStopped();
  runCode(buildFillScript(article), SESSION_OPTS);
  diagnose("PLATFORM_FORM_FILLED", "remote", "form-fill");

  return Object.freeze({
    submitPreparedPublication: async function () {
      diagnose("PLATFORM_SUBMIT_STARTED", "remote", "submit");
      try {
        throwIfStopped();
        if (!preparedContentMatches(article))
          return { status: "uncertain", errorCode: "PREPARED_CONTENT_DRIFT" };
        pwInvokeSync(["click", LIEJU.selectors.submitBtn], {
          timeout: 20000,
          session: SESSION,
        });
        // The current page URL and generic post-submit page structure cannot
        // prove that this article was created. Do not manufacture published.
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

module.exports = {
  id: "lieju",
  publicationTarget: { kind: "platform", granularity: "platform" },
  contentQueueImport: true,
  scanDir: LIEJU.selectors.articleDir,
  ensureSession: ensureDaemon,
  ensureLoggedIn: ensureLoggedIn,
  openLogin: openLogin,
  checkLogin: checkLogin,
  inspectAccount: inspectAccount,
  publishArticle: publishArticle,
  preparePlatformSubmission: preparePlatformSubmission,
  saveSession: saveCurrentState,
  closeSession: closeBrowserSession,
};
