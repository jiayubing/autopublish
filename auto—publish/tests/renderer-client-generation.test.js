const assert = require("node:assert/strict");
const { it } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

const rendererRoot = path.join(__dirname, "..", "media-workbench", "src");
const workbench = fs.readFileSync(path.join(rendererRoot, "components", "ContentWorkbench.tsx"), "utf8");
const generationView = fs.readFileSync(path.join(rendererRoot, "components", "content", "ArticleGenerationView.tsx"), "utf8");
const generationFeature = fs.readFileSync(path.join(rendererRoot, "features", "content", "content-generation-feature.js"), "utf8");
const composition = fs.readFileSync(path.join(__dirname, "..", "desktop", "composition", "content-production-composition.js"), "utf8");

it("content production exposes customer generation instead of the old single-article concept", () => {
  assert.match(workbench, /"questions" \| "client" \| "batch"/);
  assert.match(workbench, /\? "客户生成"/);
  assert.doesNotMatch(workbench, /单篇生成/);
  assert.match(workbench, /if \(value === "single"\) return "client";/, "old local tab preference should migrate once without retaining the old product concept");
});

it("customer generation exposes controlled concurrency and task progress without an embedded article editor", () => {
  assert.match(generationView, /aria-label="客户生成并发数"/);
  assert.match(generationView, /\[1, 2, 3, 4\]/);
  assert.match(generationView, /aria-label="客户生成任务进度"/);
  assert.match(generationView, /后台生成中，可切换到其他客户继续操作/);
  assert.match(generationView, /成功文章已保存到文章库/);
  assert.doesNotMatch(generationView, /GeneratedArticleEditorPanel/);
  assert.match(generationView, /function ClientGenerationView\(/, "client and batch modes must keep stable React hook boundaries");
});

it("renderer tracks background client operations while main composition shares the AI execution scheduler", () => {
  assert.match(generationFeature, /subscribeOperation/);
  assert.match(generationFeature, /next\.clientId !== scope\.clientId/);
  assert.match(generationFeature, /void refresh\(\)/);
  assert.match(composition, /createGenerationExecutionScheduler/);
  assert.match(
    composition,
    /maxConcurrency:\s*value\.generationMaxConcurrency === undefined\s*\? 4/,
  );
  assert.match(composition, /aiExecutionService\.createClient\("batch-generation"\)/);
  assert.match(composition, /aiExecutionService\.createClient\(groupId\)/);
});
