"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  LEGACY_CLASSIFICATION_MATRIX,
  createLegacyMigrationPlanner,
} = require("../src/content/legacy-migration-planner");

const FINGERPRINT = "a".repeat(64);

function article(articleId, extra) {
  return Object.assign(
    {
      version: 1,
      clientId: "client-23-b",
      articleId,
      status: "saved",
      title: "当前文章标题",
      content: "当前文章正文",
    },
    extra || {},
  );
}

function platform(suffix) {
  return {
    version: 1,
    kind: "platform",
    platformId: "toutiao",
    accountProfileId: `account-${suffix}`,
  };
}

function media(suffix) {
  return { version: 1, kind: "media", mediaResourceId: `media-${suffix}` };
}

function fact(articleId, target, status, extra) {
  return Object.assign(
    {
      version: 1,
      clientId: "client-23-b",
      articleId,
      targetIdentityV1: target,
      status,
      sourceRef: `fixture/${articleId}/${status}`,
    },
    extra || {},
  );
}

function completeSource() {
  return {
    workspaceFingerprint: FINGERPRINT,
    articles: [
      article("review-only", { reviewStatus: "pending" }),
      article("published"),
      article("paid"),
      article("queued"),
      article("failed"),
      article("uncertain"),
      article("deleted"),
    ],
    publications: [
      fact("published", platform("published"), "published", {
        accepted: true,
        submittedTitle: "历史投稿标题",
        submittedBody: "历史投稿正文",
      }),
      fact("failed", platform("failed"), "failed"),
      fact("uncertain", platform("uncertain"), "submitted"),
      fact("deleted", platform("deleted"), "published", {
        accepted: true,
        submittedTitle: "已发布标题",
        submittedBody: "已发布正文",
      }),
    ],
    queues: [
      fact("queued", platform("queued"), "queued", {
        queueState: "QUEUED",
        remoteBoundaryCrossed: false,
      }),
    ],
    orders: [
      fact("paid", media("paid"), "1", {
        orderId: "order-23-b",
        orderCreationAttemptId: "attempt-23-b",
        mediaName: "历史媒体",
        quotedPrice: 10,
        estimatedTotal: 10,
        systemSubmissionCode: "submission-code-23-b",
        submittedTitle: "付费投稿标题",
        submittedBody: "付费投稿正文",
        remoteCallStartedAt: "2026-08-08T00:00:00.000Z",
        observedAt: "2026-08-08T00:01:00.000Z",
      }),
    ],
    deletions: [
      Object.assign(article("deleted"), {
        sourceRef: "trash/deleted.tombstone.json",
        deleted: true,
        state: "TRASHED",
        deletedAt: "2026-08-08T00:02:00.000Z",
        contentFingerprint: FINGERPRINT,
      }),
    ],
  };
}

test("23-B builds all six closed variants and ignores review/generated/saved gates", () => {
  const result = createLegacyMigrationPlanner({
    legacySource: completeSource(),
  }).planResult();

  assert.deepEqual(
    result.plan.entries.map((entry) => entry.variant).sort(),
    [
      "deletionRecoveryConflict",
      "needsAttentionConflict",
      "nonPublishedTerminal",
      "pendingReadmission",
      "publishedEvidence",
      "trackablePaidOrder",
    ].sort(),
  );
  assert.equal(result.report.counts.publishedEvidence, 1);
  assert.equal(result.report.counts.trackablePaidOrder, 1);
  assert.equal(result.report.counts.pendingReadmission, 1);
  assert.equal(result.report.counts.nonPublishedTerminal, 1);
  assert.equal(result.report.counts.needsAttentionConflict, 1);
  assert.equal(result.report.counts.deletionRecoveryConflict, 1);
  assert.equal(result.report.counts.ignored, 1);
  assert.equal(result.report.counts.unplanned, 0);
  assert.equal(LEGACY_CLASSIFICATION_MATRIX.REVIEW_PENDING.result, "ignored");

  const published = result.plan.entries.find(
    (entry) => entry.variant === "publishedEvidence",
  );
  assert.equal(published.payload.publicationEvidenceV1.contentAvailable, true);
  assert.equal(published.payload.publicationEvidenceV1.title, "历史投稿标题");
  assert.equal(published.payload.publicationEvidenceV1.body, "历史投稿正文");
});

test("23-B gives trusted success priority over late terminal observations", () => {
  const source = {
    workspaceFingerprint: FINGERPRINT,
    articles: [article("first-wins")],
    publications: [
      fact("first-wins", platform("first-wins"), "failed"),
      fact("first-wins", platform("first-wins"), "published", {
        accepted: true,
        submittedTitle: "历史标题",
        submittedBody: "历史正文",
      }),
    ],
  };
  const plan = createLegacyMigrationPlanner({ legacySource: source }).plan();
  assert.equal(plan.entries.length, 1);
  assert.equal(plan.entries[0].variant, "publishedEvidence");
});

test("23-B routes multiple targets, missing order ids and content disagreement to attention", () => {
  const source = {
    workspaceFingerprint: FINGERPRINT,
    articles: [
      article("multi-target"),
      article("missing-order"),
      article("content-conflict"),
    ],
    queues: [
      fact("multi-target", platform("one"), "queued", {
        queueState: "QUEUED",
        remoteBoundaryCrossed: false,
      }),
      fact("multi-target", platform("two"), "queued", {
        queueState: "QUEUED",
        remoteBoundaryCrossed: false,
      }),
    ],
    publications: [
      fact("missing-order", media("missing"), "published", {
        accepted: true,
      }),
      fact("content-conflict", platform("content"), "submitted", {
        submittedTitle: "历史标题 A",
        submittedBody: "历史正文 A",
      }),
      fact("content-conflict", platform("content"), "submitted", {
        submittedTitle: "历史标题 B",
        submittedBody: "历史正文 B",
      }),
    ],
  };
  const result = createLegacyMigrationPlanner({
    legacySource: source,
  }).planResult();
  const byArticle = new Map(
    result.plan.entries.map((entry) => [
      entry.articleIdentityV1.articleId,
      entry,
    ]),
  );
  assert.equal(
    byArticle.get("multi-target").payload.conflictKind,
    "MULTIPLE_ACTIVE_TARGETS",
  );
  assert.equal(
    byArticle.get("missing-order").payload.conflictKind,
    "MISSING_ORDER_ID",
  );
  assert.equal(
    byArticle.get("content-conflict").payload.conflictKind,
    "CONTENT_CONFLICT",
  );
});

test("23-B is deterministic, idempotent and keeps sensitive content out of dry-run report", () => {
  const source = completeSource();
  source.publications[0].sourceRef = "C:\\private\\legacy\\publication.json";
  source.publications[0].api_key = "must-not-be-copied";
  source.publications[0].params = { content: "supplier-secret-body" };
  const reversed = JSON.parse(JSON.stringify(source));
  reversed.articles.reverse();
  reversed.publications.reverse();
  reversed.orders.reverse();

  const first = createLegacyMigrationPlanner({
    legacySource: source,
  }).planResult();
  const second = createLegacyMigrationPlanner({
    legacySource: reversed,
  }).planResult();
  assert.deepEqual(first.plan, second.plan);
  assert.deepEqual(first.report, second.report);
  assert.deepEqual(source.publications[0].params, {
    content: "supplier-secret-body",
  });
  assert.equal(Object.isFrozen(first.plan), true);
  assert.equal(Object.isFrozen(first.report), true);

  const reportText = JSON.stringify(first.report);
  assert.equal(reportText.includes("must-not-be-copied"), false);
  assert.equal(reportText.includes("supplier-secret-body"), false);
  assert.equal(reportText.includes("C:\\private\\legacy"), false);
  assert.equal(reportText.includes("历史投稿正文"), false);
});

test("23-B reads production-shaped legacy files without writing the source workspace", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ticket-23-b-reader-"));
  try {
    const articleFile = path.join(
      root,
      "generated",
      "client-23-b",
      "article-file.json",
    );
    const publicationFile = path.join(
      root,
      ".autopublish",
      "submission-records",
      "publications",
      `publication-${FINGERPRINT}.json`,
    );
    fs.mkdirSync(path.dirname(articleFile), { recursive: true });
    fs.mkdirSync(path.dirname(publicationFile), { recursive: true });
    fs.writeFileSync(
      articleFile,
      JSON.stringify(article("article-file")) + "\n",
      "utf8",
    );
    fs.writeFileSync(
      publicationFile,
      JSON.stringify({
        clientId: "client-23-b",
        articleId: "article-file",
        platformId: "toutiao",
        accountProfileId: "account-file",
        status: "published",
        accepted: true,
        submittedTitle: "文件历史标题",
        submittedBody: "文件历史正文",
      }) + "\n",
      "utf8",
    );
    const before = [
      fs.readFileSync(articleFile, "utf8"),
      fs.readFileSync(publicationFile, "utf8"),
    ];
    const planner = createLegacyMigrationPlanner({ workspaceRoot: root });
    const result = planner.planResult();
    assert.equal(result.plan.entries.length, 1);
    assert.equal(result.plan.entries[0].variant, "publishedEvidence");
    assert.equal(result.report.inputs.articles.records, 1);
    assert.equal(result.report.inputs.publications.records, 1);
    assert.deepEqual(
      [
        fs.readFileSync(articleFile, "utf8"),
        fs.readFileSync(publicationFile, "utf8"),
      ],
      before,
    );
    assert.equal(
      fs.existsSync(path.join(root, ".autopublish", "operations")),
      false,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
