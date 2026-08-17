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

test("23-B ignores current generated content and batch files during legacy evidence scan", () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "ticket-23-b-generation-batch-")
  );
  try {
    const batchDirectory = path.join(root, ".autopublish", "batches");
    const generatedDirectory = path.join(root, "generated", "畅速");
    fs.mkdirSync(batchDirectory, { recursive: true });
    fs.mkdirSync(generatedDirectory, { recursive: true });
    fs.writeFileSync(
      path.join(generatedDirectory, "current-article.json"),
      JSON.stringify({
        id: "current-article",
        clientId: "畅速",
        status: "generated",
        title: "current article",
        content: "current content",
        generationBatchId: "current-batch",
        generationTaskId: "current-task",
      }) + "\n",
      "utf8",
    );
    fs.writeFileSync(
      path.join(batchDirectory, "batch-current.json"),
      JSON.stringify({
        version: 1,
        id: "current-batch",
        concurrency: 1,
        status: "completed",
        createdAt: "2026-08-14T00:00:00.000Z",
        updatedAt: "2026-08-14T00:01:00.000Z",
        aiConfigFingerprint: FINGERPRINT,
        clientSources: [],
        templates: [],
        tasks: [],
        counts: {
          total: 0,
          succeeded: 0,
          failed: 0,
          pending: 0,
          interrupted: 0,
          cancelled: 0,
        },
      }) + "\n",
      "utf8",
    );

    const result = createLegacyMigrationPlanner({
      workspaceRoot: root,
    }).planResult();

    assert.deepEqual(result.report.diagnostics, []);
    assert.equal(result.report.counts.unplanned, 0);
    assert.equal(result.report.counts.corrupt, 0);
    assert.deepEqual(result.plan.entries, []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("23-B ignores legacy generated content without batch provenance or migration-safe client ids", () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "ticket-23-b-legacy-generated-content-"),
  );
  try {
    const generatedDirectory = path.join(root, "generated", "畅速");
    fs.mkdirSync(generatedDirectory, { recursive: true });
    fs.writeFileSync(
      path.join(generatedDirectory, "legacy-article.json"),
      JSON.stringify({
        id: "legacy-article",
        clientId: "畅速",
        status: "generated",
        title: "旧工作区文章",
        content: "标题和正文完整，但早期版本没有生成批次标识。",
      }) + "\n",
      "utf8",
    );

    const result = createLegacyMigrationPlanner({
      workspaceRoot: root,
    }).planResult();

    assert.equal(result.report.counts.ignored, 1);
    assert.equal(result.report.counts.unplanned, 0);
    assert.equal(result.report.counts.corrupt, 0);
    assert.deepEqual(result.plan.entries, []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("23-B never ignores malformed operational evidence on generated content", () => {
  const records = [
    article("generated-bad-target", {
      status: "generated",
      targetIdentityV1: {
        version: 1,
        kind: "platform",
        platformId: "toutiao",
      },
    }),
    article("generated-bad-order", {
      status: "generated",
      orderIdentityV1: { version: 1, orderId: "" },
    }),
    article("generated-incomplete-publication", {
      status: "generated",
      publicationEvidenceV1: {
        version: 1,
        resultCode: "REGULAR_ACCEPTED",
      },
    }),
    article("generated-bad-resource-id", {
      status: "generated",
      resourceId: "非法 id!",
    }),
    article("generated-bad-resource-snake-id", {
      status: "generated",
      resource_id: "非法 id!",
    }),
  ];

  for (const record of records) {
    const result = createLegacyMigrationPlanner({
      legacySource: {
        workspaceFingerprint: FINGERPRINT,
        articles: [record],
      },
    }).planResult();

    assert.equal(result.report.counts.ignored, 0, record.articleId);
    assert.equal(result.report.counts.needsAttentionConflict, 1, record.articleId);
    assert.equal(result.plan.entries.length, 1, record.articleId);
    assert.equal(result.plan.entries[0].variant, "needsAttentionConflict");
    assert.equal(
      result.plan.entries[0].payload.conflictKind,
      "IDENTITY_CONFLICT",
    );
  }
});

function completeSource() {
  return {
    workspaceFingerprint: FINGERPRINT,
    articles: [
      article("review-only", {
        reviewStatus: "pending",
        reviewedAt: "2026-08-08T00:00:00.000Z",
        sourceArticleId: "legacy-root",
      }),
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
  const planner = createLegacyMigrationPlanner({
    legacySource: completeSource(),
  });
  const evidence = planner.read();
  const result = planner.planResult();

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
  const reviewEvidence = evidence.articles.find(
    (item) => item.articleId === "review-only",
  );
  assert.equal(reviewEvidence.reviewedAt, "2026-08-08T00:00:00.000Z");
  assert.equal(reviewEvidence.sourceArticleId, "legacy-root");
  assert.doesNotMatch(JSON.stringify(result.plan), /reviewedAt|sourceArticleId/);

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

test("23-B preserves submitted-content conflicts even when one record proves success", () => {
  const source = {
    workspaceFingerprint: FINGERPRINT,
    articles: [article("published-content-conflict")],
    publications: [
      fact(
        "published-content-conflict",
        platform("published-content-conflict"),
        "published",
        {
          accepted: true,
          submittedTitle: "历史标题 A",
          submittedBody: "历史正文 A",
        },
      ),
      fact(
        "published-content-conflict",
        platform("published-content-conflict"),
        "failed",
        {
          submittedTitle: "历史标题 B",
          submittedBody: "历史正文 B",
        },
      ),
    ],
  };

  const plan = createLegacyMigrationPlanner({ legacySource: source }).plan();
  assert.equal(plan.entries.length, 1);
  assert.equal(plan.entries[0].variant, "needsAttentionConflict");
  assert.equal(plan.entries[0].payload.conflictKind, "CONTENT_CONFLICT");
});

test("23-B does not let success hide an uncertain different target", () => {
  const source = {
    workspaceFingerprint: FINGERPRINT,
    articles: [article("published-target-conflict")],
    publications: [
      fact(
        "published-target-conflict",
        platform("published-target"),
        "published",
        {
          accepted: true,
          submittedTitle: "历史标题",
          submittedBody: "历史正文",
        },
      ),
      fact(
        "published-target-conflict",
        platform("uncertain-target"),
        "submitted",
      ),
    ],
  };

  const plan = createLegacyMigrationPlanner({ legacySource: source }).plan();
  assert.equal(plan.entries.length, 1);
  assert.equal(plan.entries[0].variant, "needsAttentionConflict");
  assert.equal(plan.entries[0].payload.conflictKind, "MULTIPLE_ACTIVE_TARGETS");
});

test("23-B rejects disagreement between nested V1 and flat legacy identities", () => {
  const source = {
    workspaceFingerprint: FINGERPRINT,
    articles: [
      article("flat-article"),
      article("target-conflict"),
      article("order-conflict"),
    ],
    publications: [
      fact("flat-article", platform("article"), "submitted", {
        articleIdentityV1: {
          version: 1,
          clientId: "client-23-b",
          articleId: "nested-article",
        },
      }),
      Object.assign(
        fact("target-conflict", platform("nested-target"), "submitted"),
        {
          platformId: "toutiao",
          accountProfileId: "account-flat-target",
        },
      ),
    ],
    orders: [
      fact("order-conflict", media("order-conflict"), "1", {
        orderIdentityV1: { version: 1, orderId: "nested-order" },
        orderId: "flat-order",
      }),
    ],
  };

  const plan = createLegacyMigrationPlanner({ legacySource: source }).plan();
  const conflicts = plan.entries.filter(
    (entry) =>
      entry.variant === "needsAttentionConflict" &&
      entry.payload.conflictKind === "IDENTITY_CONFLICT",
  );
  assert.equal(conflicts.length, 3);
  assert.ok(
    conflicts.some(
      (entry) => entry.articleIdentityV1.articleId === "flat-article",
    ),
  );
  assert.equal(
    conflicts.some(
      (entry) => entry.articleIdentityV1.articleId === "nested-article",
    ),
    false,
  );
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

test("23-B preserves a sidecar remote boundary and never restores it to readmission", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ticket-23-b-sidecar-"));
  try {
    const articleFile = path.join(
      root,
      "generated",
      "client-23-b",
      "sidecar-crossed.json",
    );
    const sidecarFile = path.join(
      root,
      ".autopublish",
      "input",
      "toutiao",
      "sidecar-crossed.md.submission.json",
    );
    fs.mkdirSync(path.dirname(articleFile), { recursive: true });
    fs.mkdirSync(path.dirname(sidecarFile), { recursive: true });
    fs.writeFileSync(
      articleFile,
      JSON.stringify(article("sidecar-crossed")),
      "utf8",
    );
    fs.writeFileSync(
      sidecarFile,
      JSON.stringify({
        version: 2,
        clientId: "client-23-b",
        generatedArticleId: "sidecar-crossed",
        targetPlatformId: "toutiao",
        status: "queued",
        remoteBoundaryCrossed: true,
      }),
      "utf8",
    );
    const result = createLegacyMigrationPlanner({ workspaceRoot: root }).plan();
    assert.equal(result.entries.length, 1);
    assert.equal(result.entries[0].variant, "needsAttentionConflict");
    assert.equal(
      result.entries[0].payload.conflictKind,
      "SUBMITTING_OR_UNPROVEN_SUBMITTED",
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
