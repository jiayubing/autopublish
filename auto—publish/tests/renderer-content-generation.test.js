const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function read(file) { return fs.readFileSync(path.resolve(__dirname, "..", file), "utf8"); }

describe("renderer content generation contract", function() {
  it("keeps writing-template discovery independent from client research", function() {
    const source = read("media-workbench/src/components/content/ArticleGenerationView.tsx");
    assert.match(source, /listContentTemplateCatalog\(\)/);
    assert.match(source, /listContentSubmissionPlatforms\(\)/);
    assert.match(source, /if \(!clientId\) \{ setResearch\(\[\]\)/);
    assert.doesNotMatch(source, /if \(!clientId\) \{[^}]*setTemplates\(\[\]\)/);
  });

  it("labels template controls and distinguishes builtin/custom sources", function() {
    const source = read("media-workbench/src/components/content/ArticleGenerationView.tsx");
    assert.match(source, /写作模板平台/);
    assert.match(source, /写作模板/);
    assert.match(source, /内置只读/);
    assert.match(source, /自定义/);
    assert.match(source, /displayName/);
  });

  it("keeps generation disabled when no client is selected and ignores stale async responses", function() {
    const source = read("media-workbench/src/components/content/ArticleGenerationView.tsx");
    assert.match(source, /disabled=\{!materialIds\.length \|\| !selectedIds\.length \|\| !clientId/);
    assert.match(source, /let cancelled = false/);
    assert.match(source, /if \(cancelled\) return/);
  });
});
