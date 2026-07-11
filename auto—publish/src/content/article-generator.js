function generatorError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function hasText(value) {
  return typeof value === "string" && Boolean(value.trim());
}

function cleanMarkdown(value) {
  return value.trim()
    .replace(/^```(?:markdown|md)?\s*\r?\n?/i, "")
    .replace(/\r?\n?```\s*$/, "")
    .trim();
}

function parseArticle(value) {
  const cleaned = cleanMarkdown(value);
  const lines = cleaned.split(/\r?\n/);
  const first = lines.shift() || "";
  const heading = first.match(/^\s{0,3}#+\s+(.+)$/);
  const title = (heading ? heading[1] : first).trim();
  const content = lines.join("\n").trim();
  if (!title || !content) throw generatorError("AI_EMPTY_RESPONSE", "AI response was empty");
  return { title: title, content: content };
}

function createArticleGenerator(deps) {
  if (!deps || typeof deps.getClient !== "function" || !deps.researchStore ||
      typeof deps.researchStore.getResearch !== "function" || !deps.templateStore ||
      typeof deps.templateStore.getTemplate !== "function" || typeof deps.buildPrompt !== "function" ||
      !deps.aiClient || typeof deps.aiClient.complete !== "function" || typeof deps.createId !== "function") {
    throw generatorError("ARTICLE_GENERATOR_INVALID", "Article generator dependencies are invalid");
  }
  const now = typeof deps.now === "function" ? deps.now : function() { return new Date().toISOString(); };

  async function generateArticle(input) {
    const client = deps.getClient(input.clientId);
    const research = deps.researchStore.getResearch(input.clientId, input.researchQueryId);
    if (!research || !hasText(research.answerText)) {
      throw generatorError("RESEARCH_EMPTY_ANSWER", "Research answer is empty");
    }
    const template = deps.templateStore.getTemplate(input.platform, input.templateId);
    const scenario = input.scenario || template.scenario;
    const prompt = deps.buildPrompt({ client: client, research: research, template: template, platform: input.platform, scenario: scenario });
    const output = await deps.aiClient.complete([
      { role: "system", content: prompt.system },
      { role: "user", content: prompt.user }
    ]);
    const article = parseArticle(output);
    const timestamp = now();
    return {
      id: deps.createId(),
      clientId: input.clientId,
      researchQueryId: input.researchQueryId,
      platform: input.platform,
      scenario: scenario,
      templateId: input.templateId,
      title: article.title,
      content: article.content,
      status: "generated",
      source: {
        client_material: Boolean(client && Array.isArray(client.knowledgeFiles) && client.knowledgeFiles.some(function(file) { return file && hasText(file.content); })),
        doubao_answer: hasText(research.answerText),
        references: Boolean(Array.isArray(research.references) && research.references.length),
        template: Boolean(template && hasText(template.body))
      },
      createdAt: timestamp
    };
  }

  return { generateArticle: generateArticle };
}

module.exports = { createArticleGenerator };
