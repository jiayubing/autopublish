const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { describe, it } = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, "media-workbench/src", file), "utf8");

describe("renderer article management filters", () => {
  it("uses one six-stage navigation axis and one recycle-bin entry", () => {
    const workflow = read("article-workflow.ts");
    const content = read("components/ContentWorkbench.tsx");
    const list = read("components/content/GeneratedArticlesView.tsx");
    const tabs = read("components/content/ArticleStageTabs.tsx");
    assert.match(workflow, /pending_review.*pending_submission.*queued.*published.*failed.*trash/s);
    assert.doesNotMatch(content, /statusFilter|publicationFilter/);
    assert.doesNotMatch(list, /statusFilter|publicationFilter|PUBLICATION_STATUS_FILTERS|打开回收站|showTrash/);
    assert.match(tabs, /ARTICLE_WORKFLOW_STAGES\.map/);
    assert.doesNotMatch(list, /打开回收站/);
  });
});
