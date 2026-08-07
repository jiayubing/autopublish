"use strict";

const crypto = require("node:crypto");

const { parseOrderIdentityV1 } = require("./paid-media-order-contract");
const { dtoError, exact } = require("./safe-operational-error");

const FINGERPRINT = /^[a-f0-9]{64}$/u;
const STATUS_CODES = new Set(["0", "1", "2", "4", "9"]);
const EVENT_SOURCES = new Set([
  "provider_event_time",
  "observation_time",
  "manual_positive_evidence_time",
  "not_available",
]);
const TERMINAL_KINDS = new Set([
  "REJECTED",
  "CANCELLED",
  "OTHER_NON_PUBLISHED",
]);
const SENSITIVE_QUERY_NAME =
  /^(?:access_token|api[_-]?key|apikey|auth(?:orization)?|cookie|password|refresh_token|secret|session(?:id)?|token)$/iu;

function invalid(code) {
  throw dtoError(code);
}

function required(input, fields, code) {
  exact(input, fields);
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    fields.some((field) => !Object.prototype.hasOwnProperty.call(input, field))
  )
    invalid(code);
}

function instant(value, nullable, code) {
  if (nullable && value === null) return null;
  if (
    typeof value !== "string" ||
    value.length > 64 ||
    !/(?:Z|[+-]\d{2}:\d{2})$/u.test(value) ||
    !Number.isFinite(Date.parse(value))
  )
    invalid(code);
  return new Date(Date.parse(value)).toISOString();
}

function amount(value, code) {
  if (value === null) return null;
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 100000000
  )
    invalid(code);
  return value;
}

function fingerprint(value, code) {
  if (typeof value !== "string" || !FINGERPRINT.test(value)) invalid(code);
  return value;
}

function normalizePublishedArticleUrl(value) {
  if (typeof value !== "string" || !value || value.length > 2048) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.hash)
      return null;
    for (const name of url.searchParams.keys())
      if (SENSITIVE_QUERY_NAME.test(name)) return null;
    return url.href;
  } catch (_) {
    return null;
  }
}

function safeUrl(value, code) {
  if (value === null) return null;
  const normalized = normalizePublishedArticleUrl(value);
  if (!normalized) invalid(code);
  return normalized;
}

function validateEventTime(input, code) {
  const eventAt = instant(input.eventAt, true, code);
  if (!EVENT_SOURCES.has(input.eventAtSource)) invalid(code);
  if ((eventAt === null) !== (input.eventAtSource === "not_available"))
    invalid(code);
  return { eventAt, eventAtSource: input.eventAtSource };
}

function parseOrderObservationV1(input) {
  const code = "ORDER_OBSERVATION_V1_INVALID";
  required(
    input,
    [
      "version",
      "orderIdentityV1",
      "statusCode",
      "observedAt",
      "eventAt",
      "eventAtSource",
      "remoteUrl",
      "actualAmount",
      "evidenceFingerprint",
      "orderSnapshotFingerprint",
    ],
    code,
  );
  if (input.version !== 1 || !STATUS_CODES.has(input.statusCode)) invalid(code);
  const event = validateEventTime(input, code);
  return Object.freeze({
    version: 1,
    orderIdentityV1: parseOrderIdentityV1(input.orderIdentityV1),
    statusCode: input.statusCode,
    observedAt: instant(input.observedAt, false, code),
    ...event,
    remoteUrl: safeUrl(input.remoteUrl, code),
    actualAmount: amount(input.actualAmount, code),
    evidenceFingerprint: fingerprint(input.evidenceFingerprint, code),
    orderSnapshotFingerprint: fingerprint(input.orderSnapshotFingerprint, code),
  });
}

function parseTerminalObservationV1(input) {
  const code = "TERMINAL_OBSERVATION_V1_INVALID";
  required(
    input,
    [
      "version",
      "orderIdentityV1",
      "terminalKind",
      "observedAt",
      "eventAt",
      "eventAtSource",
      "actualAmount",
      "evidenceFingerprint",
      "orderSnapshotFingerprint",
    ],
    code,
  );
  if (input.version !== 1 || !TERMINAL_KINDS.has(input.terminalKind))
    invalid(code);
  const event = validateEventTime(input, code);
  return Object.freeze({
    version: 1,
    orderIdentityV1: parseOrderIdentityV1(input.orderIdentityV1),
    terminalKind: input.terminalKind,
    observedAt: instant(input.observedAt, false, code),
    ...event,
    actualAmount: amount(input.actualAmount, code),
    evidenceFingerprint: fingerprint(input.evidenceFingerprint, code),
    orderSnapshotFingerprint: fingerprint(input.orderSnapshotFingerprint, code),
  });
}

function parseHistoryEntry(input, identity) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    invalid("ORDER_HISTORY_V1_INVALID");
  if (input.kind === "observation") {
    required(
      input,
      ["sequence", "kind", "orderObservationV1"],
      "ORDER_HISTORY_V1_INVALID",
    );
    const observation = parseOrderObservationV1(input.orderObservationV1);
    if (
      JSON.stringify(observation.orderIdentityV1) !== JSON.stringify(identity)
    )
      invalid("ORDER_HISTORY_V1_INVALID");
    return Object.freeze({
      sequence: input.sequence,
      kind: "observation",
      orderObservationV1: observation,
    });
  }
  if (input.kind === "terminal") {
    required(
      input,
      ["sequence", "kind", "terminalObservationV1"],
      "ORDER_HISTORY_V1_INVALID",
    );
    const terminal = parseTerminalObservationV1(input.terminalObservationV1);
    if (JSON.stringify(terminal.orderIdentityV1) !== JSON.stringify(identity))
      invalid("ORDER_HISTORY_V1_INVALID");
    return Object.freeze({
      sequence: input.sequence,
      kind: "terminal",
      terminalObservationV1: terminal,
    });
  }
  invalid("ORDER_HISTORY_V1_INVALID");
}

function parseOrderHistoryV1(input) {
  required(
    input,
    ["version", "orderIdentityV1", "entries"],
    "ORDER_HISTORY_V1_INVALID",
  );
  if (
    input.version !== 1 ||
    !Array.isArray(input.entries) ||
    input.entries.length > 10000
  )
    invalid("ORDER_HISTORY_V1_INVALID");
  const identity = parseOrderIdentityV1(input.orderIdentityV1);
  const entries = [];
  for (let index = 0; index < input.entries.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(input.entries, index))
      invalid("ORDER_HISTORY_V1_INVALID");
    const entry = input.entries[index];
    if (
      !Number.isSafeInteger(entry && entry.sequence) ||
      entry.sequence !== index + 1
    )
      invalid("ORDER_HISTORY_V1_INVALID");
    entries.push(parseHistoryEntry(entry, identity));
  }
  return Object.freeze({
    version: 1,
    orderIdentityV1: identity,
    entries: Object.freeze(entries),
  });
}

function stableFingerprint(value) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(value), "utf8")
    .digest("hex");
}

module.exports = Object.freeze({
  ORDER_STATUS_CODES: Object.freeze([...STATUS_CODES]),
  ORDER_TERMINAL_KINDS: Object.freeze([...TERMINAL_KINDS]),
  parseOrderObservationV1,
  parseTerminalObservationV1,
  parseOrderHistoryV1,
  normalizePublishedArticleUrl,
  orderObservationFingerprint: stableFingerprint,
  orderSnapshotFingerprint: stableFingerprint,
});
