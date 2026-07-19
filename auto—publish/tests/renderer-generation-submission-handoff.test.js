const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function read(file) { return fs.readFileSync(path.resolve(__dirname, "..", file), "utf8"); }

describe("renderer generation submission handoff", function() {
  it("exposes one batch-level queue handoff with one target selection and one confirmation", function() {
    const detail = read("media-workbench/src/components/content/GenerationBatchDetail.tsx");
    const drawer = read("media-workbench/src/components/content/GenerationSubmissionHandoffDrawer.tsx");
    const api = read("media-workbench/src/electron-api.ts");
    const preload = read("desktop/preload.js");
    assert.match(detail, /将成功文章加入投稿队列/);
    assert.match(drawer, /检查并确认/);
    assert.match(drawer, /targetPlatformIds/);
    assert.match(drawer, /失败客户|重试未完成客户/);
    assert.match(api, /previewGenerationSubmissionHandoff/);
    assert.match(api, /commitGenerationSubmissionHandoff/);
    assert.match(preload, /generation-submission-handoff/);
  });

  it("keeps the handoff separate from remote publishing", function() {
    const drawer = read("media-workbench/src/components/content/GenerationSubmissionHandoffDrawer.tsx");
    assert.match(drawer, /不自动发布|不执行远端发布|投稿队列/);
    assert.doesNotMatch(drawer, /submitSelectedPlan|远端发布适配器/);
  });
});
