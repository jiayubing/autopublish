const fs = require("fs");
const readline = require("readline");
const path = require("path");
const { load } = require("cheerio");
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
  createStateFileLease,
} = require("../shared/browser-session-lifecycle");
const httpFormParser = require("./http-form-parser");
const { createLiejuHttpSession } = require("./http-session");
const {
  classifyLiejuHttpSubmitResponse,
  normalizeLiejuDetailUrl,
} = require("./http-outcome");
const { prepareLiejuImageMultipart } = require("./image-multipart-preparation");
const { renderLiejuPlainText } = require("./plain-text-renderer");

var DEFAULT_CITY = "北京";
var LOGIN_WAIT_TIMEOUT_MS = 5 * 60 * 1000;
var LOGIN_STATE_SETTLE_MS = 5000;
var PUBLISH_PAGE_LOGIN_CHECK_MS = 2500;
var FAST_POLL_MS = 500;
var POST_SUBMIT_VERIFY_TIMEOUT_MS = 25 * 1000;
var POST_SUBMIT_VERIFY_POLL_MS = 500;
var LIEJU_SUBMISSION_MODE_AUTO = "auto";
var LIEJU_SUBMISSION_MODE_PLAYWRIGHT_ONLY = "playwright_only";
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

function submissionModeError() {
  var error = new Error("Lieju submission mode is invalid");
  error.code = "LIEJU_SUBMISSION_MODE_INVALID";
  return error;
}

function resolveLiejuSubmissionMode(value) {
  if (value === undefined || value === null || value === "")
    return LIEJU_SUBMISSION_MODE_AUTO;
  if (value === LIEJU_SUBMISSION_MODE_AUTO) return LIEJU_SUBMISSION_MODE_AUTO;
  if (value === LIEJU_SUBMISSION_MODE_PLAYWRIGHT_ONLY)
    return LIEJU_SUBMISSION_MODE_PLAYWRIGHT_ONLY;
  throw submissionModeError();
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

  var session = Object.assign({}, pwSessionConfig(sessionInput));
  if (!nonEmptyString(session.stateFile)) {
    session.stateFile =
      sessionInput.stateFile || path.join(stateDir, "lieju.json");
  }
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

  var browserStateLease = createStateFileLease({
    stateFile: session.stateFile,
  });
  var lifecycle = createBrowserSessionLifecycle({
    session: session,
    stateDir: path.dirname(session.stateFile),
    run: invoke,
    ensureDir: ensureDir,
    sleep: sleep,
    stateLease: browserStateLease,
    atomicStateSave: true,
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
    createHttpSession: function () {
      return createLiejuHttpSession({
        stateFile: session.stateFile,
        stateLease: createStateFileLease({ stateFile: session.stateFile }),
        request: context.httpRequest,
        loginProbeUrl: LIEJU.publishUrl,
      });
    },
    imageResolver: context.imageResolver,
    liejuSubmissionMode:
      context.liejuSubmissionMode === undefined
        ? process.env.LIEJU_SUBMISSION_MODE
        : context.liejuSubmissionMode,
    submissionTransport: null,
    accountInspection: null,
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

function buildAccountIdentityIndicatorScript() {
  return [
    "  return await page.evaluate(function () {",
    "    var links = document.querySelectorAll('a[href]');",
    "    for (var i = 0; i < links.length; i += 1) {",
    "      var href = String(links[i].getAttribute('href') || '');",
    "      var parsed;",
    "      try { parsed = new URL(href, location.href); } catch (_) { parsed = null; }",
    "      if (parsed && parsed.hostname !== 'lieju.com' && parsed.hostname !== 'www.lieju.com') parsed = null;",
    "      if (parsed && /^\\/u[0-9]{1,20}$/i.test(parsed.pathname)) return true;",
    "    }",
    "    return false;",
    "  });",
  ].join("\n");
}

function buildAccountDocumentInspectionScript() {
  return [
    "function inspectDocument(doc, href) {",
    "  var links = doc.querySelectorAll('a[href]');",
    "  var fallback = null;",
    "  for (var i = 0; i < links.length; i += 1) {",
    "    var node = links[i];",
    "    var rawHref = String(node.getAttribute('href') || '');",
    "    var parsed;",
    "    try { parsed = new URL(rawHref, href); } catch (_) { parsed = null; }",
    "    if (parsed && parsed.hostname !== 'lieju.com' && parsed.hostname !== 'www.lieju.com') parsed = null;",
    "    var match = parsed && String(parsed.pathname || '').match(/^\\/u([0-9]{1,20})$/i);",
    "    var displayName = String(node.textContent || '').replace(/[\\u0000-\\u001f\\u007f]/g, '').trim();",
    "    if (match && displayName && displayName.length <= 128) {",
    "      var evidence = { verified: true, remoteAccountId: match[1], displayName: displayName };",
    "      if (!fallback) fallback = evidence;",
    "      if (/(^|\\s)m3(?:\\s|$)/.test(String((node.parentElement && node.parentElement.className) || ''))) return evidence;",
    "    }",
    "  }",
    "  return fallback || { verified: false };",
    "}",
    "return inspectDocument(document, location.href);",
  ].join("\n");
}

function buildAccountInspectionScript() {
  var pageInspection = buildAccountDocumentInspectionScript();
  return [
    "  var currentEvidence = await page.evaluate(function () {\n" +
      pageInspection +
      "\n  });",
    "  if (currentEvidence && currentEvidence.verified === true) return currentEvidence;",
    "  var verificationPage = null;",
    "  try {",
    "    verificationPage = await page.context().newPage();",
    "    await verificationPage.goto(" +
      JSON.stringify(LIEJU.accountUrl) +
      ");",
    "    await verificationPage.waitForLoadState('domcontentloaded');",
    "    return await verificationPage.evaluate(function () {\n" +
      pageInspection +
      "\n    });",
    "  } catch (_) {",
    "    return { verified: false };",
    "  } finally {",
    "    if (verificationPage) {",
    "      try { await verificationPage.close(); } catch (closeError) { /* best-effort cleanup; do not replace account evidence */ }",
    "    }",
    "  }",
  ].join("\n");
}

function accountInspectionFromHtml(html, baseUrl) {
  const $ = load(html, { decodeEntities: true });
  let fallback = null;
  for (const node of $("a[href]").toArray()) {
    const href = $(node).attr("href");
    let parsed = null;
    let match = null;
    try {
      parsed = new URL(href, baseUrl);
      if (!["lieju.com", "www.lieju.com"].includes(parsed.hostname)) continue;
      match = parsed.pathname.match(/^\/u([0-9]{1,20})$/i);
    } catch (_) {
      match = null;
    }
    const displayName = $(node)
      .text()
      .replace(/[\u0000-\u001f\u007f]/g, "")
      .trim();
    if (!match || !displayName || displayName.length > 128) continue;
    const evidence = Object.freeze({
      verified: true,
      remoteAccountId: match[1],
      displayName,
    });
    if (!fallback) fallback = evidence;
    if (/(^|\s)m3(?:\s|$)/.test(String($(node).parent().attr("class") || "")))
      return evidence;
  }
  return fallback || Object.freeze({ verified: false });
}

function selectedSubmissionTransport(runtime) {
  if (runtime.submissionTransport) return runtime.submissionTransport;
  runtime.submissionTransport =
    resolveLiejuSubmissionMode(runtime.liejuSubmissionMode) ===
    LIEJU_SUBMISSION_MODE_PLAYWRIGHT_ONLY
      ? "browser"
      : "http";
  return runtime.submissionTransport;
}

function isBrowserFallbackEligible(error) {
  const code = error && error.code;
  return [
    "LOGIN_REQUIRED",
    "LIEJU_HTTP_REQUEST_UNAVAILABLE",
    "LIEJU_HTTP_STATE_MISSING",
    "LIEJU_HTTP_STATE_INVALID",
    "LIEJU_HTTP_GET_FAILED",
    "LIEJU_HTTP_REDIRECT_UNSAFE",
    "LIEJU_HTML_CHARSET_CONFLICT",
    "LIEJU_HTML_CHARSET_UNSUPPORTED",
    "LIEJU_HTML_DECODE_FAILED",
    "LIEJU_HTML_CHARSET_UNKNOWN",
    "LIEJU_CITY_TARGET_INVALID",
    "LIEJU_PUBLICATION_FORM_INVALID",
    "LIEJU_PUBLICATION_ZONE_UNAVAILABLE",
    "LIEJU_PUBLICATION_FORM_FIELDS_INVALID",
    "LIEJU_ACCOUNT_INSPECTION_UNVERIFIED",
  ].includes(code);
}

function selectBrowserFallback(runtime, error) {
  if (selectedSubmissionTransport(runtime) !== "http") return false;
  if (!isBrowserFallbackEligible(error)) return false;
  runtime.submissionTransport = "browser";
  diagnose("LIEJU_HTTP_PREPARE_FALLBACK", "transport", "browser-fallback");
  return true;
}

async function inspectAccountThroughHttp(runtime) {
  return runtime.createHttpSession().withGetPort(async function (port) {
    requireAuthenticatedHttpSession(await port.probeLogin());
    const response = requireHttpPublicationResponse(
      await port.get(LIEJU.accountUrl),
    );
    const decoded = httpFormParser.decodeLiejuHttpHtml(response);
    const evidence = accountInspectionFromHtml(decoded.html, LIEJU.accountUrl);
    if (evidence.verified === true) return evidence;
    throw liejuPreparationError("LIEJU_ACCOUNT_INSPECTION_UNVERIFIED");
  });
}

function hasAccountIdentityIndicator(runtime) {
  try {
    return runtime.evaluate(buildAccountIdentityIndicatorScript()) === true;
  } catch (_) {
    return false;
  }
}

async function ensureBrowserAccountInspectionReady(runtime, options) {
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
    if (hasLoginIndicator(runtime)) return;
    var pageError = new Error("Account inspection page is not ready");
    pageError.code = "PLATFORM_ACCOUNT_INSPECTION_PAGE_NOT_READY";
    throw pageError;
  }
  runtime.invoke(["goto", LIEJU.accountUrl], { timeout: 20000 });
  waitForLoginState(runtime, LOGIN_STATE_SETTLE_MS);
  waitForCondition(
    function () {
      return hasAccountIdentityIndicator(runtime);
    },
    {
      timeoutMs: PUBLISH_PAGE_LOGIN_CHECK_MS,
      intervalMs: FAST_POLL_MS,
    },
  );
}

function inspectAccountInBrowser(runtime) {
  try {
    var evidence = runtime.evaluate(buildAccountInspectionScript());
    return evidence && evidence.verified === true
      ? evidence
      : { verified: false };
  } catch (_) {
    return { verified: false };
  }
}

function waitForLoginState(runtime, timeoutMs) {
  return waitForCondition(
    function () {
      return checkLoginInCurrentPage(runtime);
    },
    {
      timeoutMs: timeoutMs,
      intervalMs: FAST_POLL_MS,
    },
  );
}

function waitForLoginCompletion(runtime, timeoutMs) {
  return waitForCondition(
    function () {
      return checkLoginInCurrentPage(runtime);
    },
    {
      timeoutMs: timeoutMs || LOGIN_WAIT_TIMEOUT_MS,
      intervalMs: FAST_POLL_MS,
    },
  );
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
    "  var observedResponseUrls = typeof responseUrls !== 'undefined' && Array.isArray(responseUrls) ? responseUrls : [];",
    "  var observedDialogMessages = typeof dialogMessages !== 'undefined' && Array.isArray(dialogMessages) ? dialogMessages : [];",
    "  var rejectionPattern = " +
      JSON.stringify(POST_SUBMIT_REJECTION_PATTERN) +
      ";",
    "  var loginPattern = /(?:请先)?(?:登录|登陆)|\\blogin\\b/i;",
    "  var captchaPattern = /(?:验证码|人机验证|安全验证|滑块验证|captcha)/i;",
    "  var riskPattern = /(?:风险控制|风控|访问过于频繁|操作过于频繁|请求过于频繁)/i;",
    "  var rejectionMatcher = new RegExp(rejectionPattern, 'i');",
    "  var outcomeText = bodyText + ' ' + observedDialogMessages.join(' ');",
    "  var blockingCode = loginPattern.test(outcomeText) ? 'LOGIN_REQUIRED' : captchaPattern.test(outcomeText) ? 'CAPTCHA_REQUIRED' : riskPattern.test(outcomeText) ? 'RISK_CONTROL_REQUIRED' : null;",
    "  var hasExplicitRejection = rejectionMatcher.test(outcomeText);",
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
    "  return { url: currentUrl, detailUrls: detailUrls, responseUrls: observedResponseUrls.slice(0, 64), dialogMessages: observedDialogMessages.slice(0, 8), blockingCode: blockingCode, hasExplicitRejection: hasExplicitRejection, hasDetailPageSignals: hasDetailPageSignals, hasSubmissionForm: hasSubmissionForm };",
  ].join("\n");
}

function buildSubmitAndObserveScript() {
  return [
    "  var responseUrls = [];",
    "  var dialogMessages = [];",
    "  var responseHandler = function(response) {",
    "    try {",
    "      var responseUrl = String(response.url() || '');",
    "      if (responseUrl) responseUrls.push(responseUrl);",
    "      var headers = response.headers();",
    "      var location = headers && (headers.location || headers.Location);",
    "      if (location) responseUrls.push(new URL(String(location), page.url()).href);",
    "    } catch (_) {}",
    "  };",
    "  var dialogHandler = function(dialog) {",
    "    try { dialogMessages.push(String(dialog.message() || '')); } catch (_) {}",
    "    try { dialog.dismiss(); } catch (_) {}",
    "  };",
    "  page.on('response', responseHandler);",
    "  page.on('dialog', dialogHandler);",
    "  try {",
    "    await page.locator(" +
      JSON.stringify(LIEJU.selectors.submitBtn) +
      ").click({ noWaitAfter: true });",
    "    try { await page.waitForLoadState('domcontentloaded', { timeout: 5000 }); } catch (_) {}",
    "    try { await page.waitForTimeout(250); } catch (_) {}",
    buildPostSubmitEvidenceScript(),
    "  } finally {",
    "    try { page.off('response', responseHandler); } catch (_) {}",
    "    try { page.off('dialog', dialogHandler); } catch (_) {}",
    "  }",
  ].join("\n");
}

function evidenceCandidates(evidence) {
  if (typeof evidence === "string") return [evidence];
  if (!evidence || typeof evidence !== "object") return [];
  var candidates = [];
  for (var key of ["url", "remoteUrl", "detailUrl"]) {
    if (typeof evidence[key] === "string") candidates.push(evidence[key]);
  }
  if (Array.isArray(evidence.responseUrls)) {
    candidates = candidates.concat(
      evidence.responseUrls.filter(function (value) {
        return typeof value === "string";
      }),
    );
  }
  if (
    evidence.hasDetailPageSignals === true &&
    Array.isArray(evidence.detailUrls)
  ) {
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
    ["LOGIN_REQUIRED", "CAPTCHA_REQUIRED", "RISK_CONTROL_REQUIRED"].includes(
      evidence.blockingCode,
    )
  ) {
    return {
      status: "group_blocked",
      errorCode: evidence.blockingCode,
      articleRecoverable: true,
    };
  }
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

function verifyPostSubmit(runtime, initialEvidence) {
  var lastOutcome = null;
  function check(evidence) {
    var value = evidence;
    if (value === undefined) {
      value = null;
      try {
        value = runtime.evaluate(buildPostSubmitEvidenceScript());
      } catch (_) {
        return false;
      }
    }
    var outcome = normalizePostSubmitEvidence(value);
    if (!outcome) return false;
    lastOutcome = outcome;
    return true;
  }

  if (check(initialEvidence)) return lastOutcome;
  var timeoutMs = postSubmitVerificationTimeout(runtime);
  if (timeoutMs === 0)
    return { status: "uncertain", errorCode: "REMOTE_RESULT_UNKNOWN" };
  if (
    waitForCondition(
      function () {
        return check();
      },
      {
        timeoutMs: timeoutMs,
        intervalMs: postSubmitVerificationPoll(runtime),
      },
    ) &&
    lastOutcome
  ) {
    return lastOutcome;
  }
  return { status: "uncertain", errorCode: "REMOTE_RESULT_UNKNOWN" };
}

function defaultImagePlan() {
  return Object.freeze({
    requestedCount: 0,
    selectedCount: 0,
    textOnly: true,
    images: Object.freeze([]),
    warnings: Object.freeze([]),
  });
}

async function ensureAccountInspectionReady(runtime, options) {
  if (selectedSubmissionTransport(runtime) === "browser") {
    runtime.accountInspection = null;
    return ensureBrowserAccountInspectionReady(runtime, options);
  }
  try {
    runtime.accountInspection = await inspectAccountThroughHttp(runtime);
    return;
  } catch (error) {
    if (!selectBrowserFallback(runtime, error)) throw error;
    runtime.accountInspection = null;
    return ensureBrowserAccountInspectionReady(runtime, options);
  }
}

function inspectAccount(runtime) {
  return runtime.accountInspection || inspectAccountInBrowser(runtime);
}

function requireLiejuFormOverrides(form, evidence, profile) {
  const values = {
    "postdb[title]": evidence.title,
    "postdb[content]": evidence.body,
    "postdb[mobphone]": profile.phone,
    "postdb[linkman]": profile.contact,
  };
  if (typeof form.zoneId !== "string" || !form.zoneId)
    throw liejuPreparationError("LIEJU_PUBLICATION_ZONE_UNAVAILABLE");
  values["postdb[zone_id]"] = form.zoneId;

  const controls = Array.isArray(form.controls) ? form.controls : [];
  for (const name of Object.keys(values)) {
    const matched = controls.filter((control) => control.name === name);
    if (
      matched.length !== 1 ||
      matched[0].type === "hidden" ||
      matched[0].type === "file"
    )
      throw liejuPreparationError("LIEJU_PUBLICATION_FORM_FIELDS_INVALID");
  }
  return Object.freeze(values);
}

function liejuPreparationError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function requireAuthenticatedHttpSession(probe) {
  if (probe && probe.status === "authenticated") return;
  throw liejuPreparationError("LOGIN_REQUIRED");
}

function requireHttpPublicationResponse(response) {
  if (response && response.status !== 401 && response.status !== 403)
    return response;
  throw liejuPreparationError("LOGIN_REQUIRED");
}

function diagnoseHttpSubmit(outcome) {
  if (outcome.status === "accepted")
    diagnose("LIEJU_HTTP_SUBMIT_ACCEPTED", "remote", "http-submit");
  else if (outcome.status === "article_rejected")
    diagnose("LIEJU_HTTP_SUBMIT_REJECTED", "remote", "http-submit");
  else if (outcome.status === "group_blocked")
    diagnose("LIEJU_HTTP_SUBMIT_BLOCKED", "remote", "http-submit");
  else diagnose("LIEJU_HTTP_SUBMIT_UNCERTAIN", "remote", "http-submit");
}

function createHttpSubmitCapability(runtime, action, multipart) {
  let submissionStarted = false;
  return async function submitPreparedPublication() {
    if (submissionStarted)
      return Object.freeze({
        status: "uncertain",
        errorCode: "REMOTE_RESULT_UNKNOWN",
      });
    submissionStarted = true;
    diagnose("LIEJU_HTTP_SUBMIT_STARTED", "remote", "http-submit");
    try {
      const payload = multipart.consume();
      const result = await runtime
        .createHttpSession()
        .withSubmissionPort((port) =>
          port.post(action, {
            body: payload.body.getBuffer(),
            headers: payload.headers,
          }),
        );
      const outcome = result.stateSaved
        ? classifyLiejuHttpSubmitResponse(result.result)
        : Object.freeze({
            status: "uncertain",
            errorCode: "REMOTE_RESULT_UNKNOWN",
          });
      diagnoseHttpSubmit(outcome);
      return outcome;
    } catch (_) {
      const outcome = Object.freeze({
        status: "uncertain",
        errorCode: "REMOTE_RESULT_UNKNOWN",
      });
      diagnoseHttpSubmit(outcome);
      return outcome;
    }
  };
}

function createPreparedEvidence(claim) {
  const sourceEvidence =
    domain.createTextOnlyPreparedSubmissionEvidenceV1(claim);
  const body = renderLiejuPlainText(sourceEvidence.body);
  return domain.parsePreparedSubmissionEvidenceV1({
    ...sourceEvidence,
    body,
    contentFingerprint: domain.preparedContentFingerprint({
      title: sourceEvidence.title,
      body,
    }),
  });
}

function prepareFrozenMultipart(runtime, form, evidence, profile, imagePlan) {
  return prepareLiejuImageMultipart({
    clientId: evidence.articleIdentityV1.clientId,
    imagePlan: imagePlan === undefined ? defaultImagePlan() : imagePlan,
    form,
    preparedSubmissionEvidenceV1: evidence,
    imageResolver: runtime.imageResolver,
    formValueOverrides: requireLiejuFormOverrides(form, evidence, profile),
  });
}

async function prepareHttpPublicationForm(runtime, profile) {
  return runtime.createHttpSession().withGetPort(async function (port) {
    requireAuthenticatedHttpSession(await port.probeLogin());
    const cityResponse = requireHttpPublicationResponse(
      await port.get(httpFormParser.CITY_DIRECTORY_URL),
    );
    const city = httpFormParser.resolveLiejuCityTarget(
      httpFormParser.decodeLiejuHttpHtml(cityResponse).html,
      profile.city,
    );
    const formResponse = requireHttpPublicationResponse(
      await port.get(city.url),
    );
    const decodedForm = httpFormParser.decodeLiejuHttpHtml(formResponse);
    return httpFormParser.parseLiejuPublicationForm(decodedForm.html, city, {
      charset: decodedForm.charset,
    });
  });
}

function browserPageHtml(runtime) {
  const html = runtime.evaluate("  return await page.content();\n");
  if (typeof html !== "string" || !html) {
    throw liejuPreparationError("LIEJU_PUBLICATION_FORM_INVALID");
  }
  return html;
}

async function ensureBrowserSubmissionReady(runtime) {
  throwIfStopped();
  const wasAlive = runtime.lifecycle.isAlive();
  runtime.lifecycle.ensureStarted();
  if (!wasAlive) {
    try {
      runtime.lifecycle.loadSavedState();
    } catch (_) {
      diagnose("PLATFORM_LOGIN_STATE_LOAD_FAILED", "storage", "state-load");
    }
  }
  runtime.invoke(["goto", LIEJU.publishUrl], { timeout: 20000 });
  waitForLoginState(runtime, PUBLISH_PAGE_LOGIN_CHECK_MS);
  throwIfStopped();
  if (checkLoginInCurrentPage(runtime)) return;

  diagnose("PLATFORM_LOGIN_REQUIRED", "authentication", "publish-auth-check");
  const relogged = await doLogin(runtime, {});
  if (!relogged || !checkLogin(runtime)) {
    throw liejuPreparationError("LOGIN_REQUIRED");
  }
  throwIfStopped();
  runtime.lifecycle.saveState();
  runtime.invoke(["goto", LIEJU.publishUrl], { timeout: 20000 });
  waitForLoginState(runtime, PUBLISH_PAGE_LOGIN_CHECK_MS);
  if (!checkLoginInCurrentPage(runtime)) {
    throw liejuPreparationError("LOGIN_REQUIRED");
  }
}

async function prepareBrowserPublicationForm(runtime, profile) {
  await ensureBrowserSubmissionReady(runtime);
  runtime.invoke(["goto", httpFormParser.CITY_DIRECTORY_URL], {
    timeout: 20000,
  });
  throwIfStopped();
  const city = httpFormParser.resolveLiejuCityTarget(
    browserPageHtml(runtime),
    profile.city,
  );
  runtime.invoke(["goto", city.url], { timeout: 20000 });
  throwIfStopped();
  return httpFormParser.parseLiejuPublicationForm(
    browserPageHtml(runtime),
    city,
  );
}

function fieldSelector(name) {
  return "[name=" + JSON.stringify(name) + "]";
}

function buildFrozenFormFillScript(browserForm) {
  const payload = browserForm || {};
  const values = Array.isArray(payload.values) ? payload.values : [];
  const files = Array.isArray(payload.files) ? payload.files : [];
  let code = "";

  for (const field of values) {
    if (
      !field ||
      typeof field.name !== "string" ||
      typeof field.value !== "string"
    )
      throw liejuPreparationError("LIEJU_PUBLICATION_FORM_FIELDS_INVALID");
    const selector = fieldSelector(field.name);
    code += "  var field = page.locator(" + JSON.stringify(selector) + ");\n";
    code +=
      "  if (await field.count() !== 1) throw new Error('form field unavailable');\n";
    if (field.name === "postdb[zone_id]") {
      code +=
        "  await field.selectOption(" + JSON.stringify(field.value) + ");\n";
    } else {
      code += "  await field.fill(" + JSON.stringify(field.value) + ");\n";
    }
  }

  for (const file of files) {
    if (
      !file ||
      typeof file.fieldName !== "string" ||
      !/^local_file[1-9][0-9]*$/.test(file.fieldName) ||
      typeof file.filename !== "string" ||
      typeof file.mimeType !== "string" ||
      !Buffer.isBuffer(file.bytes)
    ) {
      throw liejuPreparationError("LIEJU_MULTIPART_FORM_INVALID");
    }
    const selector = fieldSelector(file.fieldName);
    code +=
      "  var fileField = page.locator(" + JSON.stringify(selector) + ");\n";
    code +=
      "  if (await fileField.count() !== 1) throw new Error('image field unavailable');\n";
    code +=
      "  await fileField.setInputFiles({ name: " +
      JSON.stringify(file.filename) +
      ", mimeType: " +
      JSON.stringify(file.mimeType) +
      ", buffer: Buffer.from(" +
      JSON.stringify(file.bytes.toString("base64")) +
      ", 'base64') });\n";
  }
  return code;
}

function frozenFormMatches(runtime, browserForm) {
  const values =
    browserForm && Array.isArray(browserForm.values) ? browserForm.values : [];
  const files =
    browserForm && Array.isArray(browserForm.files) ? browserForm.files : [];
  let code = "";
  for (const field of values) {
    const selector = fieldSelector(field.name);
    code += "  var field = page.locator(" + JSON.stringify(selector) + ");\n";
    code += "  if (await field.count() !== 1) return false;\n";
    code +=
      "  if (await field.inputValue() !== " +
      JSON.stringify(field.value) +
      ") return false;\n";
  }
  for (const file of files) {
    const selector = fieldSelector(file.fieldName);
    code +=
      "  var fileField = page.locator(" + JSON.stringify(selector) + ");\n";
    code += "  if (await fileField.count() !== 1) return false;\n";
    code += "  var selectedFile = await fileField.inputValue();\n";
    code +=
      "  if (!String(selectedFile || '').replace(/\\\\/g, '/').endsWith(" +
      JSON.stringify("/" + file.filename) +
      ")) return false;\n";
  }
  code += "  return true;\n";
  try {
    return runtime.evaluate(code) === true;
  } catch (_) {
    return false;
  }
}

function createBrowserSubmitCapability(runtime, browserForm) {
  let submissionStarted = false;
  return async function submitPreparedPublication() {
    if (submissionStarted)
      return Object.freeze({
        status: "uncertain",
        errorCode: "REMOTE_RESULT_UNKNOWN",
      });
    submissionStarted = true;
    diagnose("PLATFORM_SUBMIT_STARTED", "remote", "submit");
    try {
      throwIfStopped();
      if (!frozenFormMatches(runtime, browserForm)) {
        diagnose("PLATFORM_SUBMIT_UNCERTAIN", "remote", "submit");
        return Object.freeze({
          status: "uncertain",
          errorCode: "PREPARED_CONTENT_DRIFT",
        });
      }
      const initialEvidence = runtime.evaluate(buildSubmitAndObserveScript());
      const outcome = verifyPostSubmit(runtime, initialEvidence);
      if (outcome.status === "accepted")
        diagnose("PLATFORM_SUBMIT_ACCEPTED", "remote", "submit");
      else if (outcome.status === "article_rejected")
        diagnose("PLATFORM_SUBMIT_REJECTED", "remote", "submit");
      else diagnose("PLATFORM_SUBMIT_UNCERTAIN", "remote", "submit");
      return outcome;
    } catch (error) {
      if (isStopError(error))
        return Object.freeze({
          status: "group_blocked",
          errorCode: "STOP_REQUESTED",
        });
      diagnose("PLATFORM_SUBMIT_UNCERTAIN", "remote", "submit");
      return Object.freeze({
        status: "uncertain",
        errorCode: "REMOTE_RESULT_UNKNOWN",
      });
    }
  };
}

async function prepareBrowserPlatformSubmission(
  runtime,
  evidence,
  profile,
  imagePlan,
) {
  const form = await prepareBrowserPublicationForm(runtime, profile);
  const prepared = prepareFrozenMultipart(
    runtime,
    form,
    evidence,
    profile,
    imagePlan,
  );
  const browserForm = prepared.multipart.consumeBrowserForm();
  runtime.evaluate(buildFrozenFormFillScript(browserForm));
  diagnose("PLATFORM_FORM_FILLED", "remote", "form-fill");
  return domain.createPreparedSubmission({
    preparedSubmissionEvidenceV1: prepared.preparedSubmissionEvidenceV1,
    submitPreparedPublication: createBrowserSubmitCapability(
      runtime,
      browserForm,
    ),
  });
}

async function preparePlatformSubmission(runtime, claim, imagePlan) {
  throwIfStopped();
  const evidence = createPreparedEvidence(claim);
  const profile = requireLiejuPublicationProfile(claim);
  if (selectedSubmissionTransport(runtime) === "browser") {
    return prepareBrowserPlatformSubmission(
      runtime,
      evidence,
      profile,
      imagePlan,
    );
  }
  let form;
  try {
    form = await prepareHttpPublicationForm(runtime, profile);
  } catch (error) {
    if (!selectBrowserFallback(runtime, error)) throw error;
    return prepareBrowserPlatformSubmission(
      runtime,
      evidence,
      profile,
      imagePlan,
    );
  }
  throwIfStopped();
  const prepared = prepareFrozenMultipart(
    runtime,
    form,
    evidence,
    profile,
    imagePlan,
  );
  return domain.createPreparedSubmission({
    preparedSubmissionEvidenceV1: prepared.preparedSubmissionEvidenceV1,
    submitPreparedPublication: createHttpSubmitCapability(
      runtime,
      form.action,
      prepared.multipart,
    ),
  });
}

function requireLiejuPublicationProfile(claim) {
  const profile = claim && claim.publicationProfile;
  const fields = ["city", "contact", "phone"];
  const missing = fields.filter(
    (field) =>
      !profile ||
      typeof profile[field] !== "string" ||
      profile[field].trim() === "",
  );
  if (missing.length) {
    const error = new Error("Lieju publication profile is incomplete");
    error.code = "REGULAR_CONTENT_INVALID";
    error.missingFields = missing;
    throw error;
  }
  return Object.freeze(
    Object.fromEntries(fields.map((field) => [field, profile[field].trim()])),
  );
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
    imagePublishingCapability: Object.freeze({ supported: true }),
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
    preparePlatformSubmission: function (claim, imagePlan) {
      return preparePlatformSubmission(runtime, claim, imagePlan);
    },
    withHttpGetPort: function (operation) {
      return runtime.createHttpSession().withGetPort(operation);
    },
    saveSession: function () {
      return runtime.lifecycle.saveState();
    },
    closeSession: function () {
      return runtime.lifecycle.close();
    },
  };
}

module.exports = {
  createPlatformAdapter: createLiejuAdapter,
  httpFormParser,
  createLiejuHttpSession,
};
