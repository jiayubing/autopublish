"use strict";

const domain = require("../domain");

const REGULAR_OUTCOME_STATUSES = Object.freeze([
  "accepted",
  "remote_pending",
  "article_rejected",
  "group_blocked",
  "uncertain",
]);
const REGULAR_OUTCOME_KEYS = Object.freeze([
  "status",
  "code",
  "observedAt",
  "providerEventAt",
  "remoteId",
  "remoteUrl",
  "articleRecoverable",
]);
const OBSERVATION_CODES = /^[A-Z][A-Z0-9_]{0,127}$/;
const REMOTE_IDS = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/;

const REGULAR_OUTCOME_OBSERVATION_ISSUES = Object.freeze({
  INVALID: "invalid",
  TIME_INVALID: "time_invalid",
  EVIDENCE_INVALID: "evidence_invalid",
  ACCEPTED_REMOTE_IDENTITY_REQUIRED: "accepted_remote_identity_required",
  REMOTE_PENDING_REMOTE_ID_REQUIRED: "remote_pending_remote_id_required",
});

class RegularOutcomeObservationError extends Error {
  constructor(issue) {
    super(issue);
    this.name = "RegularOutcomeObservationError";
    this.issue = issue;
  }
}

function invalid(issue) {
  throw new RegularOutcomeObservationError(issue);
}

function timestamp(value) {
  if (
    typeof value !== "string" ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  )
    invalid(REGULAR_OUTCOME_OBSERVATION_ISSUES.TIME_INVALID);
  return value;
}

function parseRegularOutcomeObservation(input, options) {
  const value = input || {};
  const expectedStatus = options && options.expectedStatus;
  if (
    !REGULAR_OUTCOME_STATUSES.includes(value.status) ||
    (expectedStatus !== undefined && value.status !== expectedStatus) ||
    typeof value.code !== "string" ||
    !OBSERVATION_CODES.test(value.code) ||
    Object.keys(value).some((key) => !REGULAR_OUTCOME_KEYS.includes(key)) ||
    (value.status === "group_blocked" &&
      typeof value.articleRecoverable !== "boolean") ||
    (value.remoteId !== undefined &&
      (typeof value.remoteId !== "string" || !REMOTE_IDS.test(value.remoteId)))
  )
    invalid(REGULAR_OUTCOME_OBSERVATION_ISSUES.INVALID);

  const observedAt = timestamp(
    value.observedAt === undefined
      ? options && options.defaultObservedAt
      : value.observedAt,
  );
  const providerEventAt =
    value.providerEventAt === undefined || value.providerEventAt === null
      ? null
      : timestamp(value.providerEventAt);
  const remoteUrl =
    value.remoteUrl === undefined || value.remoteUrl === null
      ? null
      : domain.normalizePublishedArticleUrl(value.remoteUrl);
  if (value.remoteUrl !== undefined && value.remoteUrl !== null && !remoteUrl)
    invalid(REGULAR_OUTCOME_OBSERVATION_ISSUES.EVIDENCE_INVALID);

  const normalized = Object.freeze({
    status: value.status,
    code: value.code,
    observedAt,
    providerEventAt,
    remoteId: value.remoteId || null,
    remoteUrl,
    ...(value.status === "group_blocked"
      ? { articleRecoverable: value.articleRecoverable === true }
      : {}),
  });
  if (
    value.status === "accepted" &&
    !normalized.remoteId &&
    !normalized.remoteUrl
  )
    invalid(
      REGULAR_OUTCOME_OBSERVATION_ISSUES.ACCEPTED_REMOTE_IDENTITY_REQUIRED,
    );
  if (value.status === "remote_pending" && !normalized.remoteId)
    invalid(
      REGULAR_OUTCOME_OBSERVATION_ISSUES.REMOTE_PENDING_REMOTE_ID_REQUIRED,
    );
  return normalized;
}

function isRegularOutcomeObservationError(error) {
  return error instanceof RegularOutcomeObservationError;
}

module.exports = {
  REGULAR_OUTCOME_OBSERVATION_ISSUES,
  isRegularOutcomeObservationError,
  parseRegularOutcomeObservation,
};
