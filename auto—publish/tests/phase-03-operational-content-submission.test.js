"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { createOperationalStore } = require("../src/infrastructure/operational-store/operational-store");
const { createContentSubmissionService } = require("../desktop/services/content-submission-service");

function article() {
  return { id: "article-1", clientId: "client-1", title: "Fixture", content: "Body", status: "saved", createdAt: "2026-07-25T00:00:00.000Z", source: { client_material: true, doubao_answer: true, references: false, template: true }, materialSnapshots: [{ id: "m-1", name: "fixture", extension: ".md", content: "fixture", contentHash: "hash", source: "text" }], researchSnapshots: [{ questionId: "q-1", answerText: "fixture", references: [], collectionMethod: "manual" }], templateSnapshot: { platform: "fixture", id: "template-1", name: "template", scenario: "fixture", body: "body", bodyHash: "hash" } };
}

test("generic content queue lists only account-bound platform targets", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "phase-03-operational-targets-"));
  const store = createOperationalStore({ workspaceRoot: root });
  try {
    const service = createContentSubmissionService({ workspaceRoot: root, operationalStore: store, articleStore: { getArticle: () => article() }, platforms: [
      { id: "toutiao", displayName: "头条", scanDir: "toutiao", contentQueueImport: true, publicationTarget: { kind: "platform" } },
      { id: "media", displayName: "媒体", scanDir: "media", contentQueueImport: true, publicationTarget: { kind: "resource" } },
    ] });
    assert.deepEqual(service.listPlatforms().map((platform) => platform.id), ["toutiao"]);
  } finally {
    store.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("production content service stages a generated article for the paid-media workbench", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "phase-04-media-handoff-"));
  const store = createOperationalStore({ workspaceRoot: root });
  const invalidations = [];
  try {
    const input = path.join(root, ".autopublish", "input");
    const service = createContentSubmissionService({
      workspaceRoot: root,
      paths: { input },
      operationalStore: store,
      articleStore: { getArticle: () => article() },
      platforms: [
        {
          id: "media",
          displayName: "付费媒体",
          scanDir: "media",
          contentQueueImport: true,
          publicationTarget: { kind: "resource" },
        },
      ],
      onDataInvalidated: (reasonCode) => invalidations.push(reasonCode),
    });
    const request = {
      clientId: "client-1",
      generatedArticleId: "article-1",
      targetPlatform: "media",
      confirmed: true,
    };
    const preview = service.previewExport(request);
    assert.equal(preview.status, "queueable");
    assert.equal(preview.targetPlatform, "media");
    assert.equal(preview.markdown, "# Fixture\n\nBody\n");

    const exported = service.exportArticle(request);
    const filePath = path.join(input, "media", exported.filename);
    const sidecar = JSON.parse(
      fs.readFileSync(`${filePath}.submission.json`, "utf8"),
    );
    assert.equal(fs.readFileSync(filePath, "utf8"), preview.markdown);
    assert.equal(sidecar.generatedArticleId, "article-1");
    assert.equal(sidecar.clientId, "client-1");
    assert.equal(sidecar.targetPlatform, "media");
    assert.deepEqual(invalidations, ["CONTENT_EXPORT_QUEUED"]);
  } finally {
    store.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("production content batch persists explicit account binding in OperationalStore and queue sidecar", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "phase-03-operational-content-"));
  const store = createOperationalStore({ workspaceRoot: root });
  try {
    const profile = store.createAccountProfile({ platformId: "toutiao", displayName: "fixture" });
    const service = createContentSubmissionService({ workspaceRoot: root, operationalStore: store, articleStore: { getArticle: () => article() }, platforms: [{ id: "toutiao", scanDir: "toutiao", contentQueueImport: true }] });
    const batch = service.createBatch({ clientId: "client-1", articleIds: ["article-1"], targetPlatformIds: ["toutiao"], accountProfiles: { toutiao: profile.accountProfileId }, confirmed: true });
    const durable = store.getSubmissionBatch(batch.batchId);
    const sidecar = JSON.parse(fs.readFileSync(batch.items[0].sidecarPath, "utf8"));
    assert.equal(durable.items[0].payload.accountProfileId, profile.accountProfileId);
    assert.equal(durable.items[0].payload.clientId, "client-1");
    assert.equal(sidecar.accountProfileId, profile.accountProfileId);
    assert.equal(sidecar.version, 2);
    assert.equal(sidecar.filename, path.basename(batch.items[0].filePath));
    assert.equal(fs.existsSync(path.join(root, ".autopublish", "submission-batches")), false);
  } finally {
    store.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("cancelling an unclaimed operational content batch removes only its queue copy", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "phase-03-operational-content-cancel-"));
  const store = createOperationalStore({ workspaceRoot: root });
  try {
    const profile = store.createAccountProfile({ platformId: "toutiao", displayName: "fixture" });
    const service = createContentSubmissionService({ workspaceRoot: root, operationalStore: store, articleStore: { getArticle: () => article() }, platforms: [{ id: "toutiao", scanDir: "toutiao", contentQueueImport: true }] });
    const batch = service.createBatch({ clientId: "client-1", articleIds: ["article-1"], targetPlatformIds: ["toutiao"], accountProfiles: { toutiao: profile.accountProfileId }, confirmed: true });
    const preview = service.previewCancelBatch({ batchId: batch.batchId });
    assert.equal(preview.allowedCount, 1);
    const result = service.cancelBatch({ batchId: batch.batchId, planId: preview.planId, confirmed: true });
    assert.equal(result.cancelledCount, 1);
    assert.equal(fs.existsSync(batch.items[0].filePath), false);
    assert.equal(fs.existsSync(batch.items[0].sidecarPath), false);
    assert.equal(service.getBatch(batch.batchId).items[0].status, "cancelled");
    assert.equal(service.getBatch(batch.batchId).items[0].accountProfileId, profile.accountProfileId);
  } finally {
    store.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
