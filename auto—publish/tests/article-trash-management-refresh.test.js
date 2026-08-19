"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const { createAiContentService } = require("../desktop/services/ai-content-service");
const { createArticleManagementSnapshot } = require("../desktop/services/article-management-snapshot");
const { createWorkspaceDataInvalidation } = require("../desktop/workspace-data-invalidation");

function article(id) {
  return {
    id,
    clientId: "client-trash-refresh",
    title: "恢复测试文章",
    content: "正文",
    status: "generated",
    createdAt: "2026-08-19T00:00:00.000Z",
    updatedAt: "2026-08-19T00:00:00.000Z",
  };
}

function tombstone(id) {
  return {
    version: 1,
    deletedAt: "2026-08-19T00:00:00.000Z",
    clientId: "client-trash-refresh",
    articleId: id,
    status: "generated",
    references: [],
    titleSnapshot: "恢复测试文章",
  };
}

function harness(mode) {
  const id = mode === "restore" ? "article-restore" : "article-purge";
  let articles = [];
  let trash = [tombstone(id)];
  const sent = [];
  const invalidation = createWorkspaceDataInvalidation({
    workspaceRuntimeId: `trash-refresh-${mode}`,
    sendToRenderer(channel, payload) {
      sent.push([channel, payload]);
    },
  });
  const trashService = {
    listTrashedArticles() {
      return trash;
    },
    restoreArticle(input) {
      assert.equal(input.articleId, id);
      articles = [article(id)];
      trash = [];
      return {
        article: articles[0],
        restored: true,
        queueRestored: false,
        message: "文章已恢复，投稿队列不会自动恢复",
      };
    },
    preparePermanentDelete(input) {
      assert.equal(input.articleId, id);
      return {
        token: "delete-token",
        clientId: input.clientId,
        articleId: input.articleId,
        deletedAt: trash[0].deletedAt,
        status: trash[0].status,
      };
    },
    permanentlyDeleteArticle(input) {
      assert.equal(input.articleId, id);
      assert.equal(input.token, "delete-token");
      trash = [];
      return {
        clientId: input.clientId,
        articleId: input.articleId,
        deleted: true,
        deletedAt: "2026-08-19T00:00:00.000Z",
      };
    },
  };
  const aiContentService = createAiContentService({
    clientKnowledge: {
      listClients() {
        return [];
      },
      getClient(clientId) {
        return { id: clientId };
      },
    },
    researchStore: { listResearch() { return []; } },
    templateStore: { listTemplates() { return []; } },
    materialStore: { async getSelectedMaterials() { return []; } },
    contentStore: {
      listArticles() {
        return articles;
      },
      getArticle() {
        return articles[0] || null;
      },
    },
    articleTrashService: trashService,
    onDataInvalidated: invalidation.invalidate,
  });
  const snapshot = createArticleManagementSnapshot({
    getRevision: invalidation.getRevision,
    aiContentService,
  });
  return { id, aiContentService, invalidation, sent, snapshot };
}

test("restoring a trashed article invalidates the management snapshot immediately", async () => {
  const item = harness("restore");
  const before = await item.snapshot.get({ clientId: "client-trash-refresh" });
  assert.equal(before.trash.length, 1);
  assert.equal(before.articles.length, 0);

  item.aiContentService.restoreArticle({
    clientId: "client-trash-refresh",
    articleId: item.id,
  });

  assert.equal(item.invalidation.getRevision(), 1);
  assert.equal(item.sent[0][1].reasonCode, "ARTICLE_RESTORED");
  const after = await item.snapshot.get({ clientId: "client-trash-refresh" });
  assert.equal(after.trash.length, 0);
  assert.equal(after.articles.length, 1);
  assert.equal(after.workflowByArticle[item.id].stage, "pending_submission");
});

test("permanent deletion invalidates the management snapshot immediately", async () => {
  const item = harness("purge");
  const before = await item.snapshot.get({ clientId: "client-trash-refresh" });
  assert.equal(before.trash.length, 1);

  const prepared = item.aiContentService.preparePermanentDelete({
    clientId: "client-trash-refresh",
    articleId: item.id,
  });
  item.aiContentService.permanentlyDeleteArticle({
    clientId: "client-trash-refresh",
    articleId: item.id,
    token: prepared.token,
  });

  assert.equal(item.invalidation.getRevision(), 1);
  assert.equal(item.sent[0][1].reasonCode, "ARTICLE_PERMANENTLY_DELETED");
  const after = await item.snapshot.get({ clientId: "client-trash-refresh" });
  assert.equal(after.trash.length, 0);
  assert.equal(after.articles.length, 0);
});
