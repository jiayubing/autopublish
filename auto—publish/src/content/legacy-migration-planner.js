"use strict";

const crypto = require("node:crypto");

const domain = require("../domain");
const {
  createLegacyMigrationReader,
  readLegacyEvidence,
} = require("./legacy-migration-reader");

const FINGERPRINT = /^[a-f0-9]{64}$/u;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;

const LEGACY_STATE_ORDER = Object.freeze([
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

const LEGACY_CLASSIFICATION_MATRIX = Object.freeze({
  REVIEW_PENDING: Object.freeze({
    result: "ignored",
    reason: "review_is_not_a_gate",
  }),
  REVIEW_APPROVED: Object.freeze({
    result: "ignored",
    reason: "review_is_not_a_gate",
  }),
  GENERATED: Object.freeze({ result: "ignored", reason: "content_record" }),
  SAVED: Object.freeze({ result: "ignored", reason: "content_record" }),
  QUEUED: Object.freeze({
    result: "pendingReadmission",
    reason: "pre_remote_queue",
  }),
  SUBMITTING: Object.freeze({
    result: "needsAttentionConflict",
    reason: "remote_boundary_uncertain",
  }),
  SUBMITTED: Object.freeze({
    result: "needsAttentionConflict",
    reason: "acceptance_unproven",
  }),
  PUBLISHED: Object.freeze({
    result: "publishedEvidence",
    reason: "trusted_success",
  }),
  FAILED: Object.freeze({
    result: "nonPublishedTerminal",
    reason: "explicit_failure",
  }),
  UNCERTAIN: Object.freeze({
    result: "needsAttentionConflict",
    reason: "remote_result_uncertain",
  }),
  PAID_ORDER_TRACKABLE: Object.freeze({
    result: "trackablePaidOrder",
    reason: "known_order",
  }),
  PAID_ORDER_MISSING_ID: Object.freeze({
    result: "needsAttentionConflict",
    reason: "order_identity_missing",
  }),
  TRASHED: Object.freeze({
    result: "deletionRecoveryConflict",
    reason: "trash_evidence",
  }),
  PERMANENTLY_DELETED: Object.freeze({
    result: "deletionRecoveryConflict",
    reason: "deletion_evidence",
  }),
  RECOVERY_PENDING: Object.freeze({
    result: "deletionRecoveryConflict",
    reason: "recovery_incomplete",
  }),
});

const REPORT_VERSION = 1;
const VARIANT_NAMES = Object.freeze([
  "publishedEvidence",
  "trackablePaidOrder",
  "pendingReadmission",
  "nonPublishedTerminal",
  "needsAttentionConflict",
  "deletionRecoveryConflict",
]);

function plannerError(code, message) {
  const error = new Error(message || code);
  error.code = code;
  return error;
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function clone(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function digest(value) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(canonicalize(value)), "utf8")
    .digest("hex");
}

function canonicalize(value) {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(canonicalize);
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalize(value[key])]),
  );
}

function freeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value))
    return value;
  Object.freeze(value);
  Object.keys(value).forEach((key) => freeze(value[key]));
  return value;
}

function has(value, key) {
  return isObject(value) && Object.prototype.hasOwnProperty.call(value, key);
}

function firstValue(...values) {
  return values.find(
    (value) => value !== undefined && value !== null && value !== "",
  );
}

function text(value) {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function validFingerprint(value) {
  return typeof value === "string" && FINGERPRINT.test(value);
}

function validId(value) {
  return typeof value === "string" && SAFE_ID.test(value);
}

function validInstant(value) {
  return (
    typeof value === "string" &&
    value.length <= 64 &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString() === value
  );
}

function safeCode(value, fallback) {
  const candidate = text(value);
  return /^[A-Z][A-Z0-9_]{0,79}$/u.test(candidate) ? candidate : fallback;
}

function nested(record, key) {
  if (has(record, key)) return record[key];
  if (isObject(record.payload) && has(record.payload, key))
    return record.payload[key];
  return undefined;
}

function safeSourceRef(record) {
  return text(record && record.sourceRef) || "record:unknown";
}

function sourceKindOf(record, fallback) {
  return text(record && record.sourceKind) || fallback;
}

function articleKey(identity) {
  return identity ? `${identity.clientId}\u0000${identity.articleId}` : null;
}

function targetKey(identity) {
  if (!identity) return null;
  if (identity.kind === "platform")
    return `platform\u0000${identity.platformId}\u0000${identity.accountProfileId}`;
  if (identity.kind === "media")
    return `media\u0000${identity.mediaResourceId}`;
  return `legacy-unknown-account\u0000${identity.platformId}`;
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function parseArticle(value) {
  if (
    !isObject(value) ||
    value.version !== 1 ||
    !validId(text(value.clientId)) ||
    !validId(text(value.articleId))
  )
    return null;
  return {
    version: 1,
    clientId: text(value.clientId),
    articleId: text(value.articleId),
  };
}

function parseTarget(value) {
  if (!isObject(value) || value.version !== 1) return null;
  if (
    value.kind === "platform" &&
    text(value.platformId) &&
    text(value.accountProfileId)
  )
    return {
      version: 1,
      kind: "platform",
      platformId: text(value.platformId),
      accountProfileId: text(value.accountProfileId),
    };
  if (value.kind === "media" && text(value.mediaResourceId))
    return {
      version: 1,
      kind: "media",
      mediaResourceId: text(value.mediaResourceId),
    };
  if (
    value.kind === "legacy-unknown-account" &&
    text(value.platformId) &&
    value.autoExecutable === false
  )
    return {
      version: 1,
      kind: "legacy-unknown-account",
      platformId: text(value.platformId),
      autoExecutable: false,
    };
  return null;
}

function parseOrder(value) {
  if (!isObject(value) || value.version !== 1 || !text(value.orderId))
    return null;
  return { version: 1, orderId: text(value.orderId) };
}

function directArticleCandidates(record) {
  return [
    record && record.articleIdentityV1,
    nested(record, "publicationEvidenceV1") &&
      nested(record, "publicationEvidenceV1").articleIdentityV1,
    nested(record, "terminalTargetV1") &&
      nested(record, "terminalTargetV1").articleIdentityV1,
    nested(record, "closedTargetV1") &&
      nested(record, "closedTargetV1").articleIdentityV1,
    nested(record, "orderSnapshotV1") &&
      nested(record, "orderSnapshotV1").articleIdentityV1,
    nested(record, "paidTargetV1") &&
      nested(record, "paidTargetV1").articleIdentityV1,
  ].filter(Boolean);
}

function targetCandidates(record) {
  return [
    record && record.targetIdentityV1,
    nested(record, "publicationEvidenceV1") &&
      nested(record, "publicationEvidenceV1").targetSnapshotV1,
    nested(record, "terminalTargetV1") &&
      nested(record, "terminalTargetV1").targetIdentityV1,
    nested(record, "closedTargetV1") &&
      nested(record, "closedTargetV1").targetIdentityV1,
    nested(record, "orderSnapshotV1") &&
      nested(record, "orderSnapshotV1").targetIdentityV1,
    nested(record, "paidTargetV1") &&
      nested(record, "paidTargetV1").targetIdentityV1,
    nested(record, "legacyQueueEvidenceV1") &&
      nested(record, "legacyQueueEvidenceV1").targetIdentityV1,
    record && record.target,
  ].filter(Boolean);
}

function targetFromSnapshot(value) {
  if (!isObject(value) || typeof value.kind !== "string") return null;
  if (value.kind === "legacy-unknown-account") {
    return parseTarget({
      version: 1,
      kind: value.kind,
      platformId: value.platformId,
      autoExecutable: false,
    });
  }
  return parseTarget({
    version: 1,
    kind: value.kind,
    ...(value.kind === "media"
      ? { mediaResourceId: value.mediaResourceId }
      : {
          platformId: value.platformId,
          accountProfileId: value.accountProfileId,
        }),
  });
}

function targetInfoFromRecord(record) {
  const candidates = targetCandidates(record);
  const parsedCandidates = [];
  for (const candidate of candidates) {
    const parsed = parseTarget(candidate) || targetFromSnapshot(candidate);
    if (parsed) parsedCandidates.push(parsed);
  }
  if (
    parsedCandidates.length > 1 &&
    parsedCandidates.some(
      (item) => targetKey(item) !== targetKey(parsedCandidates[0]),
    )
  )
    return { target: parsedCandidates[0], invalid: true };
  const mediaResourceId = text(
    firstValue(
      record && record.mediaResourceId,
      record && record.resourceId,
      record && record.resource_id,
    ),
  );
  const platformId = text(
    firstValue(
      record && record.platformId,
      record && record.targetPlatformId,
      record && record.targetPlatform,
    ),
  );
  const accountProfileId = text(
    firstValue(record && record.accountProfileId, record && record.accountId),
  );
  let explicitTarget = null;
  if (mediaResourceId && validId(mediaResourceId))
    explicitTarget = parseTarget({
      version: 1,
      kind: "media",
      mediaResourceId,
    });
  else if (platformId) {
    explicitTarget = accountProfileId
      ? parseTarget({
          version: 1,
          kind: "platform",
          platformId,
          accountProfileId,
        })
      : parseTarget({
          version: 1,
          kind: "legacy-unknown-account",
          platformId,
          autoExecutable: false,
        });
  }
  if (parsedCandidates.length)
    return {
      target: parsedCandidates[0],
      invalid: Boolean(
        (explicitTarget &&
          targetKey(explicitTarget) !== targetKey(parsedCandidates[0])) ||
        (mediaResourceId &&
          (parsedCandidates[0].kind !== "media" ||
            mediaResourceId !== parsedCandidates[0].mediaResourceId)) ||
        (platformId &&
          (parsedCandidates[0].kind === "media" ||
            platformId !== parsedCandidates[0].platformId)) ||
        (accountProfileId &&
          (parsedCandidates[0].kind !== "platform" ||
            accountProfileId !== parsedCandidates[0].accountProfileId)),
      ),
    };
  if (mediaResourceId && validId(mediaResourceId))
    return {
      target: parseTarget({ version: 1, kind: "media", mediaResourceId }),
      invalid: candidates.length > 0,
    };
  if (!platformId) return { target: null, invalid: candidates.length > 0 };
  if (accountProfileId && validId(accountProfileId))
    return {
      target: parseTarget({
        version: 1,
        kind: "platform",
        platformId,
        accountProfileId,
      }),
      invalid: candidates.length > 0,
    };
  return {
    target: parseTarget({
      version: 1,
      kind: "legacy-unknown-account",
      platformId,
      autoExecutable: false,
    }),
    invalid: candidates.length > 0,
  };
}

function articleFromRecord(record, articleById) {
  const candidates = directArticleCandidates(record);
  const parsed = candidates.map(parseArticle).filter(Boolean);
  const explicitId = text(
    firstValue(record && record.articleId, record && record.generatedArticleId),
  );
  const explicitClientId = text(record && record.clientId);
  const explicitIdentity =
    explicitId && explicitClientId
      ? parseArticle({
          version: 1,
          clientId: explicitClientId,
          articleId: explicitId,
        })
      : null;
  const identitiesForExplicitId = explicitId
    ? articleById.get(explicitId) || []
    : [];
  const flatIdentity =
    explicitIdentity ||
    (identitiesForExplicitId.length === 1 ? identitiesForExplicitId[0] : null);
  if (parsed.length && parsed.some((item) => !sameJson(item, parsed[0])))
    return { identity: flatIdentity, invalid: true };
  if (parsed.length)
    return {
      identity:
        flatIdentity && !sameJson(flatIdentity, parsed[0])
          ? flatIdentity
          : parsed[0],
      invalid: Boolean(
        (explicitId && explicitId !== parsed[0].articleId) ||
        (explicitClientId && explicitClientId !== parsed[0].clientId) ||
        (explicitId && explicitClientId && !explicitIdentity),
      ),
    };
  const id = text(
    firstValue(
      record && record.articleId,
      record && record.generatedArticleId,
      record && record.id,
    ),
  );
  const clientId = text(record && record.clientId);
  if (id && clientId) {
    const identity = parseArticle({ version: 1, clientId, articleId: id });
    return { identity, invalid: candidates.length > 0 || !identity };
  }
  if (id) {
    const candidatesById = articleById.get(id) || [];
    if (candidatesById.length === 1)
      return { identity: candidatesById[0], invalid: candidates.length > 0 };
    if (candidatesById.length > 1) return { identity: null, invalid: true };
  }
  return { identity: null, invalid: true };
}

function orderFromRecord(record) {
  const nestedOrder = [
    record && record.orderIdentityV1,
    nested(record, "orderSnapshotV1") &&
      nested(record, "orderSnapshotV1").orderIdentityV1,
    nested(record, "orderObservationV1") &&
      nested(record, "orderObservationV1").orderIdentityV1,
    nested(record, "paidTargetV1") &&
      nested(record, "paidTargetV1").orderIdentityV1,
  ].filter(Boolean);
  const parsedOrders = nestedOrder.map(parseOrder).filter(Boolean);
  const explicitOrderId = text(
    firstValue(
      record && record.orderId,
      record && record.orderNid,
      record && record.orderNumber,
      nested(record, "publicationEvidenceV1") &&
        nested(record, "publicationEvidenceV1").orderNumber,
    ),
  );
  if (
    parsedOrders.length > 1 &&
    parsedOrders.some((item) => item.orderId !== parsedOrders[0].orderId)
  )
    return { identity: parsedOrders[0], invalid: true };
  if (parsedOrders.length)
    return {
      identity: parsedOrders[0],
      invalid: Boolean(
        explicitOrderId && explicitOrderId !== parsedOrders[0].orderId,
      ),
    };
  const orderId = text(
    firstValue(
      record && record.orderId,
      record && record.orderNid,
      record && record.orderNumber,
      nested(record, "publicationEvidenceV1") &&
        nested(record, "publicationEvidenceV1").orderNumber,
    ),
  );
  if (!orderId) return { identity: null, invalid: false };
  const identity = parseOrder({ version: 1, orderId });
  return { identity, invalid: nestedOrder.length > 0 || !identity };
}

function statusOf(record) {
  const explicitOrderStatus = text(
    firstValue(
      record && record.statusCode,
      record && record.supplierStatusCode,
    ),
  );
  const orderStatus =
    explicitOrderStatus ||
    (["0", "1", "2", "4", "9"].includes(text(record && record.status))
      ? text(record.status)
      : "");
  const raw = text(
    firstValue(
      record && record.status,
      record && record.publicationStatus,
      record && record.outcomeStatus,
    ),
  ).toLowerCase();
  return { raw, orderStatus };
}

function contentFingerprintsOf(record) {
  const result = new Set();
  const add = (value) => {
    if (validFingerprint(value)) result.add(value);
  };
  add(record && record.contentFingerprint);
  const publication = nested(record, "publicationEvidenceV1");
  const snapshot = nested(record, "orderSnapshotV1");
  add(publication && publication.contentFingerprint);
  add(snapshot && snapshot.contentFingerprint);
  try {
    if (typeof record.title === "string" && typeof record.content === "string")
      add(
        domain.preparedContentFingerprint({
          title: record.title,
          body: record.content,
        }),
      );
  } catch (error) {
    // Invalid authored content is classified by the planner; it is not emitted as a diagnostic.
  }
  try {
    if (
      typeof record.submittedTitle === "string" &&
      typeof record.submittedBody === "string"
    )
      add(
        domain.contentFingerprint(record.submittedTitle, record.submittedBody),
      );
  } catch (error) {
    // Missing or malformed historical content is handled as an evidence gap.
  }
  return result;
}

function submittedContentFingerprintOf(record) {
  const result = new Set();
  const add = (value) => {
    if (validFingerprint(value)) result.add(value);
  };
  const publication = nested(record, "publicationEvidenceV1");
  const snapshot = nested(record, "orderSnapshotV1");
  add(publication && publication.contentFingerprint);
  add(snapshot && snapshot.contentFingerprint);
  try {
    if (
      typeof record.submittedTitle === "string" &&
      typeof record.submittedBody === "string"
    )
      add(
        domain.contentFingerprint(record.submittedTitle, record.submittedBody),
      );
  } catch (error) {
    // Keep the evidence gap in the classification, not in diagnostics.
  }
  return result;
}

function stateCodesForRecord(record, kind) {
  const result = new Set();
  const add = (value) => {
    if (LEGACY_STATE_ORDER.includes(value)) result.add(value);
  };
  const status = statusOf(record);
  const sourceKind = sourceKindOf(record, kind);
  const review = text(
    firstValue(record.reviewStatus, record.reviewState),
  ).toLowerCase();
  if (review === "pending" || review === "review_pending")
    add("REVIEW_PENDING");
  if (
    review === "approved" ||
    review === "reviewed" ||
    review === "review_approved"
  )
    add("REVIEW_APPROVED");
  if (record.reviewedAt) add("REVIEW_APPROVED");
  if (status.raw === "generated") add("GENERATED");
  if (status.raw === "saved") add("SAVED");
  if (status.raw === "queued" || record.queueState === "QUEUED") add("QUEUED");
  if (
    ["remote_started", "submitting", "reserving", "claimed"].includes(
      status.raw,
    )
  )
    add("SUBMITTING");
  if (status.raw === "submitted") add("SUBMITTED");
  if (
    status.raw === "published" ||
    record.published === true ||
    record.accepted === true
  )
    add("PUBLISHED");
  if (
    ["failed", "rejected", "cancelled", "canceled"].includes(status.raw) ||
    status.orderStatus === "4"
  )
    add("FAILED");
  if (
    ["uncertain", "unknown"].includes(status.raw) ||
    record.uncertain === true
  )
    add("UNCERTAIN");
  if (["0", "1", "9"].includes(status.orderStatus)) add("PAID_ORDER_TRACKABLE");
  if (
    sourceKind === "ORDER_RECORD" &&
    ["0", "1", "2", "4", "9"].includes(status.orderStatus) &&
    !orderFromRecord(record).identity
  )
    add("PAID_ORDER_MISSING_ID");
  if (
    record.deleted === true ||
    record.trashed === true ||
    record.state === "TRASHED" ||
    ["trash", "trashed"].includes(status.raw)
  )
    add("TRASHED");
  if (
    record.permanentlyDeleted === true ||
    record.state === "PERMANENTLY_DELETED" ||
    status.raw === "permanently_deleted"
  )
    add("PERMANENTLY_DELETED");
  if (
    ["pending", "needs_repair", "pending_recovery"].includes(
      text(record.state).toLowerCase(),
    )
  )
    add("RECOVERY_PENDING");
  return result;
}

function recordIsSuccess(fact) {
  const evidence = nested(fact.record, "publicationEvidenceV1");
  if (
    isObject(evidence) &&
    ["REGULAR_ACCEPTED", "PAID_PUBLISHED"].includes(evidence.resultCode)
  )
    return Boolean(fact.target);
  const status = statusOf(fact.record);
  if (fact.target && fact.target.kind === "media") {
    return (
      (status.orderStatus === "2" ||
        status.raw === "published" ||
        fact.record.published === true) &&
      Boolean(fact.order)
    );
  }
  return (
    status.raw === "published" ||
    fact.record.accepted === true ||
    text(fact.record.outcomeStatus).toLowerCase() === "accepted"
  );
}

function recordIsUncertain(fact) {
  const status = statusOf(fact.record);
  if (
    ["uncertain", "unknown", "remote_started", "submitting"].includes(
      status.raw,
    )
  )
    return true;
  if (status.raw === "submitted" && !recordIsSuccess(fact)) return true;
  if (fact.record.remoteBoundaryCrossed === true && status.raw === "queued")
    return true;
  if (fact.record.uncertain === true) return true;
  return false;
}

function recordIsPendingQueue(fact) {
  const status = statusOf(fact.record);
  return (
    (status.raw === "queued" || fact.record.queueState === "QUEUED") &&
    fact.record.remoteBoundaryCrossed !== true &&
    Boolean(fact.target)
  );
}

function recordIsTrackableOrder(fact) {
  const status = statusOf(fact.record);
  return (
    fact.target &&
    fact.target.kind === "media" &&
    fact.order &&
    ["0", "1", "9"].includes(status.orderStatus)
  );
}

function recordIsTerminal(fact) {
  const status = statusOf(fact.record);
  if (recordIsSuccess(fact) || recordIsUncertain(fact)) return false;
  if (status.orderStatus === "4") return true;
  return ["failed", "rejected", "cancelled", "canceled"].includes(status.raw);
}

function timeFor(record, fields) {
  for (const field of fields) {
    if (validInstant(record && record[field])) return record[field];
  }
  return null;
}

function sourceVersionOf(record) {
  return Number.isSafeInteger(record && record.version) && record.version >= 1
    ? record.version
    : 1;
}

function createEvidenceRef(fact) {
  return {
    sourceKind: fact.sourceKind,
    sourceRecordIdHash: digest({
      sourceKind: fact.sourceKind,
      sourceRecordId: fact.record.sourceRecordId,
    }),
    sourceVersion: sourceVersionOf(fact.record),
    evidenceFingerprint: validFingerprint(fact.record.evidenceFingerprint)
      ? fact.record.evidenceFingerprint
      : digest(fact.record),
  };
}

function dedupeRefs(facts) {
  const refs = new Map();
  facts.forEach((fact) => {
    const ref = fact.evidenceRef;
    refs.set(
      `${ref.sourceKind}\u0000${ref.sourceRecordIdHash}\u0000${ref.evidenceFingerprint}`,
      ref,
    );
  });
  return [...refs.values()].sort((left, right) =>
    `${left.sourceKind}\u0000${left.sourceRecordIdHash}\u0000${left.evidenceFingerprint}`.localeCompare(
      `${right.sourceKind}\u0000${right.sourceRecordIdHash}\u0000${right.evidenceFingerprint}`,
    ),
  );
}

function addStateCodes(target, record, kind) {
  stateCodesForRecord(record, kind).forEach((code) => target.add(code));
}

function fallbackStateCodes(group) {
  const result = new Set(group.stateCodes);
  if (!result.size) result.add("GENERATED");
  return LEGACY_STATE_ORDER.filter((code) => result.has(code));
}

function orderIdentityList(group) {
  const map = new Map();
  group.facts.forEach((fact) => {
    if (fact.order) map.set(fact.order.orderId, fact.order);
  });
  return [...map.values()].sort((left, right) =>
    left.orderId.localeCompare(right.orderId),
  );
}

function targetIdentityList(group) {
  const map = new Map();
  group.facts.forEach((fact) => {
    if (fact.target) map.set(targetKey(fact.target), fact.target);
  });
  return [...map.values()].sort((left, right) =>
    targetKey(left).localeCompare(targetKey(right)),
  );
}

function reportArticleKey(group) {
  return group.identity
    ? { clientId: group.identity.clientId, articleId: group.identity.articleId }
    : { unresolved: digest(group.unresolvedSeed).slice(0, 32) };
}

function candidateOrderIds(candidate) {
  const payload = candidate.payload || {};
  const values = [];
  const addHistory = (history) => {
    if (history && history.orderIdentityV1)
      values.push(history.orderIdentityV1.orderId);
  };
  if (candidate.variant === "trackablePaidOrder") {
    if (payload.orderSnapshotV1 && payload.orderSnapshotV1.orderIdentityV1)
      values.push(payload.orderSnapshotV1.orderIdentityV1.orderId);
  }
  if (candidate.variant === "publishedEvidence") {
    addHistory(payload.orderHistoryV1);
    if (
      payload.publicationEvidenceV1 &&
      payload.publicationEvidenceV1.orderNumber
    )
      values.push(payload.publicationEvidenceV1.orderNumber);
  }
  if (candidate.variant === "nonPublishedTerminal")
    addHistory(payload.orderHistoryV1);
  if (candidate.variant === "needsAttentionConflict")
    (payload.migrationConflictEvidenceV1.orderIdentityV1s || []).forEach(
      (item) => values.push(item.orderId),
    );
  return [...new Set(values)];
}

function customerSnapshot(group, fact) {
  const value = nested(fact && fact.record, "publicationEvidenceV1");
  if (value && value.customerSnapshotV1) return clone(value.customerSnapshotV1);
  const displayName = text(
    firstValue(
      fact && fact.record && fact.record.displayName,
      fact && fact.record && fact.record.clientName,
      group.identity && group.identity.clientId,
    ),
  );
  return {
    version: 1,
    clientId: group.identity.clientId,
    displayName: displayName || group.identity.clientId,
  };
}

function targetSnapshot(target, record) {
  const supplied = nested(record, "publicationEvidenceV1");
  if (supplied && supplied.targetSnapshotV1)
    return clone(supplied.targetSnapshotV1);
  const snapshot = nested(record, "targetSnapshotV1");
  if (snapshot) return clone(snapshot);
  if (target.kind === "media") {
    return {
      version: 1,
      kind: "media",
      mediaResourceId: target.mediaResourceId,
      mediaName:
        text(
          firstValue(
            record.mediaName,
            record.media_name,
            target.mediaResourceId,
          ),
        ) || target.mediaResourceId,
    };
  }
  if (target.kind === "legacy-unknown-account") {
    return {
      version: 1,
      kind: "legacy-unknown-account",
      platformId: target.platformId,
      platformName:
        text(
          firstValue(
            record.platformName,
            record.displayName,
            target.platformId,
          ),
        ) || target.platformId,
    };
  }
  return {
    version: 1,
    kind: "platform",
    platformId: target.platformId,
    platformName:
      text(
        firstValue(record.platformName, record.displayName, target.platformId),
      ) || target.platformId,
    accountProfileId: target.accountProfileId,
    accountLabel:
      text(
        firstValue(
          record.accountLabel,
          record.displayName,
          target.accountProfileId,
        ),
      ) || target.accountProfileId,
  };
}

function evidenceTime(record, fields, sourceFallback, sourceField) {
  const at = timeFor(record, fields);
  if (!at) return { at: null, source: "legacy_unavailable" };
  const source = text(firstValue(record[sourceField], record.eventAtSource));
  return { at, source: source || sourceFallback };
}

function buildPublicationEvidence(group, fact) {
  const supplied = nested(fact.record, "publicationEvidenceV1");
  if (supplied) return clone(supplied);
  if (!fact.target) throw plannerError("LEGACY_PUBLICATION_TARGET_MISSING");
  const media = fact.target.kind === "media";
  const hasContent =
    typeof fact.record.submittedTitle === "string" &&
    fact.record.submittedTitle.trim() &&
    typeof fact.record.submittedBody === "string" &&
    fact.record.submittedBody.trim();
  const title = hasContent ? fact.record.submittedTitle : null;
  const body = hasContent ? fact.record.submittedBody : null;
  const submittedTime = evidenceTime(
    fact.record,
    ["submittedAt", "remoteCallStartedAt"],
    media ? "paid_order_remote_call_started" : "regular_remote_call_started",
    "submittedAtSource",
  );
  const firstPublishedTime = evidenceTime(
    fact.record,
    ["firstPublishedAt", "publishedAt", "eventAt", "observedAt"],
    "first_positive_observation_time",
    "firstPublishedAtSource",
  );
  const missingReasons = [];
  if (!hasContent) missingReasons.push("LEGACY_SUBMISSION_CONTENT_UNAVAILABLE");
  if (submittedTime.at === null)
    missingReasons.push("LEGACY_SUBMITTED_AT_UNAVAILABLE");
  if (firstPublishedTime.at === null)
    missingReasons.push("LEGACY_FIRST_PUBLISHED_AT_UNAVAILABLE");
  const imageSummaryV1 = nested(fact.record, "imageSummaryV1") || null;
  if (imageSummaryV1 === null)
    missingReasons.push("LEGACY_IMAGE_SUMMARY_UNAVAILABLE");
  return {
    version: 1,
    articleIdentityV1: group.identity,
    customerSnapshotV1: customerSnapshot(group, fact),
    contentAvailable: Boolean(hasContent),
    title,
    body,
    contentFingerprint: hasContent
      ? domain.preparedContentFingerprint({ title, body })
      : null,
    targetSnapshotV1: targetSnapshot(fact.target, fact.record),
    resultCode: media ? "PAID_PUBLISHED" : "REGULAR_ACCEPTED",
    submittedAt: submittedTime.at,
    submittedAtSource: submittedTime.source,
    firstPublishedAt: firstPublishedTime.at,
    firstPublishedAtSource: firstPublishedTime.source,
    imageSummaryV1,
    orderNumber: media && fact.order ? fact.order.orderId : null,
    remoteUrl: domain.normalizePublishedArticleUrl(
      firstValue(fact.record.remoteUrl, fact.record.orderUrl),
    ),
    missingReasons,
    safeEvidenceRefs: [
      {
        kind: "LEGACY_EVIDENCE",
        fingerprint: fact.evidenceRef.evidenceFingerprint,
      },
    ],
  };
}

function buildTerminalTarget(group, fact, closedKind) {
  const supplied =
    nested(fact.record, "closedTargetV1") ||
    nested(fact.record, "terminalTargetV1");
  if (supplied) {
    return clone(supplied);
  }
  const terminalAt = timeFor(fact.record, [
    "closedAt",
    "terminalAt",
    "observedAt",
    "eventAt",
  ]);
  const terminalKind = closedKind === "PUBLISHED" ? "PUBLISHED" : closedKind;
  const target = fact.target;
  if (!target) throw plannerError("LEGACY_TERMINAL_TARGET_MISSING");
  if (closedKind === "PUBLISHED") {
    return {
      version: 1,
      articleIdentityV1: group.identity,
      targetIdentityV1: target,
      attemptId: validId(
        text(firstValue(fact.record.attemptId, fact.record.publicationId)),
      )
        ? text(firstValue(fact.record.attemptId, fact.record.publicationId))
        : `legacy-attempt-${digest(fact.record).slice(0, 24)}`,
      terminalKind,
      reasonCode: "PUBLICATION_SUCCESS",
      terminalAt,
      terminalAtSource: terminalAt ? "observation_time" : "legacy_unavailable",
      evidenceFingerprint: fact.evidenceRef.evidenceFingerprint,
    };
  }
  return {
    version: 1,
    articleIdentityV1: group.identity,
    targetIdentityV1: target,
    attemptId: validId(
      text(firstValue(fact.record.attemptId, fact.record.publicationId)),
    )
      ? text(firstValue(fact.record.attemptId, fact.record.publicationId))
      : `legacy-attempt-${digest(fact.record).slice(0, 24)}`,
    closedKind,
    reasonCode: safeCode(fact.record.reasonCode, "LEGACY_TERMINAL"),
    closedAt: terminalAt,
    closedAtSource: terminalAt ? "observation_time" : "legacy_unavailable",
    evidenceFingerprint: fact.evidenceRef.evidenceFingerprint,
  };
}

function buildOrderSnapshot(group, fact) {
  const supplied = nested(fact.record, "orderSnapshotV1");
  if (supplied) return clone(supplied);
  if (!fact.order || !fact.target || fact.target.kind !== "media")
    throw plannerError("LEGACY_ORDER_SNAPSHOT_INCOMPLETE");
  const submittedTitle = text(fact.record.submittedTitle);
  const submittedBody = fact.record.submittedBody;
  const attemptId = text(
    firstValue(fact.record.orderCreationAttemptId, fact.record.attemptId),
  );
  const mediaName = text(
    firstValue(
      fact.record.mediaName,
      fact.record.media_name,
      fact.target.mediaResourceId,
    ),
  );
  const systemSubmissionCode = text(fact.record.systemSubmissionCode);
  if (
    !submittedTitle ||
    typeof submittedBody !== "string" ||
    !submittedBody.trim() ||
    !validId(attemptId) ||
    !mediaName ||
    !systemSubmissionCode ||
    typeof fact.record.quotedPrice !== "number" ||
    typeof fact.record.estimatedTotal !== "number" ||
    !validInstant(fact.record.remoteCallStartedAt)
  )
    throw plannerError("LEGACY_ORDER_SNAPSHOT_INCOMPLETE");
  return {
    version: 1,
    orderIdentityV1: fact.order,
    articleIdentityV1: group.identity,
    targetIdentityV1: fact.target,
    orderCreationAttemptId: attemptId,
    mediaName,
    quotedPrice: fact.record.quotedPrice,
    estimatedTotal: fact.record.estimatedTotal,
    actualAmount:
      typeof fact.record.actualAmount === "number"
        ? fact.record.actualAmount
        : null,
    systemSubmissionCode,
    submittedTitle,
    submittedBody,
    contentFingerprint: domain.contentFingerprint(
      submittedTitle,
      submittedBody,
    ),
    remoteCallStartedAt: fact.record.remoteCallStartedAt,
  };
}

function buildOrderObservation(fact, snapshot, statusCode) {
  const supplied = nested(fact.record, "orderObservationV1");
  if (supplied) return clone(supplied);
  if (!validInstant(fact.record.observedAt))
    throw plannerError("LEGACY_ORDER_OBSERVATION_INCOMPLETE");
  return {
    version: 1,
    orderIdentityV1: snapshot.orderIdentityV1,
    statusCode,
    observedAt: fact.record.observedAt,
    eventAt: validInstant(fact.record.eventAt) ? fact.record.eventAt : null,
    eventAtSource: validInstant(fact.record.eventAt)
      ? text(fact.record.eventAtSource) || "observation_time"
      : "not_available",
    remoteUrl: domain.normalizePublishedArticleUrl(
      firstValue(fact.record.remoteUrl, fact.record.orderUrl),
    ),
    actualAmount:
      typeof fact.record.actualAmount === "number"
        ? fact.record.actualAmount
        : null,
    evidenceFingerprint: fact.evidenceRef.evidenceFingerprint,
    orderSnapshotFingerprint: domain.orderSnapshotFingerprint(snapshot),
  };
}

function buildPaidTarget(group, fact) {
  const supplied = nested(fact.record, "paidTargetV1");
  if (supplied) return clone(supplied);
  const attemptId = text(
    firstValue(fact.record.orderCreationAttemptId, fact.record.attemptId),
  );
  if (
    !fact.order ||
    !fact.target ||
    fact.target.kind !== "media" ||
    !validId(attemptId)
  )
    throw plannerError("LEGACY_PAID_TARGET_INCOMPLETE");
  return {
    version: 1,
    articleIdentityV1: group.identity,
    targetIdentityV1: fact.target,
    orderCreationAttemptId: attemptId,
    orderIdentityV1: fact.order,
    state: "ACTIVE_TRACKING",
    terminalAt: null,
  };
}

function buildOrderHistory(group, fact, statusCode) {
  const supplied = nested(fact.record, "orderHistoryV1");
  if (supplied) return clone(supplied);
  const snapshot = buildOrderSnapshot(group, fact);
  const observation = buildOrderObservation(fact, snapshot, statusCode);
  return {
    version: 1,
    orderIdentityV1: snapshot.orderIdentityV1,
    entries: [
      {
        sequence: 1,
        kind: "observation",
        orderObservationV1: observation,
      },
    ],
  };
}

function buildPublishedCandidate(group, fact) {
  const publicationEvidenceV1 = buildPublicationEvidence(group, fact);
  const terminalTargetV1 = buildTerminalTarget(group, fact, "PUBLISHED");
  const suppliedHistory = nested(fact.record, "orderHistoryV1");
  const orderHistoryV1 = suppliedHistory ? clone(suppliedHistory) : null;
  return {
    variant: "publishedEvidence",
    payload: {
      publicationEvidenceV1,
      terminalTargetV1,
      orderHistoryV1,
    },
  };
}

function buildTrackableCandidate(group, fact) {
  const status = statusOf(fact.record).orderStatus;
  const orderSnapshotV1 = buildOrderSnapshot(group, fact);
  const orderObservationV1 = buildOrderObservation(
    fact,
    orderSnapshotV1,
    status,
  );
  const paidTargetV1 = buildPaidTarget(group, fact);
  return {
    variant: "trackablePaidOrder",
    payload: { orderSnapshotV1, orderObservationV1, paidTargetV1 },
  };
}

function terminalKindFor(fact) {
  const status = statusOf(fact.record);
  if (status.orderStatus === "4") return "PAID_STATUS_4";
  if (status.raw === "rejected") return "REJECTED";
  if (status.raw === "cancelled" || status.raw === "canceled")
    return "CANCELLED";
  return "FAILED";
}

function buildTerminalCandidate(group, fact) {
  const closedKind = terminalKindFor(fact);
  const closedTargetV1 = buildTerminalTarget(group, fact, closedKind);
  let orderHistoryV1 = null;
  if (fact.target && fact.target.kind === "media") {
    orderHistoryV1 = buildOrderHistory(group, fact, "4");
  }
  return {
    variant: "nonPublishedTerminal",
    payload: {
      closedTargetV1,
      orderHistoryV1,
      restoreEligibilityV1: {
        hasPublicationSuccess: false,
        hasActiveTarget: false,
        hasTrackableOrder: false,
        hasOpenUncertainty: false,
      },
    },
  };
}

function buildPendingCandidate(group, fact) {
  const supplied = nested(fact.record, "legacyQueueEvidenceV1");
  const legacyQueueEvidenceV1 = supplied
    ? clone(supplied)
    : {
        targetIdentityV1: fact.target,
        queueState: "QUEUED",
        remoteBoundaryCrossed: false,
      };
  const closedTargetV1 = nested(fact.record, "closedTargetV1")
    ? clone(nested(fact.record, "closedTargetV1"))
    : buildTerminalTarget(group, fact, "PRE_REMOTE_QUEUE_CLOSED");
  return {
    variant: "pendingReadmission",
    payload: {
      legacyQueueEvidenceV1,
      closedTargetV1,
      readmissionReason: "PROVEN_PRE_REMOTE_QUEUE",
    },
  };
}

function buildAttentionCandidate(group, conflictKind) {
  const contentFingerprints = [...group.submittedContentFingerprints].sort();
  return {
    variant: "needsAttentionConflict",
    payload: {
      conflictKind,
      migrationConflictEvidenceV1: {
        legacyStateCodes: fallbackStateCodes(group),
        targetIdentityV1s: targetIdentityList(group),
        orderIdentityV1s: orderIdentityList(group),
        contentFingerprints,
      },
      freezeReasonCode: "MIGRATION_CONFLICT",
    },
  };
}

function deletionKindFor(group) {
  if (group.successFacts.length) return "PUBLISHED_IN_TRASH";
  if (group.trackableFacts.length || orderIdentityList(group).length)
    return "ORDERED_IN_TRASH";
  if (group.activeFacts.length || group.pendingFacts.length)
    return "ACTIVE_TARGET_IN_TRASH";
  if (group.recoveryFacts.length) return "RECOVERY_TRANSACTION_CONFLICT";
  return "TOMBSTONE_CONFLICT";
}

function factKindsForDeletion(group, deletionKind) {
  const result = new Set();
  if (group.successFacts.length) result.add("PUBLICATION");
  if (orderIdentityList(group).length) result.add("ORDER");
  if (group.activeFacts.length || group.pendingFacts.length)
    result.add("ACTIVE_TARGET");
  if (group.deletionFacts.length) result.add("TOMBSTONE");
  if (group.recoveryFacts.length) result.add("RECOVERY_TRANSACTION");
  const required = {
    PUBLISHED_IN_TRASH: "PUBLICATION",
    ORDERED_IN_TRASH: "ORDER",
    ACTIVE_TARGET_IN_TRASH: "ACTIVE_TARGET",
    TOMBSTONE_CONFLICT: "TOMBSTONE",
    RECOVERY_TRANSACTION_CONFLICT: "RECOVERY_TRANSACTION",
  }[deletionKind];
  if (required) result.add(required);
  return [
    "PUBLICATION",
    "ORDER",
    "ACTIVE_TARGET",
    "TOMBSTONE",
    "RECOVERY_TRANSACTION",
  ].filter((item) => result.has(item));
}

function buildTombstone(group, fact) {
  const supplied = nested(fact && fact.record, "tombstoneIdentityV1");
  if (supplied) return clone(supplied);
  const record = (fact && fact.record) || {};
  const state =
    record.permanentlyDeleted === true || record.state === "PERMANENTLY_DELETED"
      ? "PERMANENTLY_DELETED"
      : "TRASHED";
  const deletedAt = timeFor(record, ["deletedAt", "closedAt"]);
  if (!deletedAt) return null;
  const purgedAt =
    state === "PERMANENTLY_DELETED" ? timeFor(record, ["purgedAt"]) : null;
  if (state === "PERMANENTLY_DELETED" && !purgedAt) return null;
  return {
    version: 1,
    articleIdentityV1: group.identity,
    state,
    deletedAt,
    purgedAt,
    reasonCode: safeCode(record.reasonCode, "LEGACY_TRASH"),
    contentFingerprint: validFingerprint(record.contentFingerprint)
      ? record.contentFingerprint
      : null,
  };
}

function buildDeletionTransaction(fact) {
  const supplied = nested(fact && fact.record, "deletionTransactionIdentityV1");
  if (supplied) return clone(supplied);
  return null;
}

function buildDeletionCandidate(group, deletionKind) {
  const fact =
    group.deletionFacts[0] || group.recoveryFacts[0] || group.facts[0];
  const migrationDeletionEvidenceV1 = {
    tombstoneIdentityV1: buildTombstone(group, fact),
    deletionTransactionIdentityV1: buildDeletionTransaction(fact),
    conflictingFactKinds: factKindsForDeletion(group, deletionKind),
  };
  return {
    variant: "deletionRecoveryConflict",
    payload: {
      deletionConflictKind: deletionKind,
      migrationDeletionEvidenceV1,
      freezeReasonCode: "MIGRATION_DELETION_CONFLICT",
    },
  };
}

function entryFor(group, candidate) {
  const refs = dedupeRefs(group.facts);
  return {
    entryId: `legacy-entry-${digest({ article: articleKey(group.identity), variant: candidate.variant }).slice(0, 32)}`,
    variant: candidate.variant,
    articleIdentityV1: group.identity,
    legacySourceFingerprint: digest({
      article: articleKey(group.identity),
      refs,
    }),
    legacyEvidenceRefs: refs,
    payload: candidate.payload,
  };
}

function factSort(left, right) {
  return `${safeSourceRef(left.record)}\u0000${left.evidenceRef.evidenceFingerprint}`.localeCompare(
    `${safeSourceRef(right.record)}\u0000${right.evidenceRef.evidenceFingerprint}`,
  );
}

function groupsFromEvidence(evidence) {
  const allArticles = evidence.articles || [];
  const articleById = new Map();
  const articleFacts = [];
  allArticles.forEach((record) => {
    const parsed = articleFromRecord(record, new Map());
    if (parsed.identity) {
      const id = text(record.articleId || record.id);
      if (id)
        articleById.set(id, [...(articleById.get(id) || []), parsed.identity]);
    }
    articleFacts.push({ record, sourceKind: "ARTICLE_RECORD", parsed });
  });
  const groups = new Map();
  const rawCollections = [
    ["articles", allArticles, "ARTICLE_RECORD"],
    ["publications", evidence.publications || [], "SUBMISSION_RECORD"],
    ["submissions", evidence.submissions || [], "SUBMISSION_RECORD"],
    ["queues", evidence.queues || [], "QUEUE_RECORD"],
    ["orders", evidence.orders || [], "ORDER_RECORD"],
    ["deletions", evidence.deletions || [], "DELETION_RECORD"],
    ["recoveries", evidence.recoveries || [], "DELETION_RECORD"],
  ];
  const addFact = (record, fallbackKind, collection) => {
    const sourceKind = sourceKindOf(record, fallbackKind);
    const parsedArticle = articleFromRecord(record, articleById);
    const targetInfo = targetInfoFromRecord(record);
    const target = targetInfo.target;
    const parsedOrder = orderFromRecord(record);
    const fact = {
      record,
      collection,
      sourceKind,
      target,
      order: parsedOrder.identity,
      invalidIdentity: parsedArticle.invalid,
      invalidTarget: targetInfo.invalid,
      invalidOrder: parsedOrder.invalid,
      identity: parsedArticle.identity,
      evidenceRef: null,
    };
    fact.evidenceRef = createEvidenceRef(fact);
    const key =
      articleKey(parsedArticle.identity) ||
      `unresolved:${digest({ collection, record })}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        identity: parsedArticle.identity,
        unresolvedSeed: record,
        facts: [],
        stateCodes: new Set(),
        activeTargetKeys: new Set(),
        submittedContentFingerprints: new Set(),
        contentFingerprints: new Set(),
        successFacts: [],
        uncertainFacts: [],
        pendingFacts: [],
        trackableFacts: [],
        terminalFacts: [],
        activeFacts: [],
        deletionFacts: [],
        recoveryFacts: [],
        missingOrder: false,
        invalidIdentity: false,
        invalidTarget: false,
        invalidOrder: false,
      };
      groups.set(key, group);
    }
    if (
      group.identity &&
      parsedArticle.identity &&
      !sameJson(group.identity, parsedArticle.identity)
    )
      group.invalidIdentity = true;
    if (!group.identity && parsedArticle.identity)
      group.identity = parsedArticle.identity;
    group.invalidIdentity ||= parsedArticle.invalid;
    group.invalidTarget ||= fact.invalidTarget;
    group.invalidOrder ||= fact.invalidOrder;
    group.facts.push(fact);
    addStateCodes(group.stateCodes, record, sourceKind);
    contentFingerprintsOf(record).forEach((item) =>
      group.contentFingerprints.add(item),
    );
    submittedContentFingerprintOf(record).forEach((item) =>
      group.submittedContentFingerprints.add(item),
    );
    const status = statusOf(record);
    const hasPaidStatus = ["0", "1", "2", "4", "9"].includes(
      status.orderStatus,
    );
    const mediaWithoutOrder =
      target &&
      target.kind === "media" &&
      !parsedOrder.identity &&
      (hasPaidStatus ||
        ["published", "submitted"].includes(status.raw) ||
        record.published === true ||
        record.accepted === true);
    if (mediaWithoutOrder) group.missingOrder = true;
    if (recordIsSuccess(fact)) group.successFacts.push(fact);
    if (recordIsUncertain(fact)) group.uncertainFacts.push(fact);
    if (recordIsPendingQueue(fact)) group.pendingFacts.push(fact);
    if (recordIsTrackableOrder(fact)) group.trackableFacts.push(fact);
    if (recordIsTerminal(fact)) group.terminalFacts.push(fact);
    if (
      recordIsPendingQueue(fact) ||
      recordIsTrackableOrder(fact) ||
      recordIsUncertain(fact) ||
      ["remote_started", "submitting", "submitted"].includes(status.raw)
    ) {
      group.activeFacts.push(fact);
      if (target) group.activeTargetKeys.add(targetKey(target));
    }
    if (
      collection === "deletions" ||
      record.deleted === true ||
      record.trashed === true ||
      ["TRASHED", "PERMANENTLY_DELETED"].includes(record.state) ||
      ["trash", "trashed", "permanently_deleted"].includes(status.raw)
    )
      group.deletionFacts.push(fact);
    if (collection === "recoveries") group.recoveryFacts.push(fact);
  };
  for (const [collection, records, fallbackKind] of rawCollections) {
    records.forEach((record) => addFact(record, fallbackKind, collection));
  }
  // A batch may contain nested items in a source object. The reader keeps them
  // closed and the planner treats them as submission evidence, never as a
  // runnable queue command.
  for (const articleFact of articleFacts) {
    const record = articleFact.record;
    for (const [collection, fallbackKind] of [
      ["publications", "SUBMISSION_RECORD"],
      ["submissions", "SUBMISSION_RECORD"],
      ["orders", "ORDER_RECORD"],
    ]) {
      const values = Array.isArray(record[collection])
        ? record[collection]
        : [];
      values.forEach((value, index) =>
        addFact(
          Object.assign({}, value, {
            clientId: value.clientId || record.clientId,
            articleId: value.articleId || record.articleId || record.id,
            sourceRef: `${safeSourceRef(record)}#${collection}:${index + 1}`,
          }),
          fallbackKind,
          collection,
        ),
      );
    }
  }
  return [...groups.values()].sort((left, right) =>
    left.key.localeCompare(right.key),
  );
}

function chooseFact(facts) {
  return [...facts].sort(factSort)[0] || null;
}

function classifyGroup(group) {
  group.facts.sort(factSort);
  group.successFacts.sort(factSort);
  group.uncertainFacts.sort(factSort);
  group.pendingFacts.sort(factSort);
  group.trackableFacts.sort(factSort);
  group.terminalFacts.sort(factSort);
  group.activeFacts.sort(factSort);
  group.deletionFacts.sort(factSort);
  group.recoveryFacts.sort(factSort);
  if (!group.identity) return { kind: "unplanned", code: "IDENTITY_CONFLICT" };
  const successTargets = new Set(
    group.successFacts.map((fact) => targetKey(fact.target)).filter(Boolean),
  );
  if (group.deletionFacts.length || group.recoveryFacts.length) {
    if (group.successFacts.length && successTargets.size === 1)
      return { kind: "deletion", code: "PUBLISHED_IN_TRASH" };
    return { kind: "deletion", code: deletionKindFor(group) };
  }
  if (group.submittedContentFingerprints.size > 1)
    return { kind: "attention", code: "CONTENT_CONFLICT" };
  if (group.successFacts.length) {
    const observedTargetKeys = new Set([
      ...successTargets,
      ...group.activeTargetKeys,
    ]);
    if (observedTargetKeys.size > 1)
      return { kind: "attention", code: "MULTIPLE_ACTIVE_TARGETS" };
    if (
      successTargets.size !== 1 ||
      group.invalidIdentity ||
      group.invalidTarget
    )
      return { kind: "attention", code: "IDENTITY_CONFLICT" };
    return { kind: "published", fact: chooseFact(group.successFacts) };
  }
  if (group.invalidIdentity || group.invalidTarget || group.invalidOrder)
    return { kind: "attention", code: "IDENTITY_CONFLICT" };
  if (group.missingOrder)
    return { kind: "attention", code: "MISSING_ORDER_ID" };
  if (group.activeTargetKeys.size > 1)
    return { kind: "attention", code: "MULTIPLE_ACTIVE_TARGETS" };
  if (group.uncertainFacts.length)
    return { kind: "attention", code: "SUBMITTING_OR_UNPROVEN_SUBMITTED" };
  if (group.trackableFacts.length)
    return { kind: "trackable", fact: chooseFact(group.trackableFacts) };
  if (group.pendingFacts.length)
    return { kind: "pending", fact: chooseFact(group.pendingFacts) };
  if (group.terminalFacts.length) {
    const targets = new Set(
      group.terminalFacts.map((fact) => targetKey(fact.target)).filter(Boolean),
    );
    if (targets.size > 1)
      return { kind: "attention", code: "UNKNOWN_FACT_COMBINATION" };
    return { kind: "terminal", fact: chooseFact(group.terminalFacts) };
  }
  if (
    group.stateCodes.size &&
    [...group.stateCodes].every((code) =>
      ["REVIEW_PENDING", "REVIEW_APPROVED", "GENERATED", "SAVED"].includes(
        code,
      ),
    )
  )
    return { kind: "ignored", code: "CONTENT_ONLY_RECORD" };
  return { kind: "unplanned", code: "UNKNOWN_FACT_COMBINATION" };
}

function candidateFor(group, classification) {
  if (classification.kind === "published")
    return buildPublishedCandidate(group, classification.fact);
  if (classification.kind === "trackable")
    return buildTrackableCandidate(group, classification.fact);
  if (classification.kind === "pending")
    return buildPendingCandidate(group, classification.fact);
  if (classification.kind === "terminal")
    return buildTerminalCandidate(group, classification.fact);
  if (classification.kind === "attention")
    return buildAttentionCandidate(group, classification.code);
  if (classification.kind === "deletion")
    return buildDeletionCandidate(group, classification.code);
  return null;
}

function newReport(evidence) {
  return {
    version: REPORT_VERSION,
    mode: "dry-run",
    sourceFingerprint: evidence.sourceFingerprint,
    workspaceFingerprint: evidence.workspaceFingerprint,
    classificationMatrixVersion: 1,
    inputs: {
      articles: { records: evidence.articles.length },
      publications: { records: evidence.publications.length },
      submissions: { records: evidence.submissions.length },
      queues: { records: evidence.queues.length },
      orders: { records: evidence.orders.length },
      deletions: { records: evidence.deletions.length },
      recoveries: { records: evidence.recoveries.length },
    },
    counts: {
      articles: 0,
      evidenceRecords: 0,
      planned: 0,
      publishedEvidence: 0,
      trackablePaidOrder: 0,
      pendingReadmission: 0,
      nonPublishedTerminal: 0,
      needsAttentionConflict: 0,
      deletionRecoveryConflict: 0,
      ignored: 0,
      conflicts: 0,
      unplanned: 0,
      corrupt: evidence.diagnostics.length,
    },
    diagnostics: [],
    conflictSamples: [],
  };
}

function reportDiagnostic(report, group, code, variant) {
  report.diagnostics.push({
    code,
    variant: variant || null,
    article: reportArticleKey(group),
    evidenceRefHashes: dedupeRefs(group.facts)
      .map((ref) => ref.evidenceFingerprint)
      .sort(),
  });
}

function reportConflict(report, group, code, variant) {
  report.conflictSamples.push({
    code,
    variant: variant || "needsAttentionConflict",
    article: reportArticleKey(group),
    stateCodes: fallbackStateCodes(group),
    targetCount: targetIdentityList(group).length,
    orderCount: orderIdentityList(group).length,
    evidenceRefHashes: dedupeRefs(group.facts)
      .map((ref) => ref.evidenceFingerprint)
      .sort(),
  });
}

function reportReaderDiagnostics(report, evidence) {
  evidence.diagnostics.forEach((item) => {
    report.diagnostics.push({
      code: item.code,
      variant: null,
      sourceKind: item.kind,
      sourceRefHash: digest(item.sourceRef).slice(0, 32),
    });
  });
}

function makeEnvelope(options, evidence, entries) {
  const migrationRunId =
    options.migrationRunId ||
    `migration-${digest({
      workspaceFingerprint: evidence.workspaceFingerprint,
      sourceFingerprint: evidence.sourceFingerprint,
    }).slice(0, 32)}`;
  if (!validId(migrationRunId)) throw plannerError("MIGRATION_RUN_ID_INVALID");
  const withoutFingerprint = {
    version: 1,
    migrationRunId,
    workspaceFingerprint: evidence.workspaceFingerprint,
    sourceFingerprint: evidence.sourceFingerprint,
    entries,
  };
  const planFingerprint = domain.importPlanFingerprintV1(withoutFingerprint);
  return {
    ...withoutFingerprint,
    planFingerprint,
  };
}

function validateCandidate(candidate, options, evidence, group) {
  try {
    const entry = entryFor(group, candidate);
    const draft = makeEnvelope(options, evidence, [entry]);
    domain.parseImportPlanV1(draft);
    return entry;
  } catch (error) {
    reportDiagnostic(
      options.report,
      group,
      error.code || "PLAN_ENTRY_INVALID",
      candidate.variant,
    );
    return null;
  }
}

function duplicateOrderIds(entries, report) {
  const byOrder = new Map();
  entries.forEach((entry, index) => {
    candidateOrderIds(entry).forEach((orderId) => {
      byOrder.set(orderId, [...(byOrder.get(orderId) || []), index]);
    });
  });
  const duplicateIndexes = new Set();
  for (const [orderId, indexes] of byOrder.entries()) {
    if (indexes.length < 2) continue;
    indexes.forEach((index) => duplicateIndexes.add(index));
    report.diagnostics.push({
      code: "DUPLICATE_ORDER_ID",
      variant: null,
      orderIdHash: digest(orderId).slice(0, 32),
      entryCount: indexes.length,
    });
    report.counts.conflicts += indexes.length;
  }
  return duplicateIndexes;
}

function planLegacyMigration(input) {
  const options = input || {};
  const evidence = options.evidence || readLegacyEvidence(options);
  const report = newReport(evidence);
  reportReaderDiagnostics(report, evidence);
  const groups = groupsFromEvidence(evidence);
  report.counts.articles = groups.length;
  report.counts.evidenceRecords = groups.reduce(
    (count, group) => count + group.facts.length,
    0,
  );
  const entries = [];
  for (const group of groups) {
    const classification = classifyGroup(group);
    if (classification.kind === "ignored") {
      report.counts.ignored += 1;
      continue;
    }
    if (classification.kind === "unplanned") {
      report.counts.unplanned += 1;
      reportConflict(report, group, classification.code, null);
      continue;
    }
    let candidate;
    try {
      candidate = candidateFor(group, classification);
    } catch (error) {
      candidate = null;
      reportDiagnostic(report, group, error.code || "PLAN_ENTRY_INVALID", null);
    }
    if (!candidate) {
      report.counts.unplanned += 1;
      reportConflict(report, group, "UNKNOWN_FACT_COMBINATION", null);
      continue;
    }
    const entry = validateCandidate(
      candidate,
      { ...options, report },
      evidence,
      group,
    );
    if (!entry) {
      report.counts.unplanned += 1;
      reportConflict(report, group, "PLAN_ENTRY_INVALID", candidate.variant);
      continue;
    }
    entries.push(entry);
    report.counts.planned += 1;
    report.counts[candidate.variant] += 1;
    if (
      candidate.variant === "needsAttentionConflict" ||
      candidate.variant === "deletionRecoveryConflict"
    ) {
      report.counts.conflicts += 1;
      reportConflict(
        report,
        group,
        candidate.payload.conflictKind ||
          candidate.payload.deletionConflictKind,
        candidate.variant,
      );
    }
  }
  entries.sort((left, right) =>
    `${left.articleIdentityV1.clientId}\u0000${left.articleIdentityV1.articleId}\u0000${left.variant}`.localeCompare(
      `${right.articleIdentityV1.clientId}\u0000${right.articleIdentityV1.articleId}\u0000${right.variant}`,
    ),
  );
  const duplicateIndexes = duplicateOrderIds(entries, report);
  const filteredEntries = entries.filter(
    (entry, index) => !duplicateIndexes.has(index),
  );
  if (duplicateIndexes.size) {
    report.counts.planned -= duplicateIndexes.size;
    report.counts.unplanned += duplicateIndexes.size;
    duplicateIndexes.forEach((index) => {
      const variant = entries[index].variant;
      report.counts[variant] -= 1;
    });
  }
  const plan = domain.parseImportPlanV1(
    makeEnvelope(options, evidence, filteredEntries),
  );
  report.planFingerprint = plan.planFingerprint;
  report.conflictSamples.sort((left, right) =>
    `${JSON.stringify(left.article)}\u0000${left.code}\u0000${left.variant}`.localeCompare(
      `${JSON.stringify(right.article)}\u0000${right.code}\u0000${right.variant}`,
    ),
  );
  report.diagnostics.sort((left, right) =>
    `${left.code}\u0000${JSON.stringify(left.article || null)}\u0000${left.sourceRefHash || ""}\u0000${left.orderIdHash || ""}`.localeCompare(
      `${right.code}\u0000${JSON.stringify(right.article || null)}\u0000${right.sourceRefHash || ""}\u0000${right.orderIdHash || ""}`,
    ),
  );
  return freeze({ plan, report });
}

function createLegacyMigrationPlanner(options) {
  const values = options || {};
  const reader = values.evidence ? null : createLegacyMigrationReader(values);
  function build() {
    return planLegacyMigration({
      ...values,
      evidence: values.evidence || reader.read(),
    });
  }
  return Object.freeze({
    read: () => values.evidence || reader.read(),
    plan: () => build().plan,
    dryRun: () => {
      const result = build();
      return freeze({ mode: "dry-run", report: result.report });
    },
    planResult: () => build(),
  });
}

module.exports = Object.freeze({
  LEGACY_CLASSIFICATION_MATRIX,
  LEGACY_STATE_ORDER,
  VARIANT_NAMES,
  createLegacyMigrationPlanner,
  planLegacyMigration,
});
