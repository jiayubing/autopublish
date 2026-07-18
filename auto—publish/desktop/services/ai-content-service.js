const { listClients, getClient } = require("../../src/content/client-knowledge");
const { createResearchStore } = require("../../src/content/research-store");
const { createTemplateStore } = require("../../src/content/template-store");
const { createArticleStore } = require("../../src/content/article-store");
const { createArticleTrashService } = require("../../src/content/article-trash-service");
const { createContentSubmissionService } = require("./content-submission-service");
const { createArticleReviewService } = require("../../src/content/article-review-service");
const { createAiClient } = require("../../src/content/ai-client");
const { createArticleGenerator } = require("../../src/content/article-generator");
const { createArticleVersionService } = require("../../src/content/article-version-service");
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
    ? client.knowledgeFiles.map(function(file) {
      const result = { name: file.name, content: file.content };
      ["id", "extension", "status", "characterCount", "error", "contentHash", "source"].forEach(function(key) {
        if (file && Object.prototype.hasOwnProperty.call(file, key)) result[key] = file[key];
      });
      return result;
    })
    : [];
  return value;
}

function createAiContentService(opts) {
  const options = opts || {};
  if (typeof options.workspaceRoot !== "string" && !options.clientKnowledge) {
    throw contentError("CONTENT_SERVICE_INVALID", "Workspace root is required");
  }
  const workspaceRoot = options.workspaceRoot;
  const paths = options.paths;
  const clientKnowledge = options.clientKnowledge || {
    listClients: function() { return listClients(workspaceRoot); },
    getClient: function(id) { return getClient(workspaceRoot, id); }
  };
  const researchStore = options.researchStore || createResearchStore(workspaceRoot, { paths: paths });
  const templateStore = options.templateStore || createTemplateStore(workspaceRoot, { paths: paths });
  const articleStore = options.articleStore || createArticleStore(workspaceRoot, { paths: paths });
  const contentSubmissionService = options.contentSubmissionService || (workspaceRoot ? createContentSubmissionService({
    workspaceRoot: workspaceRoot,
    paths: paths,
    articleStore: articleStore,
    publicationLedger: options.publicationLedger,
    batchStore: options.batchStore,
    platforms: options.platforms
  }) : null);
  const articleTrashService = options.articleTrashService || createArticleTrashService({
    articleStore: articleStore,
    workspaceRoot: workspaceRoot,
    submissionService: contentSubmissionService,
    transactionStore: options.articleRemovalTransactionStore,
    now: options.now,
    tokenTtlMs: options.articleRemovalTokenTtlMs,
    onTransactionStatus: options.onArticleRemovalTransaction
  });
  const articleReviewService = options.articleReviewService || createArticleReviewService({ articleStore: articleStore });
  const articleVersionService = options.articleVersionService || createArticleVersionService({
    articleStore: articleStore,
    createId: options.createId,
    now: options.now
  });
  const materialStore = options.materialStore || (workspaceRoot ? createClientMaterialStore({ workspaceRoot: workspaceRoot, paths: paths }) : {
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

  async function materializeClient(client) {
    const value = clientDto(client);
    if (materialStore && typeof materialStore.listMaterials === "function") {
      value.knowledgeFiles = await materialStore.listMaterials(client.id);
    }
    return clientDto(value);
  }

  async function listClientsSafe() {
    const clients = await clientKnowledge.listClients();
    return Promise.all(clients.map(materializeClient));
  }

  async function getClientSafe(clientId) {
    assertId(clientId, "Client id");
    return materializeClient(await clientKnowledge.getClient(clientId));
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
    if (platform !== undefined) assertId(platform, "Platform");
    if (typeof templateStore.listCatalog === "function") {
      const templates = templateStore.listCatalog().templates || [];
      return platform === undefined ? templates : templates.filter(function(template) { return template.platform === platform || template.platformId === platform; });
    }
    return templateStore.listTemplates(platform).map(function(template) {
      const safe = Object.assign({}, template);
      delete safe.sourcePath;
      return safe;
    });
  }

  function listTemplateCatalog() {
    if (!templateStore || typeof templateStore.listCatalog !== "function") throw contentError("TEMPLATE_CATALOG_UNAVAILABLE", "Template catalog is unavailable");
    return templateStore.listCatalog();
  }

  function copyBuiltinTemplate(input) {
    const request = input || {};
    assertId(request.platform, "Platform");
    assertId(request.templateId, "Template id");
    if (!templateStore || typeof templateStore.copyBuiltinTemplate !== "function") {
      throw contentError("TEMPLATE_COPY_UNAVAILABLE", "Builtin template copy is unavailable");
    }
    return templateStore.copyBuiltinTemplate(request.platform, request.templateId, request);
  }

  function saveCustomTemplate(input) {
    const request = input || {};
    assertId(request.platform, "Platform");
    assertId(request.id, "Template id");
    if (!templateStore || typeof templateStore.saveTemplate !== "function") {
      throw contentError("TEMPLATE_SAVE_UNAVAILABLE", "Custom template save is unavailable");
    }
    return templateStore.saveTemplate(request);
  }

  async function retryMaterial(clientId, materialId) {
    assertId(clientId, "Client id");
    assertId(materialId, "Material id");
    if (!materialStore || typeof materialStore.retryMaterial !== "function") {
      throw contentError("CLIENT_MATERIAL_INVALID", "Material retry is unavailable");
    }
    return clientDto({ knowledgeFiles: [await materialStore.retryMaterial(clientId, materialId)] }).knowledgeFiles[0];
  }

  async function generateArticle(input) {
    const request = input || {};
    assertId(request.clientId, "Client id");
    const materialIds = normalizeMaterialIds(request);
    const researchQueryIds = normalizeResearchQueryIds(request);
    assertId(request.platform, "Platform");
    assertId(request.templateId, "Template id");
    if (request.templateCatalogRevision !== undefined && typeof templateStore.listCatalog === "function") {
      assertId(request.templateCatalogRevision, "Template catalog revision");
      const catalog = templateStore.listCatalog();
      if (catalog && catalog.revision && catalog.revision !== request.templateCatalogRevision) {
        throw contentError("TEMPLATE_CATALOG_STALE", "模板目录已变化，请刷新后重新选择模板");
      }
    }
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

  function copyArticleVersion(input) {
    const request = input || {};
    assertId(request.clientId, "Client id");
    assertId(request.sourceArticleId, "Source article id");
    return articleVersionService.copyArticleVersion({
      clientId: request.clientId,
      sourceArticleId: request.sourceArticleId
    });
  }

  function reviewArticles(selections) {
    return articleReviewService.reviewMany(selections);
  }

  return {
    listClients: listClientsSafe,
    getClient: getClientSafe,
    retryMaterial: retryMaterial,
    listResearch: listResearch,
    getResearch: getResearch,
    listTemplates: listTemplates,
    listTemplateCatalog: listTemplateCatalog,
    copyBuiltinTemplate: copyBuiltinTemplate,
    saveCustomTemplate: saveCustomTemplate,
    generateArticle: generateArticle,
    saveArticle: saveArticle,
    listGeneratedArticles: listGeneratedArticles,
    getGeneratedArticle: getGeneratedArticle,
    copyArticleVersion: copyArticleVersion,
    reviewArticles: reviewArticles,
    listTrashedArticles: articleTrashService.listTrashedArticles,
    previewTrashArticles: articleTrashService.previewTrashArticles,
    previewArticleRemovalImpact: articleTrashService.previewArticleRemovalImpact,
    trashArticles: articleTrashService.trashArticles,
    restoreArticle: articleTrashService.restoreArticle,
    preparePermanentDelete: articleTrashService.preparePermanentDelete,
    permanentlyDeleteArticle: articleTrashService.permanentlyDeleteArticle,
    recoverPendingArticleRemovals: articleTrashService.recoverPendingRemovals,
    getArticleRemovalTransaction: articleTrashService.getArticleRemovalTransaction,
    listArticleRemovalTransactions: articleTrashService.listArticleRemovalTransactions,
    retryArticleRemovalTransaction: articleTrashService.retryArticleRemovalTransaction
  };
}

module.exports = { createAiContentService };
