const { HEALTH_CODES, mapHealthError, mapHealthResult } = require("./health-diagnostic-mapper");
const { normalizeMaintenancePolicy } = require("./maintenance-diagnostics");
const { runSqliteIntegrityCheck } = require("./sqlite-integrity-check");

const DEFAULT_TIMEOUT_MS = 10000;
const MAX_TIMEOUT_MS = 300000;

function codedError(code) {
  const error = new Error("integrity check failed");
  error.code = code;
  return error;
}

function nowMs(clock) {
  const value = typeof clock === "function" ? clock() : Date.now();
  if (value instanceof Date) return value.getTime();
  return Number.isFinite(Number(value)) ? Number(value) : Date.now();
}

function timeoutValue(value, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 1) return fallback;
  return Math.min(Math.floor(number), MAX_TIMEOUT_MS);
}

class IntegrityRunner {
  constructor(options) {
    const opts = options || {};
    this.databasePath = opts.databasePath;
    this.hasCustomExecute = typeof opts.execute === "function";
    this.execute = typeof opts.execute === "function" ? opts.execute : (input) => runSqliteIntegrityCheck({
      filePath: this.databasePath,
      signal: input.signal,
      nowMs: input.nowMs,
      policy: input.policy,
    });
    this.clock = opts.clock || Date.now;
    this.defaultTimeoutMs = timeoutValue(opts.defaultTimeoutMs, DEFAULT_TIMEOUT_MS);
    this.policy = normalizeMaintenancePolicy(opts.policy);
  }

  async run(options) {
    const opts = options || {};
    const startedAt = nowMs(this.clock);
    const timeoutMs = timeoutValue(opts.timeoutMs, this.defaultTimeoutMs);
    const context = { operation: "integrity", time: startedAt, durationMs: 0, timeoutMs };
    if (opts.signal && opts.signal.aborted) return mapHealthError(HEALTH_CODES.INTEGRITY_CANCELLED, context);
    if (!this.databasePath && !this.hasCustomExecute && typeof opts.execute !== "function") return mapHealthError(HEALTH_CODES.DATABASE_UNAVAILABLE, context);

    const controller = new AbortController();
    const execute = typeof opts.execute === "function" ? opts.execute : this.execute;
    let raw;
    try {
      raw = await this._withDeadline(execute, {
        controller,
        signal: controller.signal,
        externalSignal: opts.signal,
        timeoutMs,
        nowMs: startedAt,
        policy: opts.policy ? normalizeMaintenancePolicy(opts.policy) : this.policy,
      });
    } catch (error) {
      context.durationMs = Math.max(0, nowMs(this.clock) - startedAt);
      return mapHealthError(error, context);
    }
    context.durationMs = Math.max(0, nowMs(this.clock) - startedAt);
    return mapHealthResult(raw, context);
  }

  _withDeadline(execute, options) {
    const opts = options || {};
    return new Promise((resolve, reject) => {
      let settled = false;
      let timer;
      let externalAbort;
      const finish = (callback, value) => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        if (externalAbort && opts.externalSignal) opts.externalSignal.removeEventListener("abort", externalAbort);
        callback(value);
      };
      const abort = (code) => {
        try { opts.controller.abort(); } catch (_) { /* already aborted */ }
        finish(reject, codedError(code));
      };
      externalAbort = () => abort(HEALTH_CODES.INTEGRITY_CANCELLED);
      if (opts.externalSignal) opts.externalSignal.addEventListener("abort", externalAbort, { once: true });
      if (opts.externalSignal && opts.externalSignal.aborted) { abort(HEALTH_CODES.INTEGRITY_CANCELLED); return; }
      timer = setTimeout(() => abort(HEALTH_CODES.INTEGRITY_TIMEOUT), opts.timeoutMs);
      Promise.resolve().then(() => execute({ signal: opts.signal, nowMs: opts.nowMs, policy: opts.policy })).then(
        (value) => finish(resolve, value),
        (error) => finish(reject, error),
      );
    });
  }
}

function createIntegrityRunner(options) { return new IntegrityRunner(options); }

module.exports = { DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS, IntegrityRunner, createIntegrityRunner };
