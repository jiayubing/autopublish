const crypto = require("crypto");

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

function isOutputScaffolding(line) {
  return /^(?:#{1,6}\s*)?(?:标题|文章标题|开头|正文|正文内容|结尾|收尾)\s*[:：]?\s*$/.test(line.trim()) ||
    /^---+$/.test(line.trim());
}

function isModelPreamble(line) {
  return /^(?:好的|当然|没问题|以下是|下面是|作为.{0,20}(?:编辑|助手)|我将根据|根据您提供)/.test(line.trim());
}

function parseArticle(value) {
  const cleaned = cleanMarkdown(value);
  let lines = cleaned.split(/\r?\n/).map(function(line) { return line.trimEnd(); });
  while (lines.length && (!lines[0].trim() || isOutputScaffolding(lines[0]))) lines.shift();
  if (lines.length && isModelPreamble(lines[0]) && lines.slice(1).some(isOutputScaffolding)) {
    lines.shift();
    while (lines.length && (!lines[0].trim() || isOutputScaffolding(lines[0]))) lines.shift();
  }
  lines = lines.filter(function(line) { return !isOutputScaffolding(line); });
  const first = lines.shift() || "";
  const heading = first.match(/^\s{0,3}#+\s+(.+)$/);
  const title = (heading ? heading[1] : first).trim();
  const content = lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!title || !content) throw generatorError("AI_EMPTY_RESPONSE", "AI response was empty");
  return { title: title, content: content };
}

function isSafeArticleId(value) {
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(value);
}

function normalizeResearchQueryIds(input) {
  const ids = input.researchQueryIds === undefined ? [input.researchQueryId] : input.researchQueryIds;
  if (!Array.isArray(ids) || ids.length < 1 || ids.length > 50) {
    throw generatorError("RESEARCH_QUERY_IDS_INVALID", "Research query ids must contain 1 to 50 items");
  }
  const seen = new Set();
  ids.forEach(function(id) {
    if (typeof id !== "string" || !id.trim() || seen.has(id)) {
      throw generatorError("RESEARCH_QUERY_IDS_INVALID", "Research query ids must be non-empty and unique");
    }
    seen.add(id);
  });
  return ids.slice();
}

function normalizeMaterialIds(input) {
  const ids = input.materialIds;
  if (!Array.isArray(ids) || ids.length < 1 || ids.length > 50) {
    throw generatorError("CLIENT_MATERIAL_REQUIRED", "At least one client material is required");
  }
  const seen = new Set();
  ids.forEach(function(id) {
    if (typeof id !== "string" || !id.trim() || id.includes("/") || id.includes("\\") || seen.has(id)) {
      throw generatorError("CLIENT_MATERIAL_INVALID", "Selected client material is invalid");
    }
    seen.add(id);
  });
  return ids.slice();
}

function cloneValue(value) {
  if (Array.isArray(value)) return value.map(cloneValue);
  if (!value || typeof value !== "object") return value;
  return Object.keys(value).reduce(function(copy, key) {
    copy[key] = cloneValue(value[key]);
    return copy;
  }, {});
}

function hashText(value) {
  return crypto.createHash("sha256").update(String(value), "utf8").digest("hex");
}

function materialSnapshot(material) {
  if (!material || material.status === "error" || typeof material.name !== "string" || !material.name.trim() ||
      typeof material.content !== "string" || !material.content.trim()) {
    throw generatorError("CLIENT_MATERIAL_INVALID", "Selected client material is invalid");
  }
  return {
    id: typeof material.id === "string" && material.id ? material.id : material.name,
    name: material.name,
    extension: typeof material.extension === "string" ? material.extension : "",
    content: material.content,
    contentHash: typeof material.contentHash === "string" && material.contentHash
      ? material.contentHash
      : (typeof material.sourceHash === "string" && material.sourceHash ? material.sourceHash : hashText(material.content)),
    source: typeof material.source === "string" && material.source
      ? material.source
      : (material.extension === ".docx" ? "docx" : "text")
  };
}

function snapshotTemplate(template, platform, templateId) {
  if (!template || typeof template.body !== "string" || !template.body.trim()) {
    throw generatorError("PROMPT_TEMPLATE_REQUIRED", "Template body is required");
  }
  return {
    platform: platform,
    id: templateId,
    name: typeof template.name === "string" ? template.name : "",
    scenario: typeof template.scenario === "string" ? template.scenario : "",
    body: template.body,
    bodyHash: typeof template.bodyHash === "string" && template.bodyHash ? template.bodyHash : hashText(template.body)
  };
}

function optionalProvenanceId(value, label) {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(value)) throw generatorError("GENERATION_PROVENANCE_INVALID", label + " is invalid");
  return value;
}

function snapshotResearch(queryId, research) {
  return {
    questionId: queryId,
    question: research.question,
    answerText: research.answerText,
    references: Array.isArray(research.references) ? research.references.map(function(reference) {
      const snapshot = { title: reference && reference.title, url: reference && reference.url };
      if (reference && Object.prototype.hasOwnProperty.call(reference, "snippet")) snapshot.snippet = cloneValue(reference.snippet);
      return snapshot;
    }) : [],
    collectedAt: research.collectedAt,
    collectionMethod: research.collectionMethod
  };
}

function createArticleGenerator(deps) {
  if (!deps || typeof deps.getClient !== "function" || !deps.researchStore ||
      typeof deps.researchStore.getResearch !== "function" || !deps.templateStore ||
      typeof deps.templateStore.getTemplate !== "function" || typeof deps.buildPrompt !== "function" ||
      !deps.aiClient || typeof deps.aiClient.complete !== "function" || typeof deps.createId !== "function" ||
      !deps.materialStore || typeof deps.materialStore.getSelectedMaterials !== "function") {
    throw generatorError("ARTICLE_GENERATOR_INVALID", "Article generator dependencies are invalid");
  }
  const now = typeof deps.now === "function" ? deps.now : function() { return new Date().toISOString(); };
  const seenIds = deps.seenIds instanceof Set ? deps.seenIds : new Set();

  function createUniqueId() {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const id = deps.createId();
      if (!isSafeArticleId(id)) throw generatorError("ARTICLE_ID_INVALID", "Generated article id is invalid");
      if (!seenIds.has(id)) {
        seenIds.add(id);
        return id;
      }
    }
    throw generatorError("ARTICLE_ID_DUPLICATE", "Generated article id is duplicated");
  }

  async function generateArticle(input) {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      throw generatorError("RESEARCH_QUERY_IDS_INVALID", "Article generation input is invalid");
    }
    const researchQueryIds = normalizeResearchQueryIds(input);
    const materialIds = normalizeMaterialIds(input);
    const client = deps.getClient(input.clientId);
    let materials;
    try {
      materials = await deps.materialStore.getSelectedMaterials(input.clientId, materialIds);
    } catch (error) {
      if (error && typeof error.code === "string" && (error.code === "CLIENT_MATERIAL_INVALID" || error.code === "CLIENT_MATERIAL_REQUIRED")) throw error;
      throw generatorError("CLIENT_MATERIAL_INVALID", "Selected client material is invalid");
    }
    if (!Array.isArray(materials) || materials.length !== materialIds.length) {
      throw generatorError("CLIENT_MATERIAL_INVALID", "Selected client material is invalid");
    }
    const materialSnapshots = materials.map(materialSnapshot);
    const researches = researchQueryIds.map(function(researchQueryId) {
      const research = deps.researchStore.getResearch(input.clientId, researchQueryId);
      if (!research || research.isAnswerComplete === false || !hasText(research.answerText)) {
        throw generatorError("RESEARCH_EMPTY_ANSWER", "Research answer is empty");
      }
      return research;
    });
    const template = deps.templateStore.getTemplate(input.platform, input.templateId);
    const scenario = input.scenario || template.scenario;
    const templateSnapshot = snapshotTemplate(template, input.platform, input.templateId);
    const prompt = deps.buildPrompt({
      client: client,
      materialItems: materials,
      research: researches[0],
      researchItems: researches,
      researchQueryIds: researchQueryIds,
      template: template,
      platform: input.platform,
      scenario: scenario
    });
    const output = await deps.aiClient.complete([
      { role: "system", content: prompt.system },
      { role: "user", content: prompt.user }
    ]);
    const article = parseArticle(output);
    const timestamp = now();
    return {
      id: createUniqueId(),
      clientId: input.clientId,
      researchQueryIds: researchQueryIds,
      researchSnapshots: researches.map(function(research, index) { return snapshotResearch(researchQueryIds[index], research); }),
      platform: input.platform,
      scenario: scenario,
      templateId: input.templateId,
      title: article.title,
      content: article.content,
      status: "generated",
      source: {
        client_material: materialSnapshots.length > 0,
        doubao_answer: researches.every(function(research) { return hasText(research.answerText); }),
        references: researches.some(function(research) { return Array.isArray(research.references) && research.references.length; }),
        template: Boolean(template && hasText(template.body))
      },
      createdAt: timestamp,
      materialSnapshots: materialSnapshots,
      templateSnapshot: templateSnapshot,
      generationBatchId: optionalProvenanceId(input.generationBatchId, "Generation batch id"),
      generationTaskId: optionalProvenanceId(input.generationTaskId, "Generation task id"),
      reviewedAt: null
    };
  }

  return { generateArticle: generateArticle };
}

module.exports = { createArticleGenerator };
