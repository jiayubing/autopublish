const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { describe, it } = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, "media-workbench/src", file), "utf8");

describe("renderer published article trash flow", () => {
  it("explains published retention and exposes confirmed trash disposition", () => {
    const view = read("components/content/GeneratedArticlesView.tsx");
    const types = read("types/platform.ts");
    const platform = [
      read("components/PlatformWorkbench.tsx"),
      read("components/PlatformSubmissionOverlays.tsx"),
    ].join("\n");
    assert.match(view, /远端已发布内容不会撤回/);
    assert.match(view, /发布记录和标题快照会保留/);
    assert.match(view, /恢复文章不会自动恢复投稿队列/);
    assert.match(view, /移入回收站/);
    assert.match(types, /keep_local.*offer_trash.*auto_trash_requested.*auto_trash_blocked/s);
    assert.match(types, /IDENTITY_MISSING.*REMOVAL_BLOCKED.*REMOVAL_NEEDS_REPAIR/s);
    assert.match(platform, /可移入回收站/);
    assert.match(platform, /reasonCodes/);
  });
});
