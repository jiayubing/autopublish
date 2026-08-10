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

  it("refreshes clients and templates through the public workbench owner", async function() {
    const { createContentWorkbenchFeature } = await import(
      "../media-workbench/src/features/content/content-workbench-feature.js",
    );
    let refreshes = 0;
    const feature = createContentWorkbenchFeature({
      listClients: async () => [{ id: "client-1", name: "客户一" }],
      listTemplateCatalog: async () => {
        refreshes += 1;
        return { revision: `revision-${refreshes}`, platforms: [], templates: [], diagnostics: [] };
      },
      listQuestions: async () => [],
      listResearch: async () => [],
      loadManagement: async () => ({}),
      listPaidMediaBatches: async () => [],
      startPaidMediaBatch: async () => ({}),
      pausePaidMediaBatch: async () => ({}),
    });
    feature.setScope({ workspaceRuntimeId: "runtime-1" });
    await feature.refresh("manual");
    assert.equal(refreshes, 1);
    assert.equal(feature.getSnapshot().selectedClientId, "client-1");
    feature.dispose();
  });
});
