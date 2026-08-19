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
  assert.match(list, /flex w-full max-w-full min-w-0 items-start gap-3 p-3/);
  assert.match(list, /<div className="min-w-0 flex-1">/);
  assert.match(list, /mt-2 flex min-w-0 flex-wrap items-center gap-2/);
  assert.match(list, />发布详情<|\? '查看订单' : '发布详情'/);
  assert.doesNotMatch(list, /正文解释/);
  assert.doesNotMatch(list, /summarizeTemplateSnapshot/);
  assert.doesNotMatch(list, /sm:grid-cols-\[auto_auto_minmax\(0,1fr\)_auto\]/);
  assert.doesNotMatch(list, /sm:col-start-4/);
});

test("publication drawer opens the remote page through Electron window-open handling instead of rendering a long raw URL", () => {
  const drawer = fs.readFileSync(
    path.join(root, "media-workbench/src/components/content/PublicationHistoryDrawer.tsx"),
    "utf8",
  );
  assert.match(drawer, /window\.open\(remoteUrl, "_blank", "noopener,noreferrer"\)/);
  assert.match(drawer, /打开发布链接/);
  assert.match(drawer, />发布链接</);
  assert.doesNotMatch(drawer, /<span className="break-all">\{remoteUrl\}<\/span>/);
});
