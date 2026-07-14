const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { buildPrompt } = require("../src/content/prompt-builder");

function input(overrides) {
  return Object.assign({
    platform: "ctrip",
    scenario: "榜单",
    client: {
      id: "client-1",
      name: "上海示例客户",
      knowledgeFiles: [{ name: "brand.md", content: "客户自述资料" }]
    },
    research: {
      question: "上海周边适合家庭的目的地有哪些？",
      answerText: "豆包回答：有若干公开信息可供核实。",
      references: [{ title: "公开资料", url: "https://example.com", snippet: "资料摘录" }]
    },
    template: {
      id: "ctrip_rank",
      platform: "ctrip",
      scenario: "榜单",
      name: "榜单模板",
      body: "以清晰榜单结构组织正文。"
    }
  }, overrides);
}

describe("prompt builder", function() {
  it("builds system and user prompts with four separated Chinese sections", function() {
    const prompt = buildPrompt(input());
    assert.deepStrictEqual(Object.keys(prompt), ["system", "user"]);
    ["【客户资料】", "【豆包搜索问题及回答】", "【豆包参考资料】", "【平台与文案模板要求】"].forEach(function(section) {
      assert.equal(prompt.user.includes(section), true);
    });
    assert.equal(prompt.user.includes("平台：ctrip"), true);
    assert.equal(prompt.user.includes("场景：榜单"), true);
    assert.equal(prompt.user.includes("模板正文：\n以清晰榜单结构组织正文。"), true);
    assert.equal(prompt.user.includes("客户自述资料"), true);
    assert.equal(prompt.user.includes("公开资料"), true);
  });

  it("states factual boundaries and does not turn references into official endorsement", function() {
    const prompt = buildPrompt(input());
    assert.match(prompt.system, /不得编造/);
    assert.match(prompt.system, /中性表达/);
    assert.match(prompt.system, /官方背书/);
    assert.match(prompt.user, /不得将参考资料写成客户官方背书/);
  });

  it("requires a publish-ready response without template scaffolding", function() {
    const prompt = buildPrompt(input());
    assert.match(prompt.system, /只输出可以直接发布的最终文章/);
    assert.match(prompt.system, /第一行直接输出文章标题/);
    assert.match(prompt.system, /不得原样作为文章内容输出/);
  });

  it("rejects construction when the Doubao answer is missing or empty", function() {
    [undefined, "", "  "].forEach(function(answerText) {
      assert.throws(function() {
        buildPrompt(input({ research: Object.assign({}, input().research, { answerText: answerText }) }));
      }, function(error) { return error.code === "RESEARCH_EMPTY_ANSWER"; });
    });
  });

  it("requires a non-empty string template body", function() {
    ["", "  ", {}, [], 1, null, undefined].forEach(function(body) {
      assert.throws(function() {
        buildPrompt(input({ template: Object.assign({}, input().template, { body: body }) }));
      }, function(error) { return error.code === "PROMPT_TEMPLATE_REQUIRED"; });
    });
  });

  it("keeps platform and scenario data-driven instead of using an industry taxonomy", function() {
    const prompt = buildPrompt(input({
      platform: "custom-platform",
      scenario: "季节专题",
      template: { id: "custom-season", platform: "custom-platform", scenario: "季节专题", name: "自定义模板", body: "按季节专题组织。" }
    }));
    assert.match(prompt.user, /平台：custom-platform/);
    assert.match(prompt.user, /场景：季节专题/);
    assert.doesNotMatch(prompt.user, /餐饮|住宿/);
  });

  it("keeps multiple research question, answer, and reference groups in stable order", function() {
    const prompt = buildPrompt(input({
      researches: [
        { id: "query-1", question: "Question one", answerText: "Answer one", references: [{ title: "Reference one", url: "https://one.example" }] },
        { id: "query-2", question: "Question two", answerText: "Answer two", references: [{ title: "Reference two", url: "https://two.example" }] }
      ],
      research: undefined
    }));
    const questionOne = prompt.user.indexOf("Question one");
    const answerOne = prompt.user.indexOf("Answer one");
    const referenceOne = prompt.user.indexOf("Reference one");
    const questionTwo = prompt.user.indexOf("Question two");
    const answerTwo = prompt.user.indexOf("Answer two");
    const referenceTwo = prompt.user.indexOf("Reference two");
    assert.ok(questionOne >= 0 && questionOne < answerOne && answerOne < referenceOne);
    assert.ok(referenceOne < questionTwo && questionTwo < answerTwo && answerTwo < referenceTwo);
  });

  it("rejects an empty or duplicated research id list", function() {
    [[], ["query-1", "query-1"]].forEach(function(researchQueryIds) {
      assert.throws(function() {
        buildPrompt(input({ researchQueryIds: researchQueryIds, researches: [input().research] }));
      }, function(error) { return error.code === "RESEARCH_QUERY_IDS_INVALID"; });
    });
  });
});
