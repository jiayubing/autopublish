const { listClients, listClientIdentities, getClient, saveLiejuPublicationProfile } = require("../../src/content/client-knowledge");
const { createResearchStore } = require("../../src/content/research-store");
const { createTemplateStore } = require("../../src/content/template-store");
const { createArticleTrashService } = require("../../src/content/article-trash-service");
const { createAiClient } = require("../../src/content/ai-client");
const { createArticleGenerator } = require("../../src/content/article-generator");
const { createClientMaterialStore } = require("../../src/content/client-material-store");
const { buildPrompt } = require("../../src/content/prompt-builder");
const crypto = require("crypto");
const { reportDiagnostic } = require("../../src/diagnostics/diagnostic-producer");

function clone(value) {
  return value === undefined ? value : JSON.parse(JSON.stringify(value));
}

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

function normalizeGenerationOperationId(value) {
  if (value === undefined || value === null || value === "") return crypto.randomUUID();
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,199}$/.test(value)) {
    throw contentError("CONTENT_INPUT_INVALID", "Generation operation id is invalid");
  }
  return value;
}

function normalizeArticleCount(value) {
  if (value === undefined) return 1;
  if (!Number.isSafeInteger(value) || value < 1 || value > 100) {
    throw contentError("CONTENT_INPUT_INVALID", "Article count must be an integer from 1 to 100");
  }
  return value;
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
      const result = { name: file.name };
      if (typeof file.content === "string") result.content = file.content;
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
    listClientIdentities: function() { return listClientIdentities(workspaceRoot); },
    getClient: function(id) { return getClient(workspaceRoot, id); },
    saveLiejuPublicationProfile: function(id, profile) {
      return saveLiejuPublicationProfile(workspaceRoot, id, profile);
    }
  };
  const researchStore = options.researchStore || createResearchStore(workspaceRoot, { paths: paths });
  const templateStore = options.templateStore || createTemplateStore(workspaceRoot, { paths: paths });
  const contentStore = options.contentStore;
  const operationalStore = options.operationalStore || null;
  const articleMutationCoordinator = options.articleMutationCoordinator || null;
  const articleRemovalImpactQuery = options.articleRemovalImpactQuery || null;
  const articleTrashService = options.articleTrashService || (contentStore && createArticleTrashService({
    contentStore: contentStore,
    operationalStore: operationalStore,
    mutationCoordinator: articleMutationCoordinator,
    articleRemovalTransitionPort: options.articleRemovalTransitionPort,
    workspaceRoot: workspaceRoot,
    articleRemovalImpactQuery,
    transactionStore: options.articleRemovalTransactionStore,
    now: options.now,
    tokenTtlMs: options.articleRemovalTokenTtlMs,
    onTransactionStatus: notifyArticleRemovalTransaction
  })) || {};
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
  let articleRemovalRevision = 0;
  let disposed = false;
  let activeOperation = null;
  const completedOperations = new Map();

  function operationState() {
    if (!activeOperation) return { status: "idle", operationId: null, outcome: null };
    return {
      status: activeOperation.status,
      operationId: activeOperation.id,
      outcome: activeOperation.outcome || null,
    };
  }

  function notifyArticleRemovalTransaction(transaction) {
    const event = Object.assign({}, transaction || {});
    const terminal = event.status === "committed" || event.status === "superseded";
    if (terminal) {
      articleRemovalRevision += 1;
      event.revision = articleRemovalRevision;
      event.changedScopes = ["articleManagement", "articleAttention", "platformQueue"];
    }
    if (typeof options.onArticleRemovalTransaction === "function") {
      try { options.onArticleRemovalTransaction(event); } catch (error) {
        reportDiagnostic({
          code: "ARTICLE_REMOVAL_LISTENER_FAILED",
          module: "ai-content-service",
          category: "internal",
          operationId: "article-removal-notify",
          metadata: {
            operation: "transaction-listener",
            phase: "notify",
            outcome: "listener-isolated",
            errorCode: error && /^([A-Z][A-Z0-9_]{1,127})$/.test(error.code || "")
              ? error.code
              : "LISTENER_FAILED"
          }
        });
      }
    }
    if (terminal && typeof options.onArticleRemovalInvalidation === "function") {
      try {
        options.onArticleRemovalInvalidation({
          revision: event.revision,
          scopes: event.changedScopes.slice(),
          reasonCode: event.resolutionCode || "ARTICLE_REMOVAL_TERMINAL"
        });
      } catch (error) {
        reportDiagnostic({
          code: "ARTICLE_REMOVAL_INVALIDATION_LISTENER_FAILED",
          module: "ai-content-service",
          category: "internal",
          operationId: "article-removal-invalidation-notify",
          metadata: {
            operation: "invalidation-listener",
            phase: "notify",
            outcome: "listener-isolated",
            errorCode: error && /^([A-Z][A-Z0-9_]{1,127})$/.test(error.code || "")
              ? error.code
              : "LISTENER_FAILED"
          }
        });
      }
    }
  }

  function notifyAttentionChange(reasonCode) {
    if (typeof options.onDataInvalidated !== "function") return;
    try { options.onDataInvalidated(reasonCode); } catch (error) {
      reportDiagnostic({
        code: "AI_CONTENT_INVALIDATION_LISTENER_FAILED",
        module: "ai-content-service",
        category: "internal",
        operationId: "ai-content-invalidation-notify",
        metadata: {
          operation: "data-invalidation-listener",
          phase: "notify",
          outcome: "listener-isolated",
          reasonCode: typeof reasonCode === "string" && /^[A-Za-z][A-Za-z0-9._:-]{0,127}$/.test(reasonCode)
            ? reasonCode
            : "UNSPECIFIED",
          errorCode: error && /^([A-Z][A-Z0-9_]{1,127})$/.test(error.code || "")
            ? error.code
            : "LISTENER_FAILED"
        }
      });
    }
  }

  async function materializeClient(client) {
    const value = clientDto(client);
    if (materialStore && typeof materialStore.listMaterials === "function") {
      value.knowledgeFiles = await materialStore.listMaterials(client.id);
    }
    return clientDto(value);
  }

  async function listClientsSafe() {
    const usesMetadataPath = typeof clientKnowledge.listClientIdentities === "function" || typeof materialStore.listMaterialMetadata === "function";
    const clients = await (typeof clientKnowledge.listClientIdentities === "function" ? clientKnowledge.listClientIdentities() : clientKnowledge.listClients());
    if (!usesMetadataPath) return Promise.all(clients.map(materializeClient));
    return Promise.all(clients.map(async function(client) {
      const value = clientDto(client);
      if (materialStore && typeof materialStore.listMaterialMetadata === "function") value.knowledgeFiles = await materialStore.listMaterialMetadata(client.id);
      else value.knowledgeFiles = value.knowledgeFiles.map(function(file) { const result = Object.assign({}, file); delete result.content; return result; });
      return clientDto(value);
    }));
  }

  async function getClientSafe(clientId) {
    assertId(clientId, "Client id");
    return materializeClient(await clientKnowledge.getClient(clientId));
  }

  async function saveClientLiejuPublicationProfile(input) {
    const request = input || {};
    assertId(request.clientId, "Client id");
    if (typeof clientKnowledge.saveLiejuPublicationProfile !== "function") {
      throw contentError("CLIENT_PROFILE_UNAVAILABLE", "Client publication profile storage is unavailable");
    }
    return clientKnowledge.saveLiejuPublicationProfile(request.clientId, request.profile);
  }

  function listResearch(clientId) {
    assertId(clientId, "Client id");
    return researchStore.listResearch(clientId);
  }

  function listResearchMetadata(clientId) {
    assertId(clientId, "Client id");
    if (typeof researchStore.listResearchMetadata === "function") return researchStore.listResearchMetadata(clientId);
    return researchStore.listResearch(clientId).map(function(item) {
      const result = Object.assign({}, item);
      delete result.answerText;
      delete result.references;
      return result;
    });
  }

  async function getClientDetails(clientId) {
    assertId(clientId, "Client id");
    return { client: await materializeClient(await clientKnowledge.getClient(clientId)), research: listResearch(clientId) };
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

  async function generateSingleArticle(input) {
    if (disposed) throw contentError("CONTENT_RUNTIME_DISPOSED", "Content runtime is disposed");
    const request = input || {};
    assertId(request.clientId, "Client id");
    const materialIds = normalizeMaterialIds(request);
    const researchQueryIds = normalizeResearchQueryIds(request);
    assertId(request.platform, "Platform");
    assertId(request.templateId, "Template id");
    const generationOperationId = normalizeGenerationOperationId(request.generationOperationId);
    const articleCount = normalizeArticleCount(request.articleCount);
    if (activeOperation) {
      if (activeOperation.id !== generationOperationId) throw contentError("CONTENT_GENERATION_BUSY", "Another article generation is already running");
      return activeOperation.promise;
    }
    if (contentStore && typeof contentStore.findByGenerationOperationId === "function") {
      const existing = contentStore.findByGenerationOperationId(generationOperationId);
      if (existing && existing.kind === "one") return existing.article;
      if (existing && existing.kind === "many") throw contentError("CONTENT_GENERATION_ID_CONFLICT", "Generation operation identity is ambiguous");
    }
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
    const operation = { id: generationOperationId, status: "running", outcome: null, promise: null };
    activeOperation = operation;
    operation.promise = (async function() {
      try {
        const generated = await generator.generateArticle(Object.assign({}, request, { materialIds: materialIds, researchQueryIds: researchQueryIds, generationOperationId: generationOperationId, articleCount: articleCount }));
        if (!generated || typeof generated !== "object") throw contentError("CONTENT_GENERATION_INVALID", "Generated article is invalid");
        const article = generated.generationOperationId === generationOperationId
          ? generated
          : Object.assign({}, generated, { generationOperationId: generationOperationId });
        if (!contentStore || (typeof contentStore.createArticle !== "function" && typeof contentStore.saveArticle !== "function")) {
          throw contentError("CONTENT_STORE_REQUIRED", "Generated article cannot be persisted");
        }
        const saved = articleMutationCoordinator && typeof articleMutationCoordinator.createArticle === "function"
          ? articleMutationCoordinator.createArticle(article)
          : typeof contentStore.createArticle === "function"
            ? contentStore.createArticle(article)
            : contentStore.saveArticle(article);
        notifyAttentionChange("ARTICLE_SAVED");
        operation.status = "completed";
        operation.outcome = "saved";
        return saved === undefined ? article : saved;
      } catch (error) {
        operation.status = disposed ? "uncertain" : "failed";
        operation.outcome = disposed ? "result-uncertain" : "failed";
        throw error;
      } finally {
        if (activeOperation === operation && operation.status !== "uncertain") activeOperation = null;
      }
    })();
    return operation.promise;
  }

  async function generateArticle(input) {
    const request = input || {};
    const count = normalizeArticleCount(request.articleCount);
    if (count === 1) return generateSingleArticle(Object.assign({}, request, { articleCount: 1 }));
    const parentOperationId = normalizeGenerationOperationId(request.generationOperationId);
    const known = completedOperations.get(parentOperationId);
    if (known) return clone(known);
    const articles = [];
    const failures = [];
    for (let index = 0; index < count; index += 1) {
      const childOperationId = parentOperationId + "-" + String(index + 1);
      try {
        if (contentStore && typeof contentStore.findByGenerationOperationId === "function") {
          const existing = contentStore.findByGenerationOperationId(childOperationId);
          if (existing && existing.kind === "one" && existing.article) {
            articles.push({ index: index, article: existing.article });
            continue;
          }
          if (existing && existing.kind === "many") {
            failures.push({ index: index, code: "CONTENT_GENERATION_ID_CONFLICT" });
            continue;
          }
        }
        const article = await generateSingleArticle(Object.assign({}, request, {
          articleCount: 1,
          generationOperationId: childOperationId,
        }));
        articles.push({ index: index, article: article });
      } catch (error) {
        failures.push({ index: index, code: error && error.code ? error.code : "CONTENT_GENERATION_FAILED" });
      }
    }
    const result = {
      operationId: parentOperationId,
      articleCount: count,
      status: failures.length ? (articles.length ? "partial" : "failed") : "completed",
      articles: articles,
      failures: failures,
    };
    completedOperations.set(parentOperationId, result);
    return clone(result);
  }

  function saveArticle(input) {
    const request = input && input.article ? input : { article: input };
    if (!request.article || typeof request.article !== "object" || Array.isArray(request.article)) {
      throw contentError("CONTENT_INPUT_INVALID", "Article is required");
    }
    let saved;
    try {
      saved = articleMutationCoordinator && typeof articleMutationCoordinator.saveExistingArticle === "function"
        ? articleMutationCoordinator.saveExistingArticle(request)
        : contentStore.saveArticle(request.article);
    } catch (error) {
      if (error && error.code === "ARTICLE_EDIT_CONFLICT") {
        return {
          outcome: "conflict",
          code: "ARTICLE_EDIT_CONFLICT",
          articleId: request.article.id,
          refreshRequired: true,
        };
      }
      if (error && error.code === "ARTICLE_MUTATION_RESULT_UNCERTAIN") {
        return {
          outcome: "result-uncertain",
          code: "ARTICLE_MUTATION_RESULT_UNCERTAIN",
          articleId: request.article.id,
          refreshRequired: true,
        };
      }
      throw error;
    }
    notifyAttentionChange("ARTICLE_SAVED");
    if (saved && (saved.outcome === "saved" || saved.outcome === "conflict" || saved.outcome === "result-uncertain")) return saved;
    return {
      outcome: "saved",
      article: saved,
      editFingerprint: contentStore.fingerprintArticle(saved),
    };
  }

  function listGeneratedArticles(clientId) {
    assertId(clientId, "Client id");
    return contentStore.listArticles(clientId);
  }

  function restoreArticle(input) {
    const result = articleTrashService.restoreArticle(input);
    notifyAttentionChange("ARTICLE_RESTORED");
    return result;
  }

  function permanentlyDeleteArticle(input) {
    const result = articleTrashService.permanentlyDeleteArticle(input);
    notifyAttentionChange("ARTICLE_PERMANENTLY_DELETED");
    return result;
  }

  function getGeneratedArticle(clientId, articleId) {
    assertId(clientId, "Client id");
    assertId(articleId, "Article id");
    return contentStore.getArticle(clientId, articleId);
  }

  function getArticleEditor(clientId, articleId) {
    assertId(clientId, "Client id");
    assertId(articleId, "Article id");
    if (articleMutationCoordinator && typeof articleMutationCoordinator.readArticleForEdit === "function") {
      return articleMutationCoordinator.readArticleForEdit({ articleRef: { clientId, articleId } });
    }
    const article = contentStore.getArticle(clientId, articleId);
    return { article: article, editFingerprint: contentStore.fingerprintArticle(article) };
  }

  return {
    listClients: listClientsSafe,
    getClient: getClientSafe,
    getClientDetails: getClientDetails,
    saveClientLiejuPublicationProfile: saveClientLiejuPublicationProfile,
    retryMaterial: retryMaterial,
    listResearch: listResearch,
    listResearchMetadata: listResearchMetadata,
    getResearch: getResearch,
    listTemplates: listTemplates,
    listTemplateCatalog: listTemplateCatalog,
    copyBuiltinTemplate: copyBuiltinTemplate,
    saveCustomTemplate: saveCustomTemplate,
    generateArticle: generateArticle,
    getState: operationState,
    saveArticle: saveArticle,
    getArticleEditor: getArticleEditor,
    listGeneratedArticles: listGeneratedArticles,
    getGeneratedArticle: getGeneratedArticle,
    listTrashedArticles: articleTrashService.listTrashedArticles,
    previewTrashArticles: articleTrashService.previewTrashArticles,
    previewArticleRemovalImpact: articleTrashService.previewArticleRemovalImpact,
    trashArticles: articleTrashService.trashArticles,
    restoreArticle: restoreArticle,
    preparePermanentDelete: articleTrashService.preparePermanentDelete,
    permanentlyDeleteArticle: permanentlyDeleteArticle,
    recoverPendingArticleRemovals: articleTrashService.recoverPendingRemovals,
    getArticleRemovalTransaction: articleTrashService.getArticleRemovalTransaction,
    listArticleRemovalTransactions: articleTrashService.listArticleRemovalTransactions,
    retryArticleRemovalTransaction: articleTrashService.retryArticleRemovalTransaction,
    dispose: async function() {
      disposed = true;
      if (activeOperation && activeOperation.status === "running") {
        activeOperation.status = "uncertain";
        activeOperation.outcome = "result-uncertain";
      }
    }
  };
}

module.exports = { createAiContentService };
