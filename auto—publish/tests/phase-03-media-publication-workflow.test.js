"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { createMediaPublisher } = require("../desktop/services/media-publisher");
const {
  createPlatformWorkbenchService,
} = require("../desktop/services/platform-workbench-service");

test("media publisher emits the existing order-created outcome without an order JSON writer", async () => {
  const publisher = createMediaPublisher({
    thirdIdProvider: () => "system-submission-1",
    clientProvider: () => ({
      sendArticle: async (input) => {
        assert.deepEqual(input, {
          resourceId: "resource-1",
          title: "投稿标题",
          content: "<p>投稿正文</p>",
          thirdId: "system-submission-1",
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
  assert.deepEqual(outcome, { kind: "order_created", orderId: "order-1" });
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

  assert.deepEqual(outcome, { kind: "order_created", orderId: "order-custom" });
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
