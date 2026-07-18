const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { createTemplateCatalog } = require("../src/content/template-catalog");

function tempDirectory() { return fs.mkdtempSync(path.join(os.tmpdir(), "auto-publish-empty-client-")); }
function write(root, relative, content) {
  const filename = path.join(root, relative);
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  fs.writeFileSync(filename, content, "utf8");
}
function read(file) { return fs.readFileSync(path.resolve(__dirname, "..", file), "utf8"); }

describe("empty-client template discovery", function() {
  it("discovers custom templates from an empty-client workspace and refreshes the revision", function() {
    const root = tempDirectory();
    try {
      write(root, "templates/xiaohongshu/custom.md", "正文一\n");
      const first = createTemplateCatalog(root, { builtinRoot: false }).listCatalog();
      assert.deepEqual(first.platforms.map((item) => item.id), ["xiaohongshu"]);
      assert.deepEqual(first.templates.map((item) => item.templateId), ["custom"]);
      write(root, "templates/xiaohongshu/custom.md", "正文二\n");
      const second = createTemplateCatalog(root, { builtinRoot: false }).listCatalog();
      assert.notEqual(second.revision, first.revision);
      assert.equal(second.templates[0].body, "正文二");
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });

  it("loads catalog and submission platforms without a selected client", function() {
    const source = read("media-workbench/src/components/content/ArticleGenerationView.tsx");
    assert.doesNotMatch(source, /if \(!clientId\) \{ setResearch\(\[\]\); setTemplates\(\[\]\);/);
    assert.match(source, /listContentTemplateCatalog\(\)/);
    assert.match(source, /listContentSubmissionPlatforms\(\)/);
    assert.match(source, /当前工作区还没有客户|没有客户/);
  });

  it("provides an explicit refresh action for clients and templates", function() {
    const source = read("media-workbench/src/components/ContentWorkbench.tsx");
    assert.match(source, /刷新客户与模板/);
    assert.match(source, /listContentClients\(\)/);
    assert.match(source, /refreshToken/);
  });
});
