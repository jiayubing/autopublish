"use strict";

const crypto = require("node:crypto");

const {
  parseArticleIdentityV1,
  parseTargetIdentityV1,
} = require("./regular-publication-contract");
const { dtoError, exact } = require("./safe-operational-error");

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const FINGERPRINT = /^[a-f0-9]{64}$/u;
const STATES = new Set([
  "ACTIVE_TRACKING",
  "TERMINAL_PUBLISHED",
  "TERMINAL_REJECTED",
  "TERMINAL_CANCELLED",
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

function safeIdentity(value, code) {
  if (typeof value !== "string" || !SAFE_ID.test(value)) invalid(code);
  return value;
}

function safeText(value, max, code) {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.length > max ||
    /[\x00-\x1f\x7f]/u.test(value)
  )
    invalid(code);
  return value.trim();
}

function instant(value, code, nullable) {
  if (nullable && value === null) return null;
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/u.test(
      value,
    ) ||
    !Number.isFinite(Date.parse(value))
  )
    invalid(code);
  return value;
}

function amount(value, code, nullable) {
  if (nullable && value === null) return null;
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 100000000
  )
    invalid(code);
  return value;
}

function contentFingerprint(title, body) {
  return crypto
    .createHash("sha256")
    .update(
      JSON.stringify({ submittedTitle: title, submittedBody: body }),
      "utf8",
    )
    .digest("hex");
}

function parseOrderIdentityV1(input) {
  required(input, ["version", "orderId"], "ORDER_IDENTITY_V1_INVALID");
  if (input.version !== 1) invalid("ORDER_IDENTITY_V1_INVALID");
  return Object.freeze({
    version: 1,
    orderId: safeIdentity(input.orderId, "ORDER_IDENTITY_V1_INVALID"),
  });
}

function parseOrderSnapshotV1(input) {
  required(
    input,
    [
      "version",
      "orderIdentityV1",
      "articleIdentityV1",
      "targetIdentityV1",
      "orderCreationAttemptId",
      "mediaName",
      "quotedPrice",
      "estimatedTotal",
      "actualAmount",
      "systemSubmissionCode",
      "submittedTitle",
      "submittedBody",
      "contentFingerprint",
      "remoteCallStartedAt",
    ],
    "ORDER_SNAPSHOT_V1_INVALID",
  );
  if (input.version !== 1) invalid("ORDER_SNAPSHOT_V1_INVALID");
  const orderIdentityV1 = parseOrderIdentityV1(input.orderIdentityV1);
  const articleIdentityV1 = parseArticleIdentityV1(input.articleIdentityV1);
  const targetIdentityV1 = parseTargetIdentityV1(input.targetIdentityV1);
  if (targetIdentityV1.kind !== "media")
    invalid("ORDER_SNAPSHOT_MEDIA_TARGET_REQUIRED");
  const orderCreationAttemptId = safeIdentity(
    input.orderCreationAttemptId,
    "ORDER_SNAPSHOT_V1_INVALID",
  );
  const mediaName = input.mediaName;
  if (
    typeof mediaName !== "string" ||
    mediaName.length < 1 ||
    mediaName.length > 256 ||
    /[\x00-\x1f\x7f]/u.test(mediaName)
  )
    invalid("ORDER_SNAPSHOT_V1_INVALID");
  if (typeof input.submittedTitle !== "string")
    invalid("ORDER_SNAPSHOT_V1_INVALID");
  const submittedTitle = input.submittedTitle.trim();
  const submittedBody = input.submittedBody;
  if (
    !submittedTitle ||
    Array.from(submittedTitle).length > 30 ||
    /[\x00-\x1f\x7f]/u.test(input.submittedTitle) ||
    typeof submittedBody !== "string" ||
    !submittedBody.trim() ||
    submittedBody.length > 200000 ||
    /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/u.test(submittedBody)
  )
    invalid("ORDER_SNAPSHOT_V1_INVALID");
  if (!FINGERPRINT.test(input.contentFingerprint))
    invalid("ORDER_SNAPSHOT_V1_INVALID");
  if (
    input.contentFingerprint !==
    contentFingerprint(submittedTitle, submittedBody)
  )
    invalid("ORDER_SNAPSHOT_CONTENT_FINGERPRINT_MISMATCH");
  if (
    targetIdentityV1.mediaResourceId !== input.targetIdentityV1.mediaResourceId
  )
    invalid("ORDER_SNAPSHOT_V1_INVALID");
  const systemSubmissionCode = safeText(
    input.systemSubmissionCode,
    128,
    "ORDER_SNAPSHOT_V1_INVALID",
  );
  const remoteCallStartedAt = instant(
    input.remoteCallStartedAt,
    "ORDER_SNAPSHOT_V1_INVALID",
    false,
  );
  const actualAmount = amount(
    input.actualAmount,
    "ORDER_SNAPSHOT_V1_INVALID",
    true,
  );
  const quotedPrice = amount(
    input.quotedPrice,
    "ORDER_SNAPSHOT_V1_INVALID",
    false,
  );
  const estimatedTotal = amount(
    input.estimatedTotal,
    "ORDER_SNAPSHOT_V1_INVALID",
    false,
  );
  return Object.freeze({
    version: 1,
    orderIdentityV1,
    articleIdentityV1,
    targetIdentityV1,
    orderCreationAttemptId,
    mediaName,
    quotedPrice,
    estimatedTotal,
    actualAmount,
    systemSubmissionCode,
    submittedTitle,
    submittedBody,
    contentFingerprint: input.contentFingerprint,
    remoteCallStartedAt,
  });
}

function parsePaidTargetV1(input) {
  required(
    input,
    [
      "version",
      "articleIdentityV1",
      "targetIdentityV1",
      "orderCreationAttemptId",
      "orderIdentityV1",
      "state",
      "terminalAt",
    ],
    "PAID_TARGET_V1_INVALID",
  );
  if (input.version !== 1 || !STATES.has(input.state))
    invalid("PAID_TARGET_V1_INVALID");
  const articleIdentityV1 = parseArticleIdentityV1(input.articleIdentityV1);
  const targetIdentityV1 = parseTargetIdentityV1(input.targetIdentityV1);
  if (targetIdentityV1.kind !== "media") invalid("PAID_TARGET_MEDIA_REQUIRED");
  const orderCreationAttemptId = safeIdentity(
    input.orderCreationAttemptId,
    "PAID_TARGET_V1_INVALID",
  );
  const orderIdentityV1 = parseOrderIdentityV1(input.orderIdentityV1);
  if (input.state === "ACTIVE_TRACKING") {
    if (input.terminalAt !== null) invalid("PAID_TARGET_V1_INVALID");
  } else {
    instant(input.terminalAt, "PAID_TARGET_V1_INVALID", false);
  }
  return Object.freeze({
    version: 1,
    articleIdentityV1,
    targetIdentityV1,
    orderCreationAttemptId,
    orderIdentityV1,
    state: input.state,
    terminalAt: input.terminalAt,
  });
}

module.exports = Object.freeze({
  contentFingerprint,
  parseOrderIdentityV1,
  parseOrderSnapshotV1,
  parsePaidTargetV1,
});
