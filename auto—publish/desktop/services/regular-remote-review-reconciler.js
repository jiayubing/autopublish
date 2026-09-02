"use strict";

const {
  reportDiagnostic,
} = require("../../src/diagnostics/diagnostic-producer");

const DEFAULT_INTERVAL_MS = 60 * 1000;

function fail(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function safePlatformId(value) {
  return typeof value === "string" && /^[a-z][a-z0-9-]{0,63}$/.test(value)
    ? value
    : null;
}

function createRegularRemoteReviewReconciler(options) {
  const value = options || {};
  const outcomeService = value.regularPlatformOutcomeService;
  if (
    !outcomeService ||
    typeof outcomeService.listRegularRemotePending !== "function" ||
    typeof outcomeService.applyRegularOutcome !== "function"
  )
    throw fail("REGULAR_REMOTE_REVIEW_OUTCOME_SERVICE_REQUIRED");

  const ports = new Map();
  (value.remoteReviewPorts || []).forEach((entry) => {
    if (
      !entry ||
      !safePlatformId(entry.id) ||
      !entry.port ||
      typeof entry.port.reconcile !== "function" ||
      ports.has(entry.id)
    )
      throw fail("REGULAR_REMOTE_REVIEW_PORT_INVALID");
    ports.set(entry.id, entry.port);
  });
  const intervalMs =
    Number.isSafeInteger(value.intervalMs) &&
    value.intervalMs >= 1000 &&
    value.intervalMs <= 60 * 60 * 1000
      ? value.intervalMs
      : DEFAULT_INTERVAL_MS;
  const onDataInvalidated =
    typeof value.onDataInvalidated === "function"
      ? value.onDataInvalidated
      : function () {};

  let timer = null;
  let running = null;
  let disposed = false;

  function diagnostic(code, entry, error) {
    const platformId = safePlatformId(entry && entry.platformId);
    reportDiagnostic({
      code,
      module: "regular-remote-review-reconciler",
      category: "remote",
      operationId: "regular-remote-review",
      metadata: {
        action: "remote-review",
        ...(platformId ? { platformId } : {}),
        errorCode:
          error &&
          typeof error.code === "string" &&
          /^[A-Z][A-Z0-9_]{0,127}$/.test(error.code)
            ? error.code
            : "REMOTE_REVIEW_FAILED",
      },
    });
  }

  async function execute() {
    const pending = outcomeService.listRegularRemotePending();
    const results = [];
    for (const entry of pending) {
      const port = ports.get(entry.platformId);
      if (!port) {
        diagnostic("REGULAR_REMOTE_REVIEW_PORT_UNAVAILABLE", entry);
        results.push(
          Object.freeze({
            regularPublicationAttemptId:
              entry.regularPublicationAttemptId,
            status: "deferred",
          }),
        );
        continue;
      }
      try {
        const outcome = await port.reconcile({ remoteId: entry.remoteId });
        if (!outcome || outcome.status === "remote_pending") {
          results.push(
            Object.freeze({
              regularPublicationAttemptId:
                entry.regularPublicationAttemptId,
              status: "remote_pending",
            }),
          );
          continue;
        }
        if (!["accepted", "article_rejected"].includes(outcome.status))
          throw fail("REGULAR_REMOTE_REVIEW_OUTCOME_INVALID");
        outcomeService.applyRegularOutcome({
          regularPublicationAttemptId:
            entry.regularPublicationAttemptId,
          outcome,
        });
        onDataInvalidated("REGULAR_REMOTE_REVIEW_CHANGED");
        results.push(
          Object.freeze({
            regularPublicationAttemptId:
              entry.regularPublicationAttemptId,
            status: outcome.status,
          }),
        );
      } catch (error) {
        diagnostic("REGULAR_REMOTE_REVIEW_DEFERRED", entry, error);
        results.push(
          Object.freeze({
            regularPublicationAttemptId:
              entry.regularPublicationAttemptId,
            status: "deferred",
          }),
        );
      }
    }
    return Object.freeze(results);
  }

  function runOnce() {
    if (disposed) return Promise.resolve(Object.freeze([]));
    if (running) return running;
    running = execute().finally(() => {
      running = null;
    });
    return running;
  }

  function start() {
    if (disposed || timer) return;
    void runOnce();
    timer = setInterval(() => {
      void runOnce();
    }, intervalMs);
    if (timer && typeof timer.unref === "function") timer.unref();
  }

  async function dispose() {
    disposed = true;
    if (timer) clearInterval(timer);
    timer = null;
    if (running) await running;
  }

  return Object.freeze({ start, runOnce, dispose });
}

module.exports = {
  DEFAULT_INTERVAL_MS,
  createRegularRemoteReviewReconciler,
};
