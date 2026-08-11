"use strict";

const {
  classifyMediaTransportError,
  createMediaError,
  isKnownMediaError,
} = require("./media-errors");
const { reportDiagnostic } = require("../../diagnostics/diagnostic-producer");

const DEFAULT_TIMEOUT_MS = 30000;

function diagnose(code, action) {
  reportDiagnostic({
    code,
    module: "media-transport",
    category: "transport",
    operationId: "media-transport",
    metadata: { action },
  });
}

function timeoutValue(value, fallback) {
  const number = Number(value == null ? fallback : value);
  if (!Number.isInteger(number) || number < 1 || number > 300000) {
    throw createMediaError("MEDIA_CONFIG_INVALID");
  }
  return number;
}

function formRequest(prepared) {
  if (prepared && typeof prepared.getHeaders === "function" && typeof prepared.getBuffer === "function") {
    return { headers: prepared.getHeaders(), body: prepared.getBuffer() };
  }
  if (
    prepared &&
    prepared.headers &&
    (Buffer.isBuffer(prepared.body) || typeof prepared.body === "string" || prepared.body instanceof Uint8Array)
  ) {
    return { headers: prepared.headers, body: prepared.body };
  }
  throw createMediaError("MEDIA_CONFIG_INVALID");
}

class MediaTransport {
  constructor(options) {
    const values = options || {};
    this.fetch = values.fetch || values.fetchImpl || globalThis.fetch;
    this.timeoutMs = timeoutValue(values.timeoutMs, DEFAULT_TIMEOUT_MS);
  }

  async post(options) {
    const values = options || {};
    if (!values.policy || typeof values.policy.authorize !== "function" || typeof values.policy.assertAuthorized !== "function") {
      throw createMediaError("MEDIA_CONFIG_INVALID");
    }
    if (typeof values.prepare !== "function") throw createMediaError("MEDIA_CONFIG_INVALID");

    // The policy gate intentionally runs before the body factory. The factory
    // is the only place where the API key and article fields enter multipart.
    const decision = values.policy.authorize(values.path);
    let request;
    try {
      request = formRequest(values.prepare(decision));
    } catch (error) {
      if (isKnownMediaError(error)) throw error;
      throw createMediaError("MEDIA_CONFIG_INVALID");
    }
    values.policy.assertAuthorized(decision);
    return this._request({
      url: decision.url,
      headers: request.headers,
      body: request.body,
      timeoutMs: values.timeoutMs,
      path: values.path,
      signal: values.signal,
    });
  }

  async _request(options) {
    if (typeof this.fetch !== "function") throw createMediaError("MEDIA_TRANSPORT_UNAVAILABLE");
    const values = options || {};
    const timeoutMs = timeoutValue(values.timeoutMs, this.timeoutMs);
    const controller = new AbortController();
    let response;
    try {
      response = await this._phase(
        () => this.fetch(values.url, {
          method: "POST",
          headers: values.headers,
          body: values.body,
          signal: controller.signal,
          redirect: "manual",
        }),
        "connect",
        timeoutMs,
        controller,
        values.path,
      );
    } catch (error) {
      throw isKnownMediaError(error)
        ? error
        : classifyMediaTransportError(error, "connect", { path: values.path });
    }

    const status = Number(response && response.status);
    if (!Number.isInteger(status) || status < 100 || status > 599) {
      throw createMediaError("MEDIA_PROTOCOL_ERROR", undefined, { path: values.path });
    }
    if (status >= 300 && status < 400) {
      throw createMediaError("MEDIA_REDIRECT_REJECTED", "API 请求拒绝重定向，请显式配置最终 endpoint", {
        path: values.path,
        status,
        phase: "response",
        redirect: true,
      });
    }
    if (!response || typeof response.text !== "function") {
      throw createMediaError("MEDIA_PROTOCOL_ERROR", undefined, { path: values.path });
    }

    let text;
    try {
      text = await this._phase(
        () => response.text(),
        "read",
        timeoutMs,
        controller,
        values.path,
      );
    } catch (error) {
      throw isKnownMediaError(error)
        ? error
        : classifyMediaTransportError(error, "read", { path: values.path });
    }

    if (status >= 400) {
      throw createMediaError(
        status >= 500 ? "MEDIA_SERVER_ERROR" : "MEDIA_REMOTE_REJECTED",
        undefined,
        { path: values.path, status },
      );
    }

    let data;
    try {
      data = JSON.parse(String(text));
    } catch (_) {
      throw createMediaError("MEDIA_PROTOCOL_ERROR", undefined, { path: values.path, status });
    }
    if (status < 200 || status >= 300 || response.ok === false) {
      throw createMediaError(
        status >= 500 ? "MEDIA_SERVER_ERROR" : "MEDIA_REMOTE_REJECTED",
        undefined,
        { path: values.path, status },
      );
    }
    return data;
  }

  async _phase(operation, phase, timeoutMs, controller, path) {
    let timer;
    let timedOut = false;
    const task = Promise.resolve().then(operation);
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => {
        timedOut = true;
        try {
          controller.abort();
        } catch (_) {
          diagnose("MEDIA_TRANSPORT_ABORT_FAILED", "abort");
        }
        reject(createMediaError(
          phase === "read" ? "MEDIA_READ_TIMEOUT" : "MEDIA_CONNECT_TIMEOUT",
          undefined,
          { phase, path },
        ));
      }, timeoutMs);
    });
    try {
      return await Promise.race([task, timeout]);
    } catch (error) {
      if (timedOut) throw error;
      throw classifyMediaTransportError(error, phase, { phase, path });
    } finally {
      clearTimeout(timer);
    }
  }
}

function createMediaTransport(options) {
  return new MediaTransport(options);
}

module.exports = {
  MediaTransport,
  createMediaTransport,
  DEFAULT_MEDIA_TRANSPORT_TIMEOUT_MS: DEFAULT_TIMEOUT_MS,
};
