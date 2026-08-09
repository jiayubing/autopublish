const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

describe("renderer content generation static boundary", function () {
  it("keeps writing-template discovery independent from client research", function () {
    const source = fs.readFileSync(
      path.resolve(
        __dirname,
        "..",
        "media-workbench/src/components/content/ArticleGenerationView.tsx",
      ),
      "utf8",
    );
    assert.doesNotMatch(
      source,
      /listContentTemplateCatalog|listContentSubmissionPlatforms|listContentResearch/,
    );
    assert.match(source, /templateCatalog \|\|/);
    assert.doesNotMatch(source, /managementSubmissionPlatforms/);
    assert.doesNotMatch(source, /if \(!clientId\) \{[^}]*setTemplates\(\[\]\)/);
  });
});
