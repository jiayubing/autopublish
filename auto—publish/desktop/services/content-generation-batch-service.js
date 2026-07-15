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
  GENERATION_TEMPLATE_NOT_FOUND: "Writing template was not found",
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
  ["batchId", "taskId", "clientId", "platform", "templateId", "status", "counts", "error", "updatedAt"].forEach(function(key) {
    if (value[key] !== undefined) result[key] = clone(value[key]);
  });
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
  const clientKnowledge = opts.clientKnowledge || {
    listClients: function() { return listClients(workspaceRoot); },
    getClient: function(clientId) { return getClient(workspaceRoot, clientId); }
  };
  const materialStore = opts.materialStore || createClientMaterialStore({ workspaceRoot: workspaceRoot });
  const researchStore = opts.researchStore || createResearchStore(workspaceRoot);
  const templateStore = opts.templateStore || createTemplateStore(workspaceRoot);
  const articleStore = opts.articleStore || createArticleStore(workspaceRoot);
  const batchStore = opts.batchStore || createGenerationBatchStore({ workspaceRoot: workspaceRoot });
  const provider = opts.aiProviderService || {};
  const generatorFactory = opts.articleGeneratorFactory || createArticleGenerator;
  const promptFactory = opts.buildPrompt || buildPrompt;
  const createId = opts.createId || function() { return crypto.randomUUID(); };
  const seenIds = opts.seenIds || new Set();
  const listeners = new Set();
  let disposed = false;
  let activeStatus = "idle";
  let activeBatchId = null;
  let runner;

  function fingerprint() {
    const value = typeof provider.getFingerprint === "function" ? provider.getFingerprint() : opts.aiConfigFingerprint;
    if (value && typeof value.then === "function") return value;
    return value || "unconfigured";
  }

  function emit(value) {
    const event = safeEvent(value);
    listeners.forEach(function(listener) {
      try { listener(clone(event)); } catch (_) {}
    });
  }

  function emitBatch(batch) {
    if (batch) emit({ batchId: batch.id, status: batch.status, counts: batch.counts, updatedAt: batch.updatedAt });
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
        const template = templateStore.getTemplate(item.platform, item.templateId);
        if (!template || typeof template.body !== "string" || !template.body.trim()) throw generationError("GENERATION_TEMPLATE_NOT_FOUND");
        const selection = { platform: item.platform, templateId: item.templateId };
        if (template.source === "builtin" || template.source === "custom") selection.source = template.source;
        if (template.readOnly === true) selection.readOnly = true;
        return selection;
      } catch (error) {
        if (error && error.code === "GENERATION_TEMPLATE_NOT_FOUND") throw error;
        throw generationError("GENERATION_TEMPLATE_NOT_FOUND", SAFE_MESSAGES.GENERATION_TEMPLATE_NOT_FOUND, error);
      }
    }));
  }

  async function preview(input) {
    const value = assertObject(input);
    const clientInput = value.clientIds === undefined && Array.isArray(value.clientSources)
      ? value.clientSources.map(function(source) { return source && source.clientId; })
      : value.clientIds;
    const clientIds = uniqueIds(arrayInput(clientInput, "GENERATION_CLIENTS_REQUIRED", "Client ids", true), "client id");
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
    if (activeStatus === "running" || activeStatus === "stopping") throw generationError("GENERATION_BATCH_BUSY");
  }

  function currentState() {
    const runnerState = runner && typeof runner.getState === "function" ? runner.getState() : {};
    const status = activeStatus !== "idle" ? activeStatus : (runnerState.status || "idle");
    return { status: status, batchId: activeBatchId || runnerState.batchId || null,
      concurrency: 1, isBatchRunning: status === "running", isStopPending: status === "stopping" };
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
    return clone(batch);
  }

  async function runBatch(batchId, selection, confirmConfigChange) {
    assertAvailable();
    const batch = batchStore.getBatch(batchId);
    if (!batch) throw generationError("GENERATION_BATCH_NOT_FOUND");
    const currentFingerprint = await fingerprint();
    if (selection === "unfinished" && currentFingerprint !== batch.aiConfigFingerprint && confirmConfigChange !== true) {
      throw generationError("GENERATION_AI_CONFIG_CHANGED");
    }
    activeBatchId = batchId;
    activeStatus = "running";
    emitBatch(batch);
    try {
      const result = await ensureRunner().run(batchId, selection);
      emitBatch(result);
      return clone(result);
    } finally {
      activeStatus = "idle";
      activeBatchId = null;
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

  async function stopBatch() {
    if (!runner || activeStatus === "idle") return activeBatchId ? clone(batchStore.getBatch(activeBatchId)) : null;
    activeStatus = "stopping";
    const result = await runner.stop();
    activeStatus = "idle";
    if (result) emitBatch(result);
    return clone(result);
  }

  async function pauseBatch() {
    if (runner && typeof runner.pause === "function") return runner.pause();
    return stopBatch();
  }

  function get(batchId) { return clone(batchStore.getBatch(assertId(batchId, "batch id"))); }
  function list() { return clone(batchStore.listBatches()); }
  function subscribe(listener) {
    if (typeof listener !== "function") throw generationError("GENERATION_INPUT_INVALID", "Listener is invalid");
    listeners.add(listener);
    return function() { listeners.delete(listener); };
  }
  async function dispose() { if (disposed) return; disposed = true; if (runner && typeof runner.dispose === "function") await runner.dispose(); listeners.clear(); }

  return {
    preview: preview, previewBatch: preview, prepare: prepareBatch, prepareBatch: prepareBatch, revalidate: revalidateBatch, revalidateBatch: revalidateBatch,
    createBatch: createBatch, startBatch: startBatch, startGenerationBatch: startBatch, startPreparedBatch: startBatch,
    continueBatch: continueBatch, continueGenerationBatch: continueBatch, resumeBatch: continueBatch, resumeGenerationBatch: continueBatch,
    pauseBatch: pauseBatch, pauseGenerationBatch: pauseBatch, stopBatch: stopBatch, stopGenerationBatch: stopBatch,
    retryFailed: retryFailed, retryFailedBatch: retryFailed, retryFailedGenerationBatch: retryFailed,
    get: get, getBatch: get, getGenerationBatch: get, list: list, listBatches: list, listGenerationBatches: list,
    getState: currentState, getGenerationBatchState: currentState, subscribe: subscribe, dispose: dispose
  };
}

module.exports = { createContentGenerationBatchService, SAFE_MESSAGES };
