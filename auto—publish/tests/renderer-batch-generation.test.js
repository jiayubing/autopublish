const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
function read(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

describe("renderer content generation workflow", function() {
  it("keeps the single article source gate and collapsed source contract", function() {
    const article = read("media-workbench/src/components/content/ArticleGenerationView.tsx");
    const item = read("media-workbench/src/components/content/CollapsibleSourceItem.tsx");

    assert.match(article, /CollapsibleSourceItem/);
    assert.match(article, /materialIds/);
    assert.match(article, /researchQueryIds/);
    assert.match(article, /defaultExpanded=\{false\}/);
    assert.match(article, /disabled=\{!materialIds\.length \|\| !selectedIds\.length/);
    assert.match(item, /defaultExpanded = false/);
    assert.match(item, /aria-expanded/);
    assert.match(item, /onSelectedChange/);
    assert.match(article, /预览|preview/);
    assert.match(article, /重试|retry/);
    assert.match(article, /错误|error/);
  });

  it("defaults async material and research selections without overwriting an explicit cancellation", function() {
    const article = read("media-workbench/src/components/content/ArticleGenerationView.tsx");
    assert.match(article, /materialSelectionTouchedRef/);
    assert.match(article, /researchSelectionTouchedRef/);
    assert.match(article, /setMaterialSelection/);
    assert.match(article, /setResearchSelection/);
    assert.match(article, /validMaterials\.map\(\(item\) => item\.id \|\| item\.name\)/);
    assert.match(article, /validResearch\.map\(\(item\) => item\.id\)/);
    assert.match(article, /materialSelectionTouchedRef\.current \? current/);
    assert.match(article, /researchSelectionTouchedRef\.current \? current/);
  });

  it("retries one material through the material store API", function() {
    const article = read("media-workbench/src/components/content/ArticleGenerationView.tsx");
    const api = read("media-workbench/src/electron-api.ts");
    const preload = read("desktop/preload.js");
    const ipc = read("desktop/ipc/ai-content-ipc.js");
    assert.match(article, /retryContentMaterial/);
    assert.doesNotMatch(article, /listContentClients\(\)/);
    assert.match(api, /export async function retryContentMaterial/);
    assert.match(preload, /retryMaterial/);
    assert.match(ipc, /content:retry-material/);
  });

  it("defines the four batch steps and Cartesian task count", async function() {
    const { countGenerationTasks, BATCH_GENERATION_STEPS } = await import(pathToFileURL(path.join(root, "media-workbench/src/content-generation-ui-logic.js")));
    assert.equal(countGenerationTasks(10, 3), 30);
    assert.deepEqual(BATCH_GENERATION_STEPS, ["clients", "templates", "sources", "confirm"]);
  });

  it("discovers every returned template platform and counts all selected templates", function() {
    const batch = read("media-workbench/src/components/content/BatchGenerationView.tsx");
    assert.doesNotMatch(batch, /const PLATFORMS =/);
    assert.match(batch, /listContentTemplates\(\)/);
    assert.match(batch, /Object\.entries\(templateGroups\)/);
    assert.match(batch, /selectedTemplates\.length/);
  });

  it("renders the batch client, platform template, source and confirmation contracts", function() {
    const batch = read("media-workbench/src/components/content/BatchGenerationView.tsx");
    assert.match(batch, /四步|步骤/);
    assert.match(batch, /全选客户/);
    assert.match(batch, /取消全选/);
    assert.match(batch, /platform/);
    assert.match(batch, /按平台|平台分组|group/);
    assert.match(batch, /materialIds/);
    assert.match(batch, /researchQueryIds/);
    assert.match(batch, /预计输入字符数|字符数/);
    assert.match(batch, /不可生成|排除/);
    assert.match(batch, /可执行任务数/);
    assert.match(batch, /确认.*启动|启动.*确认/);
    assert.match(batch, /previewGenerationBatch/);
    assert.match(batch, /startGenerationBatch/);
    assert.match(batch, /getGenerationBatchState/);
    assert.match(batch, /pauseGenerationBatch/);
    assert.match(batch, /resumeGenerationBatch/);
    assert.match(batch, /stopGenerationBatch/);
    assert.match(batch, /retryFailedGenerationBatch/);
  });

  it("exposes renderer-only generation batch wrappers through preload", function() {
    const api = read("media-workbench/src/electron-api.ts");
    const preload = read("desktop/preload.js");
    [
      "previewGenerationBatch",
      "createGenerationBatch",
      "startGenerationBatch",
      "pauseGenerationBatch",
      "resumeGenerationBatch",
      "stopGenerationBatch",
      "retryFailedGenerationBatch",
      "getGenerationBatchState",
      "subscribeGenerationBatchState"
    ].forEach(function(name) { assert.match(api, new RegExp(name)); });
    assert.match(preload, /previewGenerationBatch/);
    assert.doesNotMatch(read("media-workbench/src/components/content/BatchGenerationView.tsx"), /safeStorage|Playwright|playwright|readFileSync|fs\./i);
  });

  it("provides a single and batch segmented control without losing the article editor", function() {
    const article = read("media-workbench/src/components/content/ArticleGenerationView.tsx");
    assert.match(article, /单篇生成/);
    assert.match(article, /批量生成/);
    assert.match(article, /BatchGenerationView/);
    assert.match(article, /selectedArticle/);
  });
});
