"use strict";

const path = require("node:path");
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
  throwIfStopped,
  waitForCondition,
} = require("../../core/operator-flow");
const {
  createBrowserSessionLifecycle,
  createStateFileLease,
} = require("../shared/browser-session-lifecycle");
const httpFormParser = require("./http-form-parser");
const { createLiejuHttpSession } = require("./http-session");
const { classifyLiejuHttpSubmitResponse } = require("./http-outcome");
const { prepareLiejuImageMultipart } = require("./image-multipart-preparation");
const { renderLiejuPlainText } = require("./plain-text-renderer");

const LOGIN_STATE_SETTLE_MS = 5000;
const FAST_POLL_MS = 500;

function nonEmptyString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function createLiejuRuntime(runtimeContext) {
  const context = runtimeContext || {};
  const browserRuntime = context.browserRuntime || {};
  const workspacePaths = context.workspacePaths || {};
  const profileRoot =
    nonEmptyString(browserRuntime.profileRoot) ||
    nonEmptyString(workspacePaths.browser);
  const daemonRoot =
    nonEmptyString(browserRuntime.daemonRoot) ||
    (profileRoot ? path.join(profileRoot, "sessions") : "");
  const stateDir =
    nonEmptyString(browserRuntime.stateDir) ||
    (profileRoot ? path.join(profileRoot, "state") : DIRS.stateDir);
  const sessionInput = { session: "lieju" };

  if (profileRoot) {
    sessionInput.profileDir = path.join(profileRoot, "profiles", "lieju");
    sessionInput.daemonDir = path.join(daemonRoot, "lieju");
    sessionInput.stateFile = path.join(stateDir, "lieju.json");
  } else {
    if (nonEmptyString(browserRuntime.profileDir))
      sessionInput.profileDir = browserRuntime.profileDir;
    if (nonEmptyString(browserRuntime.daemonDir))
      sessionInput.daemonDir = browserRuntime.daemonDir;
    else if (daemonRoot)
      sessionInput.daemonDir = path.join(daemonRoot, "lieju");
    if (nonEmptyString(browserRuntime.stateFile))
      sessionInput.stateFile = browserRuntime.stateFile;
    else if (nonEmptyString(browserRuntime.stateDir))
      sessionInput.stateFile = path.join(stateDir, "lieju.json");
  }

  const session = Object.assign({}, pwSessionConfig(sessionInput));
  if (!nonEmptyString(session.stateFile))
    session.stateFile = sessionInput.stateFile || path.join(stateDir, "lieju.json");

  const runtimeOptions = {
    browserChannel:
      nonEmptyString(browserRuntime.browserChannel) || PW.browserChannel,
    tempDir:
      nonEmptyString(browserRuntime.tempDir) ||
      nonEmptyString(workspacePaths.tmp) ||
      DIRS.tmpDir,
  };
  if (nonEmptyString(browserRuntime.playwrightCliJs))
    runtimeOptions.playwrightCli = browserRuntime.playwrightCliJs;
  if (nonEmptyString(browserRuntime.nodeExecPath))
    runtimeOptions.nodeExecPath = browserRuntime.nodeExecPath;

  function invoke(commandArgs, options) {
    return pwInvokeSync(
      commandArgs,
      Object.assign({}, runtimeOptions, options || {}, { session }),
    );
  }

  function evaluate(jsCode, options) {
    return runCode(
      jsCode,
      Object.assign({}, runtimeOptions, options || {}, { session }),
    );
  }

  const lifecycle = createBrowserSessionLifecycle({
    session,
    stateDir: path.dirname(session.stateFile),
    run: invoke,
    ensureDir,
    sleep,
    stateLease: createStateFileLease({ stateFile: session.stateFile }),
    atomicStateSave: true,
    start() {
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
    invoke,
    evaluate,
    lifecycle,
    imageAssetReader: context.imageAssetReader,
    accountInspection: null,
    preparationCache: new Map(),
    createHttpSession() {
      return createLiejuHttpSession({
        stateFile: session.stateFile,
        stateLease: createStateFileLease({ stateFile: session.stateFile }),
        request: context.httpRequest,
        loginProbeUrl: LIEJU.publishUrl,
      });
    },
  };
}

function diagnose(code, category, action) {
  reportDiagnostic({
    code,
    module: "platform-lieju",
    category,
    operationId: "platform-lieju",
    metadata: { platformId: "lieju", action },
  });
}

function hasLoginIndicator(runtime) {
  try {
    return Boolean(
      runtime.evaluate(
        "  var locator = page.locator(" +
          JSON.stringify(LIEJU.selectors.loginIndicator) +
          ").first();\n" +
          "  return await locator.count() > 0;\n",
      ),
    );
  } catch (_) {
    return false;
  }
}

function waitForLoginState(runtime, timeoutMs) {
  return waitForCondition(
    () => hasLoginIndicator(runtime),
    { timeoutMs, intervalMs: FAST_POLL_MS },
  );
}

function checkLogin(runtime) {
  try {
    runtime.invoke(["goto", LIEJU.base], { timeout: 20000 });
    return waitForLoginState(runtime, LOGIN_STATE_SETTLE_MS);
  } catch (_) {
    return false;
  }
}

function openLogin(runtime) {
  runtime.lifecycle.ensureStarted();
  try {
    runtime.lifecycle.loadSavedState();
  } catch (_) {
    diagnose("PLATFORM_LOGIN_STATE_LOAD_FAILED", "storage", "state-load");
  }
  runtime.invoke(["goto", LIEJU.loginUrl], { timeout: 15000 });
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

function requireAuthenticatedHttpSession(probe) {
  if (probe && probe.status === "authenticated") return;
  throw liejuPreparationError("LOGIN_REQUIRED");
}

function requireHttpPublicationResponse(response) {
  if (response && response.status !== 401 && response.status !== 403)
    return response;
  throw liejuPreparationError("LOGIN_REQUIRED");
}

async function inspectAccountThroughHttp(runtime) {
  return runtime.createHttpSession().withGetPort(async (port) => {
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

async function ensureAccountInspectionReady(runtime) {
  runtime.accountInspection = await inspectAccountThroughHttp(runtime);
}

function inspectAccount(runtime) {
  return runtime.accountInspection || Object.freeze({ verified: false });
}

function defaultImagePlan() {
  return Object.freeze({
    version: 1,
    requestedCount: 0,
    selectedCount: 0,
    textOnly: true,
    images: Object.freeze([]),
    warnings: Object.freeze([]),
  });
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

function diagnoseHttpSubmit(outcome) {
  if (outcome.status === "accepted")
    diagnose("LIEJU_HTTP_SUBMIT_ACCEPTED", "remote", "http-submit");
  else if (outcome.status === "article_rejected")
    diagnose("LIEJU_HTTP_SUBMIT_REJECTED", "remote", "http-submit");
  else if (outcome.status === "group_blocked")
    diagnose("LIEJU_HTTP_SUBMIT_BLOCKED", "remote", "http-submit");
  else
    diagnose("LIEJU_HTTP_SUBMIT_UNCERTAIN", "remote", "http-submit");
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
      const outcome = classifyLiejuHttpSubmitResponse(result.result);
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
  const sourceEvidence = domain.createTextOnlyPreparedSubmissionEvidenceV1(claim);
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
    imageAssetReader: runtime.imageAssetReader,
    formValueOverrides: requireLiejuFormOverrides(form, evidence, profile),
  });
}

async function prepareHttpPublicationForm(runtime, profile) {
  return runtime.createHttpSession().withGetPort(async (port) => {
    requireAuthenticatedHttpSession(await port.probeLogin());
    const cityResponse = requireHttpPublicationResponse(
      await port.get(httpFormParser.CITY_DIRECTORY_URL),
    );
    let city;
    try {
      city = httpFormParser.resolveLiejuCityTarget(
        httpFormParser.decodeLiejuHttpHtml(cityResponse).html,
        profile.city,
      );
    } catch (error) {
      if (!error || error.code !== "LIEJU_CITY_TARGET_UNAVAILABLE") throw error;
      city = Object.freeze({
        cityId: "1",
        url: "https://post.lieju.com/1/239",
        selection: "beijing_fallback",
      });
    }

    const formResponse = requireHttpPublicationResponse(await port.get(city.url));
    const decodedForm = httpFormParser.decodeLiejuHttpHtml(formResponse);
    return httpFormParser.parseLiejuPublicationForm(decodedForm.html, city, {
      charset: decodedForm.charset,
    });
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

async function preparePlatformSubmission(runtime, claim, imagePlan) {
  throwIfStopped();
  const evidence = createPreparedEvidence(claim);
  const profile = requireLiejuPublicationProfile(claim);
  const contextId = claim && claim.preparationContextId;
  const formVersion =
    claim &&
    typeof claim.preparationFormVersion === "string" &&
    claim.preparationFormVersion
      ? claim.preparationFormVersion
      : "default";
  const cacheKey = contextId
    ? [contextId, profile.city, formVersion].join("\u0000")
    : null;

  let form;
  if (cacheKey && runtime.preparationCache.has(cacheKey))
    form = runtime.preparationCache.get(cacheKey);
  else {
    form = await prepareHttpPublicationForm(runtime, profile);
    if (cacheKey) runtime.preparationCache.set(cacheKey, form);
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

function createLiejuAdapter(runtimeContext) {
  const runtime = createLiejuRuntime(runtimeContext);
  return Object.freeze({
    ensureSession() {
      return runtime.lifecycle.ensureStarted();
    },
    openLogin() {
      return openLogin(runtime);
    },
    checkLogin() {
      return checkLogin(runtime);
    },
    ensureAccountInspectionReady() {
      return ensureAccountInspectionReady(runtime);
    },
    inspectAccount() {
      return inspectAccount(runtime);
    },
    preparePlatformSubmission(claim, imagePlan) {
      return preparePlatformSubmission(runtime, claim, imagePlan);
    },
    saveSession() {
      return runtime.lifecycle.saveState();
    },
    closeSession() {
      return runtime.lifecycle.close();
    },
  });
}

module.exports = {
  createPlatformAdapter: createLiejuAdapter,
  httpFormParser,
  createLiejuHttpSession,
};
