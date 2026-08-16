"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { createArticleSubmissionRemovalCoordinator } = require("../desktop/services/article-submission-removal-coordinator");
const { createArticleStore } = require("../src/content/article-store");
const { createContentStore, fingerprintArticle } = require("../src/content/content-store");
const { createArticleMutationCoordinator } = require("../src/content/article-mutation-coordinator");
const { createArticleTrashService } = require("../src/content/article-trash-service");
const { createArticleRemovalService } = require("../src/content/article-removal-service");
const { createContractRegistry } = require("../desktop/ipc/contracts/registry");
const { articleRemovalContracts } = require("../desktop/ipc/contracts/article-removal-contracts");

function removalCoordinator(facts) {
  return createArticleSubmissionRemovalCoordinator({
    projection: { allItemViews: () => [] },
    lifecycleFacts: { listArticleLifecycleFacts: () => facts },
    policy: {
      normalizeSelections: (input) => input.selections,
      selectionKey: (item) => `${item.clientId}:${item.articleId}`,
    },
  });
}

function preview(facts, articleId) {
  return removalCoordinator(facts).previewArticleRemovalImpact({
    selections: [{ clientId: "client-26-g", articleId }],
  });
}

test("regular, paid, order, published, and uncertain facts are deletion blockers", () => {
  const cases = [
    {
      articleId: "regular-queued",
      facts: { submissionItems: [{ clientId: "client-26-g", articleId: "regular-queued", status: "queued" }] },
      code: "ARTICLE_OPERATION_FROZEN",
    },
    {
      articleId: "paid-target",
      facts: { activeTargets: [{ clientId: "client-26-g", articleId: "paid-target", targetKey: "media-resource:1", status: "paid_processing" }] },
      code: "ARTICLE_OPERATION_FROZEN",
    },
    {
      articleId: "paid-order",
      facts: { orders: [{ clientId: "client-26-g", articleId: "paid-order", orderId: "order-1", supplierStatusCode: "1" }] },
      code: "ARTICLE_OPERATION_FROZEN",
    },
    {
      articleId: "uncertain",
      facts: { attentionItems: [{ clientId: "client-26-g", articleId: "uncertain", status: "uncertain", kind: "paid_resolution_manual_check" }] },
      code: "PUBLICATION_UNCERTAIN",
    },
    {
      articleId: "completed-unknown",
      facts: { submissionItems: [{ clientId: "client-26-g", articleId: "completed-unknown", status: "completed", outcomeStatus: "future-state" }] },
      code: "SUBMISSION_STATUS_UNKNOWN",
    },
    {
      articleId: "published",
      facts: { publications: [{ clientId: "client-26-g", articleId: "published", status: "published", publicationId: "publication-1" }] },
      code: "ARTICLE_PUBLISHED_IMMUTABLE",
    },
  ];
  for (const value of cases) {
    const result = preview(value.facts, value.articleId);
    assert.equal(result.canCommit, false, value.articleId);
    assert.equal(result.blockedItems.some((item) => item.reasonCode === value.code), true, value.articleId);
    assert.equal(Object.hasOwn(result, "queuedToCancel"), false);
    assert.equal(Object.hasOwn(result, "queueActions"), false);
  }
});

test("terminal paid order evidence is retained while missing or unknown order identity blocks", () => {
  const terminal = preview(
    { orders: [{ clientId: "client-26-g", articleId: "terminal", orderId: "order-terminal", supplierStatusCode: "4" }] },
    "terminal",
  );
  assert.equal(terminal.canCommit, true);
  assert.deepEqual(terminal.blockedItems, []);

  const missing = preview(
    { orders: [{ clientId: "client-26-g", articleId: "missing-order", supplierStatusCode: "4", mediaResourceId: "media-1" }] },
    "missing-order",
  );
  assert.equal(missing.canCommit, false);
  assert.equal(missing.blockedItems[0].reasonCode, "MEDIA_ORDER_MISSING");

  const unknown = preview(
    { orders: [{ clientId: "client-26-g", articleId: "unknown-order", orderId: "order-unknown", supplierStatusCode: "7" }] },
    "unknown-order",
  );
  assert.equal(unknown.canCommit, false);
  assert.equal(unknown.blockedItems[0].reasonCode, "ORDER_STATUS_UNKNOWN");
});

test("operational facts without a client id still cross the typed removal IPC seam", () => {
  const result = preview(
    { publications: [{ articleId: "published-no-client", status: "published", publicationId: "publication-1" }] },
    "published-no-client",
  );
  assert.equal(result.blockedItems[0].clientId, "client-26-g");
  const registry = createContractRegistry(articleRemovalContracts);
  const contract = registry.byChannel("content:preview-article-removal-impact");
  const encoded = registry.success(contract, result);
  assert.equal(encoded.data.blockedItems[0].clientId, "client-26-g");
});

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
    articleRemovalImpactQuery: { previewArticleRemovalImpact: () => ({ blockedItems: [] }) },
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
