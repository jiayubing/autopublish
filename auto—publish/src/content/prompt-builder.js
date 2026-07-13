function promptError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function text(value) {
  return value == null ? "" : String(value);
}

function formatKnowledge(files) {
  if (!Array.isArray(files) || !files.length) return "（无客户知识库资料）";
  return files.map(function(file) {
    return "资料文件：" + text(file && file.name) + "\n" + text(file && file.content);
  }).join("\n\n");
}

function formatReferences(references) {
  if (!Array.isArray(references) || !references.length) return "（无参考资料）";
  return references.map(function(reference) {
    return "来源：" + text(reference && reference.title) +
      "\n网址：" + text(reference && reference.url) +
      (reference && reference.snippet ? "\n摘要：" + text(reference.snippet) : "");
  }).join("\n\n");
}

function normalizeResearchQueryIds(input) {
  if (input.researchQueryIds === undefined && input.researchQueryId === undefined) return null;
  const ids = input.researchQueryIds === undefined ? [input.researchQueryId] : input.researchQueryIds;
  if (!Array.isArray(ids) || ids.length < 1 || ids.length > 50) {
    throw promptError("RESEARCH_QUERY_IDS_INVALID", "Research query ids must contain 1 to 50 items");
  }
  const seen = new Set();
  ids.forEach(function(id) {
    if (typeof id !== "string" || !id.trim() || seen.has(id)) {
      throw promptError("RESEARCH_QUERY_IDS_INVALID", "Research query ids must be non-empty and unique");
    }
    seen.add(id);
  });
  return ids.slice();
}

function normalizeResearches(input, ids) {
  const researches = input.researchItems !== undefined
    ? input.researchItems
    : (input.researches === undefined ? [input.research] : input.researches);
  if (!Array.isArray(researches) || researches.length < 1 || researches.length > 50 || (ids && ids.length !== researches.length)) {
    throw promptError("RESEARCH_QUERY_IDS_INVALID", "Research queries must contain 1 to 50 matching items");
  }
  researches.forEach(function(research) {
    if (!research || typeof research.answerText !== "string" || !research.answerText.trim()) {
      throw promptError("RESEARCH_EMPTY_ANSWER", "Doubao answer is required to build a prompt");
    }
  });
  return researches;
}

function buildPrompt(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw promptError("PROMPT_INVALID_INPUT", "Prompt input is invalid");
  }

  const researchQueryIds = normalizeResearchQueryIds(input);
  const researches = normalizeResearches(input, researchQueryIds);
  const research = researches[0];

  const client = input.client || {};
  const template = input.template || {};
  const platform = text(input.platform || template.platform);
  const scenario = text(input.scenario || template.scenario);
  if (!platform || !scenario || typeof template.body !== "string" || !template.body.trim()) {
    throw promptError("PROMPT_TEMPLATE_REQUIRED", "Platform, scenario, and template body are required");
  }

  const researchGroups = researches.map(function(item, index) {
    const id = researchQueryIds ? "\nID: " + text(researchQueryIds[index]) : "";
    return "\u3010\u8c46\u5305\u95ee\u9898 " + String(index + 1) + "\u3011" + id +
      "\n\u95ee\u9898\uff1a" + text(item.question || "未提供") +
      "\n\u56de\u7b54\uff1a" + text(item.answerText) +
      "\n\u53c2\u8003\u8d44\u6599\uff1a\n" + formatReferences(item.references);
  }).join("\n\n");

  const system = [
    "你是严谨的内容编辑。没有提供的信息不得编造。",
    "不确定的信息使用中性表达，不把推测写成事实。",
    "参考资料只能用于核对，不得自动写成客户官方背书。",
    "平台、场景和模板正文是明确的写作约束，优先遵循模板要求。"
  ].join("\n");

  const userSections = [
    "【客户资料】\n客户：" + text(client.name || client.id || "未提供") + "\n" + formatKnowledge(client.knowledgeFiles),
    "【豆包搜索问题及回答】\n问题：" + text(research.question || "未提供") + "\n回答：" + text(research.answerText),
    "【豆包参考资料】\n" + formatReferences(research.references) + "\n\n不得将参考资料写成客户官方背书。",
    "【平台与文案模板要求】\n平台：" + platform + "\n场景：" + scenario +
      "\n模板 ID：" + text(template.id) + "\n模板名称：" + text(template.name) +
      "\n模板正文：\n" + text(template.body)
  ];
  const researchHeader = userSections[1].split("\n")[0];
  const referencesHeader = userSections[2].split("\n")[0];
  userSections[1] = researchHeader + "\n" + researchGroups;
  userSections[2] = referencesHeader + "\n不得将参考资料写成客户官方背书。";
  const user = userSections.join("\n\n");
  return { system: system, user: user };
}

module.exports = { buildPrompt };
