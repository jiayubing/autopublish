const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { describe, it } = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, "media-workbench/src", file), "utf8");

describe("renderer published article trash flow", () => {
  it("explains published retention and keeps published articles out of trash actions", () => {
    const view = read("components/content/GeneratedArticlesView.tsx");
    const types = read("types/platform.ts");
    assert.match(view, /远端已发布内容不会撤回/);
    assert.match(view, /发布记录和标题快照会保留/);
    assert.match(view, /恢复文章不会自动恢复投稿队列/);
    assert.match(view, /workflow\?\.stage === ["']published["']/);
    assert.match(view, /!isPublishedArticle\(article\)/);
    assert.doesNotMatch(view, /onTrashPublishedArticle/);
    assert.match(types, /keep_local.*offer_trash.*auto_trash_requested.*auto_trash_blocked/s);
    assert.match(types, /IDENTITY_MISSING.*REMOVAL_BLOCKED.*REMOVAL_NEEDS_REPAIR/s);
    assert.match(view, /previewContentArticleRemoval/);
    assert.match(view, /trashContentArticles/);
  });
});
