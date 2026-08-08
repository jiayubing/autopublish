const assert = require("node:assert/strict");
const test = require("node:test");

const {
  ARTICLE_LIFECYCLE_STAGES,
  deriveArticleLifecycle,
  projectArticleLifecycle,
} = require("../src/content/article-lifecycle-projection");
const { projectManagementSnapshot } = require("../desktop/ipc/contracts/content-core-contracts");
const { publicationSummary } = require("../src/content/article-lifecycle-facts");

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

test("submitted facts are exposed as pending confirmation, never reviewing", () => {
  const summary = publicationSummary(
    [{ articleId: "article-1", status: "submitted", targetKey: "media-resource:r1" }],
    [],
    [],
  );
  assert.equal(summary.status, "uncertain");
  assert.equal(summary.label, "待确认");
  assert.equal(summary.uncertain, true);
});

test("article lifecycle exposes the six mutually exclusive stages", () => {
  assert.deepEqual(ARTICLE_LIFECYCLE_STAGES, [
    "pending_submission",
    "queued",
    "paid_processing",
    "failed",
    "published",
    "trash",
  ]);

  assert.equal(deriveArticleLifecycle(facts()).stage, "pending_submission");
  assert.equal(
    deriveArticleLifecycle(facts({
      submissionItems: [{ articleId: "article-1", status: "queued", targetKey: "platform:p1" }],
    })).stage,
    "queued",
  );
  assert.equal(
    deriveArticleLifecycle(facts({
      publications: [{ articleId: "article-1", status: "submitted", targetKey: "media-resource:r1" }],
      orders: [{ articleId: "article-1", orderId: "order-1", supplierStatusCode: "0" }],
    })).stage,
    "paid_processing",
  );
  assert.equal(
    deriveArticleLifecycle(facts({
      publications: [{ articleId: "article-1", status: "uncertain", targetKey: "platform:p1" }],
    })).stage,
    "failed",
  );
  assert.equal(
    deriveArticleLifecycle(facts({
      publications: [{ articleId: "article-1", status: "published", targetKey: "platform:p1" }],
    })).stage,
    "published",
  );
  assert.equal(
    deriveArticleLifecycle(facts({ article: article({ status: "trashed" }) })).stage,
    "trash",
  );
});

test("published evidence wins over supplier rejection and after-sales facts", () => {
  const workflow = deriveArticleLifecycle(facts({
    publications: [{ articleId: "article-1", status: "published", targetKey: "media-resource:r1" }],
    orders: [{ articleId: "article-1", orderId: "order-1", supplierStatusCode: "4" }],
    attentionItems: [{ articleId: "article-1", kind: "failed_submission" }],
  }));

  assert.equal(workflow.stage, "published");
  assert.equal(workflow.locks.canEdit, false);
  assert.equal(workflow.locks.canQueue, false);
});

test("ordinary platform acceptance is a global published fact", () => {
  const workflow = deriveArticleLifecycle(facts({
    publications: [{ articleId: "article-1", status: "submitted", targetKey: "platform:p1" }],
  }));

  assert.equal(workflow.stage, "published");
  assert.equal(workflow.publicationSummary.status, "published");
  assert.equal(workflow.targetFacts["platform:p1"].status, "published");
  assert.deepEqual(workflow.locks, { canEdit: false, canQueue: false, canCancel: false, canTrash: false });
});

test("canonical published order remains published after a later after-sales observation", () => {
  const workflow = deriveArticleLifecycle(facts({
    orders: [{ articleId: "article-1", orderId: "order-1", supplierStatusCode: "9", publicationStatus: "published", mediaResourceId: "r1" }],
  }));

  assert.equal(workflow.stage, "published");
  assert.equal(workflow.publicationSummary.status, "published");
  assert.equal(workflow.publicationSummary.label, "已发布");
});

test("hard unknown facts still freeze an article that also has a prior published fact", () => {
  const workflow = deriveArticleLifecycle(facts({
    publications: [{ articleId: "article-1", status: "published", targetKey: "platform:p1" }],
    orders: [{ articleId: "article-1", orderId: "order-1", supplierStatusCode: "" }],
  }));

  assert.equal(workflow.stage, "failed");
  assert.equal(workflow.locks.canEdit, false);
  assert.equal(workflow.reasonCodes.includes("ORDER_STATUS_UNKNOWN"), true);
});

test("target facts preserve published success over stale queue and rejection facts", () => {
  const workflow = deriveArticleLifecycle(facts({
    publications: [{ articleId: "article-1", status: "published", targetKey: "platform:p1" }],
    submissionItems: [{ articleId: "article-1", status: "queued", targetKey: "platform:p1", canCancel: true }],
    orders: [{ articleId: "article-1", orderId: "order-1", supplierStatusCode: "4", targetKey: "platform:p1" }],
  }));

  assert.equal(workflow.targetFacts["platform:p1"].status, "published");
  assert.equal(workflow.targetFacts["platform:p1"].canCancel, false);
});

test("unknown order facts fail closed instead of falling back to pending submission", () => {
  const workflow = deriveArticleLifecycle(facts({
    orders: [{ articleId: "article-1", orderId: "order-1", supplierStatusCode: "" }],
  }));

  assert.equal(workflow.stage, "failed");
  assert.equal(workflow.locks.canEdit, false);
  assert.equal(workflow.reasonCodes.includes("ORDER_STATUS_UNKNOWN"), true);
});

test("empty and unknown publication or queue statuses fail closed", () => {
  for (const input of [
    { publications: [{ articleId: "article-1", status: "", targetKey: "platform:p1" }] },
    { publications: [{ articleId: "article-1", status: "future-state", targetKey: "platform:p1" }] },
    { submissionItems: [{ articleId: "article-1", status: "future-state", targetKey: "platform:p1" }] },
  ]) {
    const workflow = deriveArticleLifecycle(facts(input));
    assert.equal(workflow.stage, "failed");
    assert.deepEqual(workflow.locks, { canEdit: false, canQueue: false, canCancel: false, canTrash: false });
  }
});

test("multiple active targets fail closed instead of creating an ambiguous queue", () => {
  const workflow = deriveArticleLifecycle(facts({
    submissionItems: [
      { articleId: "article-1", status: "queued", targetKey: "platform:p1" },
      { articleId: "article-1", status: "queued", targetKey: "platform:p2" },
    ],
  }));

  assert.equal(workflow.stage, "failed");
  assert.equal(workflow.reasonCodes.includes("MULTIPLE_ACTIVE_TARGETS"), true);
  assert.equal(workflow.locks.canEdit, false);
});

test("active website media orders participate in the single-target freeze", () => {
  for (const supplierStatusCode of ["0", "1"]) {
    const workflow = deriveArticleLifecycle(facts({
      submissionItems: [{ articleId: "article-1", status: "queued", targetKey: "platform:p1" }],
      orders: [{ articleId: "article-1", orderId: "order-1", mediaResourceId: "resource-1", supplierStatusCode }],
    }));

    assert.equal(workflow.stage, "failed");
    assert.equal(workflow.reasonCodes.includes("MULTIPLE_ACTIVE_TARGETS"), true);
    assert.deepEqual(workflow.locks, { canEdit: false, canQueue: false, canCancel: false, canTrash: false });
  }
});

test("uncertain results remain frozen even when the article is otherwise complete", () => {
  const workflow = deriveArticleLifecycle(facts({
    submissionItems: [{ articleId: "article-1", status: "uncertain", targetKey: "platform:p1" }],
  }));

  assert.equal(workflow.stage, "failed");
  assert.deepEqual(workflow.allowedBulkActions, ["open_attention"]);
  assert.deepEqual(workflow.locks, { canEdit: false, canQueue: false, canCancel: false, canTrash: false });
});

test("a media publication without a matching order is a frozen attention stage", () => {
  const workflow = deriveArticleLifecycle(facts({
    publications: [{ articleId: "article-1", status: "published", targetKey: "media-resource:r1" }],
  }));

  assert.equal(workflow.stage, "failed");
  assert.equal(workflow.reasonCodes.includes("MEDIA_ORDER_MISSING"), true);
  assert.equal(workflow.locks.canQueue, false);
  assert.equal(workflow.locks.canTrash, false);
});

test("a deletion fact with an active queue cannot be presented as a safe trash item", () => {
  const workflow = deriveArticleLifecycle(facts({
    article: article({ status: "trashed" }),
    submissionItems: [{ articleId: "article-1", status: "queued", targetKey: "platform:p1" }],
  }));

  assert.equal(workflow.stage, "failed");
  assert.equal(workflow.reasonCodes.includes("TRASH_ACTIVE_CONFLICT"), true);
  assert.equal(workflow.locks.canTrash, false);
});

test("compatibility workflow derivation does not mutate the supplied fact arrays", () => {
  const records = [];
  const items = [];
  const { deriveWorkflow } = require("../desktop/services/article-management-snapshot");
  deriveWorkflow(article(), records, [], [], [], {
    submissionItems: items,
    targetFacts: [{ targetKey: "platform:p1", status: "published" }],
  });

  assert.deepEqual(records, []);
  assert.deepEqual(items, []);
});

test("batch projection classifies every article once and returns shared counts", () => {
  const articles = [
    article({ id: "pending" }),
    article({ id: "queued" }),
    article({ id: "paid" }),
    article({ id: "attention" }),
    article({ id: "published" }),
  ];
  const projection = projectArticleLifecycle({
    articles,
    trash: [{ articleId: "trash", clientId: "client-1", status: "trashed" }],
    submissionItems: [{ articleId: "queued", status: "queued", targetKey: "platform:p1" }],
    publications: [
      { articleId: "paid", status: "submitted", targetKey: "media-resource:r1" },
      { articleId: "attention", status: "uncertain", targetKey: "platform:p1" },
      { articleId: "published", status: "published", targetKey: "platform:p1" },
    ],
    orders: [{ articleId: "paid", orderId: "order-1", supplierStatusCode: "1" }],
    attentionItems: [],
    removalTransactions: [],
  });

  assert.deepEqual(
    Object.fromEntries(Object.entries(projection.byArticle).map(([id, value]) => [id, value.stage])),
    {
      pending: "pending_submission",
      queued: "queued",
      paid: "paid_processing",
      attention: "failed",
      published: "published",
      trash: "trash",
    },
  );
  assert.deepEqual(projection.counts, {
    pending_submission: 1,
    queued: 1,
    paid_processing: 1,
    failed: 1,
    published: 1,
    trash: 1,
    total: 6,
  });
});

test("trash records identified by articleId retain conflict facts in the batch projection", () => {
  const projection = projectArticleLifecycle({
    articles: [],
    trash: [{ articleId: "trash-published", clientId: "client-1", title: "已发布", content: "正文" }],
    publications: [{ articleId: "trash-published", status: "published", targetKey: "platform:p1" }],
  });

  assert.equal(projection.byArticle["trash-published"].stage, "failed");
  assert.equal(projection.byArticle["trash-published"].reasonCodes.includes("PUBLISHED_TRASH_CONFLICT"), true);
  assert.equal(projection.counts.failed, 1);
  assert.equal(projection.counts.trash, 0);
});

test("persisted removal repair transactions freeze every affected article", () => {
  const projection = projectArticleLifecycle({
    articles: [article({ id: "repair-article" })],
    removalTransactions: [{
      id: "removal-1",
      status: "needs_repair",
      phase: "needs_repair",
      selections: [{ clientId: "client-1", articleId: "repair-article" }],
      articles: [{ clientId: "client-1", articleId: "repair-article" }],
    }],
  });

  const workflow = projection.byArticle["repair-article"];
  assert.equal(workflow.stage, "failed");
  assert.equal(workflow.reasonCodes.includes("REMOVAL_REPAIR_REQUIRED"), true);
  assert.deepEqual(workflow.locks, {
    canEdit: false,
    canQueue: false,
    canCancel: false,
    canTrash: false,
  });
});

test("removal repair transaction membership remains isolated by client", () => {
  const projection = projectArticleLifecycle({
    articles: [article({ id: "shared-article", clientId: "client-1" })],
    removalTransactions: [{
      id: "other-client-removal",
      status: "needs_repair",
      phase: "needs_repair",
      selections: [{ clientId: "client-2", articleId: "shared-article" }],
    }],
  });

  assert.equal(projection.byArticle["shared-article"].stage, "pending_submission");
});

test("IPC projection preserves target facts from the unified workflow", () => {
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
        version: 1,
        stage: "published",
        label: "已发布",
        primaryAction: "view_publication",
        allowedBulkActions: ["view_publication"],
        locks: { canEdit: false, canQueue: false, canCancel: false, canTrash: false },
        publicationSummary: { status: "published", label: "已发布", records: 1, published: 1, uncertain: false },
        targetFacts: {
          "platform:p1": { targetKey: "platform:p1", status: "published", canCancel: false },
        },
      },
    },
    publicationSummaries: {},
    lifecycleVersion: 1,
    lifecycleCounts: { pending_submission: 0, queued: 0, paid_processing: 0, failed: 0, published: 1, trash: 0, total: 1 },
  });

  assert.deepEqual(snapshot.workflowItems[0].workflow.targetFacts, [
    { targetKey: "platform:p1", status: "published", canCancel: false },
  ]);
});
