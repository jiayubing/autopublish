const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { createGenerationSubmissionHandoffService: createService } = require("../desktop/services/generation-submission-handoff-service");
function createGenerationSubmissionHandoffService(options) {
  const value = Object.assign({}, options);
  value.contentStore = { findByGenerationTaskId(id) {
    const result = value.articleStore && value.articleStore.findByGenerationTaskId ? value.articleStore.findByGenerationTaskId(id) : null;
    const matches = Array.isArray(result) ? result : result ? [result] : [];
    return matches.length === 0 ? { kind: "none" } : matches.length === 1 ? { kind: "one", article: matches[0] } : { kind: "many", matches: matches.map((article) => ({ clientId: article.clientId, articleId: article.id })) };
  } };
  return createService(value);
}

function article(id, clientId, taskId) {
  return {
    id, clientId, generationTaskId: taskId, status: "generated", title: `标题-${id}`, content: `正文-${id}`,
    source: { client_material: true, doubao_answer: true, references: true, template: true },
    materialSnapshots: [{ id: "m", name: "资料", extension: ".md", content: "资料", contentHash: "hash", source: "text" }],
    researchSnapshots: [{ questionId: "q", answerText: "回答", references: [], collectionMethod: "manual" }],
    templateSnapshot: { platform: "writer", id: "template", name: "模板", scenario: "场景", body: "模板", bodyHash: "hash" }
  };
}

describe("generation submission handoff", function() {
  it("previews and commits 50 successful articles across two clients with one confirmation", function() {
    const articles = [];
    const tasks = [];
    for (const clientId of ["client-a", "client-b"]) {
      for (let index = 0; index < 25; index += 1) {
        const taskId = `${clientId}-task-${index}`;
        tasks.push({ id: taskId, clientId, status: "succeeded" });
        articles.push(article(`${clientId}-article-${index}`, clientId, taskId));
      }
    }
    const admissions = [];
    const regularQueueApplication = {
      previewRegularQueueAdmission(input) {
        return {
          articleRefs: input.articleRefs,
          queueableCount: input.articleRefs.length,
          idempotentCount: 0,
          missingCount: 0,
          conflictCount: 0,
          items: input.articleRefs.map((articleRef) => ({ articleRef, articleId: articleRef.articleId, status: "queueable" })),
        };
      },
      admitRegularQueueItems(input) {
        admissions.push(input);
        return { admittedCount: input.articleRefs.length, idempotentCount: 0, items: [] };
      },
    };
    const service = createGenerationSubmissionHandoffService({
      generationBatchService: { get(batchId) { return { id: batchId, revision: 3, status: "completed", tasks }; } },
      articleStore: { getArticle(clientId, articleId) { return articles.find((item) => item.clientId === clientId && item.id === articleId); }, findByGenerationTaskId(taskId) { return articles.find((item) => item.generationTaskId === taskId); } },
      regularQueueApplication,
      targetPlatforms: [{ id: "target-a", contentQueueImport: true }]
    });

    const preview = service.preview({ generationBatchId: "generation-1", platformId: "target-a", accountProfileId: "account-a" });
    assert.equal(preview.articleCount, 50);
    assert.equal(preview.clientCount, 2);
    assert.equal(preview.queueableTaskCount, 50);
    const committed = service.commit({ generationBatchId: "generation-1", platformId: "target-a", accountProfileId: "account-a", previewToken: preview.previewToken, confirmed: true });
    assert.equal(committed.createdCount, 50);
    assert.equal(admissions.length, 2);
    assert.deepEqual(admissions.map((item) => item.articleRefs[0].clientId).sort(), ["client-a", "client-b"]);
    assert.equal(admissions.every((item) => item.platformId === "target-a" && item.accountProfileId === "account-a"), true);
    const repeated = service.commit({ generationBatchId: "generation-1", platformId: "target-a", accountProfileId: "account-a", previewToken: preview.previewToken, confirmed: true });
    assert.equal(repeated.createdCount, 0);
    assert.equal(admissions.length, 2);
  });

  it("uses canonical admission facts and commits only the currently queueable articles", function() {
    const articles = [
      article("article-queueable", "client-1", "task-queueable"),
      article("article-idempotent", "client-1", "task-idempotent"),
      article("article-published", "client-1", "task-published"),
      article("article-uncertain", "client-1", "task-uncertain"),
      article("article-conflict", "client-1", "task-conflict"),
    ];
    const tasks = articles.map((value) => ({ id: value.generationTaskId, clientId: value.clientId, status: "succeeded" }));
    const admissions = [];
    let previewCalls = 0;
    const regularQueueApplication = {
      previewRegularQueueAdmission(input) {
        previewCalls += 1;
        const items = input.articleRefs.map((articleRef) => {
          const statusByArticle = {
            "article-queueable": { status: "queueable" },
            "article-idempotent": { status: "idempotent" },
            "article-published": { status: "conflict", reasonCode: "ARTICLE_PUBLISHED_IMMUTABLE" },
            "article-uncertain": { status: "conflict", reasonCode: "PUBLICATION_UNCERTAIN" },
            "article-conflict": { status: "conflict", reasonCode: "ARTICLE_ACTIVE_TARGET_CONFLICT" },
          };
          return Object.assign({ articleRef, articleId: articleRef.articleId }, statusByArticle[articleRef.articleId]);
        });
        return { articleRefs: input.articleRefs, queueableCount: 1, idempotentCount: 1, missingCount: 0, conflictCount: 3, items };
      },
      admitRegularQueueItems(input) {
        admissions.push(input);
        return { admittedCount: input.articleRefs.length, idempotentCount: 0, items: [] };
      },
    };
    const service = createGenerationSubmissionHandoffService({
      generationBatchService: { get(batchId) { return { id: batchId, revision: 1, status: "completed", tasks }; } },
      articleStore: { findByGenerationTaskId(taskId) { return articles.find((value) => value.generationTaskId === taskId); } },
      regularQueueApplication,
      targetPlatforms: [{ id: "target-a", contentQueueImport: true }],
    });

    const preview = service.preview({ generationBatchId: "generation-1", platformId: "target-a", accountProfileId: "account-a" });
    assert.equal(preview.queueableTaskCount, 1);
    assert.equal(preview.idempotentCount, 1);
    assert.equal(preview.blockedPublishedCount, 1);
    assert.equal(preview.blockedUncertainCount, 1);
    assert.equal(preview.conflictCount, 1);
    assert.deepEqual(preview.clientGroups[0].items.map((item) => item.reasonCode), [
      "ARTICLE_PUBLISHED_IMMUTABLE",
      "PUBLICATION_UNCERTAIN",
      "ARTICLE_ACTIVE_TARGET_CONFLICT",
    ]);

    const committed = service.commit({ generationBatchId: "generation-1", platformId: "target-a", accountProfileId: "account-a", previewToken: preview.previewToken, confirmed: true });
    assert.equal(committed.createdCount, 1);
    assert.equal(admissions.length, 1);
    assert.deepEqual(admissions[0].articleRefs.map((ref) => ref.articleId), ["article-queueable"]);
    assert.equal(previewCalls, 2);
  });

  it("rejects a commit after the batch revision changes", function() {
    let revision = 1;
    const service = createGenerationSubmissionHandoffService({
      generationBatchService: { get() { return { id: "generation-1", revision, status: "completed", tasks: [{ id: "task-1", clientId: "client-1", status: "succeeded" }] }; } },
      articleStore: { findByGenerationTaskId() { return article("article-1", "client-1", "task-1"); } },
      regularQueueApplication: { previewRegularQueueAdmission() { return { queueableCount: 1, idempotentCount: 0, missingCount: 0, conflictCount: 0, items: [] }; }, admitRegularQueueItems() { throw new Error("must not commit stale preview"); } },
      targetPlatforms: [{ id: "target-a", contentQueueImport: true }]
    });
    const preview = service.preview({ generationBatchId: "generation-1", platformId: "target-a", accountProfileId: "account-a" });
    revision = 2;
    assert.throws(() => service.commit({ generationBatchId: "generation-1", platformId: "target-a", accountProfileId: "account-a", previewToken: preview.previewToken, confirmed: true }), (error) => error.code === "HANDOFF_PREVIEW_STALE");
  });

  it("surfaces an article persistence read failure instead of classifying it as an identity conflict", function() {
    const service = createGenerationSubmissionHandoffService({
      generationBatchService: { get() { return { id: "generation-1", revision: 1, status: "completed", tasks: [{ id: "task-1", clientId: "client-1", status: "succeeded" }] }; } },
      articleStore: { findByGenerationTaskId() { throw Object.assign(new Error("article store unavailable"), { code: "ARTICLE_STORE_READ_FAILED" }); } },
      regularQueueApplication: { previewRegularQueueAdmission() { throw new Error("must not preview after read failure"); }, admitRegularQueueItems() { throw new Error("must not create after read failure"); } },
      targetPlatforms: [{ id: "target-a", contentQueueImport: true }]
    });
    assert.throws(
      () => service.preview({ generationBatchId: "generation-1", platformId: "target-a", accountProfileId: "account-a" }),
      { code: "HANDOFF_ARTICLE_LOOKUP_FAILED" },
    );
  });

  it("blocks duplicate article identities before delegating to the submission service", function() {
    const duplicateArticles = [article("same-article", "client-1", "task-1"), article("same-article", "client-1", "task-2")];
    let previewCalls = 0;
    const service = createGenerationSubmissionHandoffService({
      generationBatchService: { get() { return { id: "generation-1", revision: 1, status: "completed", tasks: [{ id: "task-1", clientId: "client-1", status: "succeeded" }, { id: "task-2", clientId: "client-1", status: "succeeded" }] }; } },
      articleStore: { findByGenerationTaskId(taskId) { return duplicateArticles.find((item) => item.generationTaskId === taskId); } },
      regularQueueApplication: { previewRegularQueueAdmission() { previewCalls += 1; return { queueableCount: 0, idempotentCount: 0, missingCount: 0, conflictCount: 0, items: [] }; }, admitRegularQueueItems() { throw new Error("must not create a duplicate article"); } },
      targetPlatforms: [{ id: "target-a", contentQueueImport: true }]
    });

    const preview = service.preview({ generationBatchId: "generation-1", platformId: "target-a", accountProfileId: "account-a" });
    assert.equal(preview.articleCount, 0);
    assert.equal(preview.unavailableArticleCount, 2);
    assert.equal(preview.conflictCount, 2);
    assert.deepEqual(preview.invalidArticles.map((item) => item.reasonCode), ["HANDOFF_ARTICLE_IDENTITY_CONFLICT", "HANDOFF_ARTICLE_IDENTITY_CONFLICT"]);
    assert.equal(previewCalls, 0);
  });

  it("does not expose article content or queue paths in the handoff preview", function() {
    const secretPath = "C:\\private\\queue\\article.md";
    const secretBody = "private article body";
    const service = createGenerationSubmissionHandoffService({
      generationBatchService: { get() { return { id: "generation-1", revision: 1, status: "completed", tasks: [{ id: "task-1", clientId: "client-1", status: "succeeded" }] }; } },
      articleStore: { findByGenerationTaskId() { return Object.assign(article("article-1", "client-1", "task-1"), { content: secretBody, filePath: secretPath }); } },
      regularQueueApplication: { previewRegularQueueAdmission(input) { return { queueableCount: 1, idempotentCount: 0, missingCount: 0, conflictCount: 0, items: [{ articleRef: input.articleRefs[0], articleId: "article-1", status: "queueable", filePath: secretPath, content: secretBody } ] }; }, admitRegularQueueItems() { return { admittedCount: 1, idempotentCount: 0 }; } },
      targetPlatforms: [{ id: "target-a", contentQueueImport: true }]
    });
    const serialized = JSON.stringify(service.preview({ generationBatchId: "generation-1", platformId: "target-a", accountProfileId: "account-a" }));
    assert.equal(serialized.includes(secretPath), false);
    assert.equal(serialized.includes(secretBody), false);
  });

  it("rejects a target that is not available for queue import", function() {
    const service = createGenerationSubmissionHandoffService({
      generationBatchService: { get() { return { id: "generation-1", revision: 1, status: "completed", tasks: [] }; } },
      articleStore: {},
      regularQueueApplication: { previewRegularQueueAdmission() { throw new Error("must not preview an unsupported target"); }, admitRegularQueueItems() { throw new Error("must not create an unsupported target"); } },
      targetPlatforms: [{ id: "target-a", contentQueueImport: false }]
    });
    assert.throws(() => service.preview({ generationBatchId: "generation-1", platformId: "target-a", accountProfileId: "account-a" }), (error) => error.code === "HANDOFF_TARGET_UNSUPPORTED");
  });

  it("rejects the retired multi-target request shape and missing account profile", function() {
    const service = createGenerationSubmissionHandoffService({
      generationBatchService: { get() { return { id: "generation-1", revision: 1, status: "completed", tasks: [] }; } },
      articleStore: {},
      regularQueueApplication: { previewRegularQueueAdmission() { throw new Error("must not preview invalid input"); }, admitRegularQueueItems() { throw new Error("must not create invalid input"); } },
      targetPlatforms: [{ id: "target-a", contentQueueImport: true }]
    });
    assert.throws(() => service.preview({ generationBatchId: "generation-1", targetPlatformIds: ["target-a"], accountProfiles: { "target-a": "account-a" } }), (error) => error.code === "HANDOFF_INPUT_INVALID");
    assert.throws(() => service.preview({ generationBatchId: "generation-1", platformId: "target-a", accountProfileId: "" }), (error) => error.code === "ACCOUNT_PROFILE_REQUIRED");
  });
});
