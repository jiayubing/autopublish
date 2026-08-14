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

var DEFAULT_CITY = "北京";
var LOGIN_WAIT_TIMEOUT_MS = 5 * 60 * 1000;
var LOGIN_STATE_SETTLE_MS = 5000;
var PUBLISH_PAGE_LOGIN_CHECK_MS = 2500;
var FAST_POLL_MS = 500;
var POST_SUBMIT_VERIFY_TIMEOUT_MS = 25 * 1000;
var POST_SUBMIT_VERIFY_POLL_MS = 500;
var LIEJU_DETAIL_PATH = /\/(?:[^\/?#]+\/)*([0-9]{1,20})\.html$/i;
var POST_SUBMIT_REJECTION_PATTERN = [
  "发布失败",
  "提交失败",
  "投稿失败",
  "发布被拒绝",
  "提交被拒绝",
  "投稿被拒",
  "不能发布",
  "无法发布",
  "重复投稿",
  "验证码错误",
  "标题不能为空",
  "内容不能为空",
  "publish failed",
  "submit failed",
  "submission failed",
  "cannot publish",
  "unable to publish",
  "title is required",
  "content is required",
  "rejected",
].join("|");

function nonEmptyString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function createLiejuRuntime(runtimeContext) {
  var context = runtimeContext || {};
  var browserRuntime = context.browserRuntime || {};
  var workspacePaths = context.workspacePaths || {};
  var profileRoot =
    nonEmptyString(browserRuntime.profileRoot) ||
    nonEmptyString(workspacePaths.browser);
  var daemonRoot =
    nonEmptyString(browserRuntime.daemonRoot) ||
    (profileRoot ? path.join(profileRoot, "sessions") : "");
  var stateDir =
    nonEmptyString(browserRuntime.stateDir) ||
    (profileRoot ? path.join(profileRoot, "state") : DIRS.stateDir);
  var sessionInput = { session: "lieju" };

  if (profileRoot) {
    sessionInput.profileDir = path.join(profileRoot, "profiles", "lieju");
    sessionInput.daemonDir = path.join(daemonRoot, "lieju");
    sessionInput.stateFile = path.join(stateDir, "lieju.json");
  } else {
    if (nonEmptyString(browserRuntime.profileDir)) {
      sessionInput.profileDir = browserRuntime.profileDir;
    }
    if (nonEmptyString(browserRuntime.daemonDir)) {
      sessionInput.daemonDir = browserRuntime.daemonDir;
    } else if (daemonRoot) {
      sessionInput.daemonDir = path.join(daemonRoot, "lieju");
    }
    if (nonEmptyString(browserRuntime.stateFile)) {
      sessionInput.stateFile = browserRuntime.stateFile;
    } else if (nonEmptyString(browserRuntime.stateDir)) {
      sessionInput.stateFile = path.join(stateDir, "lieju.json");
    }
  }

  var session = pwSessionConfig(sessionInput);
  var runtimeOptions = {
    browserChannel:
      nonEmptyString(browserRuntime.browserChannel) || PW.browserChannel,
    tempDir:
      nonEmptyString(browserRuntime.tempDir) ||
      nonEmptyString(workspacePaths.tmp) ||
      DIRS.tmpDir,
  };
  if (nonEmptyString(browserRuntime.playwrightCliJs)) {
    runtimeOptions.playwrightCli = browserRuntime.playwrightCliJs;
  }
  if (nonEmptyString(browserRuntime.nodeExecPath)) {
    runtimeOptions.nodeExecPath = browserRuntime.nodeExecPath;
  }

  function invoke(commandArgs, options) {
    return pwInvokeSync(
      commandArgs,
      Object.assign({}, runtimeOptions, options || {}, { session: session }),
    );
  }

  function evaluate(jsCode, options) {
    return runCode(
      jsCode,
      Object.assign({}, runtimeOptions, options || {}, { session: session }),
    );
  }

  var lifecycle = createBrowserSessionLifecycle({
    session: session,
    stateDir: path.dirname(session.stateFile),
    run: invoke,
    ensureDir: ensureDir,
    sleep: sleep,
    start: function () {
      invoke(
        [
          "open",
          LIEJU.base,
          "--browser=" + runtimeOptions.browserChannel,
          "--headed",
          "--persistent",
          "--profile=" + session.profileDir,
        ],
        { timeout: 20000 },
      );
    },
  });

  return {
    session: session,
    invoke: invoke,
    evaluate: evaluate,
    lifecycle: lifecycle,
    postSubmitVerificationTimeoutMs: context.postSubmitVerificationTimeoutMs,
    postSubmitVerificationPollMs: context.postSubmitVerificationPollMs,
  };
}

function diagnose(code, category, action) {
  reportDiagnostic({
    code,
    module: "platform-lieju",
    category,
    operationId: "platform-lieju",
    metadata: { platformId: "lieju", action: action },
  });
}

function hasLoginIndicator(runtime) {
  try {
    return !!runtime.evaluate(
      "  var locator = page.locator(" +
        JSON.stringify(LIEJU.selectors.loginIndicator) +
        ").first();\n" +
        "  return await locator.count() > 0;\n",
    );
  } catch (e) {
    return false;
  }
}

function checkLogin(runtime) {
  try {
    runtime.invoke(["goto", LIEJU.base], { timeout: 20000 });
    return waitForLoginState(runtime, LOGIN_STATE_SETTLE_MS);
  } catch (e) {
    return false;
  }
}

function openLogin(runtime) {
  runtime.lifecycle.ensureStarted();
  try {
    runtime.lifecycle.loadSavedState();
  } catch (e) {
    diagnose("PLATFORM_LOGIN_STATE_LOAD_FAILED", "storage", "state-load");
  }
  runtime.invoke(["goto", LIEJU.loginUrl], { timeout: 15000 });
}

function checkLoginInCurrentPage(runtime) {
  return hasLoginIndicator(runtime);
}

function hasAccountIdentityIndicator(runtime) {
  try {
    return runtime.evaluate(
      [
        "  var selectors = ['#um a[href*=\"uid=\"]', '.vwmy a[href*=\"uid=\"]', '.user-name a[href*=\"uid=\"]', '[data-uid]'];",
        "  for (var i = 0; i < selectors.length; i += 1) {",
        "    if (document.querySelector(selectors[i])) return true;",
        "  }",
        "  return false;",
      ].join("\n"),
    ) === true;
  } catch (_) {
    return false;
  }
}

async function ensureAccountInspectionReady(runtime, options) {
  var opts = options || {};
  var wasAlive = runtime.lifecycle.isAlive();
  runtime.lifecycle.ensureStarted();
  if (!wasAlive) {
    try {
      runtime.lifecycle.loadSavedState();
    } catch (e) {
      diagnose("PLATFORM_LOGIN_STATE_LOAD_FAILED", "storage", "state-load");
    }
  }
  if (hasAccountIdentityIndicator(runtime)) return;
  if (opts.preserveCurrentPage === true) {
    var pageError = new Error("Account inspection page is not ready");
    pageError.code = "PLATFORM_ACCOUNT_INSPECTION_PAGE_NOT_READY";
    throw pageError;
  }
  runtime.invoke(["goto", LIEJU.base], { timeout: 20000 });
  waitForLoginState(runtime, LOGIN_STATE_SETTLE_MS);
  waitForCondition(function () {
    return hasAccountIdentityIndicator(runtime);
  }, {
    timeoutMs: PUBLISH_PAGE_LOGIN_CHECK_MS,
    intervalMs: FAST_POLL_MS,
  });
}

function inspectAccount(runtime) {
  try {
    var evidence = runtime.evaluate(
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
    );
    return evidence && evidence.verified === true
      ? evidence
      : { verified: false };
  } catch (_) {
    return { verified: false };
  }
}

function waitForLoginState(runtime, timeoutMs) {
  return waitForCondition(function () {
    return checkLoginInCurrentPage(runtime);
  }, {
    timeoutMs: timeoutMs,
    intervalMs: FAST_POLL_MS,
  });
}

function waitForLoginCompletion(runtime, timeoutMs) {
  return waitForCondition(function () {
    return checkLoginInCurrentPage(runtime);
  }, {
    timeoutMs: timeoutMs || LOGIN_WAIT_TIMEOUT_MS,
    intervalMs: FAST_POLL_MS,
  });
}

function doLogin(runtime, options) {
  var opts = options || {};
  var interactive = resolveInteractive(opts);
  diagnose("PLATFORM_LOGIN_REQUIRED", "authentication", "login-required");
  try {
    runtime.invoke(["goto", LIEJU.loginUrl], { timeout: 15000 });
  } catch (e) {
    diagnose(
      "PLATFORM_LOGIN_NAVIGATION_FAILED",
      "transport",
      "login-navigation",
    );
  }

  if (!interactive) {
    diagnose("PLATFORM_LOGIN_WAITING", "authentication", "login-wait");
    return Promise.resolve(waitForLoginCompletion(runtime, opts.timeoutMs));
  }

  return new Promise(function (resolve) {
    var rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question("Press Enter after login...", function () {
      rl.close();
      resolve(waitForLoginCompletion(runtime, opts.timeoutMs));
    });
  });
}

function switchCity(runtime, cityName) {
  var targetCity = (cityName || "").trim() || DEFAULT_CITY;
  diagnose("PLATFORM_CITY_SWITCH_STARTED", "remote", "city-switch");

  var switchedCity = runtime.evaluate(
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
  ).trim();

  if (!switchedCity) {
    throw new Error("City switch failed: " + targetCity);
  }

  if (switchedCity !== targetCity) {
    diagnose("PLATFORM_CITY_SWITCH_FALLBACK", "remote", "city-fallback");
  }

  diagnose("PLATFORM_CITY_SWITCH_COMPLETED", "remote", "city-switch");
}

function isLiejuHostname(value) {
  var hostname = String(value || "").toLowerCase();
  return hostname === "lieju.com" || hostname.endsWith(".lieju.com");
}

function normalizeLiejuDetailUrl(value) {
  var normalized = domain.normalizePublishedArticleUrl(value);
  if (!normalized) return null;
  try {
    var url = new URL(normalized);
    if (!isLiejuHostname(url.hostname)) return null;
    var match = url.pathname.match(LIEJU_DETAIL_PATH);
    if (!match) return null;
    return { remoteId: match[1], remoteUrl: normalized };
  } catch (_) {
    return null;
  }
}

function isLiejuPublishPageUrl(value) {
  if (typeof value !== "string" || !value) return false;
  try {
    var current = new URL(value);
    var publish = new URL(LIEJU.publishUrl);
    return (
      current.protocol === publish.protocol &&
      current.hostname.toLowerCase() === publish.hostname.toLowerCase() &&
      current.pathname === publish.pathname
    );
  } catch (_) {
    return false;
  }
}

function buildPostSubmitEvidenceScript() {
  return [
    "  var currentUrl = String(page.url() || '');",
    "  var bodyText = '';",
    "  try { bodyText = await page.locator('body').innerText(); } catch (_) {}",
    "  bodyText = String(bodyText || '').replace(/\\s+/g, ' ').slice(0, 20000);",
    "  var rejectionPattern = " +
      JSON.stringify(POST_SUBMIT_REJECTION_PATTERN) +
      ";",
    "  var hasExplicitRejection = new RegExp(rejectionPattern, 'i').test(bodyText);",
    "  var hasDetailPageSignals = ['修改', '删除', '更新时间'].every(function(marker) { return bodyText.indexOf(marker) !== -1; });",
    "  var hasSubmissionForm = false;",
    "  try {",
    "    hasSubmissionForm = await page.locator('#atc_title, #atc_content, #atc_mobphone, #atc_linkman').count() > 0;",
    "  } catch (_) {}",
    "  var detailUrls = [currentUrl];",
    "  try {",
    "    var hrefs = await page.locator('a[href]').evaluateAll(function(nodes) {",
    "      return nodes.map(function(node) {",
    "        var href = node.getAttribute('href');",
    "        if (!href) return '';",
    "        try { return new URL(href, document.baseURI).href; } catch (_) { return ''; }",
    "      }).filter(Boolean).slice(0, 64);",
    "    });",
    "    detailUrls = detailUrls.concat(hrefs);",
    "  } catch (_) {}",
    "  return { url: currentUrl, detailUrls: detailUrls, hasExplicitRejection: hasExplicitRejection, hasDetailPageSignals: hasDetailPageSignals, hasSubmissionForm: hasSubmissionForm };",
  ].join("\n");
}

function evidenceCandidates(evidence) {
  if (typeof evidence === "string") return [evidence];
  if (!evidence || typeof evidence !== "object") return [];
  var candidates = [];
  for (var key of ["url", "remoteUrl", "detailUrl"]) {
    if (typeof evidence[key] === "string") candidates.push(evidence[key]);
  }
  if (evidence.hasDetailPageSignals === true && Array.isArray(evidence.detailUrls)) {
    candidates = candidates.concat(
      evidence.detailUrls.filter(function (value) {
        return typeof value === "string";
      }),
    );
  }
  return candidates;
}

function remoteIdentityFromPostSubmitEvidence(evidence) {
  var candidates = evidenceCandidates(evidence);
  for (var index = 0; index < candidates.length; index += 1) {
    var identity = normalizeLiejuDetailUrl(candidates[index]);
    if (identity) return identity;
  }
  return null;
}

function normalizePostSubmitEvidence(evidence) {
  var identity = remoteIdentityFromPostSubmitEvidence(evidence);
  if (identity) return { status: "accepted", ...identity };
  if (
    evidence &&
    typeof evidence === "object" &&
    evidence.hasExplicitRejection === true &&
    (evidence.hasSubmissionForm === true || isLiejuPublishPageUrl(evidence.url))
  ) {
    return { status: "article_rejected", errorCode: "REMOTE_REJECTED" };
  }
  return null;
}

function postSubmitVerificationTimeout(runtime) {
  return typeof runtime.postSubmitVerificationTimeoutMs === "number" &&
    Number.isFinite(runtime.postSubmitVerificationTimeoutMs) &&
    runtime.postSubmitVerificationTimeoutMs >= 0
    ? runtime.postSubmitVerificationTimeoutMs
    : POST_SUBMIT_VERIFY_TIMEOUT_MS;
}

function postSubmitVerificationPoll(runtime) {
  return typeof runtime.postSubmitVerificationPollMs === "number" &&
    Number.isFinite(runtime.postSubmitVerificationPollMs) &&
    runtime.postSubmitVerificationPollMs > 0
    ? runtime.postSubmitVerificationPollMs
    : POST_SUBMIT_VERIFY_POLL_MS;
}

function verifyPostSubmit(runtime) {
  var lastOutcome = null;
  function check() {
    var evidence = null;
    try {
      evidence = runtime.evaluate(buildPostSubmitEvidenceScript());
    } catch (_) {
      return false;
    }
    var outcome = normalizePostSubmitEvidence(evidence);
    if (!outcome) return false;
    lastOutcome = outcome;
    return true;
  }

  if (check()) return lastOutcome;
  var timeoutMs = postSubmitVerificationTimeout(runtime);
  if (timeoutMs === 0)
    return { status: "uncertain", errorCode: "REMOTE_RESULT_UNKNOWN" };
  if (
    waitForCondition(check, {
      timeoutMs: timeoutMs,
      intervalMs: postSubmitVerificationPoll(runtime),
    }) &&
    lastOutcome
  ) {
    return lastOutcome;
  }
  return { status: "uncertain", errorCode: "REMOTE_RESULT_UNKNOWN" };
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

function preparedContentMatches(runtime, article) {
  try {
    return (
      runtime.evaluate(
        "  var title = await page.locator('#atc_title').inputValue();\n" +
          "  var body = await page.locator('#atc_content').inputValue();\n" +
          "  return title === " +
          JSON.stringify(article.title) +
          " && body === " +
          JSON.stringify(article.body) +
          ";\n",
      ) === true
    );
  } catch (_) {
    return false;
  }
}

async function prepareArticleSubmission(runtime, article, options) {
  var opts = options || {};
  var interactive = resolveInteractive(opts);
  throwIfStopped();
  runtime.invoke(["goto", LIEJU.publishUrl], { timeout: 20000 });
  waitForLoginState(runtime, PUBLISH_PAGE_LOGIN_CHECK_MS);
  throwIfStopped();

  if (!checkLoginInCurrentPage(runtime)) {
    diagnose("PLATFORM_LOGIN_REQUIRED", "authentication", "publish-auth-check");
    var relogged = await doLogin(runtime, {
      interactive: interactive,
      timeoutMs: opts.timeoutMs,
    });
    if (!relogged || !checkLogin(runtime)) {
      var loginError = new Error("Login failed");
      loginError.code = "LOGIN_FAILED";
      throw loginError;
    }
    throwIfStopped();
    runtime.lifecycle.saveState();
    runtime.invoke(["goto", LIEJU.publishUrl], { timeout: 20000 });
    waitForLoginState(runtime, PUBLISH_PAGE_LOGIN_CHECK_MS);
    throwIfStopped();
  }

  switchCity(runtime, article.city);
  throwIfStopped();
  runtime.evaluate(buildFillScript(article));
  diagnose("PLATFORM_FORM_FILLED", "remote", "form-fill");

  return Object.freeze({
    submitPreparedPublication: async function () {
      diagnose("PLATFORM_SUBMIT_STARTED", "remote", "submit");
      try {
        throwIfStopped();
        if (!preparedContentMatches(runtime, article))
          return { status: "uncertain", errorCode: "PREPARED_CONTENT_DRIFT" };
        runtime.invoke(["click", LIEJU.selectors.submitBtn], {
          timeout: 20000,
        });
        var outcome = verifyPostSubmit(runtime);
        if (outcome.status === "uncertain")
          diagnose("PLATFORM_SUBMIT_UNCERTAIN", "remote", "submit");
        else if (outcome.status === "article_rejected")
          diagnose("PLATFORM_SUBMIT_REJECTED", "remote", "submit");
        else if (outcome.status === "accepted")
          diagnose("PLATFORM_SUBMIT_ACCEPTED", "remote", "submit");
        return outcome;
      } catch (_) {
        diagnose("PLATFORM_SUBMIT_UNCERTAIN", "remote", "submit");
        return { status: "uncertain", errorCode: "REMOTE_RESULT_UNKNOWN" };
      }
    },
  });
}

async function publishArticle(runtime, article, options) {
  var opts = options || {};
  try {
    var prepared = await prepareArticleSubmission(runtime, article, opts);
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

async function preparePlatformSubmission(runtime, claim) {
  const evidence = domain.createTextOnlyPreparedSubmissionEvidenceV1(claim);
  const profile = claim && claim.publicationProfile || {};
  const preparedArticle = Object.freeze({
    title: evidence.title,
    body: evidence.body,
    city: typeof profile.city === "string" ? profile.city : "",
    contact: typeof profile.contact === "string" ? profile.contact : "",
    phone: typeof profile.phone === "string" ? profile.phone : "",
  });
  const prepared = await prepareArticleSubmission(runtime, preparedArticle, {
    autoSubmit: true,
  });
  return domain.createPreparedSubmission({
    preparedSubmissionEvidenceV1: evidence,
    submitPreparedPublication: prepared.submitPreparedPublication,
  });
}

function isStopError(error) {
  return Boolean(error && error.code === "STOP_REQUESTED");
}

async function ensureLoggedIn(runtime, options) {
  var opts = options || {};
  var interactive = resolveInteractive(opts);
  var loaded = false;

  try {
    loaded = runtime.lifecycle.loadSavedState();
  } catch (e) {
    diagnose("PLATFORM_LOGIN_STATE_LOAD_FAILED", "storage", "state-load");
  }

  if (checkLogin(runtime)) {
    diagnose("PLATFORM_LOGIN_COMPLETED", "authentication", "login");
    return;
  }

  var relogged = await doLogin(runtime, {
    interactive: interactive,
    timeoutMs: opts.timeoutMs,
  });
  if (!relogged || !checkLogin(runtime)) {
    throw new Error("Login failed");
  }

  runtime.lifecycle.saveState();
  diagnose("PLATFORM_LOGIN_COMPLETED", "authentication", "login");
}

function createLiejuAdapter(runtimeContext) {
  var runtime = createLiejuRuntime(runtimeContext);
  return {
    id: "lieju",
    publicationTarget: { kind: "platform", granularity: "platform" },
    contentQueueImport: true,
    scanDir: LIEJU.selectors.articleDir,
    ensureSession: function () {
      return runtime.lifecycle.ensureStarted();
    },
    ensureLoggedIn: function (options) {
      return ensureLoggedIn(runtime, options);
    },
    openLogin: function () {
      return openLogin(runtime);
    },
    checkLogin: function () {
      return checkLogin(runtime);
    },
    ensureAccountInspectionReady: function (options) {
      return ensureAccountInspectionReady(runtime, options);
    },
    inspectAccount: function () {
      return inspectAccount(runtime);
    },
    publishArticle: function (article, options) {
      return publishArticle(runtime, article, options);
    },
    preparePlatformSubmission: function (claim) {
      return preparePlatformSubmission(runtime, claim);
    },
    saveSession: function () {
      return runtime.lifecycle.saveState();
    },
    closeSession: function () {
      return runtime.lifecycle.close();
    },
  };
}

module.exports = Object.assign(createLiejuAdapter(), {
  createPlatformAdapter: createLiejuAdapter,
});
