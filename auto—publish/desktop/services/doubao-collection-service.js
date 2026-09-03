const path = require("node:path");
const { createQuestionStore } = require("../../src/content/question-store");
const { createResearchStore } = require("../../src/content/research-store");
const { createDoubaoBrowserAdapter } = require("../../src/content/doubao-browser-adapter");
const { createDoubaoConversationStore } = require("../../src/content/doubao-conversation-store");
const { createDoubaoCollectionService: createSourceCollectionService } = require("../../src/content/doubao-collection-service");
const { createDoubaoCollectionQueue } = require("../../src/content/doubao-collection-queue");
const { pwSessionConfig } = require("../../src/core/playwright");
const { reportDiagnostic } = require("../../src/diagnostics/diagnostic-producer");

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
  const conversationStore = opts.conversationStore || createDoubaoConversationStore(
    path.join(workspaceRoot, "data", "doubao-conversations.json")
  );
  const browserAdapter = opts.browserAdapter || createDoubaoBrowserAdapter({
    session: session,
    profileId: profileId,
    diagnosticsDir: paths && paths.doubaoDiagnostics,
    profileDir: paths && paths.doubaoBrowser,
    conversationStore: conversationStore
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
    try { opts.onDataInvalidated(reasonCode); } catch (error) {
      reportDiagnostic({
        code: "DOUBAO_CONTENT_INVALIDATION_LISTENER_FAILED",
        module: "doubao-collection-service",
        category: "internal",
        operationId: "doubao-content-invalidation",
        metadata: {
          operation: "content-invalidation-listener",
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
    const current = questionStore.getQuestion(input.clientId, input.questionId);
    const nextText = input.text === undefined ? current.text : input.text;
    const textChanged = typeof nextText === "string" &&
      nextText.trim().replace(/\s+/g, " ") !== String(current.text || "").trim().replace(/\s+/g, " ");
    let staleResearch = null;

    if (textChanged) {
      try {
        staleResearch = researchStore.getResearch(input.clientId, input.questionId);
      } catch (error) {
        if (!error || error.code !== "RESEARCH_NOT_FOUND") throw error;
      }
      if (staleResearch && researchStore.deleteResearch(input.clientId, input.questionId) !== true) {
        throw serviceError("DOUBAO_RESEARCH_DELETE_FAILED", "Old research could not be invalidated");
      }
    }

    try {
      const result = questionStore.updateQuestion(input.clientId, input.questionId, {
        text: input.text,
        enabled: input.enabled
      });
      notifyContentSources("CONTENT_QUESTION_UPDATED");
      return result;
    } catch (error) {
      if (staleResearch) {
        try {
          researchStore.saveResearch(input.clientId, staleResearch);
        } catch (restoreError) {
          const failure = serviceError("DOUBAO_RESEARCH_RESTORE_FAILED", "Old research could not be restored after question update failed");
          failure.cause = error;
          failure.restoreError = restoreError;
          throw failure;
        }
      }
      throw error;
    }
  }

  function deleteQuestion(input) {
    const result = collectionService.deleteQuestionAndResearch(input);
    notifyContentSources("CONTENT_QUESTION_DELETED");
    return result;
  }

  function hasPendingWork(state) {
    return state && state.status === "paused" && Array.isArray(state.tasks) && state.tasks.some(function(task) {
      return task.status === "pending" || task.status === "waiting_login" || task.status === "waiting_human" || task.status === "running";
    });
  }

  async function closeSessionSafely() {
    if (typeof collectionService.close !== "function") return;
    try {
      await collectionService.close();
    } catch (error) {
      lastCloseError = safeError(error);
      reportDiagnostic({
        code: "DOUBAO_SESSION_CLOSE_FAILED",
        module: "doubao-collection-service",
        category: "storage",
        operationId: "doubao-session-close",
        metadata: {
          operation: "session-close",
          phase: "cleanup",
          outcome: "best-effort-failed",
          errorCode: lastCloseError.code
        }
      });
      if (typeof opts.onCloseError === "function") {
        try { opts.onCloseError(lastCloseError); } catch (callbackError) {
          reportDiagnostic({
            code: "DOUBAO_SESSION_CLOSE_LISTENER_FAILED",
            module: "doubao-collection-service",
            category: "internal",
            operationId: "doubao-session-close-listener",
            metadata: {
              operation: "close-error-listener",
              phase: "notify",
              outcome: "listener-isolated",
              errorCode: callbackError && /^[A-Z][A-Z0-9_]{1,127}$/.test(callbackError.code || "")
                ? callbackError.code
                : "LISTENER_FAILED"
            }
          });
        }
      }
    }
  }

  async function runWithSession(operation) {
    try {
      return await operation();
    } finally {
      let state;
      let stateReadFailed = false;
      try { state = queue.getState(); } catch (error) {
        stateReadFailed = true;
        reportDiagnostic({
          code: "DOUBAO_QUEUE_STATE_READ_FAILED",
          module: "doubao-collection-service",
          category: "storage",
          operationId: "doubao-queue-state-read",
          metadata: {
            operation: "queue-state-read",
            phase: "cleanup-gate",
            outcome: "session-left-open",
            errorCode: error && /^[A-Z][A-Z0-9_]{1,127}$/.test(error.code || "")
              ? error.code
              : "DOUBAO_QUEUE_STATE_READ_FAILED"
          }
        });
      }
      if (!stateReadFailed && !hasPendingWork(state)) await closeSessionSafely();
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
    if (typeof collectionService.prepareBatch !== "function") {
      return Promise.reject(serviceError("DOUBAO_ADAPTER_UNSUPPORTED", "Doubao collection service does not support batch preparation"));
    }
    let tasks;
    try {
      tasks = collectionService.prepareBatch(input);
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
