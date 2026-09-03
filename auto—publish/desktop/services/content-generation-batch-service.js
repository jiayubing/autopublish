const crypto = require("node:crypto");
const path = require("node:path");

const { listClients, getClient } = require("../../src/content/client-knowledge");
const { createClientMaterialStore } = require("../../src/content/client-material-store");
const { createResearchStore } = require("../../src/content/research-store");
const { createTemplateStore } = require("../../src/content/template-store");
const { createArticleGenerator } = require("../../src/content/article-generator");
const { buildPrompt } = require("../../src/content/prompt-builder");
const { createGenerationBatchStore } = require("../../src/content/generation-batch-store");
const { createGenerationBatchRunner } = require("../../src/content/generation-batch-runner");
const { reportDiagnostic } = require("../../src/diagnostics/diagnostic-producer");

const MAX_CLIENTS = 1000;
const MAX_TEMPLATES = 1000;
const MAX_SOURCE_ITEMS = 50;
const MAX_TASKS = 1000;

const SAFE_MESSAGES = {
  GENERATION_INPUT_INVALID: "Generation batch input is invalid",
  GENERATION_SOURCE_LIMIT: "Selected materials and research answers must contain at most 50 items each",
  GENERATION_TASK_LIMIT: "Generation batch has too many tasks",
  GENERATION_CLIENTS_REQUIRED: "At least one batch client is required",
  GENERATION_TEMPLATES_REQUIRED: "At least one writing template is required",
  GENERATION_CLIENT_NOT_FOUND: "Client was not found",
  CLIENT_MATERIAL_REQUIRED: "At least one valid client material is required",
  CLIENT_MATERIAL_INVALID: "Selected client material is invalid",
  GEO_RESEARCH_REQUIRED: "At least one valid GEO research answer is required",
  GEO_RESEARCH_INVALID: "Selected GEO research answer is invalid",
  GENERATION_TEMPLATE_NOT_FOUND: "写作模板不存在",
  GENERATION_TEMPLATE_INVALID: "写作模板格式无效，请检查具体模板诊断",
  GENERATION_TEMPLATE_STALE: "模板目录已变化，请刷新后重新选择模板",
  GENERATION_NO_EXECUTABLE_TASKS: "No executable generation tasks are available",
  GENERATION_BATCH_BUSY: "Generation batch is already running",
  GENERATION_BATCH_NOT_FOUND: "Generation batch was not found",
  GENERATION_AI_CONFIG_CHANGED: "AI configuration changed; confirm before continuing",
  AI_CONFIG_NOT_SET: "AI provider configuration is not set",
  AI_CONFIG_BUSY: "AI provider configuration is unavailable while generation is running",
  GENERATION_BATCH_NOT_ENDABLE: "Generation batch cannot be ended",
  GENERATION_END_CONFIRMATION_REQUIRED: "Confirm before ending the generation batch",
  GENERATION_RUNNER_DISPOSED: "Generation service is disposed",
  GENERATION_WORKSPACE_REQUIRED: "Workspace root is required",
  GENERATION_INVALID_ID: "Generation identifier is invalid",
  GENERATION_SOURCE_INVALID: "Generation source is invalid",
  GENERATION_MATERIAL_IDS_REQUIRED: "At least one client material is required",
  GENERATION_RESEARCH_IDS_REQUIRED: "At least one GEO research answer is required",
  GENERATION_BATCH_INVALID: "Generation batch data is invalid",
  GENERATION_TASK_NOT_FOUND: "Generation task was not found",
  GENERATION_TASK_CONFLICT: "Generation task already has a different article",
  GENERATION_TASK_ALREADY_SUCCEEDED: "Succeeded generation task cannot run again",
  GENERATION_TASK_BUSY: "Generation task is already running",
  GENERATION_CANCEL_CONFIRMATION_REQUIRED: "Confirm before permanently cancelling pending generation tasks",
  GENERATION_ARTICLE_INVALID: "Generation task did not produce a valid article",
  GENERATION_BATCH_STATE_UNAVAILABLE: "Generation batch state could not be confirmed",
  GENERATION_CONTROL_FAILED: "Generation batch control request failed",
  AI_CONFIG_INVALID: "AI provider configuration is invalid",
  AI_UNAUTHORIZED: "AI provider authorization failed",
  AI_FORBIDDEN: "AI provider access was denied",
  AI_MODEL_NOT_FOUND: "AI model was not found",
  AI_RATE_LIMITED: "AI provider rate limit reached",
  AI_TIMEOUT: "AI provider request timed out",
  AI_NETWORK_ERROR: "AI provider network request failed",
  AI_SERVER_ERROR: "AI provider server request failed",
  AI_EMPTY_RESPONSE: "AI provider returned an empty response"
};

function generationError(code, message, cause) {
  const error = new Error(message || SAFE_MESSAGES[code] || "Generation batch operation failed");
  error.code = code;
  if (cause) error.cause = cause;
  return error;
}

function clone(value) {
  return value === undefined ? value : JSON.parse(JSON.stringify(value));
}

function assertObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw generationError("GENERATION_INPUT_INVALID");
  return value;
}

function assertId(value, label) {
  const deviceName = typeof value === "string" ? value.split(".")[0].replace(/[ .]+$/g, "").toUpperCase() : "";
  if (typeof value !== "string" || !value.trim() || value.trim() !== value || value.length > 200 || value === "." || value === ".." ||
      value.includes("/") || value.includes("\\") || /[<>:"|?*\u0000-\u001F]/.test(value) || value.endsWith(" ") || value.endsWith(".") ||
      /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/.test(deviceName) || path.isAbsolute(value) || path.win32.isAbsolute(value)) {
    throw generationError("GENERATION_INPUT_INVALID", "Invalid " + label);
  }
  return value;
}

function arrayInput(value, code, label, required) {
  if (!Array.isArray(value) || (required && value.length === 0) || value.length > MAX_CLIENTS) {
    throw generationError(code, label + " is invalid");
  }
  return value;
}

function uniqueIds(values, label) {
  const seen = new Set();
  return values.map(function(value) {
    assertId(value, label);
    if (seen.has(value)) throw generationError("GENERATION_INPUT_INVALID", label + " is duplicated");
    seen.add(value);
    return value;
  });
}

function normalizeTemplates(value) {
  arrayInput(value, "GENERATION_TEMPLATES_REQUIRED", "Templates", true);
  if (value.length > MAX_TEMPLATES) throw generationError("GENERATION_TEMPLATES_REQUIRED", "Too many templates");
  const seen = new Set();
  return value.map(function(template) {
    assertObject(template);
    const platform = assertId(template.platform, "platform");
    const templateId = assertId(template.templateId, "template id");
    const key = platform + "\u0000" + templateId;
    if (seen.has(key)) throw generationError("GENERATION_INPUT_INVALID", "Template is duplicated");
    seen.add(key);
    return { platform: platform, templateId: templateId };
  });
}

function selectedSource(input, clientId) {
  const candidates = Array.isArray(input.clientSources) ? input.clientSources :
    (Array.isArray(input.sources) ? input.sources : []);
  const found = candidates.find(function(item) { return item && item.clientId === clientId; });
  if (found) return found;
  if (input.sources && !Array.isArray(input.sources) && typeof input.sources === "object") return input.sources[clientId];
  return null;
}

  function selectedIds(source, field) {
  if (!source || source[field] === undefined) return null;
  if (!Array.isArray(source[field])) throw generationError("GENERATION_INPUT_INVALID", field + " is invalid");
  if (source[field].length > MAX_SOURCE_ITEMS) throw generationError("GENERATION_SOURCE_LIMIT");
  return uniqueIds(source[field], field);
}

function validMaterial(item) {
  return item && item.status === "ready" && typeof item.content === "string" && Boolean(item.content.trim());
}

function validResearch(item) {
  return item && item.isAnswerComplete !== false && typeof item.answerText === "string" && Boolean(item.answerText.trim());
}

function safeEvent(event) {
  const value = event || {};
  const result = {};
  ["batchId", "taskId", "clientId", "platform", "templateId", "status", "counts", "error", "updatedAt", "batch", "capabilities"].forEach(function(key) {
    if (value[key] !== undefined) result[key] = clone(value[key]);
  });
  if (result.batchId === undefined) result.batchId = null;
  if (result.status === undefined) result.status = "idle";
  if (result.counts === undefined) result.counts = null;
  if (result.updatedAt === undefined) result.updatedAt = new Date().toISOString();
  if (result.error) result.error = {
    code: typeof result.error.code === "string" ? result.error.code.slice(0, 100) : "GENERATION_TASK_FAILED",
    message: typeof result.error.message === "string" ? result.error.message.slice(0, 200) : "Generation task failed"
  };
  return result;
}

function createContentGenerationBatchService(options) {
  const opts = options || {};
  if (typeof opts.workspaceRoot !== "string" && !opts.batchStore) throw generationError("GENERATION_WORKSPACE_REQUIRED", "Workspace root is required");
  const workspaceRoot = opts.workspaceRoot;
  const paths = opts.paths;
  const clientKnowledge = opts.clientKnowledge || {
    listClients: function() { return listClients(workspaceRoot); },
    getClient: function(clientId) { return getClient(workspaceRoot, clientId); }
  };
  const materialStore = opts.materialStore || createClientMaterialStore({ workspaceRoot: workspaceRoot, paths: paths });
  const researchStore = opts.researchStore || createResearchStore(workspaceRoot, { paths: paths });
  const templateStore = opts.templateStore || createTemplateStore(workspaceRoot, { paths: paths });
  const contentStore = opts.contentStore;
  const articleMutationCoordinator = opts.articleMutationCoordinator || null;
  if (!contentStore || (typeof contentStore.createArticle !== "function" && typeof contentStore.saveArticle !== "function") || typeof contentStore.findByGenerationTaskId !== "function") {
    throw generationError("GENERATION_CONTENT_STORE_REQUIRED", "Content store is required");
  }
  const batchStore = opts.batchStore || createGenerationBatchStore({ workspaceRoot: workspaceRoot, paths: paths });
  const provider = opts.aiProviderService || {};
  const generatorFactory = opts.articleGeneratorFactory || createArticleGenerator;
  const promptFactory = opts.buildPrompt || buildPrompt;
  const createId = opts.createId || function() { return crypto.randomUUID(); };
  const seenIds = opts.seenIds || new Set();
  const listeners = new Set();
  let disposed = false;
  let activeStatus = "idle";
  let activeBatchId = null;
  let activeRun = null;
  let runner;
  let sourceCache = null;
  const runtimeId = opts.runtimeId || crypto.randomUUID();
  let sequence = 0;
  const now = typeof opts.now === "function" ? opts.now : function() { return new Date().toISOString(); };

  function notifyData(reasonCode) {
    if (typeof opts.onDataInvalidated !== "function") return;
    try { opts.onDataInvalidated(reasonCode); } catch (error) {
      reportDiagnostic({
        code: "GENERATION_BATCH_INVALIDATION_LISTENER_FAILED",
        module: "content-generation-batch-service",
        category: "internal",
        operationId: "generation-batch-invalidation",
        metadata: {
          operation: "data-invalidation-listener",
          phase: "notify",
          outcome: "listener-isolated",
          reasonCode: typeof reasonCode === "string" && /^[A-Za-z][A-Za-z0-9._:-]{0,127}$/.test(reasonCode)
            ? reasonCode
            : "UNSPECIFIED",
          errorCode: error && /^[A-Z][A-Z0-9_]{1,127}$/.test(error.code || "")
            ? error.code
            : "LISTENER_FAILED"
        }
      });
    }
  }

  function fingerprint() {
    const value = typeof provider.getFingerprint === "function" ? provider.getFingerprint() : opts.aiConfigFingerprint;
    if (value && typeof value.then === "function") return value;
    return value || "unconfigured";
  }

  function projectedArticleTitle(value) {
    if (typeof value !== "string") return null;
    const title = value
      .replace(/[\x00-\x1f\x7f]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 300);
    return title || null;
  }

  function enrichBatch(batch) {
    if (!batch || !Array.isArray(batch.tasks)) return batch;
    const enriched = clone(batch);
    const taskIds = enriched.tasks
      .filter(function(task) { return task && task.status === "succeeded" && task.articleId; })
      .map(function(task) { return task.id; });
    if (!taskIds.length) return enriched;
    const articleByTaskId = new Map();
    try {
      if (typeof contentStore.resolveIdentities === "function") {
        const resolved = contentStore.resolveIdentities({ generationTaskIds: taskIds });
        (resolved && Array.isArray(resolved.generationTaskIds) ? resolved.generationTaskIds : []).forEach(function(entry) {
          const article = entry && entry.result && entry.result.kind === "one"
            ? entry.result.article
            : null;
          const title = projectedArticleTitle(article && article.title);
          if (article && typeof article.id === "string" && title)
            articleByTaskId.set(entry.id, { id: article.id, title });
        });
      } else {
        taskIds.forEach(function(taskIdValue) {
          const resolved = contentStore.findByGenerationTaskId(taskIdValue);
          const article = resolved && resolved.kind === "one" ? resolved.article : null;
          const title = projectedArticleTitle(article && article.title);
          if (article && typeof article.id === "string" && title)
            articleByTaskId.set(taskIdValue, { id: article.id, title });
        });
      }
    } catch (_) {
      return enriched;
    }
    enriched.tasks = enriched.tasks.map(function(task) {
      const article = articleByTaskId.get(task.id);
      if (!article || article.id !== task.articleId) return task;
      return Object.assign({}, task, { articleTitle: article.title });
    });
    return enriched;
  }

  function emit(value) {
    const source = value && value.batch
      ? Object.assign({}, value, { batch: enrichBatch(value.batch) })
      : value;
    const event = safeEvent(source);
    if (!event.capabilities && event.batch) {
      event.capabilities = {
        canResume: canResume(event.batch),
        canContinue: canResume(event.batch),
        canRetry: event.batch.status === "failed",
        canCancel: Array.isArray(event.batch.tasks) && event.batch.tasks.some(function(task) { return task.status === "pending"; })
      };
    }
    event.runtimeId = runtimeId;
    event.sequence = ++sequence;
    listeners.forEach(function(listener) {
      try { listener(clone(event)); } catch (error) {
        reportDiagnostic({
          code: "GENERATION_BATCH_LISTENER_FAILED",
          module: "content-generation-batch-service",
          category: "internal",
          operationId: "generation-batch-notify",
          metadata: {
            operation: "subscriber-notify",
            phase: "notify",
            outcome: "listener-isolated",
            errorCode: error && /^[A-Z][A-Z0-9_]{1,127}$/.test(error.code || "")
              ? error.code
              : "LISTENER_FAILED"
          }
        });
      }
    });
  }

  function emitBatch(batch, status, error) {
    if (batch) emit({ batchId: batch.id, status: status || batch.status, counts: batch.counts, batch: batch, updatedAt: now(), error: error });
  }

  function runtimeBatch(batch, status, error) {
    if (!batch) return null;
    const result = clone(batch);
    result.status = status || result.status;
    result.updatedAt = now();
    if (error) result.error = { code: error.code || "GENERATION_BATCH_FAILED", message: error.message || "Generation batch failed" };
    return result;
  }

  async function listMaterials(clientId) {
    return materialStore.listMaterials(clientId);
  }

  function listResearch(clientId) {
    return researchStore.listResearch(clientId);
  }

  function clientExists(clientId) {
    return Boolean(clientKnowledge.getClient(clientId));
  }

  async function resolveSources(input, clientIds) {
    const sources = [];
    const excludedClients = [];
    for (const clientId of clientIds) {
      const codes = [];
      if (!clientExists(clientId)) {
        excludedClients.push({ clientId: clientId, codes: ["GENERATION_CLIENT_NOT_FOUND"] });
        continue;
      }
      const source = selectedSource(input, clientId);
      const materials = await listMaterials(clientId);
      const readyMaterials = materials.filter(validMaterial);
      const materialIds = selectedIds(source, "materialIds");
      if (materialIds === null && readyMaterials.length > MAX_SOURCE_ITEMS) codes.push("GENERATION_SOURCE_LIMIT");
      const selectedMaterials = materialIds === null ? readyMaterials : materialIds.map(function(id) {
        return materials.find(function(item) { return item && (item.id === id || item.name === id); });
      });
      if (!selectedMaterials.length) codes.push("CLIENT_MATERIAL_REQUIRED");
      else if (selectedMaterials.some(function(item) { return !validMaterial(item); })) codes.push("CLIENT_MATERIAL_INVALID");

      const researches = listResearch(clientId);
      const validResearches = researches.filter(validResearch);
      const researchQueryIds = selectedIds(source, "researchQueryIds");
      const selectedResearch = researchQueryIds === null ? validResearches : researchQueryIds.map(function(id) {
        return researches.find(function(item) { return item && item.id === id; });
      });
      if (researchQueryIds === null && validResearches.length > MAX_SOURCE_ITEMS) codes.push("GENERATION_SOURCE_LIMIT");
      if (!selectedResearch.length) codes.push("GEO_RESEARCH_REQUIRED");
      else if (selectedResearch.some(function(item) { return !validResearch(item); })) codes.push("GEO_RESEARCH_INVALID");

      if (codes.length) excludedClients.push({ clientId: clientId, codes: codes });
      else sources.push({ clientId: clientId,
        materialIds: selectedMaterials.map(function(item) { return item.id || item.name; }),
        researchQueryIds: selectedResearch.map(function(item) { return item.id; }) });
    }
    return { sources: sources, excludedClients: excludedClients };
  }

  async function validateTemplates(templates) {
    return Promise.all(templates.map(function(item) {
      try {
        const template = templateStore.getCatalogTemplate({
          platformId: item.platform,
          templateId: item.templateId
        });
        if (!template || typeof template.body !== "string" || !template.body.trim()) throw generationError("GENERATION_TEMPLATE_NOT_FOUND");
        const selection = { platform: item.platform, templateId: item.templateId };
        if (template.source === "builtin" || template.source === "custom") selection.source = template.source;
        if (template.readOnly === true) selection.readOnly = true;
        return selection;
      } catch (error) {
        if (error && error.code === "GENERATION_TEMPLATE_NOT_FOUND") throw error;
        if (error && error.code === "TEMPLATE_NOT_FOUND") {
          const missing = generationError("GENERATION_TEMPLATE_NOT_FOUND");
          missing.platformId = item.platform;
          missing.templateId = item.templateId;
          throw missing;
        }
        const invalid = generationError("GENERATION_TEMPLATE_INVALID");
        invalid.platformId = item.platform;
        invalid.templateId = item.templateId;
        if (error && typeof error.diagnosticCode === "string") invalid.diagnosticCode = error.diagnosticCode;
        throw invalid;
      }
    }));
  }

  function validateCatalogRevision(value) {
    if (value.templateCatalogRevision === undefined) return;
    const requestedRevision = assertId(value.templateCatalogRevision, "template catalog revision");
    if (!templateStore || typeof templateStore.listCatalog !== "function") return;
    const catalog = templateStore.listCatalog();
    if (catalog && catalog.revision && catalog.revision !== requestedRevision) {
      const error = generationError("GENERATION_TEMPLATE_STALE");
      error.diagnosticCode = "TEMPLATE_CATALOG_REVISION_CHANGED";
      throw error;
    }
  }

  async function preview(input) {
    const value = assertObject(input);
    const clientInput = value.clientIds === undefined && Array.isArray(value.clientSources)
      ? value.clientSources.map(function(source) { return source && source.clientId; })
      : value.clientIds;
    const clientIds = uniqueIds(arrayInput(clientInput, "GENERATION_CLIENTS_REQUIRED", "Client ids", true), "client id");
    validateCatalogRevision(value);
    const templates = await validateTemplates(normalizeTemplates(value.templates));
    const resolved = await resolveSources(value, clientIds);
    const taskCount = clientIds.length * templates.length;
    if (taskCount > MAX_TASKS) throw generationError("GENERATION_TASK_LIMIT");
    const tasks = [];
    resolved.sources.forEach(function(source) {
      templates.forEach(function(template) {
        tasks.push({ clientId: source.clientId, platform: template.platform, templateId: template.templateId,
          materialIds: source.materialIds.slice(), researchQueryIds: source.researchQueryIds.slice() });
      });
    });
    return {
      clientCount: clientIds.length,
      executableClientCount: resolved.sources.length,
      taskCount: taskCount,
      executableTaskCount: tasks.length,
      excludedTaskCount: (clientIds.length - resolved.sources.length) * templates.length,
      excludedClients: resolved.excludedClients,
      templates: templates,
      clientSources: resolved.sources,
      tasks: tasks
    };
  }

  function assertAvailable() {
    if (disposed) throw generationError("GENERATION_RUNNER_DISPOSED");
    if (activeRun || activeStatus === "running" || activeStatus === "pausing") throw generationError("GENERATION_BATCH_BUSY");
  }

  function currentState(persistedBatch) {
    const runnerState = runner && typeof runner.getState === "function" ? runner.getState() : {};
    const status = activeStatus !== "idle" ? activeStatus : (runnerState.status || "idle");
    let counts = null;
    let updatedAt = runnerState.updatedAt || now();
    const batchId = activeBatchId || runnerState.batchId || null;
    if (batchId && !persistedBatch) {
      persistedBatch = batchStore.getBatch(batchId);
      if (!persistedBatch) throw generationError("GENERATION_BATCH_STATE_UNAVAILABLE");
    }
    if (persistedBatch) {
      counts = persistedBatch.counts || runnerState.counts || null;
      updatedAt = status === persistedBatch.status ? (persistedBatch.updatedAt || updatedAt) : updatedAt;
    }
    return { state: status, status: status, batchId: batchId, counts: clone(counts), updatedAt: updatedAt,
      concurrency: runnerState.concurrency || (persistedBatch && persistedBatch.concurrency) || 2, runtimeId: runtimeId, sequence: sequence, isBatchRunning: ["running", "pausing"].includes(status), isStopPending: false };
  }

  function canResume(batch) {
    return Boolean(batch && ["pending", "failed", "interrupted", "paused", "paused_configuration"].includes(batch.status) && batch.tasks && batch.tasks.some(function(task) { return ["pending", "failed", "interrupted"].includes(task.status); }));
  }

  function runtimeSnapshot() {
    const runnerState = runner && typeof runner.getState === "function" ? runner.getState() : {};
    const activeBatchIdForSnapshot = activeBatchId || runnerState.batchId || null;
    let batch = activeBatchIdForSnapshot ? batchStore.getBatch(activeBatchIdForSnapshot) : null;
    if (!batch) {
      const batches = batchStore.listBatches();
      const newest = batches[0] || null;
      batch = newest && newest.status === "abandoned"
        ? null
        : batches.find(function(item) { return canResume(item) || ["running", "pausing"].includes(item.status); }) || newest;
    }
    const runtime = currentState(batch && activeBatchIdForSnapshot === batch.id ? batch : undefined);
    return {
      runtimeId: runtimeId,
      sequence: sequence,
      runtime: runtime,
      batch: enrichBatch(batch),
      capabilities: {
        canResume: canResume(batch),
        canContinue: canResume(batch),
        canRetry: Boolean(batch && batch.status === "failed"),
        canCancel: Boolean(batch && batch.tasks && batch.tasks.some(function(task) { return task.status === "pending"; }))
      }
    };
  }

  async function executeTask(task, context) {
    const aiClient = opts.aiClient || (typeof provider.createClient === "function" ? provider.createClient() : null);
    if (!aiClient && generatorFactory === createArticleGenerator) throw generationError("AI_CONFIG_NOT_SET");
    const signal = context && context.signal;
    const signalClient = aiClient ? { complete: function(messages) { return aiClient.complete(messages, { signal: signal }); } } : null;
    if (!sourceCache) sourceCache = { materials: new Map(), research: new Map() };
    const scopedMaterialStore = Object.assign({}, materialStore, {
      getSelectedMaterials: async function(clientId, ids) {
        const key = clientId + "\u0000" + ids.join("\u0000");
        if (!sourceCache.materials.has(key)) sourceCache.materials.set(key, materialStore.getSelectedMaterials(clientId, ids));
        return sourceCache.materials.get(key);
      }
    });
    const scopedResearchStore = Object.assign({}, researchStore, {
      getResearch: function(clientId, id) {
        const key = clientId + "\u0000" + id;
        if (!sourceCache.research.has(key)) sourceCache.research.set(key, researchStore.getResearch(clientId, id));
        return sourceCache.research.get(key);
      }
    });
    const generator = generatorFactory({
      getClient: function(clientId) { return clientKnowledge.getClient(clientId); },
      researchStore: scopedResearchStore, materialStore: scopedMaterialStore, templateStore: templateStore,
      buildPrompt: promptFactory, aiClient: signalClient, createId: createId, seenIds: seenIds
    });
    const article = await generator.generateArticle({ clientId: task.clientId, materialIds: task.materialIds,
      researchQueryIds: task.researchQueryIds, platform: task.platform, templateId: task.templateId,
      generationBatchId: activeBatchId, generationTaskId: task.id });
    if (!article || typeof article.id !== "string") throw generationError("GENERATION_ARTICLE_INVALID");
    article.status = "generated";
    article.generationBatchId = activeBatchId;
    article.generationTaskId = task.id;
    if (articleMutationCoordinator && typeof articleMutationCoordinator.createArticle === "function") {
      articleMutationCoordinator.createArticle(article);
    } else if (typeof contentStore.createArticle === "function") {
      contentStore.createArticle(article);
    } else {
      contentStore.saveArticle(article);
    }
    return { id: article.id, articleId: article.id };
  }

  function ensureRunner(concurrency) {
    const requested = concurrency === undefined ? 2 : concurrency;
    if (runner && runner.getState && runner.getState().concurrency === requested) return runner;
    runner = (opts.runnerFactory || createGenerationBatchRunner)({ batchStore: batchStore, executeTask: executeTask,
      contentStore: contentStore, concurrency: requested });
    if (runner && typeof runner.subscribe === "function") runner.subscribe(function(event) { emit(event); });
    return runner;
  }

  async function createBatch(input) {
    assertAvailable();
    const previewResult = await preview(input);
    if (!previewResult.executableTaskCount) throw generationError("GENERATION_NO_EXECUTABLE_TASKS");
    const requestedConcurrency = input && input.concurrency !== undefined ? input.concurrency : 2;
    if (!Number.isInteger(requestedConcurrency) || requestedConcurrency < 1 || requestedConcurrency > 4) throw generationError("GENERATION_CONCURRENCY_INVALID");
    const batch = batchStore.createBatch({ clientSources: previewResult.clientSources, templates: previewResult.templates,
      aiConfigFingerprint: await fingerprint(), concurrency: requestedConcurrency });
    emitBatch(batch);
    notifyData("GENERATION_BATCH_CREATED");
    return enrichBatch(batch);
  }

  async function runBatch(batchId, selection, confirmConfigChange) {
    assertAvailable();
    const batch = batchStore.getBatch(batchId);
    if (!batch) throw generationError("GENERATION_BATCH_NOT_FOUND");
    const reservation = { batchId: batchId, selection: selection, promise: null };
    activeRun = reservation;
    activeBatchId = batchId;
    try {
      const currentFingerprint = await fingerprint();
      if (selection === "unfinished" && currentFingerprint !== batch.aiConfigFingerprint && confirmConfigChange !== true) {
        throw generationError("GENERATION_AI_CONFIG_CHANGED");
      }
      const activeRunner = ensureRunner(batch.concurrency || 2);
      activeStatus = "running";
      emitBatch(batch, "running");
      const runnerPromise = activeRunner.run(batchId, selection);
      const work = Promise.resolve(runnerPromise)
        .then(function(result) {
          emitBatch(result, result && result.status);
          if (result && ["completed", "failed", "abandoned", "interrupted", "paused_configuration", "paused"].includes(result.status)) notifyData("GENERATION_BATCH_TERMINAL");
          return enrichBatch(result);
        })
        .catch(function(error) {
          let failedBatch = null;
          let stateUnavailable = false;
          try {
            failedBatch = batchStore.getBatch(batchId);
            if (!failedBatch) {
              stateUnavailable = true;
            } else if (["pending", "running", "interrupted"].includes(failedBatch.status) && typeof batchStore.updateBatchStatus === "function") {
              failedBatch = batchStore.updateBatchStatus(batchId, "failed");
            } else if (["pending", "running", "interrupted"].includes(failedBatch.status)) {
              stateUnavailable = true;
            }
          } catch (stateError) {
            stateUnavailable = true;
            reportDiagnostic({
              code: "GENERATION_BATCH_STATE_READ_FAILED",
              module: "content-generation-batch-service",
              category: "storage",
              operationId: "generation-batch-failure-state",
              metadata: {
                operation: "batch-state-read",
                phase: "failure-recovery",
                outcome: "uncertain",
                errorCode: stateError && /^[A-Z][A-Z0-9_]{1,127}$/.test(stateError.code || "")
                  ? stateError.code
                  : "GENERATION_BATCH_STATE_READ_FAILED"
              }
            });
          }
          if (stateUnavailable) {
            const uncertain = generationError("GENERATION_BATCH_STATE_UNAVAILABLE");
            emit({ batchId: batchId, status: "interrupted", counts: null, updatedAt: now(), error: uncertain });
            return runtimeBatch(batch, "interrupted", uncertain);
          }
          if (failedBatch && failedBatch.status === "failed") emitBatch(failedBatch, "failed", error);
          else if (failedBatch) emitBatch(failedBatch, failedBatch.status, error);
          return runtimeBatch(failedBatch || batch, failedBatch ? failedBatch.status : "interrupted", error);
        })
        .finally(function() {
          if (activeRun === reservation) {
            activeRun = null;
            activeStatus = "idle";
            activeBatchId = null;
            sourceCache = null;
          }
        });
      reservation.promise = work;
      return runtimeBatch(batch, "running");
    } catch (error) {
      if (activeRun === reservation) {
        activeRun = null;
        activeStatus = "idle";
        activeBatchId = null;
        sourceCache = null;
      }
      throw error;
    }
  }

  async function startBatch(input) {
    const value = assertObject(input);
    return runBatch(assertId(value.batchId, "batch id"), "pending", value.confirmConfigChange === true);
  }

  async function resumeBatch(input) {
    const value = assertObject(input);
    return runBatch(assertId(value.batchId, "batch id"), "unfinished", value.confirmConfigChange === true);
  }

  async function retryFailed(input) {
    const value = assertObject(input);
    return runBatch(assertId(value.batchId, "batch id"), "failed", true);
  }

  function previewCancelPending(input) {
    const value = assertObject(input);
    const batchId = assertId(value.batchId, "batch id");
    const batch = batchStore.getBatch(batchId);
    const counts = { pending: 0, running: 0, cancelled: 0 };
    batch.tasks.forEach(function(task) {
      if (task.status === "pending" || task.status === "running" || task.status === "cancelled") counts[task.status] += 1;
    });
    return {
      batchId: batch.id,
      pendingCount: counts.pending,
      runningCount: counts.running,
      cancelledCount: counts.cancelled,
      canCancel: counts.pending > 0
    };
  }

  async function cancelPending(input) {
    const value = assertObject(input);
    if (value.confirmed !== true) throw generationError("GENERATION_CANCEL_CONFIRMATION_REQUIRED");
    const batchId = assertId(value.batchId, "batch id");
    if (!batchStore || typeof batchStore.cancelPending !== "function") throw generationError("GENERATION_BATCH_INVALID");
    const batch = batchStore.cancelPending(batchId);
    emitBatch(batch);
    notifyData("GENERATION_PENDING_TASKS_CANCELLED");
    return enrichBatch(batch);
  }

  async function requestPause(input) {
    if (input !== undefined) {
      const value = assertObject(input);
      if (value.batchId !== undefined && value.batchId !== activeBatchId) throw generationError("GENERATION_BATCH_BUSY");
    }
    if (!runner || !activeRun || activeStatus === "idle") return null;
    activeStatus = "pausing";
    const batch = batchStore.getBatch(activeBatchId);
    emitBatch(batch, "pausing");
    Promise.resolve().then(function() { return runner.pause(); })
      .catch(function(error) {
        const controlError = generationError("GENERATION_CONTROL_FAILED");
        activeStatus = "running";
        reportDiagnostic({
          code: "GENERATION_CONTROL_FAILED",
          module: "content-generation-batch-service",
          category: "internal",
          operationId: "generation-batch-control",
          metadata: {
            operation: "pause",
            phase: "command",
            outcome: "failed",
            errorCode: error && /^[A-Z][A-Z0-9_]{1,127}$/.test(error.code || "")
              ? error.code
              : "GENERATION_CONTROL_FAILED"
          }
        });
        emitBatch(batch, "running", controlError);
      });
    return runtimeBatch(batch, "pausing");
  }

  async function createAndStartBatch(input) {
    const batch = await createBatch(input);
    return runBatch(batch.id, "pending", false);
  }

  async function pauseBatch(input) {
    return requestPause(input);
  }

  async function abandonBatch(input) {
    const value = assertObject(input);
    if (value.confirmed !== true) throw generationError("GENERATION_END_CONFIRMATION_REQUIRED");
    const batchId = assertId(value.batchId, "batch id");
    if (activeRun && activeBatchId === batchId) throw generationError("GENERATION_BATCH_BUSY");
    if (!batchStore || typeof batchStore.abandonBatch !== "function") throw generationError("GENERATION_BATCH_INVALID");
    const batch = batchStore.abandonBatch(batchId);
    emitBatch(batch, "abandoned");
    notifyData("GENERATION_BATCH_TERMINAL");
    return enrichBatch(batch);
  }

  function getBatch(batchId) { return enrichBatch(batchStore.getBatch(assertId(batchId, "batch id"))); }
  function listBatches() { return batchStore.listBatches().map(enrichBatch); }
  function subscribe(listener) {
    if (typeof listener !== "function") throw generationError("GENERATION_INPUT_INVALID", "Listener is invalid");
    listeners.add(listener);
    return function() { listeners.delete(listener); };
  }
  async function dispose() {
    if (disposed) return;
    disposed = true;
    if (runner && typeof runner.dispose === "function") await runner.dispose();
    if (activeRun && activeRun.promise) {
      try { await activeRun.promise; } catch (error) {
        reportDiagnostic({
          code: "GENERATION_BATCH_DISPOSE_RUN_FAILED",
          module: "content-generation-batch-service",
          category: "storage",
          operationId: "generation-batch-dispose",
          metadata: {
            operation: "active-run-wait",
            phase: "cleanup",
            outcome: "best-effort-failed",
            errorCode: error && /^[A-Z][A-Z0-9_]{1,127}$/.test(error.code || "")
              ? error.code
              : "GENERATION_BATCH_DISPOSE_RUN_FAILED"
          }
        });
      }
    }
    listeners.clear();
  }

  return {
    preview,
    createBatch,
    startBatch,
    createAndStartBatch,
    pauseBatch,
    resumeBatch,
    abandonBatch,
    retryFailed,
    previewCancelPending,
    cancelPending,
    getBatch,
    listBatches,
    getState: currentState,
    getRuntimeSnapshot: runtimeSnapshot,
    subscribe,
    dispose,
  };
}

module.exports = { createContentGenerationBatchService, SAFE_MESSAGES };
