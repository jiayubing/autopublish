const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { createAiContentService } = require("../desktop/services/ai-content-service");
function createService(overrides) {
  const calls = [];
  const client = { id: "client-1", name: "Client", knowledgeFiles: [{ name: "facts.md", content: "facts" }] };
  const research = { id: "query-1", clientId: "client-1", question: "question", answerText: "answer", references: [] };
  const article = {
    id: "article-1", clientId: "client-1", title: "Title", content: "Body", status: "generated",
    source: { client_material: true, doubao_answer: true, references: false, template: true },
    materialSnapshots: [{ id: "facts.md" }], researchSnapshots: [{ questionId: "query-1" }],
    templateSnapshot: { platform: "ctrip", id: "template-1", name: "Guide", scenario: "guide", body: "body", bodyHash: "hash" }
  };
  const deps = Object.assign({
    clientKnowledge: {
      listClients: function() { calls.push("listClients"); return [client]; },
      getClient: function(id) { calls.push("getClient:" + id); return client; }
    },
    researchStore: {
      listResearch: function(id) { calls.push("listResearch:" + id); return [research]; },
      getResearch: function(clientId, id) { calls.push("getResearch:" + clientId + ":" + id); return research; }
    },
    templateStore: { listTemplates: function(platform) { calls.push("listTemplates:" + platform); return [{ id: "template-1" }]; } },
    contentStore: {
      saveArticle: function(value) { calls.push("saveArticle"); return value; },
      listArticles: function(id) { calls.push("listArticles:" + id); return [article]; },
      getArticle: function(clientId, id) { calls.push("getArticle:" + clientId + ":" + id); return article; }
    },
  }, overrides || {});
  return { service: createAiContentService(deps), calls: calls, article: article };
}

describe("ai content service", function() {
  it("lists local content without AI configuration", async function() {
    const setup = createService();
    const clients = await setup.service.listClients();
    assert.deepStrictEqual(clients, [{ id: "client-1", name: "Client", knowledgeFiles: [{ name: "facts.md", content: "facts" }] }]);
    assert.deepStrictEqual(setup.service.listResearch("client-1").map(function(item) { return item.id; }), ["query-1"]);
    assert.deepStrictEqual(setup.service.listTemplates("ctrip").map(function(item) { return item.id; }), ["template-1"]);
    assert.equal(setup.service.listGeneratedArticles("client-1")[0].id, "article-1");
    assert.throws(() => setup.service.getGeneratedArticle("client-1", ""), { code: "CONTENT_INPUT_INVALID" });
  });

  it("exposes one file-driven template catalog for single and batch consumers", function() {
    const setup = createService({ templateStore: {
      listTemplates: function() { return []; },
      listCatalog: function() { return { revision: "fixture-revision", platforms: [{ id: "new-platform", displayName: "新平台", description: "", order: 0 }], templates: [{ id: "first-template", templateId: "first-template", platform: "new-platform", displayName: "first-template", scenario: "first-template", body: "body" }], diagnostics: [] }; }
    } });
    assert.equal(setup.service.listTemplateCatalog().revision, "fixture-revision");
  });

  it("exposes material metadata through the client DTO and retries one material", async function() {
    const material = {
      id: "bWVudS5kb2N4",
      name: "menu.docx",
      extension: ".docx",
      status: "error",
      content: "",
      characterCount: 0,
      error: { code: "MATERIAL_DOCX_CONVERSION_FAILED", message: "DOCX conversion failed" }
    };
    const setup = createService({
      materialStore: {
        listMaterials: async function() { return [material]; },
        retryMaterial: async function(clientId, materialId) {
          assert.equal(clientId, "client-1");
          assert.equal(materialId, material.id);
          return Object.assign({}, material, { status: "ready", content: "converted", characterCount: 9, error: null });
        },
        getSelectedMaterials: async function() { return []; }
      }
    });
    const clients = await setup.service.listClients();
    assert.deepStrictEqual(clients[0].knowledgeFiles, [material]);
    assert.deepStrictEqual(await setup.service.retryMaterial("client-1", material.id), {
      id: material.id,
      name: material.name,
      extension: material.extension,
      status: "ready",
      content: "converted",
      characterCount: 9,
      error: null
    });
  });

  it("does not expose retired review operations or a second generation owner", function() {
    const setup = createService();
    assert.equal("reviewArticles" in setup.service, false);
    assert.equal("generateArticle" in setup.service, false);
    assert.equal("getState" in setup.service, false);
  });

});
