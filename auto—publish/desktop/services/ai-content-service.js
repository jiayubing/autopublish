const { listClients, getClient } = require("../../src/content/client-knowledge");
const { createResearchStore } = require("../../src/content/research-store");
const { createTemplateStore } = require("../../src/content/template-store");
const { createArticleStore } = require("../../src/content/article-store");
const { createArticleReviewService } = require("../../src/content/article-review-service");
const { createAiClient } = require("../../src/content/ai-client");
const { createArticleGenerator } = require("../../src/content/article-generator");
const { createClientMaterialStore } = require("../../src/content/client-material-store");
const { buildPrompt } = require("../../src/content/prompt-builder");
const crypto = require("crypto");

function contentError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function assertId(value, label) {
  if (typeof value !== "string" || !value.trim()) {
    throw contentError("CONTENT_INPUT_INVALID", label + " is required");
  }
}

function normalizeResearchQueryIds(input) {
  const ids = input.researchQueryIds === undefined ? [input.researchQueryId] : input.researchQueryIds;
  if (!Array.isArray(ids) || ids.length < 1 || ids.length > 50) {
    throw contentError(ids && Array.isArray(ids) && ids.length === 0 ? "GEO_RESEARCH_REQUIRED" : "CONTENT_INPUT_INVALID", "At least one GEO research answer is required");
  }
  const seen = new Set();
  ids.forEach(function(id) {
    if (typeof id !== "string" || !id.trim() || seen.has(id)) {
      throw contentError("CONTENT_INPUT_INVALID", "Research ids must be non-empty and unique");
    }
    seen.add(id);
  });
  return ids.slice();
}

function normalizeMaterialIds(input) {
  const ids = input.materialIds;
  if (!Array.isArray(ids) || ids.length < 1 || ids.length > 50) {
    throw contentError("CLIENT_MATERIAL_REQUIRED", "At least one client material is required");
  }
  const seen = new Set();
  ids.forEach(function(id) {
    if (typeof id !== "string" || !id.trim() || id.includes("/") || id.includes("\\") || seen.has(id)) {
      throw contentError("CLIENT_MATERIAL_INVALID", "Selected client material is invalid");
    }
    seen.add(id);
  });
  return ids.slice();
}

function clientDto(client) {
  const value = Object.assign({}, client);
  delete value.directory;
  value.knowledgeFiles = Array.isArray(client && client.knowledgeFiles)
    ? client.knowledgeFiles.map(function(file) { return { name: file.name, content: file.content }; })
    : [];
  return value;
}

function createAiContentService(opts) {
  const options = opts || {};
  if (typeof options.workspaceRoot !== "string" && !options.clientKnowledge) {
    throw contentError("CONTENT_SERVICE_INVALID", "Workspace root is required");
  }
  const workspaceRoot = options.workspaceRoot;
  const clientKnowledge = options.clientKnowledge || {
    listClients: function() { return listClients(workspaceRoot); },
    getClient: function(id) { return getClient(workspaceRoot, id); }
  };
  const researchStore = options.researchStore || createResearchStore(workspaceRoot);
  const templateStore = options.templateStore || createTemplateStore(workspaceRoot);
  const articleStore = options.articleStore || createArticleStore(workspaceRoot);
  const articleReviewService = options.articleReviewService || createArticleReviewService({ articleStore: articleStore });
  const materialStore = options.materialStore || (workspaceRoot ? createClientMaterialStore({ workspaceRoot: workspaceRoot }) : {
    getSelectedMaterials: async function(clientId, materialIds) {
      const client = clientKnowledge.getClient(clientId);
      const files = Array.isArray(client && client.knowledgeFiles) ? client.knowledgeFiles : [];
      return materialIds.map(function(id) {
        const item = files.find(function(file) { return file && (file.id === id || file.name === id); });
        if (!item || typeof item.content !== "string" || !item.content.trim()) {
          throw contentError("CLIENT_MATERIAL_INVALID", "Selected client material is invalid");
        }
        return Object.assign({ id: item.id || item.name, extension: "", status: "ready", source: "text" }, item);
      });
    }
  });
  const aiClientFactory = options.aiClientFactory || function() { return createAiClient(); };
  const articleGeneratorFactory = options.articleGeneratorFactory || createArticleGenerator;
  const promptBuilder = options.buildPrompt || buildPrompt;
  const createId = options.createId || function() { return crypto.randomUUID(); };
  const seenIds = options.seenIds || new Set();

  function listClientsSafe() {
    return clientKnowledge.listClients().map(clientDto);
  }

  function getClientSafe(clientId) {
    assertId(clientId, "Client id");
    return clientDto(clientKnowledge.getClient(clientId));
  }

  function listResearch(clientId) {
    assertId(clientId, "Client id");
    return researchStore.listResearch(clientId);
  }

  function getResearch(clientId, researchId) {
    assertId(clientId, "Client id");
    assertId(researchId, "Research id");
    return researchStore.getResearch(clientId, researchId);
  }

  function listTemplates(platform) {
    assertId(platform, "Platform");
    return templateStore.listTemplates(platform);
  }

  async function generateArticle(input) {
    const request = input || {};
    assertId(request.clientId, "Client id");
    const materialIds = normalizeMaterialIds(request);
    const researchQueryIds = normalizeResearchQueryIds(request);
    assertId(request.platform, "Platform");
    assertId(request.templateId, "Template id");
    const generator = articleGeneratorFactory({
      getClient: function(id) { return clientKnowledge.getClient(id); },
      researchStore: researchStore,
      materialStore: materialStore,
      templateStore: templateStore,
      buildPrompt: promptBuilder,
      aiClient: aiClientFactory(),
      createId: createId,
      seenIds: seenIds
    });
    return generator.generateArticle(Object.assign({}, request, { materialIds: materialIds, researchQueryIds: researchQueryIds }));
  }

  function saveArticle(article) {
    if (!article || typeof article !== "object" || Array.isArray(article)) {
      throw contentError("CONTENT_INPUT_INVALID", "Article is required");
    }
    return articleStore.saveArticle(article);
  }

  function listGeneratedArticles(clientId) {
    assertId(clientId, "Client id");
    return articleStore.listArticles(clientId);
  }

  function getGeneratedArticle(clientId, articleId) {
    assertId(clientId, "Client id");
    assertId(articleId, "Article id");
    return articleStore.getArticle(clientId, articleId);
  }

  function reviewArticles(selections) {
    return articleReviewService.reviewMany(selections);
  }

  return {
    listClients: listClientsSafe,
    getClient: getClientSafe,
    listResearch: listResearch,
    getResearch: getResearch,
    listTemplates: listTemplates,
    generateArticle: generateArticle,
    saveArticle: saveArticle,
    listGeneratedArticles: listGeneratedArticles,
    getGeneratedArticle: getGeneratedArticle,
    reviewArticles: reviewArticles
  };
}

module.exports = { createAiContentService };
