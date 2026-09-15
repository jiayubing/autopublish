"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { createArticleStore } = require("../src/content/article-store");
const { createContentStore, fingerprintArticle } = require("../src/content/content-store");
const { createArticleMutationCoordinator } = require("../src/content/article-mutation-coordinator");
const { createArticleTrashService } = require("../src/content/article-trash-service");
const { createArticleRemovalService } = require("../src/content/article-removal-service");
test("restore changes only content state and never restores a submission task", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ticket-26-g-restore-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const articleStore = createArticleStore(root);
  const contentStore = createContentStore({ articleStore, listClientIds: () => ["client-26-g"] });
  let facts = { publications: [], submissionItems: [], orders: [], attentionItems: [] };
  const operationalStore = { listArticleLifecycleFacts: () => facts };
  const coordinator = createArticleMutationCoordinator({ articleStore, contentStore, operationalStore });
  const value = {
    id: "article-restore",
    clientId: "client-26-g",
    title: "Restore",
    content: "Body",
    status: "saved",
    createdAt: "2026-08-15T00:00:00.000Z",
    updatedAt: "2026-08-15T00:00:00.000Z",
  };
  articleStore.createArticle(value);
  const tombstone = {
    version: 1,
    deletedAt: "2026-08-15T00:01:00.000Z",
    clientId: value.clientId,
    articleId: value.id,
    status: value.status,
    references: [],
    titleSnapshot: value.title,
    contentFingerprint: fingerprintArticle(value),
  };
  contentStore.moveArticleToTrash(value.clientId, value.id, tombstone);
  facts = {
    publications: [],
    submissionItems: [{ clientId: value.clientId, articleId: value.id, status: "cancelled" }],
    orders: [],
    attentionItems: [],
  };
  const removal = createArticleRemovalService({
    workspaceRoot: root,
    contentStore,
    mutationCoordinator: coordinator,
  });
  const trash = createArticleTrashService({
    contentStore,
    mutationCoordinator: coordinator,
    articleRemovalService: removal,
  });
  const restored = trash.restoreArticle({ clientId: value.clientId, articleId: value.id });
  assert.equal(restored.restored, true);
  assert.equal(restored.queueRestored, false);
  assert.equal(contentStore.isArticleTrashed(value.clientId, value.id), false);
  assert.equal(facts.submissionItems[0].status, "cancelled");
});
