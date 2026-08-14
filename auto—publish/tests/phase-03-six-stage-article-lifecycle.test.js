const assert = require("node:assert/strict");
const test = require("node:test");

const {
  ARTICLE_LIFECYCLE_STAGES,
  deriveArticleLifecycle,
  projectArticleLifecycle,
} = require("../src/content/article-lifecycle-projection");
const {
  projectManagementSnapshot,
} = require("../desktop/ipc/contracts/article-management-contracts");

function article(overrides) {
  return {
    id: "article-1",
    clientId: "client-1",
    title: "完整标题",
    content: "完整正文",
    status: "saved",
    ...(overrides || {}),
  };
}

function facts(overrides) {
  return {
    article: article(),
    publications: [],
    submissionItems: [],
    orders: [],
    attentionItems: [],
    removalTransactions: [],
    ...(overrides || {}),
  };
}

function operationNames(workflow) {
  return Object.keys(workflow.operations).sort();
}

test("article library exposes the five public categories and no runtime-only stages", () => {
  assert.deepEqual(ARTICLE_LIFECYCLE_STAGES, [
    "pending_submission",
    "needs_completion",
    "in_submission",
    "published",
    "trash",
  ]);

  const matrix = [
    [
      "complete article without runtime facts",
      facts(),
      "pending_submission",
      "待投稿",
      { edit: true, submit: true, trash: true },
    ],
    [
      "incomplete article without runtime facts",
      facts({ article: article({ title: "" }) }),
      "needs_completion",
      "待完善",
      { edit: true, submit: false, trash: true },
    ],
    [
      "regular queue item",
      facts({
        submissionItems: [
          { articleId: "article-1", status: "queued", targetKey: "platform:p1" },
        ],
      }),
      "in_submission",
      "投稿中",
      { edit: false, submit: false, trash: false },
    ],
    [
      "confirmed paid batch before order creation",
      facts({
        submissionItems: [
          {
            articleId: "article-1",
            status: "paid_processing",
            targetKey: "media-resource:r1",
          },
        ],
      }),
      "in_submission",
      "投稿中",
      { edit: false, submit: false, trash: false },
    ],
    [
      "active paid order",
      facts({
        orders: [
          {
            articleId: "article-1",
            orderId: "order-1",
            mediaResourceId: "resource-1",
            supplierStatusCode: "0",
          },
        ],
      }),
      "in_submission",
      "投稿中",
      { edit: false, submit: false, trash: false },
    ],
    [
      "active order with a missing target still freezes",
      facts({
        orders: [
          {
            articleId: "article-1",
            orderId: "order-without-target",
            supplierStatusCode: "1",
          },
        ],
      }),
      "in_submission",
      "投稿中",
      { edit: false, submit: false, trash: false },
    ],
    [
      "uncertain remote result",
      facts({
        publications: [
          { articleId: "article-1", status: "uncertain", targetKey: "platform:p1" },
        ],
      }),
      "in_submission",
      "投稿中",
      { edit: false, submit: false, trash: false },
    ],
    [
      "explicit failure with ended target",
      facts({
        publications: [
          { articleId: "article-1", status: "failed", targetKey: "platform:p1" },
        ],
        attentionItems: [
          { attentionId: "attention-1", articleId: "article-1", kind: "failed_submission" },
        ],
      }),
      "pending_submission",
      "待投稿",
      { edit: true, submit: true, trash: true },
    ],
    [
      "published article with a late after-sales observation",
      facts({
        publications: [
          { articleId: "article-1", status: "published", targetKey: "platform:p1" },
        ],
        orders: [
          {
            articleId: "article-1",
            orderId: "order-1",
            supplierStatusCode: "9",
            publicationStatus: "published",
            mediaResourceId: "resource-1",
          },
        ],
      }),
      "published",
      "已发布",
      { edit: false, submit: false, trash: false },
    ],
    [
      "safe trash record",
      facts({ article: article({ status: "trashed" }) }),
      "trash",
      "回收站",
      { edit: false, submit: false, trash: false, restore: true, purge: true },
    ],
  ];

  for (const [name, input, stage, label, permissions] of matrix) {
    const workflow = deriveArticleLifecycle(input);
    assert.equal(workflow.stage, stage, name);
    assert.equal(workflow.label, label, name);
    for (const [operation, allowed] of Object.entries(permissions))
      assert.equal(workflow.operations[operation].allowed, allowed, `${name}:${operation}`);
    assert.notEqual(workflow.stage, "paid_processing", name);
    assert.notEqual(workflow.stage, "failed", name);
  }
});

test("projection keeps attention and order summaries independent from the article category", () => {
  const workflow = deriveArticleLifecycle(facts({
    publications: [
      { articleId: "article-1", status: "failed", targetKey: "platform:p1" },
    ],
    orders: [
      {
        articleId: "article-1",
        orderId: "order-1",
        mediaResourceId: "resource-1",
        supplierStatusCode: "4",
      },
    ],
    attentionItems: [
      { attentionId: "attention-1", articleId: "article-1", kind: "failed_submission" },
      { attentionId: "attention-2", articleId: "article-1", kind: "order_status_anomaly" },
    ],
  }));

  assert.equal(workflow.stage, "pending_submission");
  assert.equal(workflow.attentionCount, 2);
  assert.deepEqual(workflow.orderSummary, {
    status: "rejected",
    label: "已退稿",
    records: 1,
    active: 0,
    published: 0,
    attention: 1,
  });
  assert.deepEqual(workflow.publicationSummary, {
    status: "failed",
    label: "失败",
    records: 2,
    published: 0,
    uncertain: false,
  });
  assert.equal(workflow.operations.submit.allowed, true);
  assert.deepEqual(operationNames(workflow), [
    "purge",
    "queue",
    "retarget",
    "restore",
    "submit",
    "trash",
    "edit",
  ].sort());
});

test("trash conflicts stay in the trash category and fail closed", () => {
  const workflow = deriveArticleLifecycle(facts({
    article: article({ status: "trashed" }),
    submissionItems: [
      { articleId: "article-1", status: "queued", targetKey: "platform:p1" },
    ],
  }));

  assert.equal(workflow.stage, "trash");
  assert.equal(workflow.reasonCodes.includes("TRASH_ACTIVE_CONFLICT"), true);
  assert.equal(workflow.operations.restore.allowed, false);
  assert.equal(workflow.operations.purge.allowed, false);
  assert.equal(workflow.operations.restore.reasonCodes.includes("TRASH_ACTIVE_CONFLICT"), true);
});

test("batch projection classifies all articles once and exposes one set of navigation counts", () => {
  const projection = projectArticleLifecycle({
    articles: [
      article({ id: "pending" }),
      article({ id: "incomplete", content: "" }),
      article({ id: "in-progress" }),
      article({ id: "published" }),
      article({ id: "failed" }),
    ],
    trash: [{ articleId: "trash", clientId: "client-1", status: "trashed" }],
    submissionItems: [
      { articleId: "in-progress", status: "queued", targetKey: "platform:p1" },
    ],
    publications: [
      { articleId: "published", status: "published", targetKey: "platform:p1" },
      { articleId: "failed", status: "failed", targetKey: "platform:p2" },
    ],
    attentionItems: [
      { attentionId: "attention-1", articleId: "failed", kind: "failed_submission" },
    ],
  });

  assert.deepEqual(
    Object.fromEntries(Object.entries(projection.byArticle).map(([id, value]) => [id, value.stage])),
    {
      pending: "pending_submission",
      incomplete: "needs_completion",
      "in-progress": "in_submission",
      published: "published",
      failed: "pending_submission",
      trash: "trash",
    },
  );
  assert.deepEqual(projection.counts, {
    pending_submission: 2,
    needs_completion: 1,
    in_submission: 1,
    published: 1,
    trash: 1,
    total: 6,
  });
  assert.deepEqual(Object.fromEntries(Object.entries(projection.attentionCounts)), {
    pending: 0,
    incomplete: 0,
    "in-progress": 0,
    published: 0,
    failed: 1,
    trash: 0,
  });
  assert.equal(projection.orderSummaries.failed.status, "none");
});

test("published success remains immutable even when a later unknown observation is present", () => {
  const workflow = deriveArticleLifecycle(facts({
    publications: [
      { articleId: "article-1", status: "published", targetKey: "platform:p1" },
    ],
    orders: [
      { articleId: "article-1", orderId: "order-1", supplierStatusCode: "" },
    ],
  }));

  assert.equal(workflow.stage, "published");
  assert.equal(workflow.operations.edit.allowed, false);
  assert.equal(workflow.operations.submit.allowed, false);
  assert.equal(workflow.reasonCodes.includes("ORDER_STATUS_UNKNOWN"), true);
});

test("IPC projection carries the five-stage counts and independent summaries", () => {
  const snapshot = projectManagementSnapshot({
    clientId: "client-1",
    revision: 1,
    articles: [],
    trash: [],
    submissionBatches: [],
    cancellationPlans: [],
    publicationRecords: [],
    attention: { revision: 1, items: [], counts: { total: 0, actionable: 0 } },
    submissionPlatforms: [],
    workflowByArticle: {
      "article-1": {
        version: 2,
        stage: "in_submission",
        label: "投稿中",
        primaryAction: "view_submission",
        allowedBulkActions: ["view_submission"],
        reasonCodes: [],
        reasonMessage: null,
        locks: {
          canEdit: false,
          canSubmit: false,
          canQueue: false,
          canCancel: false,
          canTrash: false,
        },
        operations: {
          edit: { allowed: false, reasonCodes: ["ARTICLE_OPERATION_FROZEN"], safeMetadata: {} },
          submit: { allowed: false, reasonCodes: ["ARTICLE_OPERATION_FROZEN"], safeMetadata: {} },
          queue: { allowed: false, reasonCodes: ["ARTICLE_OPERATION_FROZEN"], safeMetadata: {} },
          retarget: { allowed: false, reasonCodes: ["ARTICLE_OPERATION_FROZEN"], safeMetadata: {} },
          trash: { allowed: false, reasonCodes: ["ARTICLE_OPERATION_FROZEN"], safeMetadata: {} },
          restore: { allowed: false, reasonCodes: ["ARTICLE_IN_TRASH"], safeMetadata: {} },
          purge: { allowed: false, reasonCodes: ["ARTICLE_IN_TRASH"], safeMetadata: {} },
        },
        attentionCount: 1,
        orderSummary: {
          status: "processing",
          label: "付费处理中",
          records: 1,
          active: 1,
          published: 0,
          attention: 0,
        },
        publicationSummary: {
          status: "queued",
          label: "已入队",
          records: 1,
          published: 0,
          uncertain: false,
        },
        targetFacts: {},
      },
    },
    attentionCounts: { "article-1": 1 },
    orderSummaries: {
      "article-1": {
        status: "processing",
        label: "付费处理中",
        records: 1,
        active: 1,
        published: 0,
        attention: 0,
      },
    },
    publicationSummaries: {},
    lifecycleVersion: 2,
    lifecycleCounts: {
      pending_submission: 0,
      needs_completion: 0,
      in_submission: 1,
      published: 0,
      trash: 0,
      total: 1,
    },
  });

  assert.equal(snapshot.workflowItems[0].workflow.stage, "in_submission");
  assert.equal(snapshot.workflowItems[0].workflow.attentionCount, 1);
  assert.deepEqual(snapshot.attentionCountItems, [{ articleId: "article-1", count: 1 }]);
  assert.equal(snapshot.orderSummaryItems[0].summary.status, "processing");
  assert.deepEqual(snapshot.lifecycleCounts, {
    pending_submission: 0,
    needs_completion: 0,
    in_submission: 1,
    published: 0,
    trash: 0,
    total: 1,
  });
});
