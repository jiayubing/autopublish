const { wrap } = require("../services/ipc-response");
const { productionIpcRegistry } = require("./contracts/production-registry");
const {
  projectClient,
  projectMaterial,
  projectResearch,
  projectResearchMetadata,
  projectTemplate,
  projectTemplateCatalog,
} = require("./contracts/content-library-contracts");
const { projectArticle } = require("./contracts/article-editor-contracts");
const {
  projectPermanentDeleteConfirmation,
  projectPermanentDeleteResult,
  projectArticleRemovalTransaction,
  projectImpactPreview,
  projectTrashCommitResult,
} = require("./contracts/article-removal-contracts");

function contentInputError(message) {
  const error = new Error(message);
  error.code = "CONTENT_INPUT_INVALID";
  return error;
}

function generationInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw contentInputError("Generation input must be an object");
  }
  return Object.assign({}, input);
}

function safeProgressTitle(value) {
  if (typeof value !== "string") return null;
  const title = value.replace(/[\x00-\x1f\x7f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 300);
  return title || null;
}

function projectClientGenerationOperation(value) {
  if (!value) return null;
  return {
    operationId: value.operationId,
    clientId: value.clientId,
    articleCount: value.articleCount,
    concurrency: value.concurrency,
    status: value.status,
    counts: value.counts,
    tasks: Array.isArray(value.tasks) ? value.tasks.slice(0, 100).map(function(task) {
      return {
        index: task.index,
        status: task.status,
        attempts: task.attempts,
        articleId: task.articleId || null,
        articleTitle: safeProgressTitle(task.articleTitle),
        error: task.error ? {
          code: typeof task.error.code === "string" ? task.error.code.slice(0, 128) : "CONTENT_GENERATION_FAILED",
          message: "生成任务失败，请检查诊断信息。",
        } : null,
      };
    }) : [],
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}

function registerAiContentIpc(deps) {
  const ipcMain = deps.ipcMain;
  const service = deps.aiContentService;
  if (!ipcMain || !service) throw new Error("AI content IPC requires the workspace content service");

  ipcMain.handle("content:get-client-groups", function() { return wrap(function() { return service.getClientGroups(); }); });
  ipcMain.handle("content:update-client-groups", function(event, input) { return wrap(function() { return service.updateClientGroups(input); }); });
  ipcMain.handle("content:list-clients", function() { return wrap(async function() { return { clients: (await service.listClients()).map(projectClient) }; }); });
  ipcMain.handle("content:get-client-details", function(event, clientId) { return wrap(async function() { const result = await service.getClientDetails(clientId); return { client: projectClient(result.client), research: result.research.map(projectResearch) }; }); });
  ipcMain.handle("content:save-client-lieju-publication-profile", function(event, input) {
    return wrap(async function() {
      const result = await service.saveClientLiejuPublicationProfile(input);
      return { profile: projectClient({ publicationProfiles: result, knowledgeFiles: [] }).publicationProfiles.lieju };
    });
  });
  ipcMain.handle("content:list-research", function(event, clientId) { return wrap(function() { return { research: service.listResearch(clientId).map(projectResearch) }; }); });
  ipcMain.handle("content:list-research-metadata", function(event, clientId) { return wrap(function() { return { research: service.listResearchMetadata(clientId).map(projectResearchMetadata) }; }); });
  ipcMain.handle("content:list-template-catalog", function() { return wrap(function() { return projectTemplateCatalog(service.listTemplateCatalog()); }); });
  ipcMain.handle("content:retry-material", function(event, input) {
    return wrap(async function() { return { material: projectMaterial(await service.retryMaterial(input && input.clientId, input && input.materialId)) }; });
  });
  ipcMain.handle("content:generate-article", function(event, input) { return wrap(async function() {
    const result = await service.generateArticle(generationInput(input));
    if (result && Array.isArray(result.articles) && Array.isArray(result.failures)) {
      return { article: Object.assign({}, result, { articles: result.articles.map(function(item) {
        return { index: item.index, article: projectArticle(item.article) };
      }) }) };
    }
    return { article: projectArticle(result) };
  }); });
  ipcMain.handle("content:start-client-generation", function(event, input) {
    return wrap(function() {
      if (typeof service.startClientGeneration !== "function") throw contentInputError("Client generation is unavailable");
      return { operation: projectClientGenerationOperation(service.startClientGeneration(generationInput(input))) };
    });
  });
  ipcMain.handle("content:get-client-generation-state", function(event, input) {
    return wrap(function() {
      if (typeof service.getClientGenerationState !== "function") throw contentInputError("Client generation is unavailable");
      return { operation: projectClientGenerationOperation(service.getClientGenerationState(input && input.clientId)) };
    });
  });
  ipcMain.handle("content:retry-client-generation", function(event, input) {
    return wrap(function() {
      if (typeof service.retryClientGeneration !== "function") throw contentInputError("Client generation is unavailable");
      return { operation: projectClientGenerationOperation(service.retryClientGeneration(generationInput(input))) };
    });
  });
  ipcMain.handle("content:save-article", function(event, input) {
    return wrap(function() {
      const result = service.saveArticle(input);
      if (result && result.outcome === "saved") {
        return {
          outcome: "saved",
          article: projectArticle(result.article),
          editFingerprint: result.editFingerprint,
        };
      }
      if (result && result.outcome === "conflict") return result;
      if (result && result.outcome === "result-uncertain") return result;
      const error = new Error("Article save returned an invalid typed result");
      error.code = "IPC_RESULT_INVALID";
      throw error;
    });
  });
  ipcMain.handle("content:get-article-editor", function(event, input) {
    return wrap(function() {
      const result = service.getArticleEditor(input && input.clientId, input && input.articleId);
      return {
        article: projectArticle(result.article),
        editFingerprint: result.editFingerprint,
      };
    });
  });
  ipcMain.handle("content:preview-article-removal-impact", function(event, input) {
    return wrap(function() { return projectImpactPreview(service.previewArticleRemovalImpact(input)); });
  });
  ipcMain.handle("content:trash-articles", function(event, input) {
    return wrap(function() { return projectTrashCommitResult(service.trashArticles(input)); });
  });
  ipcMain.handle("content:restore-article", function(event, input) {
    return wrap(function() {
      const result = service.restoreArticle(input);
      const article = result && result.article ? result.article : result;
      return { article: projectArticle(article), restored: result && result.restored !== undefined ? result.restored : true, queueRestored: result && result.queueRestored === true, message: result && result.message || "文章已恢复，投稿队列不会自动恢复" };
    });
  });
  ipcMain.handle("content:prepare-permanent-delete-article", function(event, input) {
    return wrap(function() { return projectPermanentDeleteConfirmation(service.preparePermanentDelete(input)); });
  });
  ipcMain.handle("content:permanently-delete-article", function(event, input) {
    return wrap(function() { return projectPermanentDeleteResult(service.permanentlyDeleteArticle(input)); });
  });
  ipcMain.handle("content:get-article-removal-transaction", function(event, input) {
    return wrap(function() {
      if (!input || typeof input.transactionId !== "string" || !input.transactionId.trim()) throw contentInputError("Removal transaction id is required");
      return { transaction: projectArticleRemovalTransaction(service.getArticleRemovalTransaction(input.transactionId)) };
    });
  });
  ipcMain.handle("content:retry-article-removal-transaction", function(event, input) {
    return wrap(function() {
      if (!input || typeof input.transactionId !== "string" || !input.transactionId.trim() || input.confirmed !== true) throw contentInputError("Removal transaction confirmation is required");
      return { transaction: projectArticleRemovalTransaction(service.retryArticleRemovalTransaction(input)) };
    });
  });

  const eventContract = productionIpcRegistry.byCapability("generation.clientOperationChanged");
  const unsubscribe = typeof service.subscribeClientGeneration === "function"
    ? service.subscribeClientGeneration(function(operation) {
        if (typeof deps.sendToRenderer !== "function") return;
        const projected = projectClientGenerationOperation(operation);
        deps.sendToRenderer(eventContract.channel, productionIpcRegistry.event(eventContract, projected));
      })
    : function() {};
  return { dispose: unsubscribe };
}

module.exports = { registerAiContentIpc, projectClientGenerationOperation };