const { listClients, getClient } = require("../../src/content/client-knowledge");
const { createResearchStore } = require("../../src/content/research-store");
const { createTemplateStore } = require("../../src/content/template-store");
const { createArticleStore } = require("../../src/content/article-store");
const { createAiClient } = require("../../src/content/ai-client");
const { createArticleGenerator } = require("../../src/content/article-generator");
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
    throw contentError("CONTENT_INPUT_INVALID", "Research ids must contain 1 to 50 items");
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
    const researchQueryIds = normalizeResearchQueryIds(request);
    assertId(request.platform, "Platform");
    assertId(request.templateId, "Template id");
    const generator = articleGeneratorFactory({
      getClient: function(id) { return clientKnowledge.getClient(id); },
      researchStore: researchStore,
      templateStore: templateStore,
      buildPrompt: promptBuilder,
      aiClient: aiClientFactory(),
      createId: createId,
      seenIds: seenIds
    });
    return generator.generateArticle(Object.assign({}, request, { researchQueryIds: researchQueryIds }));
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

  return {
    listClients: listClientsSafe,
    getClient: getClientSafe,
    listResearch: listResearch,
    getResearch: getResearch,
    listTemplates: listTemplates,
    generateArticle: generateArticle,
    saveArticle: saveArticle,
    listGeneratedArticles: listGeneratedArticles,
    getGeneratedArticle: getGeneratedArticle
  };
}

module.exports = { createAiContentService };
