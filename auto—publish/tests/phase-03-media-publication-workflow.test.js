"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { createMediaPublisher } = require("../desktop/services/media-publisher");
const {
  createMediaPublicationSubmissionService,
} = require("../desktop/services/media-publication-submission-service");
const {
  createMediaOrderService,
} = require("../desktop/services/media-order-service");
const {
  createOperationalStore,
} = require("../src/infrastructure/operational-store/operational-store");
const {
  createPlatformWorkbenchService,
} = require("../desktop/services/platform-workbench-service");

test("media publisher emits receipt-bound outcome without an order JSON writer", async () => {
  const publisher = createMediaPublisher({
    clientProvider: () => ({
      sendArticle: async (input) => {
        assert.deepEqual(input, {
          resourceId: "resource-1",
          title: "投稿标题",
          content: "<p>投稿正文</p>",
          thirdId: "attempt-1",
        });
        return { data: { order_nid: "order-1" } };
      },
    }),
  });
  const outcome = await publisher.publish({
    articleId: "media-article",
    attemptId: "attempt-1",
    target: { kind: "media", mediaResourceId: "resource-1" },
    title: "投稿标题",
    body: "<p>投稿正文</p>",
  });
  assert.deepEqual(outcome, {
    status: "submitted",
    evidence: {
      articleId: "media-article",
      attemptId: "attempt-1",
      targetKey: "media-resource:resource-1",
      remoteId: "order-1",
    },
  });
});

test("media publisher sends the reusable operator identity without replacing the internal attempt", async () => {
  const publisher = createMediaPublisher({
    thirdIdProvider: () => "长期第三方标识",
    clientProvider: () => ({
      sendArticle: async (input) => {
        assert.equal(input.thirdId, "长期第三方标识");
        return { data: { order_nid: "order-custom" } };
      },
    }),
  });

  const outcome = await publisher.publish({
    articleId: "media-article",
    attemptId: "attempt-internal-1",
    target: { kind: "media", mediaResourceId: "resource-1" },
    title: "投稿标题",
    body: "<p>投稿正文</p>",
  });

  assert.equal(outcome.evidence.attemptId, "attempt-internal-1");
  assert.equal(outcome.evidence.remoteId, "order-custom");
});

test("media submission service creates an OperationalStore batch and delegates each target to PublicationWorkflow", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "phase-03-media-submit-"));
  const store = createOperationalStore({ workspaceRoot: root });
  try {
    const published = [];
    const service = createMediaPublicationSubmissionService({
      operationalStore: store,
      workbench: {
        prepareMediaPublicationCommands: async () => [
          {
            articleId: "media-article",
            target: { kind: "media", mediaResourceId: "resource-1" },
            title: "title",
            body: "body",
            postProcessingPayload: {
              sourcePlatformId: "media",
              filename: "fixture.md",
            },
          },
        ],
      },
      workflow: {
        publish: async (command) => {
          published.push(command);
          return { attemptId: command.attemptId, status: "submitted" };
        },
      },
    });
    const result = await service.submit([
      {
        filename: "fixture.md",
        title: "已保存标题",
        selectedResources: [
          { resourceId: "resource-1", name: "媒体甲", price: 12.5 },
        ],
      },
    ]);
    assert.equal(result.results[0].status, "submitted");
    const storedItem = store.getSubmissionBatch(result.batchId).items[0];
    assert.deepEqual(
      {
        titleSnapshot: storedItem.payload.titleSnapshot,
        filename: storedItem.payload.filename,
        resourceNameSnapshot: storedItem.payload.resourceNameSnapshot,
        quotedPrice: storedItem.payload.quotedPrice,
      },
      {
        titleSnapshot: "title",
        filename: "fixture.md",
        resourceNameSnapshot: "媒体甲",
        quotedPrice: 12.5,
      },
    );
    assert.equal(published[0].target.mediaResourceId, "resource-1");
    assert.equal(published[0].postProcessingPayload.batchId, result.batchId);
  } finally {
    store.close();
  }
});

test("a newly submitted paid-media order keeps its quoted price through the real attempt identity", async () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "phase-03-media-order-price-"),
  );
  const store = createOperationalStore({ workspaceRoot: root });
  try {
    const service = createMediaPublicationSubmissionService({
      operationalStore: store,
      workbench: {
        prepareMediaPublicationCommands: async () => [
          {
            articleId: "article-price",
            target: { kind: "media", mediaResourceId: "resource-price" },
            title: "报价链路稿件",
            body: "body",
            postProcessingPayload: { filename: "price.md" },
          },
        ],
      },
      workflow: {
        publish: async (command) => {
          store.reservePublicationTarget({
            articleId: command.articleId,
            publicationId: "publication-price",
            attemptId: command.attemptId,
            target: command.target,
          });
          store.commitRemoteOutcome({
            attemptId: command.attemptId,
            batchItemId: command.batchItemId,
            outcome: {
              status: "submitted",
              evidence: {
                articleId: command.articleId,
                attemptId: command.attemptId,
                targetKey: "media-resource:resource-price",
                remoteId: "order-price",
              },
            },
          });
          return { attemptId: command.attemptId, status: "submitted" };
        },
      },
    });

    await service.submit([
      {
        filename: "price.md",
        selectedResources: [
          { resourceId: "resource-price", name: "报价媒体", price: 36.5 },
        ],
      },
    ]);

    const order = createMediaOrderService({
      operationalStore: store,
    }).listOrderViews()[0];
    assert.deepEqual(
      [order.title, order.resourceName, order.price],
      ["报价链路稿件", "报价媒体", "36.5"],
    );
  } finally {
    store.close();
  }
});

test("the submission owner does not recanonicalize a price that bypassed MediaResourceService", async () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "phase-03-media-order-string-price-"),
  );
  const store = createOperationalStore({ workspaceRoot: root });
  try {
    const service = createMediaPublicationSubmissionService({
      operationalStore: store,
      workbench: {
        prepareMediaPublicationCommands: async () => [
          {
            articleId: "article-string-price",
            target: { kind: "media", mediaResourceId: "resource-string-price" },
            title: "供应商字符串报价稿件",
            body: "body",
            postProcessingPayload: { filename: "string-price.md" },
          },
        ],
      },
      workflow: {
        publish: async (command) => {
          store.reservePublicationTarget({
            articleId: command.articleId,
            publicationId: "publication-string-price",
            attemptId: command.attemptId,
            target: command.target,
          });
          store.commitRemoteOutcome({
            attemptId: command.attemptId,
            batchItemId: command.batchItemId,
            outcome: {
              status: "submitted",
              evidence: {
                articleId: command.articleId,
                attemptId: command.attemptId,
                targetKey: "media-resource:resource-string-price",
                remoteId: "order-string-price",
              },
            },
          });
          return { attemptId: command.attemptId, status: "submitted" };
        },
      },
    });

    await service.submit([
      {
        filename: "string-price.md",
        selectedResources: [
          {
            resourceId: "resource-string-price",
            name: "字符串报价媒体",
            price: "36.50",
          },
        ],
      },
    ]);

    const order = createMediaOrderService({
      operationalStore: store,
    }).listOrderViews()[0];
    assert.equal(order.price, "");
  } finally {
    store.close();
  }
});

test("media command preparation is read-only and derives a media target from selected resources", async () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "phase-03-media-prepare-"),
  );
  const input = path.join(root, "input", "media");
  fs.mkdirSync(input, { recursive: true });
  fs.writeFileSync(path.join(input, "fixture.md"), "# Title\n\nBody");
  const workbench = createPlatformWorkbenchService({
    rootDir: root,
    paths: { input: path.join(root, "input") },
    platforms: [{ id: "media", scanDir: "media" }],
  });
  const commands = await workbench.prepareMediaPublicationCommands([
    {
      filename: "fixture.md",
      selectedResources: [{ resourceId: "resource-1" }],
    },
  ]);
  assert.equal(commands[0].target.kind, "media");
  assert.equal(commands[0].target.mediaResourceId, "resource-1");
  assert.match(commands[0].articleId, /^media-/);
  assert.equal(
    fs.existsSync(path.join(root, ".autopublish", "operations.sqlite")),
    false,
  );
});

test("media command preparation preserves the saved title and sends a valid HTML body", async () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "phase-03-media-payload-"),
  );
  const input = path.join(root, "input", "media");
  fs.mkdirSync(input, { recursive: true });
  fs.writeFileSync(
    path.join(input, "文件标题-49b6b5d2-ba7c-4854-9b6b-369eba845d15.md"),
    "# 文件中的原始标题\n\n第一段 <script>alert(1)</script>\n\n第二段正文",
  );
  const workbench = createPlatformWorkbenchService({
    rootDir: root,
    paths: { input: path.join(root, "input") },
    platforms: [{ id: "media", scanDir: "media" }],
  });

  const commands = await workbench.prepareMediaPublicationCommands([
    {
      filename: "文件标题-49b6b5d2-ba7c-4854-9b6b-369eba845d15.md",
      title: "用户保存的投稿标题",
      selectedResources: [{ resourceId: "resource-1" }],
    },
  ]);

  assert.equal(commands[0].title, "用户保存的投稿标题");
  assert.equal(
    commands[0].body,
    "<p>第一段 &lt;script&gt;alert(1)&lt;/script&gt;</p>\n<p>第二段正文</p>",
  );
  assert.doesNotMatch(commands[0].body, /文件中的原始标题|49b6b5d2|<script>/);
});
