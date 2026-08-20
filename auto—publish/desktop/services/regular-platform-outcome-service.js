"use strict";

const domain = require("../../src/domain");

const TRANSITION_METHODS = Object.freeze([
  "confirmRegularAccepted",
  "confirmRegularNotAccepted",
  "getRegularOutcomeSnapshot",
  "markOrphanedRegularAttemptUncertain",
  "prepareRegularUncertainResolution",
  "recordRegularAccepted",
  "recordRegularArticleRejected",
  "recordRegularGroupBlocked",
  "recordRegularUncertain",
]);

function fail(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function validateTransitions(value) {
  if (
    !value ||
    Object.keys(value).sort().join("\u0000") !==
      [...TRANSITION_METHODS].sort().join("\u0000") ||
    TRANSITION_METHODS.some((method) => typeof value[method] !== "function")
  )
    throw fail("REGULAR_OUTCOME_TRANSITIONS_INVALID");
  return value;
}

function createRegularPlatformOutcomeService(options) {
  const value = options || {};
  const transitions = validateTransitions(value.regularOutcomeTransitions);
  const clock = value.clock || (() => new Date());

  function observedAt() {
    const stamp = new Date(clock());
    if (!Number.isFinite(stamp.getTime()))
      throw fail("REGULAR_OUTCOME_TIME_INVALID");
    return stamp.toISOString();
  }

  function canonicalObservation(raw) {
    const result = raw || {};
    if (
      !["accepted", "article_rejected", "group_blocked", "uncertain"].includes(
        result.status,
      )
    )
      throw fail("REGULAR_ADAPTER_OUTCOME_INVALID");
    if (
      result.errorCode !== undefined &&
      (typeof result.errorCode !== "string" ||
        !/^[A-Z][A-Z0-9_]{0,127}$/.test(result.errorCode))
    )
      throw fail("REGULAR_ADAPTER_OUTCOME_INVALID");
    const observation = {
      status: result.status,
      code:
        result.errorCode ||
        (result.status === "accepted"
          ? "REGULAR_ACCEPTED"
          : `REGULAR_${result.status.toUpperCase()}`),
      observedAt: result.observedAt || observedAt(),
    };
    if (result.providerEventAt)
      observation.providerEventAt = result.providerEventAt;
    if (
      result.remoteId !== undefined &&
      (typeof result.remoteId !== "string" ||
        !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/.test(result.remoteId))
    )
      throw fail("REGULAR_ADAPTER_OUTCOME_INVALID");
    if (result.remoteId) observation.remoteId = result.remoteId;
    if (result.remoteUrl !== undefined && result.remoteUrl !== null) {
      const remoteUrl = domain.normalizePublishedArticleUrl(result.remoteUrl);
      if (!remoteUrl) throw fail("REGULAR_ADAPTER_OUTCOME_INVALID");
      observation.remoteUrl = remoteUrl;
    }
    if (
      result.status === "accepted" &&
      !observation.remoteId &&
      !observation.remoteUrl
    )
      throw fail("REGULAR_ACCEPTED_REMOTE_IDENTITY_REQUIRED");
    if (result.status === "group_blocked") {
      if (typeof result.articleRecoverable !== "boolean")
        throw fail("REGULAR_ADAPTER_OUTCOME_INVALID");
      observation.articleRecoverable = result.articleRecoverable;
    }
    return Object.freeze(observation);
  }

  function applyRegularOutcome(input) {
    const request = input || {};
    const attemptId = request.regularPublicationAttemptId;
    const observation = canonicalObservation(request.outcome);
    const command = { regularPublicationAttemptId: attemptId, observation };
    if (observation.status === "accepted")
      return transitions.recordRegularAccepted(command);
    if (observation.status === "article_rejected")
      return transitions.recordRegularArticleRejected(command);
    if (observation.status === "group_blocked")
      return transitions.recordRegularGroupBlocked(command);
    return transitions.recordRegularUncertain(command);
  }

  return Object.freeze({
    applyRegularOutcome,
    confirmRegularAccepted: transitions.confirmRegularAccepted,
    confirmRegularNotAccepted: transitions.confirmRegularNotAccepted,
    getRegularOutcomeSnapshot: transitions.getRegularOutcomeSnapshot,
    markOrphanedRegularAttemptUncertain:
      transitions.markOrphanedRegularAttemptUncertain,
    prepareRegularUncertainResolution:
      transitions.prepareRegularUncertainResolution,
  });
}

module.exports = { createRegularPlatformOutcomeService };
