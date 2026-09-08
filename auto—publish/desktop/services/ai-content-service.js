const { listClients, listClientIdentities, getClient, saveLiejuPublicationProfile } = require("../../src/content/client-knowledge");
const { createResearchStore } = require("../../src/content/research-store");
const { createTemplateStore } = require("../../src/content/template-store");
const { createArticleTrashService } = require("../../src/content/article-trash-service");
const { createClientMaterialStore } = require("../../src/content/client-material-store");
const { createClientGroupStore } = require("../../src/content/client-group-store");
const { reportDiagnostic } = require("../../src/diagnostics/diagnostic-producer");

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
  const clientGroupStore = workspaceRoot ? createClientGroupStore(workspaceRoot, { paths }) : null;
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
  const materialStore = options.materialStore || (workspaceRoot ? createClientMaterialStore({ workspaceRoot, paths }) : {});
  let articleRemovalRevision = 0;
  let disposed = false;
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

  function getClientGroups() {
    if (disposed || !clientGroupStore) throw contentError("CLIENT_GROUP_UNAVAILABLE", "Client groups are unavailable");
    return clientGroupStore.read();
  }

  async function updateClientGroups(input) {
    if (disposed || !clientGroupStore) throw contentError("CLIENT_GROUP_UNAVAILABLE", "Client groups are unavailable");
    const clients = input && input.action === "assign"
      ? await (typeof clientKnowledge.listClientIdentities === "function" ? clientKnowledge.listClientIdentities() : clientKnowledge.listClients())
      : [];
    if (disposed) throw contentError("CLIENT_GROUP_UNAVAILABLE", "Client groups are unavailable");
    return clientGroupStore.update(input, clients.map((client) => client.id));
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
    getClientGroups,
    updateClientGroups,
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
    }
  };
}

module.exports = { createAiContentService };
