const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");

test("article library keeps publication action visible and removes the long body explanation", () => {
  const view = fs.readFileSync(
    path.join(root, "media-workbench/src/components/content/GeneratedArticlesView.tsx"),
    "utf8",
  );
  const list = fs.readFileSync(
    path.join(root, "media-workbench/src/components/content/GeneratedArticlesList.tsx"),
    "utf8",
  );

  assert.match(view, /overflow-x-hidden overflow-y-auto/);
  assert.match(
    list,
    /grid w-full max-w-full min-w-0 grid-cols-\[auto_auto_minmax\(0,1fr\)_auto\] items-start gap-3 p-3/,
  );
  assert.match(list, /<div className="min-w-0 overflow-hidden">/);
  assert.match(list, /className="shrink-0 self-center whitespace-nowrap rounded border/);
  assert.match(list, />发布详情<|\? '查看订单' : '发布详情'/);
  assert.doesNotMatch(list, /正文解释/);
  assert.doesNotMatch(list, /summarizeTemplateSnapshot/);
  assert.doesNotMatch(list, /sm:grid-cols-\[auto_auto_minmax\(0,1fr\)_auto\]/);
  assert.doesNotMatch(list, /sm:col-start-4/);
});

test("publication drawer delegates the persisted publication id to the main-process open command instead of rendering a long raw URL", () => {
  const drawer = fs.readFileSync(
    path.join(root, "media-workbench/src/components/content/PublicationHistoryDrawer.tsx"),
    "utf8",
  );
  assert.match(drawer, /onOpenPublicationUrl\?\.\(record\)/);
  assert.doesNotMatch(drawer, /window\.open\(/);
  assert.match(drawer, /打开发布链接/);
  assert.match(drawer, />发布链接</);
  assert.doesNotMatch(drawer, /<span className="break-all">\{remoteUrl\}<\/span>/);
});

test("article library routes uncertain publication handling to submission-center attention instead of owning reconciliation", () => {
  const drawer = fs.readFileSync(
    path.join(root, "media-workbench/src/components/content/PublicationHistoryDrawer.tsx"),
    "utf8",
  );
  const app = fs.readFileSync(
    path.join(root, "media-workbench/src/App.tsx"),
    "utf8",
  );
  const submissionCenter = fs.readFileSync(
    path.join(root, "media-workbench/src/components/PlatformWorkbench.tsx"),
    "utf8",
  );

  assert.doesNotMatch(drawer, /onReconcile/);
  assert.match(drawer, /onOpenAttention/);
  assert.match(drawer, /前往需处理事项/);
  assert.match(app, /setSubmissionCenterSection\("attention"\)/);
  assert.match(app, /initialSection=\{submissionCenterSection\}/);
  assert.match(submissionCenter, /useState<SubmissionCenterSection>\(initialSection\)/);
});
