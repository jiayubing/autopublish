"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const domain = require("../src/domain");

const fingerprint = "a".repeat(64);

function customerSnapshot() {
  return { version: 1, clientId: "client-1", displayName: "示例客户" };
}

function targetSnapshot() {
  return {
    version: 1,
    kind: "platform",
    platformId: "hepan",
    platformName: "蓝色河畔",
    accountProfileId: "account-1",
    accountLabel: "运营账号",
  };
}

function evidence() {
  return {
    version: 1,
    articleIdentityV1: {
      version: 1,
      clientId: "client-1",
      articleId: "article-1",
    },
    customerSnapshotV1: customerSnapshot(),
    contentAvailable: true,
    title: "标题",
    body: "正文",
    contentFingerprint: domain.preparedContentFingerprint({
      title: "标题",
      body: "正文",
    }),
    targetSnapshotV1: targetSnapshot(),
    resultCode: "REGULAR_ACCEPTED",
    submittedAt: "2026-08-07T01:02:03.000Z",
    submittedAtSource: "regular_remote_call_started",
    firstPublishedAt: "2026-08-07T01:02:04.000Z",
    firstPublishedAtSource: "first_positive_observation_time",
    imageSummaryV1: {
      deliveryMode: "text_only",
      images: [],
      decisionKind: "initial",
    },
    orderNumber: null,
    remoteUrl: "https://example.test/article/1",
    missingReasons: [],
    safeEvidenceRefs: [
      { kind: "PREPARED_SUBMISSION", fingerprint },
      { kind: "REGULAR_ACCEPTED_OBSERVATION", fingerprint: "b".repeat(64) },
    ],
  };
}

test("publicationEvidenceV1 accepts the exact online regular success contract", () => {
  assert.deepEqual(domain.parsePublicationEvidenceV1(evidence()), evidence());
});

test("nested snapshots are closed and reject sensitive or unknown fields", () => {
  assert.throws(
    () =>
      domain.parseCustomerSnapshotV1({ ...customerSnapshot(), cookie: "x" }),
    { code: "DTO_UNKNOWN_FIELD" },
  );
  assert.throws(
    () =>
      domain.parseTargetSnapshotV1({
        ...targetSnapshot(),
        metadata: { authorization: "secret" },
      }),
    { code: "DTO_UNKNOWN_FIELD" },
  );
  assert.throws(
    () =>
      domain.parseTargetSnapshotV1({
        version: 1,
        kind: "legacy-unknown-account",
        platformId: "hepan",
        platformName: "蓝色河畔",
      }),
    { code: "TARGET_SNAPSHOT_V1_ONLINE_REQUIRED" },
  );
  assert.equal(
    domain.parseTargetSnapshotV1(
      {
        version: 1,
        kind: "legacy-unknown-account",
        platformId: "hepan",
        platformName: "蓝色河畔",
      },
      { allowLegacy: true },
    ).kind,
    "legacy-unknown-account",
  );
});

test("target snapshots cover platform, media, and migration-only unknown accounts", () => {
  assert.deepEqual(
    domain.parseTargetSnapshotV1({
      version: 1,
      kind: "media",
      mediaResourceId: "media-1",
      mediaName: "示例媒体",
    }),
    {
      version: 1,
      kind: "media",
      mediaResourceId: "media-1",
      mediaName: "示例媒体",
    },
  );
  assert.throws(
    () =>
      domain.parseCustomerSnapshotV1({
        version: 1,
        clientId: "client-1",
        displayName: "x".repeat(257),
      }),
    { code: "CUSTOMER_SNAPSHOT_V1_INVALID" },
  );
  assert.throws(
    () =>
      domain.parseTargetSnapshotV1({
        ...targetSnapshot(),
        accountLabel: "unsafe\nlabel",
      }),
    { code: "TARGET_SNAPSHOT_V1_INVALID" },
  );
  assert.throws(
    () =>
      domain.parseCustomerSnapshotV1({
        version: 1,
        clientId: "client-1",
        displayName: "C:\\content-library\\client-1",
      }),
    { code: "CUSTOMER_SNAPSHOT_V1_INVALID" },
  );
});

test("publicationEvidenceV1 rejects recursive extras and inconsistent time/missing rules", () => {
  assert.throws(
    () =>
      domain.parsePublicationEvidenceV1({
        ...evidence(),
        imageSummaryV1: {
          ...evidence().imageSummaryV1,
          rawResponse: "secret",
        },
      }),
    { code: "DTO_UNKNOWN_FIELD" },
  );
  assert.throws(
    () =>
      domain.parsePublicationEvidenceV1({
        ...evidence(),
        submittedAt: null,
        submittedAtSource: "legacy_unavailable",
      }),
    { code: "PUBLICATION_EVIDENCE_V1_INVALID" },
  );
  assert.throws(
    () =>
      domain.parsePublicationEvidenceV1({
        ...evidence(),
        contentFingerprint: "c".repeat(64),
      }),
    { code: "PUBLICATION_EVIDENCE_V1_INVALID" },
  );
});

test("migration-only missing content and image facts require matching missing reasons", () => {
  const migrated = {
    ...evidence(),
    contentAvailable: false,
    title: null,
    body: null,
    contentFingerprint: null,
    submittedAt: null,
    submittedAtSource: "legacy_unavailable",
    firstPublishedAt: null,
    firstPublishedAtSource: "legacy_unavailable",
    imageSummaryV1: null,
    missingReasons: [
      "LEGACY_SUBMISSION_CONTENT_UNAVAILABLE",
      "LEGACY_SUBMITTED_AT_UNAVAILABLE",
      "LEGACY_FIRST_PUBLISHED_AT_UNAVAILABLE",
      "LEGACY_IMAGE_SUMMARY_UNAVAILABLE",
    ],
    safeEvidenceRefs: [{ kind: "LEGACY_EVIDENCE", fingerprint }],
  };
  assert.equal(
    domain.parsePublicationEvidenceV1(migrated, { allowLegacy: true })
      .contentAvailable,
    false,
  );
  assert.throws(() => domain.parsePublicationEvidenceV1(migrated), {
    code: "PUBLICATION_EVIDENCE_V1_ONLINE_REQUIRED",
  });
});

test("publication evidence rejects sparse recursive arrays", () => {
  const sparseRefs = new Array(1);
  assert.throws(
    () =>
      domain.parsePublicationEvidenceV1({
        ...evidence(),
        safeEvidenceRefs: sparseRefs,
      }),
    { code: "PUBLICATION_EVIDENCE_V1_INVALID" },
  );
  const sparseImages = new Array(1);
  assert.throws(
    () =>
      domain.parsePublicationEvidenceV1({
        ...evidence(),
        imageSummaryV1: {
          deliveryMode: "with_images",
          images: sparseImages,
          decisionKind: "initial",
        },
      }),
    { code: "PUBLICATION_EVIDENCE_V1_INVALID" },
  );
});
