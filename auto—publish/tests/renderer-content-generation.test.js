const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function read(file) { return fs.readFileSync(path.resolve(__dirname, "..", file), "utf8"); }

describe("renderer content generation contract", function() {
  it("keeps writing-template discovery independent from client research", function() {
    const source = read("media-workbench/src/components/content/ArticleGenerationView.tsx");
    assert.doesNotMatch(source, /listContentTemplateCatalog|listContentSubmissionPlatforms|listContentResearch/);
    assert.match(source, /templateCatalog \|\|/);
    assert.doesNotMatch(source, /managementSubmissionPlatforms/);
    assert.doesNotMatch(source, /if \(!clientId\) \{[^}]*setTemplates\(\[\]\)/);
  });

  it("routes submission through article management instead of the obsolete single-article export picker", function() {
    const source = read("media-workbench/src/components/content/ArticleGenerationView.tsx");
    assert.doesNotMatch(source, /aria-label="导出平台"/);
    assert.doesNotMatch(source, /commands\.(previewExport|exportToSubmissionQueue)/);
    assert.doesNotMatch(source, /加入待投稿队列|投稿预检/);
  });

  it("labels template controls and distinguishes builtin/custom sources", function() {
    const source = read("media-workbench/src/components/content/ArticleGenerationView.tsx");
    assert.match(source, /写作模板平台/);
    assert.match(source, /写作模板/);
    assert.match(source, /templateSourceLabel/);
    assert.match(source, /显示内置模板/);
    assert.match(source, /displayName/);
  });

  it("keeps generation disabled when no client is selected and consumes scoped read snapshots", function() {
    const source = read("media-workbench/src/components/content/ArticleGenerationView.tsx");
    assert.match(source, /disabled=\{!materialIds\.length \|\| !selectedIds\.length \|\| !clientId/);
    assert.match(source, /researchByClient/);
  });
});
