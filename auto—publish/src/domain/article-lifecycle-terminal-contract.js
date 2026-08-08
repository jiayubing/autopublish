"use strict";

const { AttemptId } = require("./identities");
const {
  parseArticleIdentityV1,
  parseTargetIdentityV1,
} = require("./regular-publication-contract");
const { dtoError, exact } = require("./safe-operational-error");

const FINGERPRINT = /^[a-f0-9]{64}$/u;
const SAFE_CODE = /^[A-Z][A-Z0-9_]{0,79}$/u;
const TERMINAL_KINDS = new Set(["PUBLISHED"]);
const CLOSED_KINDS = new Set([
  "PRE_REMOTE_QUEUE_CLOSED",
  "FAILED",
  "REJECTED",
  "CANCELLED",
  "PAID_STATUS_4",
]);
const TERMINAL_TIME_SOURCES = new Set([
  "provider_event_time",
  "first_positive_observation_time",
  "manual_positive_evidence_time",
  "observation_time",
  "legacy_unavailable",
]);
const CLOSED_TIME_SOURCES = new Set([
  "queue_closed_time",
  "observation_time",
  "manual_resolution_time",
  "deletion_time",
  "recovery_transaction_time",
  "legacy_unavailable",
]);
const TOMBSTONE_STATES = new Set(["TRASHED", "PERMANENTLY_DELETED"]);
const DELETION_STATES = new Set([
  "PENDING",
  "COMMITTED",
  "NEEDS_REPAIR",
  "SUPERSEDED",
]);

function invalid(code) {
  throw dtoError(code);
}

function required(input, fields, code) {
  exact(input, fields);
  if (
    fields.some((field) => !Object.prototype.hasOwnProperty.call(input, field))
  )
    invalid(code);
}

function instant(value, code, nullable) {
  if (nullable && value === null) return null;
  if (
    typeof value !== "string" ||
    value.length > 64 ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  )
    invalid(code);
  return value;
}

function safeCode(value, code, nullable) {
  if (nullable && value === null) return null;
  if (typeof value !== "string" || !SAFE_CODE.test(value)) invalid(code);
  return value;
}

function safeFingerprint(value, code, nullable) {
  if (nullable && value === null) return null;
  if (typeof value !== "string" || !FINGERPRINT.test(value)) invalid(code);
  return value;
}

function safeAttemptId(value, code) {
  if (value === null) return null;
  try {
    return AttemptId.serialize(AttemptId.parse(value));
  } catch (_) {
    invalid(code);
  }
}

function safeArticleIdentities(value, code) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 10000)
    invalid(code);
  for (let index = 0; index < value.length; index += 1)
    if (!Object.prototype.hasOwnProperty.call(value, index)) invalid(code);
  const identities = value.map((item) => parseArticleIdentityV1(item));
  const keys = identities.map(
    (item) => `${item.clientId}\u0000${item.articleId}`,
  );
  if (new Set(keys).size !== keys.length) invalid(code);
  return Object.freeze(identities);
}

function validateTimePair(input, atField, sourceField, sources, code) {
  if (!sources.has(input[sourceField])) invalid(code);
  const at = instant(input[atField], code, true);
  if ((at === null) !== (input[sourceField] === "legacy_unavailable"))
    invalid(code);
  return { at, source: input[sourceField] };
}

function targetIdentity(input, code) {
  try {
    return parseTargetIdentityV1(input);
  } catch (_) {
    invalid(code);
  }
}

function parseTerminalTargetV1(input) {
  const code = "TERMINAL_TARGET_V1_INVALID";
  required(
    input,
    [
      "version",
      "articleIdentityV1",
      "targetIdentityV1",
      "attemptId",
      "terminalKind",
      "reasonCode",
      "terminalAt",
      "terminalAtSource",
      "evidenceFingerprint",
    ],
    code,
  );
  if (input.version !== 1 || !TERMINAL_KINDS.has(input.terminalKind))
    invalid(code);
  const time = validateTimePair(
    input,
    "terminalAt",
    "terminalAtSource",
    TERMINAL_TIME_SOURCES,
    code,
  );
  return Object.freeze({
    version: 1,
    articleIdentityV1: parseArticleIdentityV1(input.articleIdentityV1),
    targetIdentityV1: targetIdentity(input.targetIdentityV1, code),
    attemptId: safeAttemptId(input.attemptId, code),
    terminalKind: input.terminalKind,
    reasonCode: safeCode(input.reasonCode, code),
    terminalAt: time.at,
    terminalAtSource: time.source,
    evidenceFingerprint: safeFingerprint(input.evidenceFingerprint, code),
  });
}

function parseClosedTargetV1(input) {
  const code = "CLOSED_TARGET_V1_INVALID";
  required(
    input,
    [
      "version",
      "articleIdentityV1",
      "targetIdentityV1",
      "attemptId",
      "closedKind",
      "reasonCode",
      "closedAt",
      "closedAtSource",
      "evidenceFingerprint",
    ],
    code,
  );
  if (input.version !== 1 || !CLOSED_KINDS.has(input.closedKind)) invalid(code);
  const time = validateTimePair(
    input,
    "closedAt",
    "closedAtSource",
    CLOSED_TIME_SOURCES,
    code,
  );
  return Object.freeze({
    version: 1,
    articleIdentityV1: parseArticleIdentityV1(input.articleIdentityV1),
    targetIdentityV1: targetIdentity(input.targetIdentityV1, code),
    attemptId: safeAttemptId(input.attemptId, code),
    closedKind: input.closedKind,
    reasonCode: safeCode(input.reasonCode, code),
    closedAt: time.at,
    closedAtSource: time.source,
    evidenceFingerprint: safeFingerprint(input.evidenceFingerprint, code),
  });
}

function parseTombstoneIdentityV1(input) {
  const code = "TOMBSTONE_IDENTITY_V1_INVALID";
  required(
    input,
    [
      "version",
      "articleIdentityV1",
      "state",
      "deletedAt",
      "purgedAt",
      "reasonCode",
      "contentFingerprint",
    ],
    code,
  );
  if (input.version !== 1 || !TOMBSTONE_STATES.has(input.state)) invalid(code);
  const deletedAt = instant(input.deletedAt, code, false);
  const purgedAt = instant(input.purgedAt, code, true);
  if (
    (input.state === "TRASHED" && purgedAt !== null) ||
    (input.state === "PERMANENTLY_DELETED" && purgedAt === null)
  )
    invalid(code);
  return Object.freeze({
    version: 1,
    articleIdentityV1: parseArticleIdentityV1(input.articleIdentityV1),
    state: input.state,
    deletedAt,
    purgedAt,
    reasonCode: safeCode(input.reasonCode, code),
    contentFingerprint: safeFingerprint(input.contentFingerprint, code, true),
  });
}

function parseDeletionTransactionIdentityV1(input) {
  const code = "DELETION_TRANSACTION_IDENTITY_V1_INVALID";
  required(
    input,
    [
      "version",
      "transactionId",
      "articleIdentitiesV1",
      "state",
      "reasonCode",
      "createdAt",
      "updatedAt",
      "selectionFingerprint",
    ],
    code,
  );
  if (input.version !== 1 || !DELETION_STATES.has(input.state)) invalid(code);
  let transactionId;
  try {
    transactionId = AttemptId.serialize(AttemptId.parse(input.transactionId));
  } catch (_) {
    invalid(code);
  }
  return Object.freeze({
    version: 1,
    transactionId,
    articleIdentitiesV1: safeArticleIdentities(input.articleIdentitiesV1, code),
    state: input.state,
    reasonCode: safeCode(input.reasonCode, code, true),
    createdAt: instant(input.createdAt, code, false),
    updatedAt: instant(input.updatedAt, code, false),
    selectionFingerprint: safeFingerprint(input.selectionFingerprint, code),
  });
}

module.exports = Object.freeze({
  CLOSED_TARGET_KINDS: Object.freeze([...CLOSED_KINDS]),
  DELETION_TRANSACTION_STATES: Object.freeze([...DELETION_STATES]),
  TERMINAL_TARGET_KINDS: Object.freeze([...TERMINAL_KINDS]),
  parseClosedTargetV1,
  parseDeletionTransactionIdentityV1,
  parseTerminalTargetV1,
  parseTombstoneIdentityV1,
});
