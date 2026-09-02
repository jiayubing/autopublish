const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { createTemplateStore } = require("../src/content/template-store");
const { createContentGenerationBatchService } = require("../desktop/services/content-generation-batch-service");

function tempDirectory() { return fs.mkdtempSync(path.join(os.tmpdir(), "auto-publish-generation-contract-")); }
function write(root, relative, content) {
  const filename = path.join(root, relative);
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  fs.writeFileSync(filename, content, "utf8");
}

describe("template catalog to generation contract", function() {
  it("passes正文-only, v2 metadata, and legacy templates through one batch preview seam", async function() {
    const root = tempDirectory();
    const builtinRoot = path.join(root, "builtin");
    try {
      write(root, "templates/custom/body-only.md", "正文-only instruction\n");
      write(root, "templates/custom/metadata.md", "---\ndisplayName: 带元数据模板\nenabled: true\n---\n带元数据的正文\n");
      write(root, "templates/broken/broken.md", "---\nunknown: value\n---\n坏模板正文\n");
      write(builtinRoot, "legacy/legacy.md", "---\nplatform: legacy\nscenario: 旧版模板\nname: legacy-template\n---\n旧版正文\n");

      const templateStore = createTemplateStore(root, { builtinRoot: builtinRoot });
      const catalog = templateStore.listCatalog();
      assert.deepEqual(catalog.templates.map((item) => `${item.platformId}:${item.templateId}`).sort(), [
        "custom:body-only",
        "custom:metadata",
        "legacy:legacy-template",
      ]);
      assert.equal(catalog.diagnostics.some((item) => item.code === "TEMPLATE_FRONT_MATTER_INVALID" && item.templateId === "broken"), true);

      const service = createContentGenerationBatchService({
        workspaceRoot: root,
        templateStore,
        clientKnowledge: { getClient: () => ({ id: "client-1", name: "Fixture client" }) },
        materialStore: { listMaterials: async () => [{ id: "brand.md", status: "ready", content: "fixture material" }] },
        researchStore: { listResearch: () => [{ id: "q1", answerText: "fixture answer" }] },
        contentStore: { saveArticle: (article) => article, findByGenerationTaskId: () => ({ kind: "none" }) },
        aiProviderService: { getFingerprint: () => "fixture" },
        articleGeneratorFactory: (deps) => ({
          generateArticle: async (input) => {
            const template = deps.templateStore.getCatalogTemplate({ platformId: input.platform, templateId: input.templateId });
            assert.equal(typeof template.body, "string");
            return { id: `article-${input.templateId}`, title: "Fixture title", content: "Fixture body" };
          },
        }),
      });

      try {
        const preview = await service.preview({
          clientIds: ["client-1"],
          templates: catalog.templates.map((item) => ({ platform: item.platformId, templateId: item.templateId })),
          templateCatalogRevision: catalog.revision,
        });
        assert.equal(preview.executableTaskCount, 3);

        write(root, "templates/custom/body-only.md", "正文-only instruction updated\n");
        await assert.rejects(
          service.preview({ clientIds: ["client-1"], templates: [{ platform: "custom", templateId: "body-only" }], templateCatalogRevision: catalog.revision }),
          (error) => error.code === "GENERATION_TEMPLATE_STALE",
        );

        await assert.rejects(
          service.preview({ clientIds: ["client-1"], templates: [{ platform: "broken", templateId: "broken" }] }),
          (error) => error.code === "GENERATION_TEMPLATE_INVALID" && error.platformId === "broken" && error.templateId === "broken" && !String(error.message).includes(root),
        );

        const accepted = await service.createAndStartBatch({ clientIds: ["client-1"], templates: [{ platform: "custom", templateId: "body-only" }] });
        assert.equal(accepted.status, "running");
        let batch = accepted;
        for (let attempt = 0; attempt < 100 && batch.status !== "completed"; attempt += 1) {
          await new Promise((resolve) => setTimeout(resolve, 5));
          batch = await service.getBatch(accepted.id);
        }
        assert.equal(batch.status, "completed");
        assert.equal(batch.tasks[0].status, "succeeded");
      } finally {
        await service.dispose();
      }
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
