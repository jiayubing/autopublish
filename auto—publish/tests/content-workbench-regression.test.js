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
    const generationApi = read("media-workbench/src/bridge/generation.ts");
    [
      'ipcRenderer.invoke("content:list-clients")',
      'ipcRenderer.invoke("content:generate-article", input)',
      'ipcRenderer.invoke("content:save-article", article)',
      "export async function listContentClients",
    ].forEach(function(value) { assert.equal((preload + api + generationApi).includes(value), true, "missing " + value); });
    ["export async function generateContentArticle", "export async function saveContentArticle"].forEach(function(value) {
      assert.equal(generationApi.includes(value), true, "missing " + value);
    });
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

  it("keeps the content view height chain constrained for batch wizard actions", function() {
    const workbench = read("media-workbench/src/components/ContentWorkbench.tsx");
    assert.match(workbench, /<div className="flex min-h-0 flex-1 flex-col overflow-hidden">\s*\{tab === 'questions'/);
  });

  it("lets the batch generation branch fill the remaining article-generation height", function() {
    const article = read("media-workbench/src/components/content/ArticleGenerationView.tsx");
    assert.match(article, /\{mode === 'batch' \? <div className="min-h-0 flex-1">\s*<BatchGenerationView/);
  });

  it("keeps the batch wizard action bar visible when a previous batch snapshot exists", function() {
    const batch = read("media-workbench/src/components/content/BatchGenerationView.tsx");
    assert.match(batch, /\{viewMode === 'wizard' && <div className="flex shrink-0 items-center justify-between/);
    assert.match(batch, /: '下一步'\}/);
  });

  it("keeps an explicitly opened new-batch wizard open across preview hydration", function() {
    const batch = read("media-workbench/src/components/content/BatchGenerationView.tsx");
    const feature = read("media-workbench/src/features/generation/generation-feature.js");
    assert.match(feature, /await hydrate\('command-result'\)/);
    assert.match(batch, /const newBatchWizardRef = useRef\(false\)/);
    assert.match(batch, /if \(batch && !newBatchWizardRef\.current\) setViewMode\('monitoring'\)/);
    assert.match(batch, /newBatchWizardRef\.current = true/);
  });

  it("exposes the collection API and multi-research generation contract", function() {
    const api = read("media-workbench/src/bridge/content.ts");
    const types = read("media-workbench/src/types/content.ts");
    const generationTypes = read("media-workbench/src/types/generation.ts");
    [
      "listContentQuestions",
      "createContentQuestion",
      "updateContentQuestion",
      "deleteContentQuestion",
      "getDoubaoLoginStatus",
      "openDoubaoLogin",
      "collectDoubaoQuestion",
      "pauseDoubaoBatch",
      "resumeDoubaoBatch",
      "stopDoubaoBatch",
      "retryFailedDoubao",
      "getDoubaoQueueState",
      "subscribeDoubaoQueue",
      "saveManualResearch",
      "researchQueryIds: string[]"
    ].forEach(function(value) { assert.equal((api + types + generationTypes).includes(value), true, "missing " + value); });
    assert.match(read("media-workbench/src/bridge/content.ts"), /subscribeDoubaoQueue[\s\S]*\(\) => void/);
  });

  it("exposes the Task 1 batch preview and prepared-start renderer API", function() {
    const preload = read("desktop/preload.js");
    const api = read("media-workbench/src/bridge/content.ts");
    assert.match(preload, /previewDoubaoBatch: function\(input\) \{ return ipcRenderer\.invoke\("content:preview-doubao-batch", input\); \}/);
    assert.match(preload, /startPreparedDoubaoBatch: function\(input\) \{ return ipcRenderer\.invoke\("content:start-prepared-doubao-batch", input\); \}/);
    assert.match(api, /export async function previewDoubaoBatch[\s\S]*callDoubao\(\s*\(api\) => requireBridgeMethod\(api\.previewDoubaoBatch\)\(input\)/);
    assert.match(api, /export async function startPreparedDoubaoBatch[\s\S]*callDoubao\(\s*\(api\) => requireBridgeMethod\(api\.startPreparedDoubaoBatch\)\(\{ tasks \}\)/);
    assert.doesNotMatch(api, /callContent\(\s*"(?:previewDoubaoBatch|startPreparedDoubaoBatch)"/);
    assert.doesNotMatch(api, /export function startPreparedDoubaoBatch[\s\S]*return startDoubaoBatch\(tasks\)/);
  });

  it("unwraps prepared batch command input before calling the task-array bridge", function() {
    const feature = read("media-workbench/src/features/content/use-content-workbench-feature.ts");
    assert.match(feature, /startPreparedDoubaoBatch:\s*\(input:\s*\{\s*tasks:\s*DoubaoBatchTask\[\]\s*\}\)\s*=>\s*startPreparedDoubaoBatch\(input\.tasks\)/);
  });

  it("keeps batch selection and answer expansion as independent controls", function() {
    const questions = read("media-workbench/src/components/content/QuestionCollectionView.tsx");
    const batch = read("media-workbench/src/components/content/QuestionBatchControls.tsx");
    const item = read("media-workbench/src/components/content/CollapsibleSourceItem.tsx");
    assert.doesNotMatch(questions, /onClientChange/);
    assert.match(batch, /indeterminate/);
    assert.match(questions, /二次确认|confirm/);
    assert.match(item, /defaultExpanded = false/);
    assert.match(item, /onSelectedChange/);
    assert.match(item, /aria-expanded/);
    assert.doesNotMatch(item, /activeId/);
  });

  it("keeps Task 10 single and batch generation workflows on renderer APIs", function() {
    const article = read("media-workbench/src/components/content/ArticleGenerationView.tsx");
    const batch = read("media-workbench/src/components/content/BatchGenerationView.tsx");
    const generationFeature = read("media-workbench/src/features/generation/use-generation-feature.ts");
    const api = read("media-workbench/src/bridge/generation.ts");
    ["单篇生成", "批量生成", "CollapsibleSourceItem", "materialIds", "researchQueryIds"].forEach(function(value) {
      assert.equal(article.includes(value), true, "missing " + value);
    });
    ["previewGenerationBatch", "createAndStartGenerationBatch", "getGenerationRuntimeSnapshot", "pauseGenerationBatch", "resumeGenerationBatch", "stopGenerationBatch", "retryFailedGenerationBatch"].forEach(function(value) {
      assert.equal((batch.includes(value) || generationFeature.includes(value)) && api.includes(value), true, "missing " + value);
    });
    assert.doesNotMatch(batch, /safeStorage|readFileSync|Playwright|playwright|fetch\(/i);
  });
});
