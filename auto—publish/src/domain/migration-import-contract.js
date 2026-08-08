"use strict";

const {
  parseArticleIdentityV1,
  parseTargetIdentityV1,
} = require("./regular-publication-contract");
const {
  parsePublicationEvidenceV1,
} = require("./publication-evidence-contract");
const {
  parseOrderIdentityV1,
  parseOrderSnapshotV1,
  parsePaidTargetV1,
} = require("./paid-media-order-contract");
const {
  orderSnapshotFingerprint,
  parseOrderHistoryV1,
  parseOrderObservationV1,
} = require("./order-observation-contract");
const {
  parseClosedTargetV1,
  parseDeletionTransactionIdentityV1,
  parseTerminalTargetV1,
  parseTombstoneIdentityV1,
} = require("./article-lifecycle-terminal-contract");
const { dtoError, exact } = require("./safe-operational-error");

const FINGERPRINT = /^[a-f0-9]{64}$/u;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const VARIANTS = new Set([
  "publishedEvidence",
  "trackablePaidOrder",
  "pendingReadmission",
  "nonPublishedTerminal",
  "needsAttentionConflict",
  "deletionRecoveryConflict",
]);
const SOURCE_KINDS = new Set([
  "ARTICLE_RECORD",
  "QUEUE_RECORD",
  "SUBMISSION_RECORD",
  "ORDER_RECORD",
  "DELETION_RECORD",
]);
const CONFLICT_KINDS = new Set([
  "SUBMITTING_OR_UNPROVEN_SUBMITTED",
  "MISSING_ORDER_ID",
  "MULTIPLE_ACTIVE_TARGETS",
  "IDENTITY_CONFLICT",
  "CONTENT_CONFLICT",
  "UNKNOWN_FACT_COMBINATION",
]);
const DELETION_CONFLICT_KINDS = new Set([
  "PUBLISHED_IN_TRASH",
  "ORDERED_IN_TRASH",
  "ACTIVE_TARGET_IN_TRASH",
  "TOMBSTONE_CONFLICT",
  "RECOVERY_TRANSACTION_CONFLICT",
]);
const LEGACY_STATE_CODES = new Set([
  "REVIEW_PENDING",
  "REVIEW_APPROVED",
  "GENERATED",
  "SAVED",
  "QUEUED",
  "SUBMITTING",
  "SUBMITTED",
  "PUBLISHED",
  "FAILED",
  "UNCERTAIN",
  "PAID_ORDER_TRACKABLE",
  "PAID_ORDER_MISSING_ID",
  "TRASHED",
  "PERMANENTLY_DELETED",
  "RECOVERY_PENDING",
]);
const DELETION_FACT_KINDS = new Set([
  "PUBLICATION",
  "ORDER",
  "ACTIVE_TARGET",
  "TOMBSTONE",
  "RECOVERY_TRANSACTION",
]);
const NON_PUBLISHED_CLOSED_KINDS = new Set([
  "FAILED",
  "REJECTED",
  "CANCELLED",
  "PAID_STATUS_4",
]);

function invalid() {
  throw dtoError("IMPORT_PLAN_V1_INVALID");
}

function required(input, fields) {
  exact(input, fields);
  if (
    fields.some((field) => !Object.prototype.hasOwnProperty.call(input, field))
  )
    invalid();
}

function safeId(value) {
  if (
    typeof value !== "string" ||
    value === "." ||
    value === ".." ||
    !SAFE_ID.test(value)
  )
    invalid();
  return value;
}

function fingerprint(value) {
  if (typeof value !== "string" || !FINGERPRINT.test(value)) invalid();
  return value;
}

function denseArray(value, minimum, maximum) {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum)
    invalid();
  for (let index = 0; index < value.length; index += 1)
    if (!Object.prototype.hasOwnProperty.call(value, index)) invalid();
  return value;
}

function enumArray(value, allowed, maximum) {
  const parsed = denseArray(value, 0, maximum).map((item) => {
    if (!allowed.has(item)) invalid();
    return item;
  });
  if (new Set(parsed).size !== parsed.length) invalid();
  return Object.freeze(parsed);
}

function parsedArray(value, parse, maximum) {
  return Object.freeze(denseArray(value, 0, maximum).map(parse));
}

function same(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function articleKey(identity) {
  return `${identity.clientId}\u0000${identity.articleId}`;
}

function targetKey(identity) {
  if (identity.kind === "platform")
    return `platform\u0000${identity.platformId}\u0000${identity.accountProfileId}`;
  if (identity.kind === "media")
    return `media\u0000${identity.mediaResourceId}`;
  return `legacy-unknown-account\u0000${identity.platformId}`;
}

function snapshotTargetKey(snapshot) {
  if (snapshot.kind === "platform")
    return `platform\u0000${snapshot.platformId}\u0000${snapshot.accountProfileId}`;
  if (snapshot.kind === "media")
    return `media\u0000${snapshot.mediaResourceId}`;
  return `legacy-unknown-account\u0000${snapshot.platformId}`;
}

function parseLegacyEvidenceRefV1(input) {
  required(input, [
    "sourceKind",
    "sourceRecordIdHash",
    "sourceVersion",
    "evidenceFingerprint",
  ]);
  if (
    !SOURCE_KINDS.has(input.sourceKind) ||
    !Number.isSafeInteger(input.sourceVersion) ||
    input.sourceVersion < 1
  )
    invalid();
  return Object.freeze({
    sourceKind: input.sourceKind,
    sourceRecordIdHash: fingerprint(input.sourceRecordIdHash),
    sourceVersion: input.sourceVersion,
    evidenceFingerprint: fingerprint(input.evidenceFingerprint),
  });
}

function parseLegacyQueueEvidenceV1(input) {
  required(input, ["targetIdentityV1", "queueState", "remoteBoundaryCrossed"]);
  if (input.queueState !== "QUEUED" || input.remoteBoundaryCrossed !== false)
    invalid();
  return Object.freeze({
    targetIdentityV1: parseTargetIdentityV1(input.targetIdentityV1),
    queueState: "QUEUED",
    remoteBoundaryCrossed: false,
  });
}

function parseMigrationConflictEvidenceV1(input) {
  required(input, [
    "legacyStateCodes",
    "targetIdentityV1s",
    "orderIdentityV1s",
    "contentFingerprints",
  ]);
  const targetIdentityV1s = parsedArray(
    input.targetIdentityV1s,
    parseTargetIdentityV1,
    10000,
  );
  const orderIdentityV1s = parsedArray(
    input.orderIdentityV1s,
    parseOrderIdentityV1,
    10000,
  );
  const contentFingerprints = Object.freeze(
    denseArray(input.contentFingerprints, 0, 10000).map(fingerprint),
  );
  if (
    new Set(targetIdentityV1s.map(targetKey)).size !==
      targetIdentityV1s.length ||
    new Set(orderIdentityV1s.map((item) => item.orderId)).size !==
      orderIdentityV1s.length ||
    new Set(contentFingerprints).size !== contentFingerprints.length
  )
    invalid();
  return Object.freeze({
    legacyStateCodes: enumArray(input.legacyStateCodes, LEGACY_STATE_CODES, 64),
    targetIdentityV1s,
    orderIdentityV1s,
    contentFingerprints,
  });
}

function parseMigrationDeletionEvidenceV1(input) {
  required(input, [
    "tombstoneIdentityV1",
    "deletionTransactionIdentityV1",
    "conflictingFactKinds",
  ]);
  return Object.freeze({
    tombstoneIdentityV1:
      input.tombstoneIdentityV1 === null
        ? null
        : parseTombstoneIdentityV1(input.tombstoneIdentityV1),
    deletionTransactionIdentityV1:
      input.deletionTransactionIdentityV1 === null
        ? null
        : parseDeletionTransactionIdentityV1(
            input.deletionTransactionIdentityV1,
          ),
    conflictingFactKinds: enumArray(
      input.conflictingFactKinds,
      DELETION_FACT_KINDS,
      5,
    ),
  });
}

function parseRestoreEligibilityV1(input) {
  required(input, [
    "hasPublicationSuccess",
    "hasActiveTarget",
    "hasTrackableOrder",
    "hasOpenUncertainty",
  ]);
  for (const value of Object.values(input))
    if (typeof value !== "boolean") invalid();
  return Object.freeze({
    hasPublicationSuccess: input.hasPublicationSuccess,
    hasActiveTarget: input.hasActiveTarget,
    hasTrackableOrder: input.hasTrackableOrder,
    hasOpenUncertainty: input.hasOpenUncertainty,
  });
}

function bindArticle(entryArticle, nestedArticle) {
  if (!same(entryArticle, nestedArticle)) invalid();
}

function parsePublishedEvidence(payload, articleIdentityV1, orderIds) {
  required(payload, [
    "publicationEvidenceV1",
    "terminalTargetV1",
    "orderHistoryV1",
  ]);
  const publicationEvidenceV1 = parsePublicationEvidenceV1(
    payload.publicationEvidenceV1,
    { allowLegacy: true },
  );
  const terminalTargetV1 = parseTerminalTargetV1(payload.terminalTargetV1);
  const orderHistoryV1 =
    payload.orderHistoryV1 === null
      ? null
      : parseOrderHistoryV1(payload.orderHistoryV1);
  bindArticle(articleIdentityV1, publicationEvidenceV1.articleIdentityV1);
  bindArticle(articleIdentityV1, terminalTargetV1.articleIdentityV1);
  if (
    terminalTargetV1.terminalKind !== "PUBLISHED" ||
    targetKey(terminalTargetV1.targetIdentityV1) !==
      snapshotTargetKey(publicationEvidenceV1.targetSnapshotV1) ||
    (orderHistoryV1 &&
      (publicationEvidenceV1.resultCode !== "PAID_PUBLISHED" ||
        orderHistoryV1.orderIdentityV1.orderId !==
          publicationEvidenceV1.orderNumber))
  )
    invalid();
  if (orderHistoryV1) orderIds.add(orderHistoryV1.orderIdentityV1.orderId);
  return Object.freeze({
    publicationEvidenceV1,
    terminalTargetV1,
    orderHistoryV1,
  });
}

function parseTrackablePaidOrder(payload, articleIdentityV1, orderIds) {
  required(payload, ["orderSnapshotV1", "orderObservationV1", "paidTargetV1"]);
  const orderSnapshotV1 = parseOrderSnapshotV1(payload.orderSnapshotV1);
  const orderObservationV1 = parseOrderObservationV1(
    payload.orderObservationV1,
  );
  const paidTargetV1 = parsePaidTargetV1(payload.paidTargetV1);
  bindArticle(articleIdentityV1, orderSnapshotV1.articleIdentityV1);
  bindArticle(articleIdentityV1, paidTargetV1.articleIdentityV1);
  if (
    !["0", "1", "9"].includes(orderObservationV1.statusCode) ||
    paidTargetV1.state !== "ACTIVE_TRACKING" ||
    !same(
      orderSnapshotV1.orderIdentityV1,
      orderObservationV1.orderIdentityV1,
    ) ||
    !same(orderSnapshotV1.orderIdentityV1, paidTargetV1.orderIdentityV1) ||
    !same(orderSnapshotV1.targetIdentityV1, paidTargetV1.targetIdentityV1) ||
    orderSnapshotV1.orderCreationAttemptId !==
      paidTargetV1.orderCreationAttemptId ||
    orderObservationV1.orderSnapshotFingerprint !==
      orderSnapshotFingerprint(orderSnapshotV1)
  )
    invalid();
  orderIds.add(orderSnapshotV1.orderIdentityV1.orderId);
  return Object.freeze({ orderSnapshotV1, orderObservationV1, paidTargetV1 });
}

function parsePendingReadmission(payload, articleIdentityV1) {
  required(payload, [
    "legacyQueueEvidenceV1",
    "closedTargetV1",
    "readmissionReason",
  ]);
  const legacyQueueEvidenceV1 = parseLegacyQueueEvidenceV1(
    payload.legacyQueueEvidenceV1,
  );
  const closedTargetV1 = parseClosedTargetV1(payload.closedTargetV1);
  bindArticle(articleIdentityV1, closedTargetV1.articleIdentityV1);
  if (
    payload.readmissionReason !== "PROVEN_PRE_REMOTE_QUEUE" ||
    closedTargetV1.closedKind !== "PRE_REMOTE_QUEUE_CLOSED" ||
    !same(
      legacyQueueEvidenceV1.targetIdentityV1,
      closedTargetV1.targetIdentityV1,
    )
  )
    invalid();
  return Object.freeze({
    legacyQueueEvidenceV1,
    closedTargetV1,
    readmissionReason: "PROVEN_PRE_REMOTE_QUEUE",
  });
}

function parseNonPublishedTerminal(payload, articleIdentityV1, orderIds) {
  required(payload, [
    "closedTargetV1",
    "orderHistoryV1",
    "restoreEligibilityV1",
  ]);
  const closedTargetV1 = parseClosedTargetV1(payload.closedTargetV1);
  const orderHistoryV1 =
    payload.orderHistoryV1 === null
      ? null
      : parseOrderHistoryV1(payload.orderHistoryV1);
  const restoreEligibilityV1 = parseRestoreEligibilityV1(
    payload.restoreEligibilityV1,
  );
  bindArticle(articleIdentityV1, closedTargetV1.articleIdentityV1);
  const paidTarget = closedTargetV1.targetIdentityV1.kind === "media";
  const terminalEvidenceMatches =
    !orderHistoryV1 ||
    orderHistoryV1.entries.some((entry) => {
      if (closedTargetV1.closedKind === "PAID_STATUS_4")
        return (
          (entry.kind === "observation" &&
            entry.orderObservationV1.statusCode === "4") ||
          (entry.kind === "terminal" &&
            entry.terminalObservationV1.terminalKind === "REJECTED")
        );
      if (closedTargetV1.closedKind === "REJECTED")
        return (
          entry.kind === "terminal" &&
          entry.terminalObservationV1.terminalKind === "REJECTED"
        );
      if (closedTargetV1.closedKind === "CANCELLED")
        return (
          entry.kind === "terminal" &&
          entry.terminalObservationV1.terminalKind === "CANCELLED"
        );
      return entry.kind === "terminal";
    });
  if (
    !NON_PUBLISHED_CLOSED_KINDS.has(closedTargetV1.closedKind) ||
    (orderHistoryV1 === null) !== !paidTarget ||
    (closedTargetV1.closedKind === "PAID_STATUS_4" && !paidTarget) ||
    !terminalEvidenceMatches
  )
    invalid();
  if (orderHistoryV1) orderIds.add(orderHistoryV1.orderIdentityV1.orderId);
  return Object.freeze({
    closedTargetV1,
    orderHistoryV1,
    restoreEligibilityV1,
  });
}

function parseNeedsAttentionConflict(payload, _articleIdentityV1, orderIds) {
  required(payload, [
    "conflictKind",
    "migrationConflictEvidenceV1",
    "freezeReasonCode",
  ]);
  if (
    !CONFLICT_KINDS.has(payload.conflictKind) ||
    payload.freezeReasonCode !== "MIGRATION_CONFLICT"
  )
    invalid();
  const migrationConflictEvidenceV1 = parseMigrationConflictEvidenceV1(
    payload.migrationConflictEvidenceV1,
  );
  if (
    (payload.conflictKind === "MULTIPLE_ACTIVE_TARGETS" &&
      migrationConflictEvidenceV1.targetIdentityV1s.length < 2) ||
    (payload.conflictKind === "CONTENT_CONFLICT" &&
      migrationConflictEvidenceV1.contentFingerprints.length < 2)
  )
    invalid();
  for (const identity of migrationConflictEvidenceV1.orderIdentityV1s)
    orderIds.add(identity.orderId);
  return Object.freeze({
    conflictKind: payload.conflictKind,
    migrationConflictEvidenceV1,
    freezeReasonCode: "MIGRATION_CONFLICT",
  });
}

function parseDeletionRecoveryConflict(payload, articleIdentityV1) {
  required(payload, [
    "deletionConflictKind",
    "migrationDeletionEvidenceV1",
    "freezeReasonCode",
  ]);
  if (
    !DELETION_CONFLICT_KINDS.has(payload.deletionConflictKind) ||
    payload.freezeReasonCode !== "MIGRATION_DELETION_CONFLICT"
  )
    invalid();
  const migrationDeletionEvidenceV1 = parseMigrationDeletionEvidenceV1(
    payload.migrationDeletionEvidenceV1,
  );
  if (migrationDeletionEvidenceV1.tombstoneIdentityV1)
    bindArticle(
      articleIdentityV1,
      migrationDeletionEvidenceV1.tombstoneIdentityV1.articleIdentityV1,
    );
  if (
    migrationDeletionEvidenceV1.deletionTransactionIdentityV1 &&
    !migrationDeletionEvidenceV1.deletionTransactionIdentityV1.articleIdentitiesV1.some(
      (identity) => same(identity, articleIdentityV1),
    )
  )
    invalid();
  const requiredFact = {
    PUBLISHED_IN_TRASH: "PUBLICATION",
    ORDERED_IN_TRASH: "ORDER",
    ACTIVE_TARGET_IN_TRASH: "ACTIVE_TARGET",
    TOMBSTONE_CONFLICT: "TOMBSTONE",
    RECOVERY_TRANSACTION_CONFLICT: "RECOVERY_TRANSACTION",
  }[payload.deletionConflictKind];
  if (!migrationDeletionEvidenceV1.conflictingFactKinds.includes(requiredFact))
    invalid();
  return Object.freeze({
    deletionConflictKind: payload.deletionConflictKind,
    migrationDeletionEvidenceV1,
    freezeReasonCode: "MIGRATION_DELETION_CONFLICT",
  });
}

function parseEntry(input) {
  required(input, [
    "entryId",
    "variant",
    "articleIdentityV1",
    "legacySourceFingerprint",
    "legacyEvidenceRefs",
    "payload",
  ]);
  if (!VARIANTS.has(input.variant)) invalid();
  const articleIdentityV1 = parseArticleIdentityV1(input.articleIdentityV1);
  const legacyEvidenceRefs = Object.freeze(
    denseArray(input.legacyEvidenceRefs, 1, 10000).map(
      parseLegacyEvidenceRefV1,
    ),
  );
  if (
    new Set(
      legacyEvidenceRefs.map(
        (reference) =>
          `${reference.sourceKind}\u0000${reference.sourceRecordIdHash}\u0000${reference.evidenceFingerprint}`,
      ),
    ).size !== legacyEvidenceRefs.length
  )
    invalid();
  const orderIds = new Set();
  const parsePayload = {
    publishedEvidence: parsePublishedEvidence,
    trackablePaidOrder: parseTrackablePaidOrder,
    pendingReadmission: parsePendingReadmission,
    nonPublishedTerminal: parseNonPublishedTerminal,
    needsAttentionConflict: parseNeedsAttentionConflict,
    deletionRecoveryConflict: parseDeletionRecoveryConflict,
  }[input.variant];
  const payload = parsePayload(input.payload, articleIdentityV1, orderIds);
  return {
    value: Object.freeze({
      entryId: safeId(input.entryId),
      variant: input.variant,
      articleIdentityV1,
      legacySourceFingerprint: fingerprint(input.legacySourceFingerprint),
      legacyEvidenceRefs,
      payload,
    }),
    articleKey: articleKey(articleIdentityV1),
    orderIds,
  };
}

function parseImportPlanV1(input) {
  required(input, [
    "version",
    "migrationRunId",
    "workspaceFingerprint",
    "sourceFingerprint",
    "planFingerprint",
    "entries",
  ]);
  if (input.version !== 1) invalid();
  const parsedEntries = denseArray(input.entries, 0, 100000).map(parseEntry);
  const articleKeys = new Set();
  const orderIds = new Set();
  const entryIds = new Set();
  for (const parsed of parsedEntries) {
    if (
      articleKeys.has(parsed.articleKey) ||
      entryIds.has(parsed.value.entryId)
    )
      invalid();
    articleKeys.add(parsed.articleKey);
    entryIds.add(parsed.value.entryId);
    for (const orderId of parsed.orderIds) {
      if (orderIds.has(orderId)) invalid();
      orderIds.add(orderId);
    }
  }
  return Object.freeze({
    version: 1,
    migrationRunId: safeId(input.migrationRunId),
    workspaceFingerprint: fingerprint(input.workspaceFingerprint),
    sourceFingerprint: fingerprint(input.sourceFingerprint),
    planFingerprint: fingerprint(input.planFingerprint),
    entries: Object.freeze(parsedEntries.map((entry) => entry.value)),
  });
}

module.exports = Object.freeze({ parseImportPlanV1 });
