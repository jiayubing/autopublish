const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function source(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

test("streamlined product flow keeps batch results truthful and production navigation flat", () => {
  const detail = source(
    "media-workbench/src/components/content/GenerationBatchDetail.tsx",
  );
  const workbench = source(
    "media-workbench/src/components/ContentWorkbench.tsx",
  );
  const generation = source(
    "media-workbench/src/components/content/ArticleGenerationView.tsx",
  );
  const app = source("media-workbench/src/App.tsx");

  assert.match(detail, /批次结果/);
  assert.match(detail, /查看文章/);
  assert.match(detail, /查看本批次文章/);
  assert.match(detail, /投稿请先进入文章库/);
  assert.doesNotMatch(detail, /批量投稿/);
  assert.match(detail, /task\.articleTitle/);

  assert.match(workbench, /"questions", "single", "batch"/);
  assert.match(workbench, /问题采集/);
  assert.match(workbench, /单篇生成/);
  assert.match(workbench, /批量生成/);
  assert.doesNotMatch(workbench, /"questions", "generate"/);
  assert.doesNotMatch(generation, /generation-mode-control/);
  assert.doesNotMatch(generation, /文章生成模式/);

  assert.match(workbench, /auto-publish:content-production-tab/);
  assert.match(workbench, /auto-publish:article-library-stage/);
  assert.match(workbench, /auto-publish:selected-client/);
  assert.match(app, /auto-publish:last-main-view/);

  assert.match(app, /lifecycleCounts\?\.needs_completion/);
  assert.match(app, /counts\.attentionItems/);
  assert.match(app, /order\.anomaly/);
  assert.match(app, /manualResolutionRequired/);
  assert.doesNotMatch(
    app,
    /submissionCenter:\s*submissionCenter\.snapshot\.data\.counts\.total/,
  );
  assert.doesNotMatch(app, /orders:\s*orders\.length/);
});
