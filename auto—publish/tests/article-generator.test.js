const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { createArticleGenerator } = require("../src/content/article-generator");

function error(code) {
  const value = new Error(code);
  value.code = code;
  return value;
}

function dependencies(overrides) {
  const calls = [];
  const client = { id: "client-1", knowledgeFiles: [{ name: "brand.md", content: "Client material" }] };
  const research = { id: "query-1", answerText: "Research answer", references: [{ title: "Reference", url: "https://example.com" }] };
  const template = { id: "template-1", scenario: "Guide", body: "Template instructions" };
  return Object.assign({
    calls: calls,
    getClient: function(id) { calls.push("client:" + id); return client; },
    researchStore: { getResearch: function(clientId, queryId) { calls.push("research:" + clientId + ":" + queryId); return research; } },
    templateStore: { getTemplate: function(platform, templateId) { calls.push("template:" + platform + ":" + templateId); return template; } },
    buildPrompt: function(input) { calls.push("prompt"); return { system: "System", user: "User" }; },
    aiClient: { complete: async function(messages) { calls.push("ai"); return "# Article title\n\nArticle body"; } },
    createId: function() { return "article-" + (calls.filter(function(call) { return call === "ai"; }).length); },
    now: function() { return "2026-07-11T00:00:00.000Z"; }
  }, overrides || {});
}

describe("article generator", function() {
  it("loads dependencies in order, cleans markdown, and returns a generated article", async function() {
    const deps = dependencies();
    const article = await createArticleGenerator(deps).generateArticle({
      clientId: "client-1", researchQueryId: "query-1", platform: "ctrip", templateId: "template-1"
    });
    assert.deepStrictEqual(deps.calls, ["client:client-1", "research:client-1:query-1", "template:ctrip:template-1", "prompt", "ai"]);
    assert.equal(article.id, "article-1");
    assert.equal(article.title, "Article title");
    assert.equal(article.content, "Article body");
    assert.equal(article.status, "generated");
    assert.deepStrictEqual(article.source, { client_material: true, doubao_answer: true, references: true, template: true });
    assert.equal(Object.prototype.hasOwnProperty.call(article, "prompt"), false);
  });

  it("blocks an empty research answer before template or AI access", async function() {
    const deps = dependencies({ researchStore: { getResearch: function() { return { answerText: "  " }; } } });
    await assert.rejects(createArticleGenerator(deps).generateArticle({ clientId: "client-1", researchQueryId: "query-1", platform: "ctrip", templateId: "template-1" }), function(value) {
      return value.code === "RESEARCH_EMPTY_ANSWER";
    });
    assert.deepStrictEqual(deps.calls, ["client:client-1"]);
  });

  it("surfaces empty AI output and does not manufacture an article", async function() {
    const deps = dependencies({ aiClient: { complete: async function() { throw error("AI_EMPTY_RESPONSE"); } } });
    await assert.rejects(createArticleGenerator(deps).generateArticle({ clientId: "client-1", researchQueryId: "query-1", platform: "ctrip", templateId: "template-1" }), function(value) {
      return value.code === "AI_EMPTY_RESPONSE";
    });
  });

  it("removes markdown fences and derives a title from the first line", async function() {
    const deps = dependencies({ aiClient: { complete: async function() { return "```markdown\nPlain title\n\nBody text\n```"; } } });
    const article = await createArticleGenerator(deps).generateArticle({ clientId: "client-1", researchQueryId: "query-1", platform: "ctrip", templateId: "template-1" });
    assert.equal(article.title, "Plain title");
    assert.equal(article.content, "Body text");
  });

  it("creates a new id for repeated inputs and derives source flags from supplied data", async function() {
    let nextId = 0;
    const deps = dependencies({
      getClient: function() { return { id: "client-1", knowledgeFiles: [] }; },
      researchStore: { getResearch: function() { return { answerText: "Research answer", references: [] }; } },
      createId: function() { nextId += 1; return "article-" + nextId; }
    });
    const generator = createArticleGenerator(deps);
    const input = { clientId: "client-1", researchQueryId: "query-1", platform: "ctrip", templateId: "template-1" };
    const first = await generator.generateArticle(input);
    const second = await generator.generateArticle(input);
    assert.notEqual(first.id, second.id);
    assert.deepStrictEqual(first.source, { client_material: false, doubao_answer: true, references: false, template: true });
  });
});
