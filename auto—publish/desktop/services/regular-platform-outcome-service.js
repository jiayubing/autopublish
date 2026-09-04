"use strict";

const {
  REGULAR_OUTCOME_OBSERVATION_ISSUES,
  isRegularOutcomeObservationError,
  parseRegularOutcomeObservation,
} = require("../../src/publication/regular-outcome-observation");

const TRANSITION_METHODS = Object.freeze([
  "confirmRegularAccepted",
  "confirmRegularNotAccepted",
  "getRegularOutcomeSnapshot",
  "listRegularRemotePending",
  "markOrphanedRegularAttemptUncertain",
  "prepareRegularUncertainResolution",
  "recordRegularAccepted",
  "recordRegularArticleRejected",
  "recordRegularGroupBlocked",
  "recordRegularRemotePending",
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

  function translateObservationError(error) {
    if (!isRegularOutcomeObservationError(error)) throw error;
    if (error.issue === REGULAR_OUTCOME_OBSERVATION_ISSUES.TIME_INVALID)
      return fail("REGULAR_OUTCOME_TIME_INVALID");
    if (
      error.issue ===
      REGULAR_OUTCOME_OBSERVATION_ISSUES.ACCEPTED_REMOTE_IDENTITY_REQUIRED
    )
      return fail("REGULAR_ACCEPTED_REMOTE_IDENTITY_REQUIRED");
    if (
      error.issue ===
      REGULAR_OUTCOME_OBSERVATION_ISSUES.REMOTE_PENDING_REMOTE_ID_REQUIRED
    )
      return fail("REGULAR_REMOTE_PENDING_REMOTE_ID_REQUIRED");
    return fail("REGULAR_ADAPTER_OUTCOME_INVALID");
  }

  function defaultOutcomeCode(status) {
    if (status === "accepted") return "REGULAR_ACCEPTED";
    return typeof status === "string"
      ? `REGULAR_${status.toUpperCase()}`
      : null;
  }

  function canonicalObservation(raw) {
    const result = raw || {};
    const candidate = {
      status: result.status,
      code:
        result.errorCode === undefined
          ? defaultOutcomeCode(result.status)
          : result.errorCode,
      observedAt: result.observedAt || observedAt(),
    };
    if (result.providerEventAt) candidate.providerEventAt = result.providerEventAt;
    if (result.remoteId !== undefined) candidate.remoteId = result.remoteId;
    if (result.remoteUrl !== undefined && result.remoteUrl !== null)
      candidate.remoteUrl = result.remoteUrl;
    if (result.status === "group_blocked")
      candidate.articleRecoverable = result.articleRecoverable;
    try {
      return parseRegularOutcomeObservation(candidate);
    } catch (error) {
      throw translateObservationError(error);
    }
  }

  function applyRegularOutcome(input) {
    const request = input || {};
    const attemptId = request.regularPublicationAttemptId;
    const observation = canonicalObservation(request.outcome);
    const command = { regularPublicationAttemptId: attemptId, observation };
    if (observation.status === "accepted")
      return transitions.recordRegularAccepted(command);
    if (observation.status === "remote_pending")
      return transitions.recordRegularRemotePending(command);
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
    listRegularRemotePending: transitions.listRegularRemotePending,
    markOrphanedRegularAttemptUncertain:
      transitions.markOrphanedRegularAttemptUncertain,
    prepareRegularUncertainResolution:
      transitions.prepareRegularUncertainResolution,
  });
}

module.exports = { createRegularPlatformOutcomeService };
