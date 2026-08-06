const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

function read(file) {
  return fs.readFileSync(path.resolve(__dirname, "..", file), "utf8");
}

describe("Doubao content workbench renderer contracts", function() {
  it("declares collection types and research provenance fields", function() {
    const types =
      read("media-workbench/src/types/content.ts") +
      read("media-workbench/src/types/generation.ts");
    [
      "ContentQuestion",
      "DoubaoLoginStatus",
      "DoubaoTaskStatus",
      "DoubaoQueueState",
      "collectionMethod",
      "collectedAt",
      "updatedAt",
      "researchQueryIds",
      "researchSnapshots",
      "researchQueryId?"
    ].forEach(function(value) { assert.equal(types.includes(value), true, "missing " + value); });
  });

  it("keeps privileged and browser-only implementation out of React files", function() {
    const files = [
      "media-workbench/src/components/ContentWorkbench.tsx",
      "media-workbench/src/components/content/QuestionCollectionView.tsx",
      "media-workbench/src/components/content/ArticleGenerationView.tsx",
      "media-workbench/src/components/content/GeneratedArticlesView.tsx",
      "media-workbench/src/components/content/CollectionTaskBar.tsx"
    ];
    const forbidden = /\b(?:fs|child_process|PLAYWRIGHT_CLI_JS|browser_data|ipcRenderer)\b/;
    files.forEach(function(file) { assert.doesNotMatch(read(file), forbidden, "privileged code in " + file); });
  });

  it("renders collection controls, explicit recollection confirmation, and task icons", function() {
    const questions = read("media-workbench/src/components/content/QuestionCollectionView.tsx");
    const batch = read("media-workbench/src/components/content/QuestionBatchControls.tsx");
    const researchList = read("media-workbench/src/components/content/QuestionResearchList.tsx");
    const taskBar = read("media-workbench/src/components/content/CollectionTaskBar.tsx");
    ["commands.createQuestion", "commands.updateQuestion", "commands.deleteQuestion", "confirm", "force: true", "commands.saveManualResearch", "不会修改已保存文章"].forEach(function(value) {
      assert.equal(questions.includes(value), true, "missing " + value);
    });
    ["collectionMethod", "references", "collectedAt", "CollapsibleSourceItem"].forEach(function(value) {
      assert.equal(researchList.includes(value), true, "missing " + value);
    });
    assert.match(batch, /previewDoubaoBatch/);
    assert.match(batch, /startPreparedDoubaoBatch/);
    ["Pause", "Play", "Square", "RotateCcw", "title=", "width", "height"].forEach(function(value) {
      assert.equal(taskBar.includes(value), true, "missing " + value);
    });
    assert.doesNotMatch(taskBar, /onStart|<LogIn/);
  });

  it("keeps one current-client selector and exposes independent batch commands", function() {
    const questions = read("media-workbench/src/components/content/QuestionCollectionView.tsx");
    const batch = read("media-workbench/src/components/content/QuestionBatchControls.tsx");
    const api = read("media-workbench/src/bridge/content.ts");
    assert.equal((questions.match(/onClientChange/g) || []).length, 0);
    ["全选客户", "取消全选", "采集选中客户", "重新采集选中客户"].forEach(function(value) {
      assert.match(batch, new RegExp(value));
    });
    assert.match(batch, /previewDoubaoBatch/);
    assert.match(batch, /startPreparedDoubaoBatch/);
    assert.match(api, /previewDoubaoBatch|DoubaoBatchPreview/);
  });

  it("uses pure batch-selection helpers and keeps current-client changes isolated", function() {
    const batch = read("media-workbench/src/components/content/QuestionBatchControls.tsx");
    assert.match(batch, /export function toggleAllClientIds/);
    assert.match(batch, /export function getBatchSelectionState/);
    assert.match(batch, /selectedClientIds\.length/);
    assert.match(batch, /useState<string\[\]>\(initialClientId \? \[initialClientId\] : \[\]\)/);
    assert.match(batch, /setSelectedClientIds\(\(current\) => \{[\s\S]*current\.filter/);
  });

  it("does not start prepared tasks from a preview whose client selection changed", function() {
    const batch = read("media-workbench/src/components/content/QuestionBatchControls.tsx");
    const questions = read("media-workbench/src/components/content/QuestionCollectionView.tsx");
    assert.match(batch, /selectionRevisionRef/);
    assert.match(batch, /clientIdsRef/);
    assert.match(batch, /selectionStillMatches\(previewRequest\)/);
    assert.match(batch, /批次客户选择已变化，请重新预览/);
    assert.match(batch, /disabled=\{batchActionBusy/);
    assert.match(questions, /commandStates\.previewDoubaoBatch\.busy/);
  });

  it("renders collected answers through the shared collapsed source item", function() {
    const questions = read("media-workbench/src/components/content/QuestionResearchList.tsx");
    const item = read("media-workbench/src/components/content/CollapsibleSourceItem.tsx");
    assert.match(item, /defaultExpanded = false/);
    assert.match(item, /aria-expanded/);
    assert.match(item, /type=\"checkbox\"|type='checkbox'/);
    assert.match(questions, /CollapsibleSourceItem/);
    assert.match(questions, /defaultExpanded=\{false\}/);
  });

  it("uses selected research ids in generation and delegates history selection", function() {
    const generation = read("media-workbench/src/components/content/ArticleGenerationView.tsx");
    const generationFeature = read("media-workbench/src/features/content/use-content-generation-feature.ts");
    const history = read("media-workbench/src/components/content/GeneratedArticlesView.tsx");
    assert.match(generation, /useContentGenerationFeature/);
    assert.match(generation, /generationFeature\.generate\(\{[\s\S]*researchQueryIds: selectedIds/);
    assert.match(generationFeature, /generate: generateContentArticle/);
    ["checkbox", "answerText", "length", "commands.saveArticle"].forEach(function(value) {
      assert.equal(generation.includes(value), true, "missing " + value);
    });
    assert.doesNotMatch(generation, /commands\.(previewExport|exportToSubmissionQueue)/);
    assert.match(history, /onSelect|onArticleSelect/);
    assert.doesNotMatch(history, /saveContentArticle|generateContentArticle/);
  });

  it("initializes the queue from feature commands and cleans up its feature subscription", function() {
    const questions = read("media-workbench/src/components/content/QuestionCollectionView.tsx");
    const feature = read("media-workbench/src/features/content/content-sources-feature.js");
    assert.match(feature, /doubaoQueue/);
    assert.match(feature, /subscribeDoubaoQueue/);
    assert.match(feature, /getDoubaoQueueState/);
    assert.match(feature, /clearQueueSubscription/);
    assert.match(feature, /ensureQueueSubscription/);
    assert.match(feature, /dispose\(\)[\s\S]*clearQueueSubscription/);
    assert.match(questions, /queueQuery/);
    assert.match(questions, /queue=\{queue\}/);
  });

  it("separates question research loading from login checking and preserves session errors", function() {
    const questions = read("media-workbench/src/components/content/QuestionCollectionView.tsx");
    const feature = read("media-workbench/src/features/content/content-sources-feature.js");
    const types = read("media-workbench/src/types/content.ts");
    assert.match(types, /DoubaoLoginStatus =[^;]*["']checking["']/);
    assert.match(feature, /doubaoLoginQuery/);
    assert.match(feature, /LOGIN_COMMANDS/);
    assert.match(questions, /loginQuery\.loading/);
    assert.match(questions, /login\.status/);
    assert.doesNotMatch(questions, /listContentQuestions|listContentResearch/);
    assert.doesNotMatch(questions, /setLogin|refreshClientData\('command-result'\)/);
    assert.doesNotMatch(questions, /Promise\.all\(\[listContentQuestions\(clientId\), listContentResearch\(clientId\), getDoubaoLoginStatus\(\)\]\)/);
  });

  it("does not refresh login when passive view data changes", function() {
    const questions = read("media-workbench/src/components/content/QuestionCollectionView.tsx");
    assert.doesNotMatch(questions, /\[clientId, refreshToken\]/);
    assert.doesNotMatch(questions, /useEffect\([^]*refreshLogin[^]*refreshClientData/);
    assert.match(questions, /onClick=\{refreshLogin\}/);
  });

  it("restores the last stable login state when a passive session is unavailable", function() {
    const questions = read("media-workbench/src/components/content/QuestionCollectionView.tsx");
    const feature = read("media-workbench/src/features/content/content-sources-feature.js");
    const api = read("media-workbench/src/bridge/content.ts");
    assert.match(feature, /getCachedDoubaoLoginState/);
    assert.match(feature, /rememberDoubaoLoginState/);
    assert.doesNotMatch(questions, /getCachedDoubaoLoginState|rememberDoubaoLoginState/);
    assert.match(questions, /PLAYWRIGHT_SESSION_NOT_OPEN/);
    assert.match(api, /ipcError/);
  });

  it("refreshes once after collection completion and prevents duplicate submissions", function() {
    const questions = read("media-workbench/src/components/content/QuestionCollectionView.tsx");
    const feature = read("media-workbench/src/features/content/content-sources-feature.js");
    const batch = read("media-workbench/src/components/content/QuestionBatchControls.tsx");
    const taskBar = read("media-workbench/src/components/content/CollectionTaskBar.tsx");
    assert.match(feature, /nextQueue\.status === 'completed'/);
    assert.match(feature, /queueRefreshKey/);
    assert.match(feature, /lastQueueRefreshKey/);
    assert.match(feature, /refreshCompletedQueueData/);
    assert.match(questions, /isCollecting/);
    assert.match(batch, /disabled=\{batchActionBusy/);
    assert.match(taskBar, /disabled=\{busy\}/);
  });

  it("delegates queue-result refresh identity to the scoped content feature", function() {
    const questions = read("media-workbench/src/components/content/QuestionCollectionView.tsx");
    const feature = read("media-workbench/src/features/content/content-sources-feature.js");
    assert.match(feature, /queueIdentity/);
    assert.match(feature, /clientIdentity/);
    assert.match(feature, /researchIndexIdentity/);
    assert.match(feature, /requestedClientId !== selectedClientId/);
    assert.match(feature, /queueIdentity\.isCurrent/);
    assert.doesNotMatch(questions, /loadSequence|refreshToken|onContentSourcesChangedRef|subscribeDoubaoQueue/);
  });

  it("derives collection pending state from feature command state and clears its run token on every exit", function() {
    const questions = read("media-workbench/src/components/content/QuestionCollectionView.tsx");
    assert.match(questions, /const collectionPending = commandStates\.collectDoubaoQuestion\.busy/);
    assert.match(questions, /commandStates\.previewDoubaoBatch\.busy/);
    assert.match(questions, /commandStates\.startPreparedDoubaoBatch\.busy/);
    assert.match(questions, /commandStates\.retryFailedDoubao\.busy/);
    assert.match(questions, /const isCollecting = collectionPending/);
    assert.doesNotMatch(questions, /pendingCollectionToken|tryBeginCollection|finishCollection/);
  });

  it("routes retry through the shared collection lock and surfaces rejected commands", function() {
    const questions = read("media-workbench/src/components/content/QuestionCollectionView.tsx");
    const taskBar = read("media-workbench/src/components/content/CollectionTaskBar.tsx");
    assert.match(questions, /async function retryFailed\(\)/);
    assert.match(questions, /retryFailedDoubao\(\)/);
    assert.match(questions, /retryFailedDoubao\(\)[\s\S]*catch \(value\)[\s\S]*setError/);
    assert.match(questions, /onRetry=\{retryFailed\}/);
  });

  it("deduplicates collection refreshes by run token and refreshes empty/external completions", function() {
    const feature = read("media-workbench/src/features/content/content-sources-feature.js");
    assert.match(feature, /queueRefreshKey/);
    assert.match(feature, /nextQueue\.total === 0/);
    assert.match(feature, /key !== lastQueueRefreshKey/);
    assert.doesNotMatch(feature, /skipNextCompletionRefresh/);
  });

  it("shows queue status, current question, wait seconds, and the latest safe failure", function() {
    const taskBar = read("media-workbench/src/components/content/CollectionTaskBar.tsx");
    ["running", "paused", "stopping", "completed", "当前问题", "等待", "失败", "waitRemainingMs / 1000", "error?.code", "error?.message"].forEach(function(value) {
      assert.equal(taskBar.includes(value), true, "missing " + value);
    });
  });

  it("makes the task bar information area shrink and truncate long text", function() {
    const taskBar = read("media-workbench/src/components/content/CollectionTaskBar.tsx");
    assert.match(taskBar, /flex-1 min-w-0/);
    assert.match(taskBar, /overflow-hidden/);
    assert.match(taskBar, /truncate/);
  });

  it("clears article and research selection when the customer changes", function() {
    const workbench = read("media-workbench/src/components/ContentWorkbench.tsx");
    const contentFeature = read("media-workbench/src/features/content/content-sources-feature.js");
    const generation = read("media-workbench/src/components/content/ArticleGenerationView.tsx");
    assert.match(workbench, /content\.selectClient\(nextClientId\)/);
    assert.match(contentFeature, /selectClient\(clientId\)[\s\S]*currentArticle = null/);
    assert.match(generation, /useEffect\(\(\) => \{[\s\S]*setSelectedIds\(\[\]\)[\s\S]*\[clientId\]\)/);
  });

  it("resets platform templates and ignores stale template requests", function() {
    const generation = read("media-workbench/src/components/content/ArticleGenerationView.tsx");
    assert.doesNotMatch(generation, /listContentTemplateCatalog|listContentSubmissionPlatforms/);
    assert.match(generation, /templateCatalog \|\|/);
    assert.match(generation, /useEffect\(\(\) => \{[\s\S]*setSelectedIds\(\[\]\)[\s\S]*\[clientId\]\)/);
    assert.match(generation, /selectedArticleRef\.current[\s\S]*templateId/);
    assert.match(generation, /nextTemplates\.some/);
  });

  it("preserves a history article template when template loading completes", function() {
    const generation = read("media-workbench/src/components/content/ArticleGenerationView.tsx");
    assert.match(generation, /setTemplateId\(resolvedTemplateId\)/);
    assert.match(generation, /setTemplateId\(\(current\) => \{/);
    assert.match(generation, /nextTemplates\.some/);
    assert.match(generation, /selectedArticleRef\.current\?\.platform === platform/);
  });

  it("maps legacy history templates by platform and scenario without replacing snapshots", async function() {
    const generation = read("media-workbench/src/components/content/ArticleGenerationView.tsx");
    const { resolveAvailableTemplateId } = await import("../media-workbench/src/article-history-logic.js");
    assert.equal(resolveAvailableTemplateId({ platform: "ctrip", scenario: "guide", templateId: "missing" }, [{ id: "current", platform: "ctrip", scenario: "guide" }]), "current");
    assert.equal(resolveAvailableTemplateId({ platform: "ctrip", templateId: "deleted", templateSnapshot: { platform: "ctrip", id: "deleted", name: "Old", scenario: "guide", body: "old" } }, [{ id: "current", platform: "ctrip", scenario: "guide" }]), "deleted");
    assert.match(generation, /resolveAvailableTemplateId/);
    assert.match(generation, /onArticleChange\(\{ \.\.\.currentArticle, templateId: resolvedTemplateId \}\)/);
    assert.match(generation, /commands\.saveArticle\(\{ article: \{ \.\.\.editorArticle, templateId: resolvedTemplateId/);
    assert.match(generation, /expectedFingerprint/);
    assert.match(generation, /templateId: resolvedTemplateId/);
  });
});
