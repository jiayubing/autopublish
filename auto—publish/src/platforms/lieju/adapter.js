const fs = require("fs");
const readline = require("readline");
const { execSync } = require("child_process");

const { DIRS, PW, LIEJU } = require("../../../scripts/config");
const { log } = require("../../core/logger");
const { ensureDir, sleep, quoteArg } = require("../../core/files");
const { pwSessionConfig, pwEnv, pwCmd, pwRun, runCode } = require("../../core/playwright");
const { resolveInteractive, throwIfStopped, waitForCondition } = require("../../core/operator-flow");

var SESSION = pwSessionConfig("lieju");
var SESSION_OPTS = { session: SESSION };

var DEFAULT_CITY = "北京";
var PUBLISH_SUCCESS_WORDS = ["发布成功", "提交成功", "操作成功", "success"];
var LOGIN_WAIT_TIMEOUT_MS = 5 * 60 * 1000;
var LOGIN_STATE_SETTLE_MS = 5000;
var PUBLISH_PAGE_LOGIN_CHECK_MS = 2500;
var FAST_POLL_MS = 500;

function daemonAlive() {
  try {
    return pwRun("list", { timeout: 8000, session: SESSION }).indexOf(SESSION.session) !== -1;
  } catch (e) {
    return false;
  }
}

function ensureDaemon() {
  if (daemonAlive()) {
    log("Daemon already running", "INFO");
    return;
  }

  log("Starting daemon...", "WARN");
  try {
    execSync(
      pwCmd(
        "open " +
        LIEJU.base +
        " --browser=" + PW.browserChannel +
        " --headed --persistent --profile=" + quoteArg(SESSION.profileDir),
        SESSION
      ),
      {
        encoding: "utf-8",
        timeout: 20000,
        env: pwEnv(SESSION)
      }
    );
  } catch (e) {
    log("Daemon start command returned: " + e.message, "WARN");
  }

  for (var i = 0; i < 20; i++) {
    sleep(1500);
    if (daemonAlive()) {
      log("Daemon ready", "INFO");
      return;
    }
  }

  throw new Error("Failed to start daemon");
}

function loadSavedState() {
  if (!fs.existsSync(SESSION.stateFile)) {
    return false;
  }
  pwRun("state-load " + quoteArg(SESSION.stateFile), { timeout: 20000, session: SESSION });
  log("Loaded saved login state", "INFO");
  return true;
}

function saveCurrentState() {
  ensureDir(DIRS.stateDir);
  pwRun("state-save " + quoteArg(SESSION.stateFile), { timeout: 20000, session: SESSION });
  log("Saved login state", "INFO");
}

function closeBrowserSession() {
  try {
    saveCurrentState();
  } catch (e) {
    log("Failed to save login state before close: " + e.message, "WARN");
  }

  try {
    pwRun("close", { timeout: 15000, session: SESSION });
    log("Browser session closed", "INFO");
  } catch (e) {
    log("Failed to close browser session: " + e.message, "WARN");
  }
}

function hasLoginIndicator() {
  try {
    return !!runCode(
      "  var locator = page.locator(" + JSON.stringify(LIEJU.selectors.loginIndicator) + ").first();\n" +
      "  return await locator.count() > 0;\n",
      SESSION_OPTS
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
    pwRun("goto " + LIEJU.base, { timeout: 20000, session: SESSION });
    return waitForLoginState(LOGIN_STATE_SETTLE_MS);
  } catch (e) {
    return false;
  }
}

function checkLoginInCurrentPage() {
  return hasLoginIndicator();
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
  log("Please log in to Lieju in the opened browser...", "INFO");
  try {
    pwRun("goto " + LIEJU.loginUrl, { timeout: 15000, session: SESSION });
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

function switchCity(cityName) {
  var targetCity = (cityName || "").trim() || DEFAULT_CITY;
  log("Switching city to " + targetCity, "INFO");

  var switchedCity = runCode(
    "  var targetCity = " + JSON.stringify(targetCity) + ";\n" +
    "  var fallbackCity = " + JSON.stringify(DEFAULT_CITY) + ";\n" +
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
    SESSION_OPTS
  ).trim();

  if (!switchedCity) {
    throw new Error("City switch failed: " + targetCity);
  }

  if (switchedCity !== targetCity) {
    log("City not found, falling back to " + switchedCity, "WARN");
  }

  log("City switched to " + switchedCity, "INFO");
}

function isPublishSuccessPage(snapshotText) {
  var url = getCurrentPageUrl();
  if (/https?:\/\/[^/]+\/[^/]+\/\d+\.html(?:\?.*)?$/.test(url)) {
    return true;
  }

  var snapshot = snapshotText || pwRun("snapshot --raw", { timeout: 15000, session: SESSION });
  return snapshot.indexOf("修改") !== -1 &&
    snapshot.indexOf("删除") !== -1 &&
    snapshot.indexOf("更新时间") !== -1;
}

function waitForPublishSuccess(timeoutMs) {
  return waitForCondition(function() {
    var snapshot = "";
    try {
      snapshot = pwRun("snapshot --raw", { timeout: 15000, session: SESSION });
    } catch (e) {}

    if (snapshot && isPublishSuccessPage(snapshot)) {
      return true;
    }

    for (var i = 0; i < PUBLISH_SUCCESS_WORDS.length; i++) {
      if (snapshot.indexOf(PUBLISH_SUCCESS_WORDS[i]) !== -1) {
        return true;
      }
    }

    return false;
  }, {
    timeoutMs: timeoutMs,
    intervalMs: 2000
  });
}

function buildFillScript(article) {
  var code = "";
  code += "  await page.waitForSelector('#atc_title');\n";
  code += "  await page.waitForSelector('#atc_content');\n";
  code += "  await page.waitForSelector('#atc_mobphone');\n";
  code += "  await page.waitForSelector('#atc_linkman');\n";
  code += "  var zoneOptions = await page.locator('#atc_zone_id option').evaluateAll(function(options) {\n";
  code += "    return options.map(function(option) {\n";
  code += "      return { value: option.value, text: option.textContent && option.textContent.trim() };\n";
  code += "    });\n";
  code += "  });\n";
  code += "  var fallbackZone = zoneOptions.filter(function(option) { return option.value; }).slice(-1)[0];\n";
  code += "  if (fallbackZone) await page.locator('#atc_zone_id').selectOption(fallbackZone.value);\n";

  if (article.title) {
    code += "  await page.locator('#atc_title').fill(" + JSON.stringify(article.title) + ");\n";
  }
  if (article.body) {
    code += "  await page.locator('#atc_content').fill(" + JSON.stringify(article.body) + ");\n";
  }
  if (article.phone) {
    code += "  await page.locator('#atc_mobphone').fill(" + JSON.stringify(article.phone) + ");\n";
  }
  if (article.contact) {
    code += "  await page.locator('#atc_linkman').fill(" + JSON.stringify(article.contact) + ");\n";
  }

  return code;
}

async function publishArticle(article, options) {
  var opts = options || {};
  var autoSubmit = opts.autoSubmit !== false;
  var interactive = resolveInteractive(opts);

  throwIfStopped();
  pwRun("goto " + LIEJU.publishUrl, { timeout: 20000, session: SESSION });
  waitForLoginState(PUBLISH_PAGE_LOGIN_CHECK_MS);
  throwIfStopped();

  if (!checkLoginInCurrentPage()) {
    log("Lieju publish page requires login", "WARN");
    var relogged = await doLogin({ interactive: interactive, timeoutMs: opts.timeoutMs });
    if (!relogged || !checkLogin()) {
      throw new Error("Login did not complete");
    }
    throwIfStopped();
    saveCurrentState();
    pwRun("goto " + LIEJU.publishUrl, { timeout: 20000, session: SESSION });
    waitForLoginState(PUBLISH_PAGE_LOGIN_CHECK_MS);
    throwIfStopped();
  }

  switchCity(article.city);
  throwIfStopped();
  runCode(buildFillScript(article), SESSION_OPTS);
  log("Form filled", "INFO");

  if (!autoSubmit) {
    log("Form filled; waiting for manual submission", "INFO");
    return "pending";
  }

  throwIfStopped();
  log("Submitting automatically...", "INFO");
  pwRun("click " + LIEJU.selectors.submitBtn, { timeout: 20000, session: SESSION });
  return waitForPublishSuccess(25000);
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

module.exports = {
  id: "lieju",
  scanDir: LIEJU.selectors.articleDir,
  ensureSession: ensureDaemon,
  ensureLoggedIn: ensureLoggedIn,
  checkLogin: checkLogin,
  publishArticle: publishArticle,
  saveSession: saveCurrentState,
  closeSession: closeBrowserSession
};
