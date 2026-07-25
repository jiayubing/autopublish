"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { createOperationalStore } = require("../src/infrastructure/operational-store/operational-store");
const { createPublicationWorkflow } = require("../src/application/publication-workflow");
const { createContentSubmissionService } = require("../desktop/services/content-submission-service");
const { createPlatformWorkbenchService } = require("../desktop/services/platform-workbench-service");
const { createPublicationSubmissionService } = require("../desktop/services/publication-submission-service");

function article() {
  return { id: "article-1", clientId: "client-1", title: "Fixture", content: "Body", status: "saved", createdAt: "2026-07-25T00:00:00.000Z", source: { client_material: true, doubao_answer: true, references: false, template: true }, materialSnapshots: [{ id: "m-1", name: "fixture", extension: ".md", content: "fixture", contentHash: "hash", source: "text" }], researchSnapshots: [{ questionId: "q-1", answerText: "fixture", references: [], collectionMethod: "manual" }], templateSnapshot: { platform: "fixture", id: "template-1", name: "template", scenario: "fixture", body: "body", bodyHash: "hash" } };
}

test("content queue execution claims and completes its original OperationalStore item", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "phase-03-content-chain-"));
  const store = createOperationalStore({ workspaceRoot: root });
  try {
    const profile = store.createAccountProfile({ platformId: "toutiao", displayName: "fixture" });
    const input = path.join(root, ".autopublish", "input");
    const content = createContentSubmissionService({ workspaceRoot: root, paths: { input }, operationalStore: store, articleStore: { getArticle: () => article() }, platforms: [{ id: "toutiao", scanDir: "toutiao", contentQueueImport: true }] });
    const queued = content.createBatch({ clientId: "client-1", articleIds: ["article-1"], targetPlatformIds: ["toutiao"], accountProfiles: { toutiao: profile.accountProfileId }, confirmed: true });
    const workbench = createPlatformWorkbenchService({ rootDir: root, paths: { input }, platforms: [{ id: "toutiao", scanDir: "toutiao" }], adapters: { toutiao: { parseArticleFiles: async () => [{ title: "Fixture", body: "Body" }] } } });
    const workflow = createPublicationWorkflow({ operationalStore: store, clock: () => new Date("2026-07-25T00:00:00.000Z"), publisher: {
      inspectAccount: async () => ({ verified: true, accountProfileId: profile.accountProfileId }),
      publish: async (publishInput) => ({ status: "published", evidence: { articleId: publishInput.articleId, attemptId: publishInput.attemptId, targetKey: `platform:toutiao:account:${profile.accountProfileId}`, accountProfileId: profile.accountProfileId, remoteId: "remote-1", remoteUrl: "https://example.test/remote-1" } }),
    } });
    const service = createPublicationSubmissionService({ workflow, operationalStore: store, workbench, workerPublisher: { registerAttempt: () => {}, unregisterAttempt: () => {} } });
    const plan = workbench.buildSelectedSubmissionsPlan([{ sourcePlatformId: "toutiao", filename: path.basename(queued.items[0].filePath), targetPlatformIds: ["toutiao"], accountProfiles: { toutiao: profile.accountProfileId } }]);
    const result = await service.submit(plan);
    assert.equal(result.batchId, queued.batchId);
    assert.equal(result.results[0].status, "published");
    assert.equal(store.getSubmissionBatch(queued.batchId).items[0].status, "completed");
    assert.equal(store.listPublicationRecords({ articleIds: ["article-1"] })[0].status, "published");
  } finally {
    store.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
