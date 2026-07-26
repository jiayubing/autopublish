const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { it } = require("node:test");
const { createArticleStore } = require("../src/content/article-store");
const { createContentStore } = require("../src/content/content-store");
const { createGenerationSubmissionHandoffService } = require("../desktop/services/generation-submission-handoff-service");

function article(index) {
  return { id: "article-" + index, clientId: "client-1", generationTaskId: "task-" + index, platform: "writer", scenario: "guide", templateId: "template", title: "Title " + index, content: "Body " + index, status: "generated", createdAt: "2026-07-11T00:00:00.000Z", source: { client_material: true, doubao_answer: true, references: true, template: true }, researchQueryIds: ["q"], researchSnapshots: [{ questionId: "q", question: "Question", answerText: "Answer", references: [], collectedAt: "2026-07-11T00:00:00.000Z", collectionMethod: "manual" }], materialSnapshots: [{ id: "m", name: "Material", extension: ".md", content: "Material", contentHash: "hash", source: "text" }], templateSnapshot: { platform: "writer", id: "template", name: "Template", scenario: "guide", body: "Template", bodyHash: "hash" } };
}

it("runs 500 and 5000 tasks through the production file adapter with one identity scan per preview", function() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "phase-05-handoff-capacity-"));
  try {
    const articleStore = createArticleStore(root); const generated = path.join(root, "generated", "client-1"); fs.mkdirSync(generated, { recursive: true });
    for (let index = 0; index < 5000; index += 1) { const value = article(index); fs.writeFileSync(path.join(generated, value.id + ".json"), JSON.stringify(value) + "\n"); fs.writeFileSync(path.join(generated, value.id + ".md"), "---\ntitle: " + JSON.stringify(value.title) + "\n---\n\n" + value.content + "\n"); }
    let scans = 0; const contentStore = createContentStore({ listClientIds: () => ["client-1"], articleStore: { listArticles: (clientId) => { scans += 1; return articleStore.listArticles(clientId); }, fingerprintArticle: articleStore.fingerprintArticle, getArticle: articleStore.getArticle } });
    const created = []; const submission = { previewBatch: ({ clientId, articleIds }) => ({ clientId, queueableTaskCount: articleIds.length, idempotentCount: 0, conflictCount: 0, items: articleIds.map((articleId) => ({ articleId, targetPlatformId: "target", status: "queueable" })) }), createBatch: ({ clientId, articleIds }) => { created.push({ clientId, count: articleIds.length }); return { createdCount: articleIds.length, idempotentCount: 0, items: [] }; } };
    let taskCount = 500;
    const service = createGenerationSubmissionHandoffService({ generationBatchService: { get: () => ({ id: "batch", revision: 1, status: "completed", tasks: Array.from({ length: taskCount }, (_, index) => ({ id: "task-" + index, clientId: "client-1", status: "succeeded" })) }) }, contentStore, contentSubmissionService: submission, targetPlatforms: [{ id: "target", contentQueueImport: true }] });
    for (const count of [500, 5000]) {
      taskCount = count;
      const preview = service.preview({ generationBatchId: "batch", targetPlatformIds: ["target"], accountProfiles: { target: "account" } });
      const token = preview.previewToken; const result = service.commit({ generationBatchId: "batch", targetPlatformIds: ["target"], accountProfiles: { target: "account" }, previewToken: token, confirmed: true });
      assert.equal(result.createdCount, count); assert.equal(preview.articleCount, count); assert.equal(created.at(-1).count, count);
    }
    assert.equal(scans, 4); assert.equal(created.length, 2);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
