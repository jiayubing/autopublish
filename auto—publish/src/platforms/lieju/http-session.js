"use strict";

const fs = require("node:fs");
const { request: playwrightRequest } = require("playwright");
const { LIEJU } = require("../../../scripts/config");
const { reportDiagnostic } = require("../../diagnostics/diagnostic-producer");
const { createStateFileLease } = require("../shared/browser-session-lifecycle");

const MAX_REDIRECTS = 5;
let nextTemporaryStateId = 0;

function sessionError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function forbidSerialization() {
  throw sessionError(
    "LIEJU_HTTP_RESPONSE_SERIALIZATION_FORBIDDEN",
    "Lieju HTTP response serialization is forbidden",
  );
}

function safeLiejuUrl(value) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (
      url.protocol !== "https:" ||
      url.port ||
      url.username ||
      url.password ||
      (host !== "post.lieju.com" && host !== "www.lieju.com")
    )
      return null;
    return url;
  } catch (_) {
    return null;
  }
}

function safeLiejuResponseUrl(value) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (
      url.protocol !== "https:" ||
      url.port ||
      url.username ||
      url.password ||
      (host !== "lieju.com" && !host.endsWith(".lieju.com"))
    )
      return null;
    return url;
  } catch (_) {
    return null;
  }
}

function safeLiejuSubmissionUrl(value) {
  const url = safeLiejuUrl(value);
  if (
    !url ||
    url.hostname.toLowerCase() !== "post.lieju.com" ||
    !/^\/\d{1,20}\/239$/.test(url.pathname) ||
    url.hash ||
    url.searchParams.size !== 1 ||
    url.searchParams.getAll("action").length !== 1 ||
    url.searchParams.get("action") !== "postnew"
  )
    return null;
  return url;
}

function responseContentType(headers) {
  const entries = Object.entries(headers || {});
  const found = entries.find(function ([name]) {
    return name.toLowerCase() === "content-type";
  });
  return found && typeof found[1] === "string" ? found[1] : "";
}

function redirectLocation(headers, currentUrl) {
  const location = Object.entries(headers || {}).find(function ([name]) {
    return name.toLowerCase() === "location";
  });
  if (!location || typeof location[1] !== "string") return null;
  try {
    return new URL(location[1], currentUrl).toString();
  } catch (_) {
    return null;
  }
}

function isRedirect(status) {
  return status >= 300 && status <= 399;
}

function isAuthenticatedProbeResponse(response) {
  const url = safeLiejuUrl(response.url);
  return Boolean(
    url &&
    response.status >= 200 &&
    response.status <= 299 &&
    url.hostname.toLowerCase() === "post.lieju.com" &&
    /^\/\d{1,20}\/239$/.test(url.pathname),
  );
}

function isExpiredProbeResponse(response) {
  const url = safeLiejuUrl(response.url);
  return Boolean(
    response.status === 401 ||
    response.status === 403 ||
    (url &&
      url.hostname.toLowerCase() === "www.lieju.com" &&
      /^\/login\/?$/i.test(url.pathname)),
  );
}

function createLiejuHttpSession(options) {
  const opts = options || {};
  const stateFile = opts.stateFile;
  const io = opts.fs || fs;
  const request = opts.request || playwrightRequest;
  const stateLease =
    opts.stateLease || createStateFileLease({ stateFile: stateFile, fs: io });
  if (
    typeof stateFile !== "string" ||
    !stateFile ||
    !request ||
    typeof request.newContext !== "function"
  )
    throw new Error("Lieju HTTP session dependencies are required");

  let context = null;
  let closed = false;
  let receivedValidResponse = false;
  let submissionResponseObserved = false;

  function diagnose(code, category, action) {
    const event = {
      code,
      module: "platform-lieju-http",
      category,
      operationId: "platform-lieju-http",
      metadata: { platformId: "lieju", action },
    };
    if (typeof opts.diagnose === "function") opts.diagnose(event);
    else reportDiagnostic(event);
  }

  async function open() {
    if (closed)
      throw sessionError("LIEJU_HTTP_SESSION_CLOSED", "HTTP session is closed");
    if (context) return;
    stateLease.acquire();
    try {
      if (!io.existsSync(stateFile))
        throw sessionError(
          "LIEJU_HTTP_STATE_MISSING",
          "Lieju HTTP session state is missing",
        );
      context = await request.newContext({ storageState: stateFile });
    } catch (error) {
      try {
        stateLease.release();
      } catch (_) {
        diagnose("LIEJU_HTTP_STATE_LEASE_RELEASE_FAILED", "storage", "lease");
      }
      if (error && error.code === "LIEJU_HTTP_STATE_MISSING") throw error;
      throw sessionError(
        "LIEJU_HTTP_STATE_INVALID",
        "Lieju HTTP session state is invalid",
      );
    }
  }

  async function get(url, options) {
    const opts = options || {};
    let currentUrl = safeLiejuUrl(url);
    if (!currentUrl)
      throw sessionError("LIEJU_HTTP_URL_INVALID", "Lieju HTTP URL is invalid");
    await open();

    for (
      let redirectCount = 0;
      redirectCount <= MAX_REDIRECTS;
      redirectCount += 1
    ) {
      let response;
      try {
        response = await context.get(currentUrl.toString(), {
          timeout: Number.isFinite(opts.timeoutMs) ? opts.timeoutMs : 20000,
          maxRedirects: 0,
          failOnStatusCode: false,
        });
      } catch (_) {
        throw sessionError("LIEJU_HTTP_GET_FAILED", "Lieju HTTP GET failed");
      }

      const status = response.status();
      const headers = response.headers();
      if (isRedirect(status)) {
        const redirectedUrl = safeLiejuUrl(
          redirectLocation(headers, currentUrl),
        );
        if (!redirectedUrl)
          throw sessionError(
            "LIEJU_HTTP_REDIRECT_UNSAFE",
            "Lieju HTTP redirect is unsafe",
          );
        if (redirectCount === MAX_REDIRECTS)
          throw sessionError(
            "LIEJU_HTTP_REDIRECT_LIMIT",
            "Lieju HTTP redirect limit exceeded",
          );
        currentUrl = redirectedUrl;
        continue;
      }

      const responseUrl = safeLiejuUrl(response.url());
      if (!responseUrl)
        throw sessionError(
          "LIEJU_HTTP_RESPONSE_URL_UNSAFE",
          "Lieju HTTP response URL is unsafe",
        );
      let body;
      try {
        body = await response.body();
      } catch (_) {
        throw sessionError(
          "LIEJU_HTTP_BODY_UNAVAILABLE",
          "Lieju HTTP response body is unavailable",
        );
      }
      if (status >= 200 && status <= 299) receivedValidResponse = true;
      return Object.freeze({
        url: responseUrl.toString(),
        status,
        contentType: responseContentType(headers),
        body: Buffer.from(body),
        toJSON: forbidSerialization,
      });
    }
    throw sessionError(
      "LIEJU_HTTP_REDIRECT_LIMIT",
      "Lieju HTTP redirect limit exceeded",
    );
  }

  async function post(url, input) {
    const target = safeLiejuSubmissionUrl(url);
    const payload = input || {};
    if (!target)
      throw sessionError(
        "LIEJU_HTTP_SUBMIT_URL_INVALID",
        "Lieju HTTP submission URL is invalid",
      );
    if (!Buffer.isBuffer(payload.body) || !payload.headers)
      throw sessionError(
        "LIEJU_HTTP_SUBMIT_PAYLOAD_INVALID",
        "Lieju HTTP submission payload is invalid",
      );
    await open();

    let response;
    try {
      response = await context.post(target.toString(), {
        data: Buffer.from(payload.body),
        headers: payload.headers,
        timeout: Number.isFinite(payload.timeoutMs) ? payload.timeoutMs : 20000,
        maxRedirects: 0,
        maxRetries: 0,
        failOnStatusCode: false,
      });
    } catch (_) {
      throw sessionError("LIEJU_HTTP_POST_FAILED", "Lieju HTTP POST failed");
    }

    const status = response.status();
    const headers = response.headers();
    const responseUrl = safeLiejuUrl(response.url());
    if (!responseUrl)
      throw sessionError(
        "LIEJU_HTTP_RESPONSE_URL_UNSAFE",
        "Lieju HTTP response URL is unsafe",
      );
    // A submission response can update the authenticated storage state even
    // when its body, redirect, or result classification later proves unsafe.
    // Preserve that state best-effort, but let a failed save make the caller's
    // post-boundary result uncertain.
    submissionResponseObserved = true;
    let redirectUrl = null;
    if (isRedirect(status)) {
      redirectUrl = safeLiejuResponseUrl(redirectLocation(headers, target));
      if (!redirectUrl)
        throw sessionError(
          "LIEJU_HTTP_REDIRECT_UNSAFE",
          "Lieju HTTP redirect is unsafe",
        );
    }
    let body;
    try {
      body = await response.body();
    } catch (_) {
      throw sessionError(
        "LIEJU_HTTP_BODY_UNAVAILABLE",
        "Lieju HTTP response body is unavailable",
      );
    }
    if (status >= 200 && status <= 299) receivedValidResponse = true;
    return Object.freeze({
      url: responseUrl.toString(),
      status,
      contentType: responseContentType(headers),
      body: Buffer.from(body),
      redirectUrl: redirectUrl ? redirectUrl.toString() : null,
      toJSON: forbidSerialization,
    });
  }

  async function probeLogin() {
    const response = await get(opts.loginProbeUrl || LIEJU.publishUrl);
    if (isAuthenticatedProbeResponse(response))
      return Object.freeze({ status: "authenticated" });
    if (isExpiredProbeResponse(response))
      return Object.freeze({ status: "expired" });
    return Object.freeze({ status: "unclassified" });
  }

  async function saveState() {
    const temporaryStateFile =
      stateFile + ".tmp-" + process.pid + "-" + ++nextTemporaryStateId;
    try {
      await context.storageState({ path: temporaryStateFile });
      io.renameSync(temporaryStateFile, stateFile);
      diagnose("LIEJU_HTTP_STATE_SAVED", "storage", "state-save");
      return true;
    } catch (_) {
      diagnose("LIEJU_HTTP_STATE_SAVE_FAILED", "storage", "state-save");
      return false;
    } finally {
      try {
        if (io.existsSync(temporaryStateFile))
          io.unlinkSync(temporaryStateFile);
      } catch (_) {
        diagnose(
          "LIEJU_HTTP_STATE_TEMP_CLEANUP_FAILED",
          "storage",
          "state-save",
        );
      }
    }
  }

  async function close() {
    if (closed)
      return Object.freeze({ stateSaveAttempted: false, stateSaved: true });
    closed = true;
    let stateSaveAttempted = false;
    let stateSaved = true;
    try {
      if (context && (receivedValidResponse || submissionResponseObserved)) {
        stateSaveAttempted = true;
        stateSaved = await saveState();
      }
    } finally {
      if (context) {
        try {
          await context.dispose();
        } catch (_) {
          diagnose("LIEJU_HTTP_CONTEXT_CLEANUP_FAILED", "transport", "close");
        }
      }
      try {
        stateLease.release();
      } catch (_) {
        diagnose("LIEJU_HTTP_STATE_LEASE_RELEASE_FAILED", "storage", "lease");
      }
    }
    return Object.freeze({ stateSaveAttempted, stateSaved });
  }

  async function withGetPort(operation) {
    if (typeof operation !== "function")
      throw new Error("Lieju HTTP operation is required");
    await open();
    let result;
    let primaryError = null;
    try {
      result = await operation(Object.freeze({ get, probeLogin }));
    } catch (error) {
      primaryError = error;
    }
    await close();
    if (primaryError) throw primaryError;
    return result;
  }

  async function withSubmissionPort(operation) {
    if (typeof operation !== "function")
      throw new Error("Lieju HTTP submission operation is required");
    await open();
    let result;
    let primaryError = null;
    try {
      result = await operation(Object.freeze({ post }));
    } catch (error) {
      primaryError = error;
    }
    const closeResult = await close();
    if (primaryError) throw primaryError;
    return Object.freeze({ result, stateSaved: closeResult.stateSaved });
  }

  return Object.freeze({ withGetPort, withSubmissionPort });
}

module.exports = { createLiejuHttpSession };
