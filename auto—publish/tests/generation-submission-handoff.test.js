const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { createGenerationSubmissionHandoffService } = require("../desktop/services/generation-submission-handoff-service");

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
    const batches = [];
    const submissionService = {
      previewBatch(input) {
        return { clientId: input.clientId, totalTaskCount: input.articleIds.length, queueableTaskCount: input.articleIds.length, idempotentCount: 0, conflictCount: 0, items: input.articleIds.map((articleId) => ({ articleId, targetPlatformId: "target-a", status: "queueable" })) };
      },
      createBatch(input) {
        batches.push(input);
        return { batchId: `submission-${batches.length}`, createdCount: input.articleIds.length, idempotentCount: 0, items: [] };
      }
    };
    const service = createGenerationSubmissionHandoffService({
      generationBatchService: { get(batchId) { return { id: batchId, revision: 3, status: "completed", tasks }; } },
      articleStore: { getArticle(clientId, articleId) { return articles.find((item) => item.clientId === clientId && item.id === articleId); }, findByGenerationTaskId(taskId) { return articles.find((item) => item.generationTaskId === taskId); } },
      contentSubmissionService: submissionService,
      targetPlatforms: [{ id: "target-a", contentQueueImport: true }]
    });

    const preview = service.preview({ generationBatchId: "generation-1", targetPlatformIds: ["target-a"], accountProfiles: { "target-a": "account-a" } });
    assert.equal(preview.articleCount, 50);
    assert.equal(preview.clientCount, 2);
    assert.equal(preview.queueableTaskCount, 50);
    const committed = service.commit({ generationBatchId: "generation-1", targetPlatformIds: ["target-a"], accountProfiles: { "target-a": "account-a" }, previewToken: preview.previewToken, confirmed: true });
    assert.equal(committed.createdCount, 50);
    assert.equal(batches.length, 2);
    assert.deepEqual(batches.map((item) => item.clientId).sort(), ["client-a", "client-b"]);
  });

  it("rejects a commit after the batch revision changes", function() {
    let revision = 1;
    const service = createGenerationSubmissionHandoffService({
      generationBatchService: { get() { return { id: "generation-1", revision, status: "completed", tasks: [{ id: "task-1", clientId: "client-1", status: "succeeded" }] }; } },
      articleStore: { findByGenerationTaskId() { return article("article-1", "client-1", "task-1"); } },
      contentSubmissionService: { previewBatch() { return { queueableTaskCount: 1, idempotentCount: 0, conflictCount: 0, items: [] }; }, createBatch() { throw new Error("must not commit stale preview"); } },
      targetPlatforms: [{ id: "target-a", contentQueueImport: true }]
    });
    const preview = service.preview({ generationBatchId: "generation-1", targetPlatformIds: ["target-a"], accountProfiles: { "target-a": "account-a" } });
    revision = 2;
    assert.throws(() => service.commit({ generationBatchId: "generation-1", targetPlatformIds: ["target-a"], accountProfiles: { "target-a": "account-a" }, previewToken: preview.previewToken, confirmed: true }), (error) => error.code === "HANDOFF_PREVIEW_STALE");
  });

  it("blocks duplicate article identities before delegating to the submission service", function() {
    const duplicateArticles = [article("same-article", "client-1", "task-1"), article("same-article", "client-1", "task-2")];
    let previewCalls = 0;
    const service = createGenerationSubmissionHandoffService({
      generationBatchService: { get() { return { id: "generation-1", revision: 1, status: "completed", tasks: [{ id: "task-1", clientId: "client-1", status: "succeeded" }, { id: "task-2", clientId: "client-1", status: "succeeded" }] }; } },
      articleStore: { findByGenerationTaskId(taskId) { return duplicateArticles.find((item) => item.generationTaskId === taskId); } },
      contentSubmissionService: { previewBatch() { previewCalls += 1; return { queueableTaskCount: 0, idempotentCount: 0, conflictCount: 0, items: [] }; }, createBatch() { throw new Error("must not create a duplicate article"); } },
      targetPlatforms: [{ id: "target-a", contentQueueImport: true }]
    });

    const preview = service.preview({ generationBatchId: "generation-1", targetPlatformIds: ["target-a"], accountProfiles: { "target-a": "account-a" } });
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
      contentSubmissionService: { previewBatch() { return { queueableTaskCount: 1, idempotentCount: 0, conflictCount: 0, items: [{ articleId: "article-1", targetPlatformId: "target-a", status: "queueable", filePath: secretPath, content: secretBody } ] }; }, createBatch() { return { createdCount: 1, idempotentCount: 0 }; } },
      targetPlatforms: [{ id: "target-a", contentQueueImport: true }]
    });
    const serialized = JSON.stringify(service.preview({ generationBatchId: "generation-1", targetPlatformIds: ["target-a"], accountProfiles: { "target-a": "account-a" } }));
    assert.equal(serialized.includes(secretPath), false);
    assert.equal(serialized.includes(secretBody), false);
  });

  it("rejects a target that is not available for queue import", function() {
    const service = createGenerationSubmissionHandoffService({
      generationBatchService: { get() { return { id: "generation-1", revision: 1, status: "completed", tasks: [] }; } },
      articleStore: {},
      contentSubmissionService: { previewBatch() { throw new Error("must not preview an unsupported target"); }, createBatch() { throw new Error("must not create an unsupported target"); } },
      targetPlatforms: [{ id: "target-a", contentQueueImport: false }]
    });
    assert.throws(() => service.preview({ generationBatchId: "generation-1", targetPlatformIds: ["target-a"], accountProfiles: { "target-a": "account-a" } }), (error) => error.code === "HANDOFF_TARGET_UNSUPPORTED");
  });
});
