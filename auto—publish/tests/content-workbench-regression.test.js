const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

function read(file) {
  return fs.readFileSync(path.resolve(__dirname, "..", file), "utf8");
}

describe("content workbench regression", function() {
  it("exposes the content IPC API to the React renderer", function() {
    const preload = read("desktop/preload.js");
    const api = read("media-workbench/src/bridge/content.ts");
    [
      'ipcRenderer.invoke("content:list-clients")',
      'ipcRenderer.invoke("content:generate-article", input)',
      'ipcRenderer.invoke("content:save-article", article)',
      'ipcRenderer.invoke("content:review-articles", { articles: articles })',
      "export async function listContentClients",
      "export async function generateContentArticle",
      "export async function saveContentArticle",
      "export async function reviewContentArticles"
    ].forEach(function(value) { assert.equal((preload + api).includes(value), true, "missing " + value); });
  });

  it("keeps the AI content workspace reachable from navigation", function() {
    const app = read("media-workbench/src/App.tsx");
    const sidebar = read("media-workbench/src/components/Sidebar.tsx");
    const workbench = read("media-workbench/src/components/ContentWorkbench.tsx");
    assert.equal(app.includes("ContentWorkbench"), true);
    assert.equal(app.includes("currentView === 'content'"), true);
    assert.equal(sidebar.includes("id: 'content' as ViewMode"), true);
    assert.equal(workbench.includes("QuestionCollectionView"), true);
    assert.equal(workbench.includes("ArticleGenerationView"), true);
    assert.equal(workbench.includes("GeneratedArticlesView"), true);
  });

  it("keeps existing renderer IPC errors readable after structured responses", function() {
    const api = read("media-workbench/src/bridge/content.ts");
    assert.equal(api.includes("ipcError"), true);
    assert.equal(api.includes("new Error(result.error ||"), false);
  });

  it("defines the three content workbench tabs and shared refresh boundary", function() {
    const workbench = read("media-workbench/src/components/ContentWorkbench.tsx");
    ["questions", "generate", "history", "QuestionCollectionView", "ArticleGenerationView", "GeneratedArticlesView"].forEach(function(value) {
      assert.equal(workbench.includes(value), true, "missing " + value);
    });
    assert.match(workbench, /onRefresh|refresh/);
  });

  it("exposes the collection API and multi-research generation contract", function() {
    const api = read("media-workbench/src/bridge/content.ts");
    const types = read("media-workbench/src/types.ts");
    [
      "listContentQuestions",
      "createContentQuestion",
      "updateContentQuestion",
      "deleteContentQuestion",
      "getDoubaoLoginStatus",
      "openDoubaoLogin",
      "collectDoubaoQuestion",
      "startDoubaoBatch",
      "pauseDoubaoBatch",
      "resumeDoubaoBatch",
      "stopDoubaoBatch",
      "retryFailedDoubao",
      "getDoubaoQueueState",
      "subscribeDoubaoQueue",
      "saveManualResearch",
      "researchQueryIds: string[]"
    ].forEach(function(value) { assert.equal((api + types).includes(value), true, "missing " + value); });
    assert.match(read("media-workbench/src/bridge/content.ts"), /subscribeDoubaoQueue[\s\S]*\(\) => void/);
  });

  it("exposes the Task 1 batch preview and prepared-start renderer API", function() {
    const preload = read("desktop/preload.js");
    const api = read("media-workbench/src/bridge/content.ts");
    assert.match(preload, /previewDoubaoBatch: function\(input\) \{ return ipcRenderer\.invoke\("content:preview-doubao-batch", input\); \}/);
    assert.match(preload, /startPreparedDoubaoBatch: function\(input\) \{ return ipcRenderer\.invoke\("content:start-prepared-doubao-batch", input\); \}/);
    assert.match(api, /export async function previewDoubaoBatch[\s\S]*callContent\(\s*"previewDoubaoBatch",\s*\[input\]/);
    assert.match(api, /export async function startPreparedDoubaoBatch[\s\S]*callContent\(\s*"startPreparedDoubaoBatch",\s*\[\{ tasks \}\]/);
    assert.doesNotMatch(api, /export function startPreparedDoubaoBatch[\s\S]*return startDoubaoBatch\(tasks\)/);
  });

  it("keeps batch selection and answer expansion as independent controls", function() {
    const questions = read("media-workbench/src/components/content/QuestionCollectionView.tsx");
    const item = read("media-workbench/src/components/content/CollapsibleSourceItem.tsx");
    assert.doesNotMatch(questions, /onClientChange/);
    assert.match(questions, /indeterminate/);
    assert.match(questions, /二次确认|confirm/);
    assert.match(item, /defaultExpanded = false/);
    assert.match(item, /onSelectedChange/);
    assert.match(item, /aria-expanded/);
    assert.doesNotMatch(item, /activeId/);
  });

  it("keeps Task 10 single and batch generation workflows on renderer APIs", function() {
    const article = read("media-workbench/src/components/content/ArticleGenerationView.tsx");
    const batch = read("media-workbench/src/components/content/BatchGenerationView.tsx");
    const api = read("media-workbench/src/bridge/content.ts");
    ["单篇生成", "批量生成", "CollapsibleSourceItem", "materialIds", "researchQueryIds"].forEach(function(value) {
      assert.equal(article.includes(value), true, "missing " + value);
    });
    ["previewGenerationBatch", "createAndStartGenerationBatch", "getGenerationRuntimeSnapshot", "pauseGenerationBatch", "resumeGenerationBatch", "stopGenerationBatch", "retryFailedGenerationBatch"].forEach(function(value) {
      assert.equal(batch.includes(value) && api.includes(value), true, "missing " + value);
    });
    assert.doesNotMatch(batch, /safeStorage|readFileSync|Playwright|playwright|fetch\(/i);
  });
});
