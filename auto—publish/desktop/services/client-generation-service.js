"use strict";

const crypto = require("node:crypto");
const { getClient } = require("../../src/content/client-knowledge");
const { createResearchStore } = require("../../src/content/research-store");
const { createTemplateStore } = require("../../src/content/template-store");
const { createClientMaterialStore } = require("../../src/content/client-material-store");
const { createArticleGenerator } = require("../../src/content/article-generator");
const { buildPrompt } = require("../../src/content/prompt-builder");
const { reportDiagnostic } = require("../../src/diagnostics/diagnostic-producer");

const RETRY_DELAYS = [5000, 15000];
const RETRYABLE_CODES = new Set([
  "AI_RATE_LIMITED", "AI_TIMEOUT", "AI_NETWORK_ERROR", "AI_SERVER_ERROR", "AI_REQUEST_FAILED",
  "ECONNRESET", "ECONNREFUSED", "ENETUNREACH", "ETIMEDOUT", "EAI_AGAIN",
]);
const CONFIGURATION_CODES = new Set([
  "AI_CONFIG_NOT_SET", "AI_CONFIG_INVALID", "AI_UNAUTHORIZED", "AI_FORBIDDEN", "AI_MODEL_NOT_FOUND",
  "MODEL_NOT_FOUND", "MODEL_INVALID",
]);

function clientGenerationError(code, message) {
  const error = new Error(message || code);
  error.code = code;
  return error;
}

function clone(value) {
  return value === undefined ? value : JSON.parse(JSON.stringify(value));
}

function assertId(value, label) {
  if (typeof value !== "string" || !value.trim() || value.length > 200 || !/^[^/\\\u0000-\u001f]+$/.test(value)) {
    throw clientGenerationError("CONTENT_INPUT_INVALID", (label || "Identifier") + " is invalid");
  }
  return value;
}

function normalizeOperationId(value) {
  if (value === undefined || value === null || value === "") return crypto.randomUUID();
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,199}$/.test(value)) {
    throw clientGenerationError("CONTENT_INPUT_INVALID", "Generation operation id is invalid");
  }
  return value;
}

function normalizeArticleCount(value) {
  const count = value === undefined ? 1 : value;
  if (!Number.isSafeInteger(count) || count < 1 || count > 100) {
    throw clientGenerationError("CONTENT_INPUT_INVALID", "Article count must be an integer from 1 to 100");
  }
  return count;
}

function normalizeConcurrency(value) {
  const concurrency = value === undefined ? 2 : value;
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 4) {
    throw clientGenerationError("GENERATION_CONCURRENCY_INVALID", "Generation concurrency must be an integer from 1 to 4");
  }
  return concurrency;
}

function normalizeIds(value, requiredCode, invalidCode, label) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 50) {
    throw clientGenerationError(value && Array.isArray(value) && value.length === 0 ? requiredCode : "CONTENT_INPUT_INVALID", "At least one " + label + " is required");
  }
  const seen = new Set();
  value.forEach(function(id) {
    if (typeof id !== "string" || !id.trim() || id.includes("/") || id.includes("\\") || seen.has(id)) {
      throw clientGenerationError(invalidCode, "Selected " + label + " is invalid");
    }
    seen.add(id);
  });
  return value.slice();
}

function safeError(error) {
  return {
    code: error && typeof error.code === "string" ? error.code.slice(0, 100) : "CONTENT_GENERATION_FAILED",
    message: error && typeof error.message === "string" ? error.message.slice(0, 500) : "文章生成失败",
  };
}

function isRetryable(error) {
  if (!error || error.retryable === false) return false;
  if (RETRYABLE_CODES.has(error.code)) return true;
  return error.status === 429 || (Number.isInteger(error.status) && error.status >= 500 && error.status <= 599);
}

function isConfigurationError(error) {
  return Boolean(error && (CONFIGURATION_CODES.has(error.code) || error.status === 401 || error.status === 403 || error.status === 404));
}

function countsFor(tasks) {
  const counts = { total: tasks.length, pending: 0, running: 0, succeeded: 0, failed: 0 };
  tasks.forEach(function(task) {
    if (Object.prototype.hasOwnProperty.call(counts, task.status)) counts[task.status] += 1;
  });
  return counts;
}

function createClientGenerationService(options) {
  const value = options || {};
  if (typeof value.workspaceRoot !== "string" || !value.workspaceRoot.trim()) {
    throw clientGenerationError("CONTENT_SERVICE_INVALID", "Workspace root is required");
  }
  const workspaceRoot = value.workspaceRoot;
  const paths = value.paths;
  const contentStore = value.contentStore;
  if (!contentStore || (typeof contentStore.createArticle !== "function" && typeof contentStore.saveArticle !== "function")) {
    throw clientGenerationError("CONTENT_STORE_REQUIRED", "Content store is required");
  }
  const clientKnowledge = value.clientKnowledge || { getClient: function(id) { return getClient(workspaceRoot, id); } };
  const researchStore = value.researchStore || createResearchStore(workspaceRoot, { paths: paths });
  const templateStore = value.templateStore || createTemplateStore(workspaceRoot, { paths: paths });
  const materialStore = value.materialStore || createClientMaterialStore({ workspaceRoot: workspaceRoot, paths: paths });
  const articleMutationCoordinator = value.articleMutationCoordinator || null;
  const articleGeneratorFactory = value.articleGeneratorFactory || createArticleGenerator;
  const promptBuilder = value.buildPrompt || buildPrompt;
  const aiClientFactory = value.aiClientFactory;
  if (typeof aiClientFactory !== "function") throw clientGenerationError("AI_CONFIG_NOT_SET", "AI execution service is unavailable");
  const createId = value.createId || function() { return crypto.randomUUID(); };
  const seenIds = value.seenIds || new Set();
  const sleep = value.sleep || function(milliseconds) { return new Promise(function(resolve) { setTimeout(resolve, milliseconds); }); };
  const now = value.now || function() { return new Date().toISOString(); };
  const listeners = new Set();
  const operations = new Map();
  const latestByClient = new Map();
  let disposed = false;

  function snapshot(operation) {
    if (!operation) return null;
    return {
      operationId: operation.id,
      clientId: operation.clientId,
      articleCount: operation.articleCount,
      concurrency: operation.concurrency,
      status: operation.status,
      counts: countsFor(operation.tasks),
      tasks: operation.tasks.map(function(task) {
        return {
          index: task.index,
          status: task.status,
          attempts: task.attempts,
          articleId: task.articleId || null,
          articleTitle: task.articleTitle || null,
          error: task.error ? clone(task.error) : null,
        };
      }),
      createdAt: operation.createdAt,
      updatedAt: operation.updatedAt,
    };
  }

  function emit(operation) {
    operation.updatedAt = now();
    const event = snapshot(operation);
    listeners.forEach(function(listener) {
      try { listener(clone(event)); } catch (error) {
        reportDiagnostic({
          code: "CLIENT_GENERATION_LISTENER_FAILED",
          module: "client-generation-service",
          category: "internal",
          operationId: operation.id,
          metadata: { operation: "progress-listener", phase: "notify", outcome: "listener-isolated" },
        });
      }
    });
  }

  function finalize(operation) {
    const counts = countsFor(operation.tasks);
    operation.status = counts.failed > 0 ? (counts.succeeded > 0 ? "partial" : "failed") : "completed";
    operation.updatedAt = now();
    emit(operation);
  }

  function findExisting(operationId) {
    if (typeof contentStore.findByGenerationOperationId !== "function") return null;
    const existing = contentStore.findByGenerationOperationId(operationId);
    if (!existing || existing.kind === "none") return null;
    if (existing.kind === "many") throw clientGenerationError("CONTENT_GENERATION_ID_CONFLICT", "Generation operation identity is ambiguous");
    return existing.kind === "one" ? existing.article : existing;
  }

  function saveGeneratedArticle(article) {
    const saved = articleMutationCoordinator && typeof articleMutationCoordinator.createArticle === "function"
      ? articleMutationCoordinator.createArticle(article)
      : typeof contentStore.createArticle === "function"
        ? contentStore.createArticle(article)
        : contentStore.saveArticle(article);
    if (typeof value.onDataInvalidated === "function") value.onDataInvalidated("ARTICLE_SAVED");
    return saved === undefined ? article : saved;
  }

  async function generateOnce(operation, task) {
    const childOperationId = operation.articleCount === 1 ? operation.id : operation.id + "-" + String(task.index + 1);
    const existing = findExisting(childOperationId);
    if (existing) return existing;
    const generator = articleGeneratorFactory({
      getClient: function(id) { return clientKnowledge.getClient(id); },
      researchStore: researchStore,
      materialStore: materialStore,
      templateStore: templateStore,
      buildPrompt: promptBuilder,
      aiClient: aiClientFactory("client-generation:" + operation.id),
      createId: createId,
      seenIds: seenIds,
    });
    const generated = await generator.generateArticle(Object.assign({}, operation.request, {
      articleCount: 1,
      generationOperationId: childOperationId,
    }));
    if (!generated || typeof generated !== "object") throw clientGenerationError("CONTENT_GENERATION_INVALID", "Generated article is invalid");
    const article = generated.generationOperationId === childOperationId
      ? generated
      : Object.assign({}, generated, { generationOperationId: childOperationId });
    return saveGeneratedArticle(article);
  }

  async function generateWithRetry(operation, task) {
    for (let attempt = 0; ; attempt += 1) {
      if (operation.controller.signal.aborted) throw clientGenerationError("AI_ABORTED", "Generation task was aborted");
      try {
        return await generateOnce(operation, task);
      } catch (error) {
        if (!isRetryable(error) || attempt >= RETRY_DELAYS.length) throw error;
        await sleep(RETRY_DELAYS[attempt]);
      }
    }
  }

  async function runOperation(operation) {
    let nextIndex = 0;
    let configurationFailure = null;
    async function worker() {
      while (!disposed && !operation.controller.signal.aborted && !configurationFailure) {
        const task = operation.tasks[nextIndex++];
        if (!task) return;
        if (task.status !== "pending") continue;
        task.status = "running";
        task.attempts += 1;
        task.error = null;
        emit(operation);
        try {
          const article = await generateWithRetry(operation, task);
          task.status = "succeeded";
          task.articleId = article && article.id || null;
          task.articleTitle = article && typeof article.title === "string" ? article.title.slice(0, 300) : null;
          task.error = null;
        } catch (error) {
          if (operation.controller.signal.aborted || error && error.code === "AI_ABORTED") {
            task.status = "failed";
            task.error = { code: "AI_ABORTED", message: "生成任务已停止" };
          } else {
            task.status = "failed";
            task.error = safeError(error);
            if (isConfigurationError(error)) configurationFailure = task.error;
          }
        }
        emit(operation);
      }
    }
    await Promise.all(Array.from({ length: operation.concurrency }, worker));
    if (configurationFailure) {
      operation.tasks.forEach(function(task) {
        if (task.status === "pending") {
          task.status = "failed";
          task.error = clone(configurationFailure);
        }
      });
    }
    if (operation.controller.signal.aborted) {
      operation.tasks.forEach(function(task) {
        if (task.status === "pending") {
          task.status = "failed";
          task.error = { code: "AI_ABORTED", message: "生成任务已停止" };
        }
      });
    }
    finalize(operation);
    return snapshot(operation);
  }

  function prepareRequest(input) {
    const request = input || {};
    assertId(request.clientId, "Client id");
    assertId(request.platform, "Platform");
    assertId(request.templateId, "Template id");
    const materialIds = normalizeIds(request.materialIds, "CLIENT_MATERIAL_REQUIRED", "CLIENT_MATERIAL_INVALID", "client material");
    const researchIds = normalizeIds(request.researchQueryIds === undefined ? [request.researchQueryId] : request.researchQueryIds, "GEO_RESEARCH_REQUIRED", "CONTENT_INPUT_INVALID", "GEO research answer");
    clientKnowledge.getClient(request.clientId);
    if (request.templateCatalogRevision !== undefined && typeof templateStore.listCatalog === "function") {
      assertId(request.templateCatalogRevision, "Template catalog revision");
      const catalog = templateStore.listCatalog();
      if (catalog && catalog.revision && catalog.revision !== request.templateCatalogRevision) {
        throw clientGenerationError("TEMPLATE_CATALOG_STALE", "模板目录已变化，请刷新后重新选择模板");
      }
    }
    return Object.assign({}, request, {
      clientId: request.clientId,
      materialIds: materialIds,
      researchQueryIds: researchIds,
      articleCount: normalizeArticleCount(request.articleCount),
      concurrency: normalizeConcurrency(request.concurrency),
      generationOperationId: normalizeOperationId(request.generationOperationId),
    });
  }

  function start(input) {
    if (disposed) throw clientGenerationError("CONTENT_RUNTIME_DISPOSED", "Content runtime is disposed");
    const request = prepareRequest(input);
    const current = latestByClient.get(request.clientId);
    if (current && current.status === "running") {
      if (current.id === request.generationOperationId) return snapshot(current);
      throw clientGenerationError("CONTENT_GENERATION_CLIENT_BUSY", "当前客户已有文章生成任务正在运行");
    }
    const existingOperation = operations.get(request.generationOperationId);
    if (existingOperation) return snapshot(existingOperation);
    const createdAt = now();
    const operation = {
      id: request.generationOperationId,
      clientId: request.clientId,
      articleCount: request.articleCount,
      concurrency: request.concurrency,
      status: "running",
      request: Object.assign({}, request, { articleCount: 1 }),
      tasks: Array.from({ length: request.articleCount }, function(_, index) {
        return { index: index, status: "pending", attempts: 0, articleId: null, articleTitle: null, error: null };
      }),
      createdAt: createdAt,
      updatedAt: createdAt,
      controller: new AbortController(),
      promise: null,
    };
    operations.set(operation.id, operation);
    latestByClient.set(operation.clientId, operation);
    emit(operation);
    operation.promise = runOperation(operation).catch(function(error) {
      operation.tasks.forEach(function(task) {
        if (task.status === "pending" || task.status === "running") {
          task.status = "failed";
          task.error = safeError(error);
        }
      });
      finalize(operation);
      return snapshot(operation);
    });
    return snapshot(operation);
  }

  function getState(clientId) {
    if (clientId === undefined || clientId === null || clientId === "") {
      const running = Array.from(latestByClient.values()).filter(function(operation) { return operation.status === "running"; });
      return { status: running.length ? "running" : "idle", activeClientCount: running.length, isBatchRunning: running.length > 0 };
    }
    assertId(clientId, "Client id");
    return snapshot(latestByClient.get(clientId) || null);
  }

  function retryFailed(input) {
    if (disposed) throw clientGenerationError("CONTENT_RUNTIME_DISPOSED", "Content runtime is disposed");
    const request = input || {};
    const operationId = assertId(request.operationId, "Operation id");
    const operation = operations.get(operationId);
    if (!operation) throw clientGenerationError("CONTENT_GENERATION_OPERATION_NOT_FOUND", "Generation operation was not found");
    if (operation.status === "running") throw clientGenerationError("CONTENT_GENERATION_CLIENT_BUSY", "当前客户已有文章生成任务正在运行");
    const failed = operation.tasks.filter(function(task) { return task.status === "failed"; });
    if (!failed.length) return snapshot(operation);
    const current = latestByClient.get(operation.clientId);
    if (current && current !== operation && current.status === "running") {
      throw clientGenerationError("CONTENT_GENERATION_CLIENT_BUSY", "当前客户已有文章生成任务正在运行");
    }
    failed.forEach(function(task) { task.status = "pending"; task.error = null; });
    operation.status = "running";
    operation.controller = new AbortController();
    latestByClient.set(operation.clientId, operation);
    emit(operation);
    operation.promise = runOperation(operation).catch(function(error) {
      operation.tasks.forEach(function(task) {
        if (task.status === "pending" || task.status === "running") {
          task.status = "failed";
          task.error = safeError(error);
        }
      });
      finalize(operation);
      return snapshot(operation);
    });
    return snapshot(operation);
  }

  async function waitForOperation(operationId) {
    const operation = operations.get(operationId);
    if (!operation) throw clientGenerationError("CONTENT_GENERATION_OPERATION_NOT_FOUND", "Generation operation was not found");
    if (operation.promise) await operation.promise;
    const succeeded = operation.tasks.filter(function(task) { return task.status === "succeeded"; });
    const failed = operation.tasks.filter(function(task) { return task.status === "failed"; });
    if (operation.articleCount === 1) {
      if (failed.length) throw Object.assign(new Error(failed[0].error && failed[0].error.message || "文章生成失败"), failed[0].error || {});
      return contentStore.getArticle(operation.clientId, succeeded[0].articleId);
    }
    return {
      operationId: operation.id,
      articleCount: operation.articleCount,
      status: failed.length ? (succeeded.length ? "partial" : "failed") : "completed",
      articles: succeeded.map(function(task) { return { index: task.index, article: contentStore.getArticle(operation.clientId, task.articleId) }; }),
      failures: failed.map(function(task) { return { index: task.index, code: task.error && task.error.code || "CONTENT_GENERATION_FAILED" }; }),
    };
  }

  function generateArticle(input) {
    const started = start(input);
    return waitForOperation(started.operationId);
  }

  function subscribe(listener) {
    if (typeof listener !== "function") throw clientGenerationError("CONTENT_LISTENER_INVALID", "Generation listener is invalid");
    listeners.add(listener);
    return function() { listeners.delete(listener); };
  }

  async function dispose() {
    if (disposed) return;
    disposed = true;
    const active = Array.from(operations.values()).filter(function(operation) { return operation.status === "running"; });
    active.forEach(function(operation) { operation.controller.abort(); });
    await Promise.allSettled(active.map(function(operation) { return operation.promise; }));
    listeners.clear();
  }

  return {
    start: start,
    getState: getState,
    retryFailed: retryFailed,
    waitForOperation: waitForOperation,
    generateArticle: generateArticle,
    subscribe: subscribe,
    dispose: dispose,
  };
}

module.exports = { createClientGenerationService };
