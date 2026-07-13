const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { createAiContentService } = require("../desktop/services/ai-content-service");

function error(code, message) {
  const value = new Error(message || code);
  value.code = code;
  return value;
}

function createService(overrides) {
  const calls = [];
  const client = { id: "client-1", name: "Client", knowledgeFiles: [{ name: "facts.md", content: "facts" }] };
  const research = { id: "query-1", clientId: "client-1", question: "question", answerText: "answer", references: [] };
  const article = { id: "article-1", clientId: "client-1", title: "Title", content: "Body" };
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
    articleStore: {
      saveArticle: function(value) { calls.push("saveArticle"); return value; },
      listArticles: function(id) { calls.push("listArticles:" + id); return [article]; },
      getArticle: function(clientId, id) { calls.push("getArticle:" + clientId + ":" + id); return article; }
    },
    aiClientFactory: function() { calls.push("aiClientFactory"); return { complete: async function() { return "# Title\nBody"; } }; },
    articleGeneratorFactory: function(deps) { calls.push("articleGeneratorFactory"); return { generateArticle: async function(input) { calls.push("generate:" + input.clientId); return article; } }; },
    buildPrompt: function() { return { system: "s", user: "u" }; },
    createId: function() { return "article-1"; },
    seenIds: new Set()
  }, overrides || {});
  return { service: createAiContentService(deps), calls: calls, article: article };
}

describe("ai content service", function() {
  it("lists local content without creating an AI client", function() {
    const setup = createService();
    assert.deepStrictEqual(setup.service.listClients(), [{ id: "client-1", name: "Client", knowledgeFiles: [{ name: "facts.md", content: "facts" }] }]);
    assert.deepStrictEqual(setup.service.listResearch("client-1").map(function(item) { return item.id; }), ["query-1"]);
    assert.deepStrictEqual(setup.service.listTemplates("ctrip").map(function(item) { return item.id; }), ["template-1"]);
    assert.equal(setup.calls.includes("aiClientFactory"), false);
  });

  it("creates the AI client only while generating and saves separately", async function() {
    const setup = createService();
    const generated = await setup.service.generateArticle({ clientId: "client-1", researchQueryId: "query-1", platform: "ctrip", templateId: "template-1" });
    assert.equal(generated.id, "article-1");
    assert.equal(setup.calls.includes("aiClientFactory"), true);
    assert.deepStrictEqual(setup.service.saveArticle(generated), generated);
    assert.equal(setup.calls.includes("saveArticle"), true);
  });

  it("preserves safe AI configuration failures without touching local reads", async function() {
    const setup = createService({ aiClientFactory: function() { throw error("AI_CONFIG_INVALID", "AI client configuration is invalid"); } });
    assert.deepStrictEqual(setup.service.listGeneratedArticles("client-1").map(function(item) { return item.id; }), ["article-1"]);
    await assert.rejects(setup.service.generateArticle({ clientId: "client-1", researchQueryId: "query-1", platform: "ctrip", templateId: "template-1" }), function(value) {
      return value.code === "AI_CONFIG_INVALID" && !value.message.includes("key");
    });
  });

  it("rejects missing request identifiers before invoking dependencies", async function() {
    const setup = createService();
    await assert.rejects(setup.service.generateArticle({ clientId: "", researchQueryId: "query-1", platform: "ctrip", templateId: "template-1" }), function(value) {
      return value.code === "CONTENT_INPUT_INVALID";
    });
    assert.throws(function() { setup.service.getGeneratedArticle("client-1", ""); }, function(value) { return value.code === "CONTENT_INPUT_INVALID"; });
  });

  it("passes multiple research ids to the generator in the requested order", async function() {
    let generatedInput;
    const setup = createService({
      articleGeneratorFactory: function() {
        return { generateArticle: async function(input) { generatedInput = input; return setup.article; } };
      }
    });
    await setup.service.generateArticle({ clientId: "client-1", researchQueryIds: ["query-1", "query-2"], platform: "ctrip", templateId: "template-1" });
    assert.deepStrictEqual(generatedInput.researchQueryIds, ["query-1", "query-2"]);
  });

  it("rejects empty, duplicate, and oversized research id arrays at the service boundary", async function() {
    const setup = createService();
    const inputs = [[], ["query-1", "query-1"], Array.from({ length: 51 }, function(_, index) { return "query-" + index; })];
    for (const researchQueryIds of inputs) {
      await assert.rejects(setup.service.generateArticle({ clientId: "client-1", researchQueryIds: researchQueryIds, platform: "ctrip", templateId: "template-1" }), function(value) {
        return value.code === "CONTENT_INPUT_INVALID";
      });
    }
  });
});
