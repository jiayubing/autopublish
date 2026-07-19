const { createQuestionStore } = require("../../src/content/question-store");
const { createResearchStore } = require("../../src/content/research-store");
const { createDoubaoBrowserAdapter } = require("../../src/content/doubao-browser-adapter");
const { createDoubaoCollectionService: createSourceCollectionService } = require("../../src/content/doubao-collection-service");
const { createDoubaoCollectionQueue } = require("../../src/content/doubao-collection-queue");
const { pwSessionConfig } = require("../../src/core/playwright");

function serviceError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function safeError(error) {
  const code = error && typeof error.code === "string" && error.code.trim()
    ? error.code.trim().slice(0, 100) : "DOUBAO_COLLECTION_FAILED";
  const message = error && typeof error.message === "string" && error.message.trim()
    ? error.message.trim().slice(0, 500) : "Doubao collection failed";
  return { code: code, message: message };
}

function createDoubaoCollectionDesktopService(options) {
  const opts = options || {};
  const workspaceRoot = opts.workspaceRoot || opts.rootDir;
  const paths = opts.paths;
  if (typeof workspaceRoot !== "string" || !workspaceRoot.trim()) {
    throw serviceError("DOUBAO_DESKTOP_SERVICE_INVALID", "Doubao workspace root is required");
  }

  const questionStore = opts.questionStore || createQuestionStore(workspaceRoot);
  const researchStore = opts.researchStore || createResearchStore(workspaceRoot, { paths: paths });
  const profileId = opts.profileId || "default";
  const session = opts.session || pwSessionConfig({ session: "doubao", profileId: profileId, profileDir: paths && paths.doubaoBrowser });
  const browserAdapter = opts.browserAdapter || createDoubaoBrowserAdapter({
    session: session,
    profileId: profileId,
    diagnosticsDir: paths && paths.doubaoDiagnostics,
    profileDir: paths && paths.doubaoBrowser
  });
  const collectionService = opts.collectionService || createSourceCollectionService({
    questionStore: questionStore,
    researchStore: researchStore,
    browserAdapter: browserAdapter
  });
  const queue = opts.queue || createDoubaoCollectionQueue({
    collectOne: function(input) { return collectionService.collectOne(input); }
  });
  let disposePromise = null;
  let lastCloseError = null;

  function notifyContentSources(reasonCode) {
    if (typeof opts.onDataInvalidated !== "function") return;
    try { opts.onDataInvalidated(["contentSources"], reasonCode); } catch (_) {}
  }

  function clientIdOf(input) {
    return typeof input === "string" ? input : input && input.clientId;
  }

  function listQuestions(input) {
    return questionStore.listQuestions(clientIdOf(input));
  }

  function createQuestion(input) {
    const result = questionStore.createQuestion(input.clientId, {
      text: input.text,
      enabled: input.enabled
    });
    notifyContentSources("CONTENT_QUESTION_CREATED");
    return result;
  }

  function updateQuestion(input) {
    const result = questionStore.updateQuestion(input.clientId, input.questionId, {
      text: input.text,
      enabled: input.enabled
    });
    notifyContentSources("CONTENT_QUESTION_UPDATED");
    return result;
  }

  function deleteQuestion(input) {
    const result = collectionService.deleteQuestionAndResearch(input);
    notifyContentSources("CONTENT_QUESTION_DELETED");
    return result;
  }

  function hasPendingWork(state) {
    return state && state.status === "paused" && Array.isArray(state.tasks) && state.tasks.some(function(task) {
      return task.status === "pending" || task.status === "waiting_login" || task.status === "running";
    });
  }

  async function closeSessionSafely() {
    if (typeof collectionService.close !== "function") return;
    try {
      await collectionService.close();
    } catch (error) {
      lastCloseError = safeError(error);
      if (typeof opts.onCloseError === "function") opts.onCloseError(lastCloseError);
    }
  }

  async function runWithSession(operation) {
    try {
      return await operation();
    } finally {
      let state;
      try { state = queue.getState(); } catch (_) {}
      if (!hasPendingWork(state)) await closeSessionSafely();
    }
  }

  function startBatch(tasks) {
    const inputTasks = Array.isArray(tasks) ? tasks : tasks && tasks.tasks;
    return runWithSession(function() { return queue.start(inputTasks); });
  }

  function previewBatch(input) {
    if (typeof collectionService.previewBatch !== "function") {
      throw serviceError("DOUBAO_ADAPTER_UNSUPPORTED", "Doubao collection service does not support batch preview");
    }
    return collectionService.previewBatch(input);
  }

  function startPreparedBatch(input) {
    if (typeof collectionService.validatePreparedBatch !== "function") {
      return Promise.reject(serviceError("DOUBAO_ADAPTER_UNSUPPORTED", "Doubao collection service does not support prepared batches"));
    }
    let tasks;
    try {
      tasks = collectionService.validatePreparedBatch(input);
    } catch (error) {
      return Promise.reject(error);
    }
    return startBatch(tasks);
  }

  async function collectOne(input) {
    try {
      return await runWithSession(async function() {
        const state = await queue.start([input]);
        if (!state || typeof state !== "object" || Array.isArray(state) || state.status !== "completed" ||
            !Array.isArray(state.tasks) || state.tasks.length !== 1) {
          throw serviceError("DOUBAO_COLLECTION_FAILED", "Doubao collection did not complete successfully");
        }
        const task = state.tasks[0];
        if (!task || task.clientId !== input.clientId || task.questionId !== input.questionId) {
          throw serviceError("DOUBAO_COLLECTION_FAILED", "Doubao collection did not complete successfully");
        }
        if (task.status !== "succeeded") {
          const failure = task && task.error ? task.error : { code: "DOUBAO_COLLECTION_FAILED", message: "Doubao collection failed" };
          throw serviceError(failure.code, failure.message);
        }
        const record = await researchStore.getResearch(input.clientId, input.questionId);
        if (!record || typeof record !== "object" || Array.isArray(record)) {
          throw serviceError("DOUBAO_COLLECTION_FAILED", "Doubao collection did not produce a research record");
        }
        notifyContentSources("CONTENT_RESEARCH_COLLECTED");
        return record;
      });
    } catch (error) {
      const safe = safeError(error);
      throw serviceError(safe.code, safe.message);
    }
  }

  async function dispose() {
    if (disposePromise) return disposePromise;
    disposePromise = Promise.resolve().then(async function() {
      await queue.dispose();
      await closeSessionSafely();
    });
    return disposePromise;
  }

  return {
    profileId: profileId,
    listQuestions: listQuestions,
    createQuestion: createQuestion,
    updateQuestion: updateQuestion,
    deleteQuestion: deleteQuestion,
    getLoginState: function() { return collectionService.getLoginState(); },
    openLogin: function() { return collectionService.openLogin(); },
    collectOne: collectOne,
    saveManual: function(input) { const result = collectionService.saveManual(input); notifyContentSources("CONTENT_RESEARCH_MANUAL_SAVED"); return result; },
    previewBatch: previewBatch,
    startBatch: startBatch,
    startPreparedBatch: startPreparedBatch,
    pauseBatch: function() { return queue.pause(); },
    resumeBatch: function() { return queue.resume(); },
    stopBatch: function() { return queue.stop(); },
    retryFailed: function() { return runWithSession(function() { return queue.retryFailed(); }); },
    getQueueState: function() { return queue.getState(); },
    subscribe: function(listener) { return queue.subscribe(listener); },
    dispose: dispose
  };
}

module.exports = {
  createDoubaoCollectionDesktopService: createDoubaoCollectionDesktopService,
  createDoubaoCollectionService: createDoubaoCollectionDesktopService
};
