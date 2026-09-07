const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");

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
