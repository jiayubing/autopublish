const crypto = require("node:crypto");
const path = require("node:path");

const { listClients, getClient } = require("../../src/content/client-knowledge");
const { createClientMaterialStore } = require("../../src/content/client-material-store");
const { createResearchStore } = require("../../src/content/research-store");
const { createTemplateStore } = require("../../src/content/template-store");
const { createArticleStore } = require("../../src/content/article-store");
const { createArticleGenerator } = require("../../src/content/article-generator");
const { buildPrompt } = require("../../src/content/prompt-builder");
const { createGenerationBatchStore } = require("../../src/content/generation-batch-store");
const { createGenerationBatchRunner } = require("../../src/content/generation-batch-runner");

const MAX_CLIENTS = 1000;
const MAX_TEMPLATES = 1000;

const SAFE_MESSAGES = {
  GENERATION_INPUT_INVALID: "Generation batch input is invalid",
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
  GENERATION_STOPPED: "Generation batch is stopped",
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
  const articleStore = opts.articleStore || createArticleStore(workspaceRoot, { paths: paths });
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
  const runtimeId = opts.runtimeId || crypto.randomUUID();
  let sequence = 0;
  const now = typeof opts.now === "function" ? opts.now : function() { return new Date().toISOString(); };

  function notifyData(reasonCode) {
    if (typeof opts.onDataInvalidated !== "function") return;
    try { opts.onDataInvalidated(reasonCode); } catch (_) {}
  }

  function fingerprint() {
    const value = typeof provider.getFingerprint === "function" ? provider.getFingerprint() : opts.aiConfigFingerprint;
    if (value && typeof value.then === "function") return value;
    return value || "unconfigured";
  }

  function emit(value) {
    const event = safeEvent(value);
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
      try { listener(clone(event)); } catch (_) {}
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
    try { return await materialStore.listMaterials(clientId); } catch (error) { return []; }
  }

  function listResearch(clientId) {
    try { return researchStore.listResearch(clientId); } catch (error) { return []; }
  }

  function clientExists(clientId) {
    try { return Boolean(clientKnowledge.getClient(clientId)); } catch (_) { return false; }
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
        let template;
        if (typeof templateStore.getTemplate === "function" && templateStore.getTemplate.length <= 1 &&
            (typeof templateStore.getCatalogTemplate !== "function" || templateStore.getCatalogTemplate === templateStore.getTemplate)) {
          template = templateStore.getTemplate({ platformId: item.platform, templateId: item.templateId });
        } else if (typeof templateStore.getCatalogTemplate === "function") {
          template = templateStore.getCatalogTemplate({ platformId: item.platform, templateId: item.templateId });
        } else if (typeof templateStore.getTemplate === "function") {
          // Compatibility adapter for older injected test doubles. The real store
          // above only exposes the catalog interface to business callers.
          template = templateStore.getTemplate(item.platform, item.templateId);
        }
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
      taskCount: clientIds.length * templates.length,
      executableTaskCount: tasks.length,
      excludedTaskCount: (clientIds.length - resolved.sources.length) * templates.length,
      excludedClients: resolved.excludedClients,
      templates: templates,
      clientSources: resolved.sources,
      tasks: tasks
    };
  }

  async function prepareBatch(input) {
    const result = await preview(input);
    return Object.assign({ preparedAt: new Date().toISOString() }, result);
  }

  async function revalidateBatch(input) {
    return preview(input);
  }

  function assertAvailable() {
    if (disposed) throw generationError("GENERATION_RUNNER_DISPOSED");
    if (activeRun || activeStatus === "running" || activeStatus === "pausing" || activeStatus === "stopping") throw generationError("GENERATION_BATCH_BUSY");
  }

  function currentState(persistedBatch) {
    const runnerState = runner && typeof runner.getState === "function" ? runner.getState() : {};
    const status = activeStatus !== "idle" ? activeStatus : (runnerState.status || "idle");
    let counts = null;
    let updatedAt = runnerState.updatedAt || now();
    const batchId = activeBatchId || runnerState.batchId || null;
    if (batchId && !persistedBatch) {
      try {
        persistedBatch = batchStore.getBatch(batchId);
      } catch (_) {}
    }
    if (persistedBatch) {
      counts = persistedBatch.counts || runnerState.counts || null;
      updatedAt = status === persistedBatch.status ? (persistedBatch.updatedAt || updatedAt) : updatedAt;
    }
    return { state: status, status: status, batchId: batchId, counts: clone(counts), updatedAt: updatedAt,
      concurrency: 1, runtimeId: runtimeId, sequence: sequence, isBatchRunning: ["running", "pausing", "stopping"].includes(status), isStopPending: status === "stopping" };
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
      batch = batches.find(function(item) { return canResume(item) || ["running", "pausing", "stopping"].includes(item.status); }) || batches[batches.length - 1] || null;
    }
    const runtime = currentState(batch && activeBatchIdForSnapshot === batch.id ? batch : undefined);
    return {
      runtimeId: runtimeId,
      sequence: sequence,
      runtime: runtime,
      batch: clone(batch),
      capabilities: {
        canResume: canResume(batch),
        canContinue: canResume(batch),
        canRetry: Boolean(batch && batch.status === "failed"),
        canCancel: Boolean(batch && batch.tasks && batch.tasks.some(function(task) { return task.status === "pending"; }))
      }
    };
  }

  async function findExistingArticle(task) {
    function isNotFound(error) {
      return error && (error.code === "ARTICLE_NOT_FOUND" || error.code === "GENERATION_ARTICLE_NOT_FOUND");
    }
    if (typeof articleStore.findByGenerationTaskId === "function") {
      try { return await articleStore.findByGenerationTaskId(task.id); }
      catch (error) { if (isNotFound(error)) return null; throw error; }
    }
    if (typeof articleStore.listArticles !== "function") return null;
    try {
      const articles = await articleStore.listArticles(task.clientId);
      return articles.find(function(article) { return article.generationTaskId === task.id; }) || null;
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  async function executeTask(task, context) {
    const aiClient = opts.aiClient || (typeof provider.createClient === "function" ? provider.createClient() : null);
    if (!aiClient && generatorFactory === createArticleGenerator) throw generationError("AI_CONFIG_NOT_SET");
    const signal = context && context.signal;
    const signalClient = aiClient ? { complete: function(messages) { return aiClient.complete(messages, { signal: signal }); } } : null;
    const generator = generatorFactory({
      getClient: function(clientId) { return clientKnowledge.getClient(clientId); },
      researchStore: researchStore, materialStore: materialStore, templateStore: templateStore,
      buildPrompt: promptFactory, aiClient: signalClient, createId: createId, seenIds: seenIds
    });
    const article = await generator.generateArticle({ clientId: task.clientId, materialIds: task.materialIds,
      researchQueryIds: task.researchQueryIds, platform: task.platform, templateId: task.templateId,
      generationBatchId: activeBatchId, generationTaskId: task.id });
    if (!article || typeof article.id !== "string") throw generationError("GENERATION_ARTICLE_INVALID");
    article.status = "generated";
    article.generationBatchId = activeBatchId;
    article.generationTaskId = task.id;
    articleStore.saveArticle(article);
    return { id: article.id, articleId: article.id };
  }

  function ensureRunner() {
    if (runner) return runner;
    runner = (opts.runnerFactory || createGenerationBatchRunner)({ batchStore: batchStore, executeTask: executeTask,
      findByGenerationTaskId: findExistingArticle, concurrency: 1 });
    if (runner && typeof runner.subscribe === "function") runner.subscribe(function(event) { emit(event); });
    return runner;
  }

  async function createBatch(input) {
    assertAvailable();
    const previewResult = await prepareBatch(input);
    if (!previewResult.executableTaskCount) throw generationError("GENERATION_NO_EXECUTABLE_TASKS");
    const batch = batchStore.createBatch({ clientSources: previewResult.clientSources, templates: previewResult.templates,
      aiConfigFingerprint: await fingerprint(), concurrency: 1 });
    emitBatch(batch);
    notifyData("GENERATION_BATCH_CREATED");
    return clone(batch);
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
      const activeRunner = ensureRunner();
      activeStatus = "running";
      emitBatch(batch, "running");
      const runnerPromise = activeRunner.run(batchId, selection);
      const work = Promise.resolve(runnerPromise)
        .then(function(result) {
          emitBatch(result, result && result.status);
          if (result && ["completed", "failed", "stopped", "interrupted", "paused_configuration"].includes(result.status)) notifyData("GENERATION_BATCH_TERMINAL");
          return clone(result);
        })
        .catch(function(error) {
          let failedBatch = null;
          try {
            failedBatch = batchStore.getBatch(batchId);
            if (["pending", "running", "stopping", "interrupted"].includes(failedBatch.status) && typeof batchStore.updateBatchStatus === "function") {
              failedBatch = batchStore.updateBatchStatus(batchId, "failed");
            }
          } catch (_) {}
          if (failedBatch) emitBatch(failedBatch, "failed", error);
          else emit({ batchId: batchId, status: "failed", counts: null, updatedAt: now(), error: error });
          return runtimeBatch(failedBatch || batch, "failed", error);
        })
        .finally(function() {
          if (activeRun === reservation) {
            activeRun = null;
            activeStatus = "idle";
            activeBatchId = null;
          }
        });
      reservation.promise = work;
      return runtimeBatch(batch, "running");
    } catch (error) {
      if (activeRun === reservation) {
        activeRun = null;
        activeStatus = "idle";
        activeBatchId = null;
      }
      throw error;
    }
  }

  async function startBatch(input) {
    const value = assertObject(input);
    if (value.batchId) return runBatch(assertId(value.batchId, "batch id"), "pending", value.confirmConfigChange === true);
    const batch = await createBatch(value);
    return runBatch(batch.id, "pending", false);
  }

  async function continueBatch(input) {
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
    return clone(batch);
  }

  async function requestStop(input, commandStatus) {
    if (input !== undefined) {
      const value = assertObject(input);
      if (value.batchId !== undefined && value.batchId !== activeBatchId) throw generationError("GENERATION_BATCH_BUSY");
    }
    if (!runner || !activeRun || activeStatus === "idle") return null;
    activeStatus = commandStatus;
    const batch = batchStore.getBatch(activeBatchId);
    emitBatch(batch, commandStatus);
    Promise.resolve().then(function() { return typeof runner[commandStatus === "pausing" ? "pause" : "stop"] === "function" ? runner[commandStatus === "pausing" ? "pause" : "stop"]() : runner.stop(); })
      .catch(function() { return undefined; });
    return runtimeBatch(batch, commandStatus);
  }

  async function createAndStartBatch(input) {
    const batch = await createBatch(input);
    return runBatch(batch.id, "pending", false);
  }

  async function stopBatch(input) {
    return requestStop(input, "stopping");
  }

  async function pauseBatch(input) {
    return requestStop(input, "pausing");
  }

  function get(batchId) { return clone(batchStore.getBatch(assertId(batchId, "batch id"))); }
  function list() { return clone(batchStore.listBatches()); }
  function subscribe(listener) {
    if (typeof listener !== "function") throw generationError("GENERATION_INPUT_INVALID", "Listener is invalid");
    listeners.add(listener);
    return function() { listeners.delete(listener); };
  }
  async function dispose() { if (disposed) return; disposed = true; if (runner && typeof runner.dispose === "function") await runner.dispose(); if (activeRun && activeRun.promise) await activeRun.promise.catch(function() { return undefined; }); listeners.clear(); }

  return {
    preview: preview, previewBatch: preview, prepare: prepareBatch, prepareBatch: prepareBatch, revalidate: revalidateBatch, revalidateBatch: revalidateBatch,
    createBatch: createBatch, createAndStartBatch: createAndStartBatch, createAndStartGenerationBatch: createAndStartBatch, startBatch: startBatch, startGenerationBatch: startBatch, startPreparedBatch: startBatch,
    continueBatch: continueBatch, continueGenerationBatch: continueBatch, resumeBatch: continueBatch, resumeGenerationBatch: continueBatch,
    pauseBatch: pauseBatch, pauseGenerationBatch: pauseBatch, stopBatch: stopBatch, stopGenerationBatch: stopBatch,
    retryFailed: retryFailed, retryFailedBatch: retryFailed, retryFailedGenerationBatch: retryFailed,
    previewCancelPending: previewCancelPending, previewCancelPendingGenerationBatch: previewCancelPending,
    cancelPending: cancelPending, cancelPendingGenerationBatch: cancelPending,
    get: get, getBatch: get, getGenerationBatch: get, list: list, listBatches: list, listGenerationBatches: list,
    getState: currentState, getGenerationBatchState: currentState, getRuntimeSnapshot: runtimeSnapshot, getGenerationRuntimeSnapshot: runtimeSnapshot, subscribe: subscribe, dispose: dispose
  };
}

module.exports = { createContentGenerationBatchService, SAFE_MESSAGES };
