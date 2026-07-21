const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

let groupArticlesByTemplate;
let resolveAvailableTemplateId;
let summarizeTemplateSnapshot;
let articleSelectionKey;
let selectableArticles;
let selectionState;

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
  articleSelectionKey = historyLogic.articleSelectionKey;
  selectableArticles = historyLogic.selectableArticles;
  selectionState = historyLogic.selectionState;
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

  it("keeps article opening separate from queue selection", function() {
    const view = fs.readFileSync(path.resolve(__dirname, "..", "media-workbench/src/components/content/GeneratedArticlesView.tsx"), "utf8");
    assert.doesNotMatch(view, /reviewContentArticles|审核已选|待审核/);
    assert.match(view, /ActionConfirmationModal/);
    assert.match(view, /article\.status !== 'generated'/);
    assert.match(view, /onArticleSelect\(article\)/);
    assert.match(view, /全选当前结果/);
    assert.match(view, /templateSnapshot/);
    assert.match(view, /正文解释|body/);
  });

  it("offers a current-client trash view with restore and confirmed permanent deletion", function() {
    const view = fs.readFileSync(path.resolve(__dirname, "..", "media-workbench/src/components/content/GeneratedArticlesView.tsx"), "utf8");
    const api = fs.readFileSync(path.resolve(__dirname, "..", "media-workbench/src/bridge/content.ts"), "utf8");
    assert.match(view, /getArticleManagementSnapshot|setTrash/);
    assert.match(view, /restoreContentArticle/);
    assert.match(view, /preparePermanentDeleteContentArticle/);
    assert.match(view, /permanentlyDeleteContentArticle/);
    assert.match(view, /移入回收站/);
    assert.match(view, /永久删除/);
    assert.match(api, /preparePermanentDeleteContentArticle/);
    assert.match(api, /permanentlyDeleteContentArticle/);
  });

  it("keeps saved articles selectable for submission queueing", function() {
    const view = fs.readFileSync(path.resolve(__dirname, "..", "media-workbench/src/components/content/GeneratedArticlesView.tsx"), "utf8");
    assert.match(view, /const selectedQueueable = filtered\.filter/);
    assert.match(view, /disabled=\{!selectedArticles\.some\(\(article\) => article\.status === 'generated' \|\| article\.status === 'saved'\)/);
    assert.match(view, /状态：/);
    assert.match(view, /撤销未开始投稿/);
    assert.match(view, /getArticleManagementSnapshot/);
    assert.match(view, /queueableTaskCount/);
    assert.match(view, /idempotentCount/);
    assert.match(view, /conflictCount/);
    assert.match(view, /新增/);
    assert.match(view, /已存在跳过/);
    assert.match(view, /冲突/);

  });

  it("selects a saved-only filtered result", function() {
    const saved = item("saved", "ctrip", "guide", "2026-07-15T00:00:00.000Z", { status: "saved" });
    assert.deepStrictEqual(selectableArticles([saved], "c1"), [saved]);
    assert.deepStrictEqual(selectionState([saved], [articleSelectionKey(saved)], "c1"), {
      total: 1, selected: 1, checked: true, indeterminate: false, disabled: false
    });
  });

  it("keeps generated and saved articles in one mixed selection with indeterminate state", function() {
    const generated = item("generated", "ctrip", "guide", "2026-07-15T00:00:00.000Z");
    const saved = item("saved", "ctrip", "guide", "2026-07-14T00:00:00.000Z", { status: "saved" });
    const foreign = item("foreign", "ctrip", "guide", "2026-07-13T00:00:00.000Z", { clientId: "other-client", status: "saved" });
    const state = selectionState([generated, saved, foreign], [articleSelectionKey(generated)], "c1");
    assert.deepStrictEqual(selectableArticles([generated, saved, foreign], "c1").map((article) => article.id), ["generated", "saved"]);
    assert.equal(state.total, 2);
    assert.equal(state.selected, 1);
    assert.equal(state.checked, false);
    assert.equal(state.indeterminate, true);
    assert.equal(state.disabled, false);
  });

  it("scopes selection state to the currently filtered result", function() {
    const generated = item("generated", "ctrip", "guide", "2026-07-15T00:00:00.000Z");
    const saved = item("saved", "ctrip", "guide", "2026-07-14T00:00:00.000Z", { status: "saved" });
    const selectedSaved = [articleSelectionKey(saved)];
    assert.deepStrictEqual(selectionState([generated], selectedSaved, "c1"), {
      total: 1, selected: 0, checked: false, indeterminate: false, disabled: false
    });
    assert.deepStrictEqual(selectionState([saved], selectedSaved, "c1"), {
      total: 1, selected: 1, checked: true, indeterminate: false, disabled: false
    });
  });
});
