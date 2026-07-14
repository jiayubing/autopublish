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
    materialStore: { getSelectedMaterials: async function() { return [{ id: "brand.md", name: "brand.md", extension: ".md", status: "ready", content: "Client material", contentHash: "material-hash", source: "text" }]; } },
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
      clientId: "client-1", materialIds: ["brand.md"], researchQueryId: "query-1", platform: "ctrip", templateId: "template-1"
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
    await assert.rejects(createArticleGenerator(deps).generateArticle({ clientId: "client-1", materialIds: ["brand.md"], researchQueryId: "query-1", platform: "ctrip", templateId: "template-1" }), function(value) {
      return value.code === "RESEARCH_EMPTY_ANSWER";
    });
    assert.deepStrictEqual(deps.calls, ["client:client-1"]);
  });

  it("surfaces empty AI output and does not manufacture an article", async function() {
    const deps = dependencies({ aiClient: { complete: async function() { throw error("AI_EMPTY_RESPONSE"); } } });
    await assert.rejects(createArticleGenerator(deps).generateArticle({ clientId: "client-1", materialIds: ["brand.md"], researchQueryId: "query-1", platform: "ctrip", templateId: "template-1" }), function(value) {
      return value.code === "AI_EMPTY_RESPONSE";
    });
  });

  it("removes markdown fences and derives a title from the first line", async function() {
    const deps = dependencies({ aiClient: { complete: async function() { return "```markdown\nPlain title\n\nBody text\n```"; } } });
    const article = await createArticleGenerator(deps).generateArticle({ clientId: "client-1", materialIds: ["brand.md"], researchQueryId: "query-1", platform: "ctrip", templateId: "template-1" });
    assert.equal(article.title, "Plain title");
    assert.equal(article.content, "Body text");
  });

  it("removes model preambles and template section markers from publishable output", async function() {
    const deps = dependencies({ aiClient: { complete: async function() {
      return "好的，作为严谨的内容编辑，我将为您创作文章。\n---\n### 标题\n\n榜单标题\n\n### 开头\n\n这是文章正文。\n\n### 结尾\n\n这是结尾。";
    } } });
    const article = await createArticleGenerator(deps).generateArticle({ clientId: "client-1", materialIds: ["brand.md"], researchQueryId: "query-1", platform: "ctrip", templateId: "template-1" });
    assert.equal(article.title, "榜单标题");
    assert.equal(article.content, "这是文章正文。\n\n这是结尾。");
  });

  it("creates a new id for repeated inputs and derives source flags from supplied data", async function() {
    let nextId = 0;
    const deps = dependencies({
      getClient: function() { return { id: "client-1", knowledgeFiles: [] }; },
      researchStore: { getResearch: function() { return { answerText: "Research answer", references: [] }; } },
      createId: function() { nextId += 1; return "article-" + nextId; }
    });
    const generator = createArticleGenerator(deps);
    const input = { clientId: "client-1", materialIds: ["brand.md"], researchQueryId: "query-1", platform: "ctrip", templateId: "template-1" };
    const first = await generator.generateArticle(input);
    const second = await generator.generateArticle(input);
    assert.notEqual(first.id, second.id);
    assert.deepStrictEqual(first.source, { client_material: true, doubao_answer: true, references: false, template: true });
  });

  it("retries a duplicate generated id instead of returning it twice", async function() {
    const ids = ["article-1", "article-1", "article-2"];
    const generator = createArticleGenerator(dependencies({ createId: function() { return ids.shift(); } }));
    const input = { clientId: "client-1", materialIds: ["brand.md"], researchQueryId: "query-1", platform: "ctrip", templateId: "template-1" };
    assert.equal((await generator.generateArticle(input)).id, "article-1");
    assert.equal((await generator.generateArticle(input)).id, "article-2");
  });

  it("rejects unsafe ids and an id generator that cannot escape duplicates", async function() {
    const input = { clientId: "client-1", materialIds: ["brand.md"], researchQueryId: "query-1", platform: "ctrip", templateId: "template-1" };
    await assert.rejects(createArticleGenerator(dependencies({ createId: function() { return " "; } })).generateArticle(input), function(value) {
      return value.code === "ARTICLE_ID_INVALID";
    });
    const generator = createArticleGenerator(dependencies({ createId: function() { return "article-1"; } }));
    await generator.generateArticle(input);
    await assert.rejects(generator.generateArticle(input), function(value) { return value.code === "ARTICLE_ID_DUPLICATE"; });
  });

  it("reads multiple research records in order and returns safe immutable snapshots", async function() {
    const calls = [];
    const researchById = {
      "query-1": { id: "query-1", question: "Question one", answerText: "Answer one", references: [{ title: "Reference one", url: "https://one.example", snippet: "Snippet one", secret: "do-not-copy" }], collectedAt: "2026-07-12T00:00:00.000Z", collectionMethod: "automatic", apiKey: "do-not-copy" },
      "query-2": { id: "query-2", question: "Question two", answerText: "Answer two", references: [], collectedAt: "2026-07-12T00:01:00.000Z", collectionMethod: "manual", clientKnowledge: "do-not-copy" }
    };
    const deps = dependencies({
      researchStore: { getResearch: function(clientId, queryId) { calls.push(queryId); return researchById[queryId]; } },
      templateStore: { getTemplate: function() { calls.push("template"); return { id: "template-1", scenario: "Guide", body: "Template instructions" }; } },
      buildPrompt: function(value) { calls.push("prompt"); assert.deepStrictEqual(value.researchItems, [researchById["query-1"], researchById["query-2"]]); return { system: "System", user: "User" }; },
      aiClient: { complete: async function() { calls.push("ai"); return "# Article title\n\nArticle body"; } }
    });
    const article = await createArticleGenerator(deps).generateArticle({
      clientId: "client-1", materialIds: ["brand.md"], researchQueryIds: ["query-1", "query-2"], platform: "ctrip", templateId: "template-1"
    });
    assert.deepStrictEqual(calls, ["query-1", "query-2", "template", "prompt", "ai"]);
    assert.deepStrictEqual(article.researchQueryIds, ["query-1", "query-2"]);
    assert.deepStrictEqual(article.researchSnapshots, [
      { questionId: "query-1", question: "Question one", answerText: "Answer one", references: [{ title: "Reference one", url: "https://one.example", snippet: "Snippet one" }], collectedAt: "2026-07-12T00:00:00.000Z", collectionMethod: "automatic" },
      { questionId: "query-2", question: "Question two", answerText: "Answer two", references: [], collectedAt: "2026-07-12T00:01:00.000Z", collectionMethod: "manual" }
    ]);
    researchById["query-1"].references[0].title = "Changed later";
    assert.equal(article.researchSnapshots[0].references[0].title, "Reference one");
    assert.equal(Object.prototype.hasOwnProperty.call(article.researchSnapshots[0], "apiKey"), false);
  });

  it("deeply clones object and array reference snippets in research snapshots", async function() {
    const source = {
      id: "query-1",
      question: "Question one",
      answerText: "Answer one",
      references: [
        { title: "Object reference", url: "https://one.example", snippet: { highlights: ["one"] } },
        { title: "Array reference", url: "https://two.example", snippet: [{ text: "two" }] }
      ],
      collectedAt: "2026-07-12T00:00:00.000Z",
      collectionMethod: "automatic"
    };
    const deps = dependencies({
      researchStore: { getResearch: function() { return source; } }
    });
    const article = await createArticleGenerator(deps).generateArticle({
      clientId: "client-1", materialIds: ["brand.md"], researchQueryIds: ["query-1"], platform: "ctrip", templateId: "template-1"
    });
    source.references[0].snippet.highlights[0] = "changed";
    source.references[1].snippet[0].text = "changed";
    assert.deepStrictEqual(article.researchSnapshots[0].references, [
      { title: "Object reference", url: "https://one.example", snippet: { highlights: ["one"] } },
      { title: "Array reference", url: "https://two.example", snippet: [{ text: "two" }] }
    ]);
  });

  it("blocks any empty answer before template or AI access", async function() {
    const deps = dependencies({
      researchStore: { getResearch: function(clientId, queryId) { return queryId === "query-2" ? { id: queryId, answerText: "  " } : { id: queryId, answerText: "Answer one" }; } }
    });
    await assert.rejects(createArticleGenerator(deps).generateArticle({
      clientId: "client-1", materialIds: ["brand.md"], researchQueryIds: ["query-1", "query-2"], platform: "ctrip", templateId: "template-1"
    }), function(value) { return value.code === "RESEARCH_EMPTY_ANSWER"; });
    assert.deepStrictEqual(deps.calls, ["client:client-1"]);
  });

  it("rejects empty, duplicate, and oversized research id lists", async function() {
    const generator = createArticleGenerator(dependencies());
    const inputs = [[], ["query-1", "query-1"], Array.from({ length: 51 }, function(_, index) { return "query-" + index; })];
    for (const researchQueryIds of inputs) {
      await assert.rejects(generator.generateArticle({ clientId: "client-1", materialIds: ["brand.md"], researchQueryIds: researchQueryIds, platform: "ctrip", templateId: "template-1" }), function(value) {
        return value.code === "RESEARCH_QUERY_IDS_INVALID";
      });
    }
  });

  it("loads explicitly selected materials and persists material, template, batch, and task snapshots", async function() {
    let promptInput;
    const deps = dependencies({
      materialStore: {
        getSelectedMaterials: async function(clientId, materialIds) {
          assert.equal(clientId, "client-1");
          assert.deepStrictEqual(materialIds, ["brand.md"]);
          return [{
            id: "brand.md", name: "brand.md", extension: ".md", status: "ready",
            content: "Client material", contentHash: "material-hash", source: "text"
          }];
        }
      },
      buildPrompt: function(value) {
        promptInput = value;
        return { system: "System", user: "User" };
      },
      templateStore: { getTemplate: function() {
        return { id: "template-1", platform: "ctrip", scenario: "Guide", name: "Guide", body: "Template instructions", bodyHash: "template-hash" };
      } }
    });
    const article = await createArticleGenerator(deps).generateArticle({
      clientId: "client-1", materialIds: ["brand.md"], researchQueryIds: ["query-1"],
      platform: "ctrip", templateId: "template-1", generationBatchId: "batch-1", generationTaskId: "task-1"
    });
    assert.deepStrictEqual(promptInput.materialItems.map(function(item) { return item.name; }), ["brand.md"]);
    assert.deepStrictEqual(article.materialSnapshots, [{
      id: "brand.md", name: "brand.md", extension: ".md", content: "Client material",
      contentHash: "material-hash", source: "text"
    }]);
    assert.equal(article.templateSnapshot.platform, "ctrip");
    assert.equal(article.templateSnapshot.id, "template-1");
    assert.equal(article.templateSnapshot.body, "Template instructions");
    assert.equal(article.templateSnapshot.bodyHash, "template-hash");
    assert.equal(article.generationBatchId, "batch-1");
    assert.equal(article.generationTaskId, "task-1");
    assert.equal(article.reviewedAt, null);
  });

  it("rejects missing or damaged selected materials before AI access", async function() {
    for (const materialStore of [
      { getSelectedMaterials: async function() { return []; } },
      { getSelectedMaterials: async function() { return [{ id: "brand.md", status: "error", error: { code: "MATERIAL_READ_FAILED" } }]; } }
    ]) {
      const deps = dependencies({ materialStore: materialStore });
      await assert.rejects(createArticleGenerator(deps).generateArticle({
        clientId: "client-1", materialIds: ["brand.md"], researchQueryId: "query-1", platform: "ctrip", templateId: "template-1"
      }), function(value) { return value.code === "CLIENT_MATERIAL_INVALID"; });
      assert.equal(deps.calls.includes("ai"), false);
    }
  });
});
