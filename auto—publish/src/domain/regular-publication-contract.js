"use strict";

const crypto = require("node:crypto");
const util = require("node:util");

const { ArticleId, AttemptId, ClientId } = require("./identities");
const { parsePublicationTarget } = require("./publication-target");
const { dtoError, exact } = require("./safe-operational-error");

const FINGERPRINT = /^[a-f0-9]{64}$/;
const DELIVERY_MODES = new Set(["text_only", "with_images"]);
const DECISION_KINDS = new Set([
  "initial",
  "retry_preparation",
  "replace_image",
  "continue_text_only",
]);

function invalid(code) {
  throw dtoError(code);
}

function parseArticleIdentityV1(input) {
  exact(input, ["version", "clientId", "articleId"]);
  if (input.version !== 1) invalid("ARTICLE_IDENTITY_V1_INVALID");
  try {
    return Object.freeze({
      version: 1,
      clientId: ClientId.serialize(ClientId.parse(input.clientId)),
      articleId: ArticleId.serialize(ArticleId.parse(input.articleId)),
    });
  } catch (_) {
    return invalid("ARTICLE_IDENTITY_V1_INVALID");
  }
}

function parseTargetIdentityV1(input) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    invalid("TARGET_IDENTITY_V1_INVALID");
  if (input.version !== 1) invalid("TARGET_IDENTITY_V1_INVALID");
  let target;
  try {
    if (input.kind === "platform") {
      exact(input, ["version", "kind", "platformId", "accountProfileId"]);
      target = parsePublicationTarget({
        kind: "platform",
        platformId: input.platformId,
        accountProfileId: input.accountProfileId,
      });
      return Object.freeze({ version: 1, ...target });
    }
    if (input.kind === "media") {
      exact(input, ["version", "kind", "mediaResourceId"]);
      target = parsePublicationTarget({
        kind: "media",
        mediaResourceId: input.mediaResourceId,
      });
      return Object.freeze({ version: 1, ...target });
    }
    if (input.kind === "legacy-unknown-account") {
      exact(input, ["version", "kind", "platformId", "autoExecutable"]);
      if (
        !Object.prototype.hasOwnProperty.call(input, "autoExecutable") ||
        input.autoExecutable !== false
      )
        invalid("TARGET_IDENTITY_V1_INVALID");
      target = parsePublicationTarget({
        kind: "legacy-unknown-account",
        platformId: input.platformId,
        autoExecutable: input.autoExecutable,
      });
      return Object.freeze({ version: 1, ...target });
    }
  } catch (_) {
    return invalid("TARGET_IDENTITY_V1_INVALID");
  }
  return invalid("TARGET_IDENTITY_V1_INVALID");
}

function preparedContentFingerprint(input) {
  const value = input || {};
  if (typeof value.title !== "string" || typeof value.body !== "string")
    invalid("PREPARED_SUBMISSION_EVIDENCE_V1_INVALID");
  return crypto
    .createHash("sha256")
    .update(JSON.stringify({ title: value.title, body: value.body }), "utf8")
    .digest("hex");
}

function validTitle(value) {
  return (
    typeof value === "string" &&
    value.length >= 1 &&
    value.length <= 256 &&
    !/[\x00-\x1f\x7f]/.test(value)
  );
}

function validBody(value) {
  return (
    typeof value === "string" &&
    value.length >= 1 &&
    value.length <= 200000 &&
    !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value)
  );
}

function parseImage(input) {
  exact(input, ["assetFingerprint", "layoutSlot"]);
  if (
    !FINGERPRINT.test(input.assetFingerprint) ||
    !Number.isInteger(input.layoutSlot) ||
    input.layoutSlot < 0 ||
    input.layoutSlot > 9999
  )
    invalid("PREPARED_SUBMISSION_EVIDENCE_V1_INVALID");
  return Object.freeze({
    assetFingerprint: input.assetFingerprint,
    layoutSlot: input.layoutSlot,
  });
}

function parsePreparedSubmissionEvidenceV1(input) {
  exact(input, [
    "version",
    "attemptId",
    "articleIdentityV1",
    "targetIdentityV1",
    "title",
    "body",
    "contentFingerprint",
    "deliveryMode",
    "images",
    "decisionKind",
  ]);
  if (
    input.version !== 1 ||
    !validTitle(input.title) ||
    !validBody(input.body) ||
    !FINGERPRINT.test(input.contentFingerprint) ||
    !DELIVERY_MODES.has(input.deliveryMode) ||
    !DECISION_KINDS.has(input.decisionKind) ||
    !Array.isArray(input.images) ||
    input.images.length > 5
  )
    invalid("PREPARED_SUBMISSION_EVIDENCE_V1_INVALID");
  let attemptId;
  try {
    attemptId = AttemptId.serialize(AttemptId.parse(input.attemptId));
  } catch (_) {
    return invalid("PREPARED_SUBMISSION_EVIDENCE_V1_INVALID");
  }
  const articleIdentityV1 = parseArticleIdentityV1(input.articleIdentityV1);
  const targetIdentityV1 = parseTargetIdentityV1(input.targetIdentityV1);
  if (targetIdentityV1.kind !== "platform")
    invalid("PREPARED_SUBMISSION_PLATFORM_TARGET_REQUIRED");
  for (let index = 0; index < input.images.length; index += 1)
    if (!Object.prototype.hasOwnProperty.call(input.images, index))
      invalid("PREPARED_SUBMISSION_EVIDENCE_V1_INVALID");
  const images = input.images.map(parseImage);
  if (
    new Set(images.map((image) => image.assetFingerprint)).size !==
    images.length
  )
    invalid("PREPARED_SUBMISSION_EVIDENCE_V1_INVALID");
  if (
    input.contentFingerprint !==
      preparedContentFingerprint({ title: input.title, body: input.body }) ||
    (input.deliveryMode === "text_only" && images.length !== 0) ||
    (input.deliveryMode === "with_images" && images.length === 0) ||
    (input.decisionKind === "continue_text_only" &&
      (input.deliveryMode !== "text_only" || images.length !== 0))
  )
    invalid("PREPARED_SUBMISSION_EVIDENCE_V1_INVALID");
  return Object.freeze({
    version: 1,
    attemptId,
    articleIdentityV1,
    targetIdentityV1,
    title: input.title,
    body: input.body,
    contentFingerprint: input.contentFingerprint,
    deliveryMode: input.deliveryMode,
    images: Object.freeze(images),
    decisionKind: input.decisionKind,
  });
}

function createTextOnlyPreparedSubmissionEvidenceV1(claim) {
  const value = claim || {};
  const snapshot = value.publicationSnapshot || {};
  const title = snapshot.title;
  const body = snapshot.body;
  return parsePreparedSubmissionEvidenceV1({
    version: 1,
    attemptId: value.regularPublicationAttemptId,
    articleIdentityV1: value.articleIdentityV1,
    targetIdentityV1: value.targetIdentityV1,
    title,
    body,
    contentFingerprint: preparedContentFingerprint({ title, body }),
    deliveryMode: "text_only",
    images: [],
    decisionKind: "initial",
  });
}

function createPreparedSubmission(input) {
  const value = input || {};
  exact(value, ["preparedSubmissionEvidenceV1", "submitPreparedPublication"]);
  const evidence = parsePreparedSubmissionEvidenceV1(
    value.preparedSubmissionEvidenceV1,
  );
  if (typeof value.submitPreparedPublication !== "function")
    invalid("PREPARED_SUBMISSION_CAPABILITY_INVALID");
  const capability = {
    preparedSubmissionEvidenceV1: evidence,
    submitPreparedPublication: async function () {
      return value.submitPreparedPublication();
    },
  };
  Object.defineProperties(capability, {
    toJSON: {
      enumerable: false,
      value: function () {
        throw dtoError("PREPARED_SUBMISSION_NOT_SERIALIZABLE");
      },
    },
    [util.inspect.custom]: {
      enumerable: false,
      value: function () {
        return "[PreparedSubmission]";
      },
    },
  });
  return Object.freeze(capability);
}

module.exports = Object.freeze({
  createPreparedSubmission,
  createTextOnlyPreparedSubmissionEvidenceV1,
  parseArticleIdentityV1,
  parsePreparedSubmissionEvidenceV1,
  parseTargetIdentityV1,
  preparedContentFingerprint,
});
