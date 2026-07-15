const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

let groupArticlesByTemplate;
let resolveAvailableTemplateId;
let summarizeTemplateSnapshot;

function item(id, platform, templateId, createdAt, overrides) {
  return Object.assign({
    id: id,
    clientId: "c1",
    platform: platform,
    templateId: templateId,
    title: id,
    content: "body",
    status: "generated",
    createdAt: createdAt,
    updatedAt: createdAt,
    templateSnapshot: { platform: platform, id: templateId, name: templateId + " name", scenario: "guide", body: "body", bodyHash: templateId + " hash" }
  }, overrides || {});
}

describe("article history grouping", async function() {
  const historyLogic = await import("../media-workbench/src/article-history-logic.js");
  groupArticlesByTemplate = historyLogic.groupArticlesByTemplate;
  resolveAvailableTemplateId = historyLogic.resolveAvailableTemplateId;
  summarizeTemplateSnapshot = historyLogic.summarizeTemplateSnapshot;
  it("groups by platform and template snapshot, sorting groups and articles by createdAt", function() {
    const groups = groupArticlesByTemplate([
      item("old-a", "ctrip", "a", "2026-07-10T00:00:00.000Z", { reviewedAt: "2026-07-15T00:00:00.000Z" }),
      item("new-b", "toutiao", "b", "2026-07-14T00:00:00.000Z"),
      item("new-a", "ctrip", "a", "2026-07-13T00:00:00.000Z", { updatedAt: "2026-07-15T00:00:00.000Z" }),
      item("old-b", "toutiao", "b", "2026-07-11T00:00:00.000Z")
    ]);

    assert.deepStrictEqual(groups.map((group) => group.key), ["toutiao:b", "ctrip:a"]);
    assert.deepStrictEqual(groups[0].articles.map((article) => article.id), ["new-b", "old-b"]);
    assert.deepStrictEqual(groups[1].articles.map((article) => article.id), ["new-a", "old-a"]);
  });

  it("uses the saved template snapshot after template deletion and keeps old articles visible", function() {
    const historical = item("historical", "ctrip", "deleted-template", "2026-07-12T00:00:00.000Z");
    assert.equal(resolveAvailableTemplateId(historical, [{ id: "current", platform: "ctrip", scenario: "guide" }]), "deleted-template");
    assert.equal(summarizeTemplateSnapshot(historical.templateSnapshot), "body");

    const groups = groupArticlesByTemplate([item("legacy", "", undefined, "2026-07-12T00:00:00.000Z", { templateSnapshot: undefined })]);

    assert.equal(groups.length, 1);
    assert.equal(groups[0].label, "旧版未分类");
    assert.deepStrictEqual(groups[0].articles.map((article) => article.id), ["legacy"]);
  });

  it("separates legacy articles by platform and template id when available", function() {
    const groups = groupArticlesByTemplate([
      item("ctrip-legacy", "ctrip", "old-guide", "2026-07-12T00:00:00.000Z", { templateSnapshot: undefined }),
      item("toutiao-legacy", "toutiao", "old-news", "2026-07-13T00:00:00.000Z", { templateSnapshot: undefined }),
    ]);

    assert.deepStrictEqual(groups.map((group) => group.key), ["toutiao:old-news", "ctrip:old-guide"]);
    assert.deepStrictEqual(groups.map((group) => group.articles.map((article) => article.id)), [["toutiao-legacy"], ["ctrip-legacy"]]);
  });

  it("keeps article opening separate from explicit review selection", function() {
    const view = fs.readFileSync(path.resolve(__dirname, "..", "media-workbench/src/components/content/GeneratedArticlesView.tsx"), "utf8");
    assert.match(view, /reviewContentArticles/);
    assert.match(view, /window\.confirm/);
    assert.match(view, /article\.status !== 'generated'/);
    assert.match(view, /onArticleSelect\(article\)/);
    assert.match(view, /全选当前结果/);
    assert.match(view, /templateSnapshot/);
    assert.match(view, /正文解释|body/);
  });
});
