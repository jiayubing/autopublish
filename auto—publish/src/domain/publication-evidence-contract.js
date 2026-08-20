"use strict";

const { ClientId } = require("./identities");
const { exact, dtoError } = require("./safe-operational-error");
const {
  parseArticleIdentityV1,
  parseTargetIdentityV1,
  preparedContentFingerprint,
} = require("./regular-publication-contract");

const FINGERPRINT = /^[a-f0-9]{64}$/;
const REMOTE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/u;
const MISSING_REASONS = new Set([
  "LEGACY_SUBMISSION_CONTENT_UNAVAILABLE",
  "LEGACY_SUBMITTED_AT_UNAVAILABLE",
  "LEGACY_FIRST_PUBLISHED_AT_UNAVAILABLE",
  "LEGACY_IMAGE_SUMMARY_UNAVAILABLE",
]);
const EVIDENCE_KINDS = new Set([
  "PREPARED_SUBMISSION",
  "REGULAR_ACCEPTED_OBSERVATION",
  "MANUAL_POSITIVE_EVIDENCE",
  "PAID_ORDER_SNAPSHOT",
  "PAID_PUBLISHED_OBSERVATION",
  "LEGACY_EVIDENCE",
]);

function invalid(code = "PUBLICATION_EVIDENCE_V1_INVALID") {
  throw dtoError(code);
}

function displayText(value) {
  return (
    typeof value === "string" &&
    value.length >= 1 &&
    value.length <= 256 &&
    !/[\x00-\x1f\x7f]/.test(value) &&
    !/^(?:[A-Za-z]:[\\/]|\\\\|\/|file:)/i.test(value)
  );
}

function parseCustomerSnapshotV1(input) {
  exact(input, ["version", "clientId", "displayName"]);
  if (input.version !== 1 || !displayText(input.displayName))
    invalid("CUSTOMER_SNAPSHOT_V1_INVALID");
  let clientId;
  try {
    clientId = ClientId.serialize(ClientId.parse(input.clientId));
  } catch (_) {
    invalid("CUSTOMER_SNAPSHOT_V1_INVALID");
  }
  return Object.freeze({
    version: 1,
    clientId,
    displayName: input.displayName,
  });
}

function parseTargetSnapshotV1(input, options) {
  const allowLegacy = Boolean(options && options.allowLegacy);
  if (!input || typeof input !== "object" || Array.isArray(input))
    invalid("TARGET_SNAPSHOT_V1_INVALID");
  let identity;
  if (input.kind === "platform") {
    exact(input, [
      "version",
      "kind",
      "platformId",
      "platformName",
      "accountProfileId",
      "accountLabel",
    ]);
    if (!displayText(input.platformName) || !displayText(input.accountLabel))
      invalid("TARGET_SNAPSHOT_V1_INVALID");
    identity = parseTargetIdentityV1({
      version: input.version,
      kind: input.kind,
      platformId: input.platformId,
      accountProfileId: input.accountProfileId,
    });
    return Object.freeze({
      ...identity,
      platformName: input.platformName,
      accountLabel: input.accountLabel,
    });
  }
  if (input.kind === "media") {
    exact(input, ["version", "kind", "mediaResourceId", "mediaName"]);
    if (!displayText(input.mediaName)) invalid("TARGET_SNAPSHOT_V1_INVALID");
    identity = parseTargetIdentityV1({
      version: input.version,
      kind: input.kind,
      mediaResourceId: input.mediaResourceId,
    });
    return Object.freeze({ ...identity, mediaName: input.mediaName });
  }
  if (input.kind === "legacy-unknown-account") {
    exact(input, ["version", "kind", "platformId", "platformName"]);
    if (!allowLegacy) invalid("TARGET_SNAPSHOT_V1_ONLINE_REQUIRED");
    if (!displayText(input.platformName)) invalid("TARGET_SNAPSHOT_V1_INVALID");
    identity = parseTargetIdentityV1({
      version: input.version,
      kind: input.kind,
      platformId: input.platformId,
      autoExecutable: false,
    });
    return Object.freeze({
      version: 1,
      kind: identity.kind,
      platformId: identity.platformId,
      platformName: input.platformName,
    });
  }
  return invalid("TARGET_SNAPSHOT_V1_INVALID");
}

function parseImage(input) {
  exact(input, ["assetFingerprint", "layoutSlot"]);
  if (
    !FINGERPRINT.test(input.assetFingerprint) ||
    !Number.isInteger(input.layoutSlot) ||
    input.layoutSlot < 0 ||
    input.layoutSlot > 9999
  )
    invalid();
  return Object.freeze({
    assetFingerprint: input.assetFingerprint,
    layoutSlot: input.layoutSlot,
  });
}

function parseImageSummaryV1(input) {
  exact(input, ["deliveryMode", "images", "decisionKind"]);
  if (
    !["text_only", "with_images"].includes(input.deliveryMode) ||
    !Array.isArray(input.images) ||
    !denseArray(input.images) ||
    input.images.length > 5 ||
    ![
      "initial",
      "retry_preparation",
      "replace_image",
      "continue_text_only",
    ].includes(input.decisionKind)
  )
    invalid();
  const images = input.images.map(parseImage);
  if (
    new Set(images.map((image) => image.assetFingerprint)).size !==
      images.length ||
    (input.deliveryMode === "text_only" && images.length !== 0) ||
    (input.deliveryMode === "with_images" && images.length === 0) ||
    (input.decisionKind === "continue_text_only" &&
      input.deliveryMode !== "text_only")
  )
    invalid();
  return Object.freeze({
    deliveryMode: input.deliveryMode,
    images: Object.freeze(images),
    decisionKind: input.decisionKind,
  });
}

function timestamp(value) {
  return (
    typeof value === "string" &&
    value.length <= 64 &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString() === value
  );
}

function remoteUrl(value) {
  if (value === null) return null;
  if (typeof value !== "string" || value.length > 2048) invalid();
  try {
    const parsed = new globalThis.URL(value);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password)
      invalid();
    return value;
  } catch (_) {
    return invalid();
  }
}

function remoteId(value) {
  if (value === null) return null;
  if (typeof value !== "string" || !REMOTE_ID.test(value))
    invalid("PUBLICATION_EVIDENCE_V2_REMOTE_ID_INVALID");
  return value;
}

function parseSafeEvidenceRef(input) {
  exact(input, ["kind", "fingerprint"]);
  if (!EVIDENCE_KINDS.has(input.kind) || !FINGERPRINT.test(input.fingerprint))
    invalid();
  return Object.freeze({ kind: input.kind, fingerprint: input.fingerprint });
}

function hasReason(reasons, reason) {
  return reasons.includes(reason);
}

function denseArray(value) {
  for (let index = 0; index < value.length; index += 1)
    if (!Object.prototype.hasOwnProperty.call(value, index)) return false;
  return true;
}

function parsePublicationEvidenceV1(input, options) {
  const allowLegacy = Boolean(options && options.allowLegacy);
  exact(input, [
    "version",
    "articleIdentityV1",
    "customerSnapshotV1",
    "contentAvailable",
    "title",
    "body",
    "contentFingerprint",
    "targetSnapshotV1",
    "resultCode",
    "submittedAt",
    "submittedAtSource",
    "firstPublishedAt",
    "firstPublishedAtSource",
    "imageSummaryV1",
    "orderNumber",
    "remoteUrl",
    "missingReasons",
    "safeEvidenceRefs",
  ]);
  if (
    input.version !== 1 ||
    typeof input.contentAvailable !== "boolean" ||
    !["REGULAR_ACCEPTED", "PAID_PUBLISHED"].includes(input.resultCode) ||
    !Array.isArray(input.missingReasons) ||
    !denseArray(input.missingReasons) ||
    input.missingReasons.length > 4 ||
    new Set(input.missingReasons).size !== input.missingReasons.length ||
    input.missingReasons.some((reason) => !MISSING_REASONS.has(reason)) ||
    !Array.isArray(input.safeEvidenceRefs) ||
    !denseArray(input.safeEvidenceRefs) ||
    input.safeEvidenceRefs.length < 1 ||
    input.safeEvidenceRefs.length > 16
  )
    invalid();
  if (!allowLegacy && input.missingReasons.length)
    invalid("PUBLICATION_EVIDENCE_V1_ONLINE_REQUIRED");

  const articleIdentityV1 = parseArticleIdentityV1(input.articleIdentityV1);
  const customerSnapshotV1 = parseCustomerSnapshotV1(input.customerSnapshotV1);
  if (customerSnapshotV1.clientId !== articleIdentityV1.clientId) invalid();
  const targetSnapshotV1 = parseTargetSnapshotV1(input.targetSnapshotV1, {
    allowLegacy,
  });

  const contentMissing = hasReason(
    input.missingReasons,
    "LEGACY_SUBMISSION_CONTENT_UNAVAILABLE",
  );
  if (input.contentAvailable) {
    if (
      !displayText(input.title) ||
      typeof input.body !== "string" ||
      input.body.length < 1 ||
      input.body.length > 200000 ||
      /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(input.body) ||
      !FINGERPRINT.test(input.contentFingerprint) ||
      input.contentFingerprint !==
        preparedContentFingerprint({ title: input.title, body: input.body }) ||
      contentMissing
    )
      invalid();
  } else if (
    !allowLegacy ||
    input.title !== null ||
    input.body !== null ||
    input.contentFingerprint !== null ||
    !contentMissing
  ) {
    invalid();
  }

  const submittedMissing = hasReason(
    input.missingReasons,
    "LEGACY_SUBMITTED_AT_UNAVAILABLE",
  );
  const firstPublishedMissing = hasReason(
    input.missingReasons,
    "LEGACY_FIRST_PUBLISHED_AT_UNAVAILABLE",
  );
  if (
    (input.submittedAt === null) !== submittedMissing ||
    (input.submittedAt === null
      ? input.submittedAtSource !== "legacy_unavailable"
      : !timestamp(input.submittedAt) ||
        ![
          "regular_remote_call_started",
          "paid_order_remote_call_started",
        ].includes(input.submittedAtSource)) ||
    (input.firstPublishedAt === null) !== firstPublishedMissing ||
    (input.firstPublishedAt === null
      ? input.firstPublishedAtSource !== "legacy_unavailable"
      : !timestamp(input.firstPublishedAt) ||
        ![
          "provider_event_time",
          "first_positive_observation_time",
          "manual_positive_evidence_time",
        ].includes(input.firstPublishedAtSource))
  )
    invalid();

  const imageMissing = hasReason(
    input.missingReasons,
    "LEGACY_IMAGE_SUMMARY_UNAVAILABLE",
  );
  const imageSummaryV1 =
    input.imageSummaryV1 === null
      ? null
      : parseImageSummaryV1(input.imageSummaryV1);
  if (
    (imageSummaryV1 === null) !== imageMissing ||
    (!allowLegacy && imageMissing)
  )
    invalid();

  if (
    (input.resultCode === "REGULAR_ACCEPTED" &&
      (![
        "platform",
        ...(allowLegacy ? ["legacy-unknown-account"] : []),
      ].includes(targetSnapshotV1.kind) ||
        input.orderNumber !== null ||
        (input.submittedAt !== null &&
          input.submittedAtSource !== "regular_remote_call_started"))) ||
    (input.resultCode === "PAID_PUBLISHED" &&
      (targetSnapshotV1.kind !== "media" ||
        typeof input.orderNumber !== "string" ||
        input.orderNumber.length < 1 ||
        input.orderNumber.length > 128 ||
        /[\x00-\x1f\x7f]/.test(input.orderNumber) ||
        (input.submittedAt !== null &&
          input.submittedAtSource !== "paid_order_remote_call_started")))
  )
    invalid();
  const safeEvidenceRefs = input.safeEvidenceRefs.map(parseSafeEvidenceRef);
  if (
    new Set(
      safeEvidenceRefs.map(
        (reference) => `${reference.kind}\u0000${reference.fingerprint}`,
      ),
    ).size !== safeEvidenceRefs.length
  )
    invalid();

  return Object.freeze({
    version: 1,
    articleIdentityV1,
    customerSnapshotV1,
    contentAvailable: input.contentAvailable,
    title: input.title,
    body: input.body,
    contentFingerprint: input.contentFingerprint,
    targetSnapshotV1,
    resultCode: input.resultCode,
    submittedAt: input.submittedAt,
    submittedAtSource: input.submittedAtSource,
    firstPublishedAt: input.firstPublishedAt,
    firstPublishedAtSource: input.firstPublishedAtSource,
    imageSummaryV1,
    orderNumber: input.orderNumber,
    remoteUrl: remoteUrl(input.remoteUrl),
    missingReasons: Object.freeze([...input.missingReasons]),
    safeEvidenceRefs: Object.freeze(safeEvidenceRefs),
  });
}

function parsePublicationEvidenceV2(input, options) {
  exact(input, [
    "version",
    "articleIdentityV1",
    "customerSnapshotV1",
    "contentAvailable",
    "title",
    "body",
    "contentFingerprint",
    "targetSnapshotV1",
    "resultCode",
    "submittedAt",
    "submittedAtSource",
    "firstPublishedAt",
    "firstPublishedAtSource",
    "imageSummaryV1",
    "orderNumber",
    "remoteId",
    "remoteUrl",
    "missingReasons",
    "safeEvidenceRefs",
  ]);
  if (input.version !== 2) invalid("PUBLICATION_EVIDENCE_V2_INVALID");
  if (input.resultCode !== "REGULAR_ACCEPTED")
    invalid("PUBLICATION_EVIDENCE_V2_RESULT_INVALID");
  const { remoteId: inputRemoteId, ...v1Input } = input;
  const parsedV1 = parsePublicationEvidenceV1(
    { ...v1Input, version: 1 },
    options,
  );
  // V1 is deliberately closed.  V2 is the only online contract that can
  // preserve a regular platform's display-only remote identifier.
  const parsedRemoteId = remoteId(inputRemoteId);
  const manualPositive =
    parsedV1.firstPublishedAtSource === "manual_positive_evidence_time" &&
    parsedV1.safeEvidenceRefs.some(
      (reference) => reference.kind === "MANUAL_POSITIVE_EVIDENCE",
    );
  if (
    parsedV1.resultCode === "REGULAR_ACCEPTED" &&
    !parsedRemoteId &&
    !parsedV1.remoteUrl &&
    !manualPositive
  )
    invalid("REGULAR_ACCEPTED_REMOTE_IDENTITY_REQUIRED");
  return Object.freeze({
    ...parsedV1,
    version: 2,
    remoteId: parsedRemoteId,
  });
}

function parsePublicationEvidence(input, options) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    invalid("PUBLICATION_EVIDENCE_INVALID");
  if (input.version === 1) return parsePublicationEvidenceV1(input, options);
  if (input.version === 2) return parsePublicationEvidenceV2(input, options);
  return invalid("PUBLICATION_EVIDENCE_VERSION_UNSUPPORTED");
}

function projectPublicationLocator(input) {
  const evidence = parsePublicationEvidence(input, { allowLegacy: true });
  const remoteId = evidence.version === 2 ? evidence.remoteId : null;
  const manualWithoutLocator =
    evidence.resultCode === "REGULAR_ACCEPTED" &&
    evidence.firstPublishedAtSource === "manual_positive_evidence_time" &&
    evidence.safeEvidenceRefs.some(
      (reference) => reference.kind === "MANUAL_POSITIVE_EVIDENCE",
    ) &&
    !remoteId &&
    !evidence.remoteUrl;
  return Object.freeze({
    remoteId,
    remoteUrl: evidence.remoteUrl,
    displayStatus: manualWithoutLocator
      ? "MANUAL_CONFIRMED_NO_LOCATOR"
      : remoteId || evidence.remoteUrl
        ? "RECORDED"
        : "UNKNOWN_LEGACY",
  });
}

function parsePublicationLocator(input) {
  exact(input, ["remoteId", "remoteUrl", "displayStatus"]);
  if (
    ![
      "MANUAL_CONFIRMED_NO_LOCATOR",
      "RECORDED",
      "UNKNOWN_LEGACY",
    ].includes(input.displayStatus)
  )
    invalid("PUBLICATION_LOCATOR_INVALID");
  const parsedRemoteId = remoteId(input.remoteId);
  const parsedRemoteUrl = remoteUrl(input.remoteUrl);
  if (
    (input.displayStatus === "RECORDED" &&
      !parsedRemoteId &&
      !parsedRemoteUrl) ||
    (input.displayStatus === "MANUAL_CONFIRMED_NO_LOCATOR" &&
      (parsedRemoteId || parsedRemoteUrl)) ||
    (input.displayStatus === "UNKNOWN_LEGACY" &&
      (parsedRemoteId || parsedRemoteUrl))
  )
    invalid("PUBLICATION_LOCATOR_INVALID");
  return Object.freeze({
    remoteId: parsedRemoteId,
    remoteUrl: parsedRemoteUrl,
    displayStatus: input.displayStatus,
  });
}

module.exports = Object.freeze({
  parseCustomerSnapshotV1,
  parseImageSummaryV1,
  parsePublicationEvidence,
  parsePublicationEvidenceV1,
  parsePublicationEvidenceV2,
  parsePublicationLocator,
  parsePublicationRemoteId: remoteId,
  parseTargetSnapshotV1,
  projectPublicationLocator,
});
