"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const domain = require("../src/domain");
const { createArticleStore } = require("../src/content/article-store");
const {
  renderLiejuPlainText,
} = require("../src/platforms/lieju/plain-text-renderer");
const { createPlatformAdapter } = require("../src/platforms/lieju/adapter");

function claim(body) {
  return {
    platformId: "lieju",
    regularPublicationAttemptId: "attempt-lieju-plain-text",
    articleIdentityV1: {
      version: 1,
      clientId: "client-plain-text",
      articleId: "article-plain-text",
    },
    targetIdentityV1: {
      version: 1,
      kind: "platform",
      platformId: "lieju",
      accountProfileId: "account-plain-text",
    },
    publicationProfile: {
      city: "北京",
      contact: "合成联系人",
      phone: "010-12345678",
    },
    publicationSnapshot: { title: "东爵测试标题", body },
  };
}

function loadAdapterWithFormFixture(root) {
  const stateFile = path.join(root, "lieju-state.json");
  const getCalls = [];
  const responses = [
    response('<meta charset="utf-8">'),
    response(
      '<meta charset="utf-8"><a href="https://post.lieju.com/1/239">北京</a>',
    ),
    response([
      '<meta charset="utf-8">',
      '<form method="post" enctype="multipart/form-data" action="/1/239?action=postnew">',
      '<input type="hidden" name="fid" value="opaque-current-form-value">',
      '<input type="text" name="postdb[title]">',
      '<textarea name="postdb[content]"></textarea>',
      '<select name="postdb[zone_id]"><option value="">请选择</option><option value="zone-final">最终区域</option></select>',
      '<input type="text" name="postdb[mobphone]">',
      '<input type="text" name="postdb[linkman]">',
      "</form>",
    ].join("")),
  ];
  fs.writeFileSync(stateFile, '{"cookies":[]}', "utf8");
  return {
    getCalls,
    adapter: createPlatformAdapter({
      browserRuntime: { stateFile },
      httpRequest: {
        newContext: async () => ({
          get: async (url) => {
            getCalls.push(url);
            return responses.shift();
          },
          storageState: async ({ path: filename }) =>
            fs.writeFileSync(filename, '{"cookies":[]}', "utf8"),
          dispose: async () => undefined,
        }),
      },
    }),
    restore() {},
  };
}

function response(body) {
  return {
    status: () => 200,
    url: () => "https://post.lieju.com/1/239",
    headers: () => ({ "content-type": "text/html; charset=utf-8" }),
    body: async () => Buffer.from(body, "utf8"),
  };
}

test("Lieju plain-text renderer preserves readable markdown and HTML text without image locations", () => {
  const source = [
    "# 章节标题",
    "",
    "这是 **重点** 与 *强调*、~~删除线~~，以及 [官网链接](https://example.test/article)。",
    "",
    "![本地图](file:///C:/Users/private/cover.png)",
    '<img src="https://cdn.example.test/cover.png" alt="HTML 配图">',
    "",
    "- 无序第一项",
    "  - 嵌套项",
    "1. 有序第一项",
    "2. 有序第二项",
    "",
    "> 引用 **保留文字**",
    "",
    "| 项目 | 说明 |",
    "| --- | :--- |",
    "| 服务 | `稳定` |",
    "",
    "行内 `const value = 1;`",
    "",
    "```js",
    "const publishable = true;",
    "```",
    "",
    "<p>HTML <strong>段落</strong><br>换行</p>",
    "<script>doNotSubmit()</script>",
  ].join("\n");

  const rendered = renderLiejuPlainText(source);

  assert.equal(
    rendered,
    [
      "章节标题",
      "",
      "这是 重点 与 强调、删除线，以及 官网链接。",
      "",
      "本地图",
      "HTML 配图",
      "",
      "• 无序第一项",
      "  • 嵌套项",
      "1. 有序第一项",
      "2. 有序第二项",
      "",
      "引用：引用 保留文字",
      "",
      "项目\t说明",
      "服务\t稳定",
      "",
      "行内 const value = 1;",
      "",
      "const publishable = true;",
      "",
      "HTML 段落",
      "换行",
    ].join("\n"),
  );
  assert.doesNotMatch(rendered, /\*\*|file:\/\/|cdn\.example\.test/);
});

test("Lieju plain-text renderer keeps the 东爵 2211→2151 article's chapters, numbering, and ending", () => {
  const source = [
    "## 东爵 2211→2151",
    "",
    "**第一章：问题缘起**",
    "",
    "1. 先完成现场核验。",
    "2. 再记录服务改进。",
    "",
    "### 结尾",
    "",
    "让每一次反馈都落到实处。",
  ].join("\n");
  const rendered = renderLiejuPlainText(source);

  assert.equal(
    rendered,
    [
      "东爵 2211→2151",
      "",
      "第一章：问题缘起",
      "",
      "1. 先完成现场核验。",
      "2. 再记录服务改进。",
      "",
      "结尾",
      "",
      "让每一次反馈都落到实处。",
    ].join("\n"),
  );
  assert.doesNotMatch(rendered, /\*\*/);
});

test("Lieju plain-text renderer removes Setext and reference-style presentation syntax", () => {
  const source = [
    "Setext 标题",
    "============",
    "",
    "参阅[普通链接]和![图片]。",
    "",
    "[普通链接]: https://docs.example.test/article",
    "[图片]: file:///C:/private/cover.png",
  ].join("\n");

  const rendered = renderLiejuPlainText(source);

  assert.equal(rendered, "Setext 标题\n\n参阅普通链接和图片。");
  assert.doesNotMatch(rendered, /[!\[\]=]|file:\/\/|docs\.example\.test/);
});

test("Lieju HTTP prepare freezes the actual plain-text form body and leaves article bytes untouched", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "lieju-plain-text-"));
  const source = "## 标题\n\n**正文**含有 ![图片](C:\\private\\cover.png)。";
  const store = createArticleStore(root);
  store.saveArticle({
    id: "article-plain-text",
    clientId: "client-plain-text",
    status: "saved",
    title: "东爵测试标题",
    content: source,
    createdAt: "2026-08-15T00:00:00.000Z",
  });
  const directory = path.join(root, "generated", "client-plain-text");
  const markdown = path.join(directory, "article-plain-text.md");
  const metadata = path.join(directory, "article-plain-text.json");
  const before = {
    markdown: fs.readFileSync(markdown),
    metadata: fs.readFileSync(metadata),
  };
  const fixture = loadAdapterWithFormFixture(root);
  try {
    const article = store.getArticle("client-plain-text", "article-plain-text");
    const prepared = await fixture.adapter.preparePlatformSubmission(
      claim(article.content),
    );
    const evidence = prepared.preparedSubmissionEvidenceV1;

    assert.deepEqual(fixture.getCalls, [
      "https://post.lieju.com/117/239",
      "https://www.lieju.com/city.php?post=239",
      "https://post.lieju.com/1/239",
    ]);
    assert.equal(evidence.body, "标题\n\n正文含有 图片。");
    assert.notEqual(evidence.body, article.content);
    assert.equal(
      evidence.contentFingerprint,
      domain.preparedContentFingerprint({
        title: evidence.title,
        body: evidence.body,
      }),
    );
    assert.deepEqual(
      domain.parsePreparedSubmissionEvidenceV1(evidence),
      evidence,
    );
    assert.doesNotMatch(evidence.body, /private|cover\.png/);
    assert.deepEqual(
      {
        markdown: fs.readFileSync(markdown),
        metadata: fs.readFileSync(metadata),
      },
      before,
    );
  } finally {
    fixture.restore();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
