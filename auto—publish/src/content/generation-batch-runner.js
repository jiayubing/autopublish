const RETRY_DELAYS = [5000, 15000];
const VALID_SELECTIONS = new Set(["pending", "failed", "unfinished"]);
const CONFIGURATION_ERRORS = new Set([
  "AI_CONFIG_NOT_SET", "AI_CONFIG_INVALID", "AI_UNAUTHORIZED", "AI_FORBIDDEN", "AI_MODEL_NOT_FOUND",
  "MODEL_NOT_FOUND", "MODEL_INVALID", "GENERATION_AI_CONFIG_CHANGED"
]);
const RETRYABLE_CODES = new Set([
  "AI_RATE_LIMITED", "AI_TIMEOUT", "AI_NETWORK_ERROR", "AI_SERVER_ERROR",
  "ECONNRESET", "ECONNREFUSED", "ENETUNREACH", "ETIMEDOUT", "EAI_AGAIN"
]);

function runnerError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function isRetryable(error) {
  if (!error || error.retryable === false) return false;
  if (error.status === 404) return false;
  if (RETRYABLE_CODES.has(error.code)) return true;
  if (error.code === "AI_REQUEST_FAILED" && error.retryable !== false) return true;
  return error.status === 429 || (Number.isInteger(error.status) && error.status >= 500 && error.status <= 599);
}

function isConfigurationError(error) {
  if (!error) return false;
  return CONFIGURATION_ERRORS.has(error.code) || error.status === 401 || error.status === 403 || error.status === 404;
}

function isAborted(error, signal) {
  return Boolean(signal && signal.aborted) || Boolean(error && (error.code === "AI_ABORTED" || error.name === "AbortError"));
}

function safeError(error) {
  if (!error) return { code: "GENERATION_TASK_FAILED", message: "Generation task failed" };
  const code = typeof error.code === "string" && error.code.trim() ? error.code.trim().slice(0, 100) : "GENERATION_TASK_FAILED";
  const message = typeof error.message === "string" && error.message.trim() ? error.message.trim().slice(0, 2000) : "Generation task failed";
  return { code: code, message: message };
}

function createGenerationBatchRunner(options) {
  const deps = options || {};
  if (!deps.batchStore || typeof deps.batchStore.getBatch !== "function" ||
      typeof deps.batchStore.markTaskRunning !== "function" ||
      typeof deps.batchStore.markTaskSucceeded !== "function" ||
      typeof deps.batchStore.markTaskFailed !== "function" ||
      typeof deps.batchStore.markTaskInterrupted !== "function" ||
      typeof deps.batchStore.updateBatchStatus !== "function" ||
      typeof deps.executeTask !== "function") {
    throw runnerError("GENERATION_RUNNER_INVALID", "Generation runner dependencies are invalid");
  }
  const concurrency = deps.concurrency === undefined ? 1 : deps.concurrency;
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 4) {
    throw runnerError("GENERATION_CONCURRENCY_INVALID", "Generation concurrency must be an integer from 1 to 4");
  }
  const sleep = typeof deps.sleep === "function" ? deps.sleep : function(milliseconds) {
    return new Promise(function(resolve) { setTimeout(resolve, milliseconds); });
  };
  const now = typeof deps.now === "function" ? deps.now : function() { return new Date().toISOString(); };
  const listeners = new Set();
  const activeTasks = new Map();
  let activeRun = null;
  let disposed = false;
  let state = { status: "idle", batchId: null, concurrency: concurrency };

  function emit(batch, task, error) {
    const event = {
      batchId: batch && batch.id,
      taskId: task && task.id,
      clientId: task && task.clientId,
      platform: task && task.platform,
      templateId: task && task.templateId,
      counts: batch && batch.counts ? clone(batch.counts) : undefined,
      status: batch && batch.status,
      error: error ? safeError(error) : undefined
    };
    Object.keys(event).forEach(function(key) {
      if (event[key] === undefined) delete event[key];
    });
    listeners.forEach(function(listener) {
      try { listener(clone(event)); } catch (_) {}
    });
  }

  function setState(batch, status) {
    state = {
      status: status || (batch && batch.status) || "idle",
      batchId: batch ? batch.id : null,
      concurrency: concurrency,
      updatedAt: now()
    };
    if (batch) emit(batch);
  }

  function selected(task, selection) {
    if (task.status === "succeeded" || task.status === "running") return false;
    if (selection === "pending") return task.status === "pending";
    if (selection === "failed") return task.status === "failed";
    return task.status === "pending" || task.status === "failed" || task.status === "interrupted";
  }

  function findExistingArticle(task) {
    const injectedFinder = typeof deps.findByGenerationTaskId === "function" ? deps.findByGenerationTaskId : null;
    const articleStoreFinder = !injectedFinder && deps.articleStore && typeof deps.articleStore.findByGenerationTaskId === "function"
      ? deps.articleStore.findByGenerationTaskId.bind(deps.articleStore) : null;
    if (!injectedFinder && !articleStoreFinder) return null;
    return Promise.resolve().then(function() {
      if (injectedFinder) return injectedFinder(task);
      return articleStoreFinder(task.id);
    }).catch(function(error) {
      if (error && (error.code === "ARTICLE_NOT_FOUND" || error.code === "GENERATION_ARTICLE_NOT_FOUND")) return null;
      throw error;
    });
  }

  function abortError() {
    const error = runnerError("AI_ABORTED", "Generation task was stopped");
    error.name = "AbortError";
    return error;
  }

  function wait(milliseconds, signal) {
    if (signal.aborted) return Promise.reject(abortError());
    let removeListener;
    const aborted = new Promise(function(_, reject) {
      function onAbort() {
        if (removeListener) removeListener();
        reject(abortError());
      }
      signal.addEventListener("abort", onAbort, { once: true });
      removeListener = function() { signal.removeEventListener("abort", onAbort); };
    });
    return Promise.race([Promise.resolve().then(function() { return sleep(milliseconds); }), aborted])
      .finally(function() { if (removeListener) removeListener(); });
  }

  async function executeWithRetry(task, signal) {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await deps.executeTask(task, { signal: signal });
      } catch (error) {
        if (isAborted(error, signal)) throw abortError();
        if (!isRetryable(error) || attempt >= RETRY_DELAYS.length) throw error;
        await wait(RETRY_DELAYS[attempt], signal);
      }
    }
  }

  function articleIdFromResult(result, existing) {
    if (existing && typeof existing.id === "string") return existing.id;
    if (typeof result === "string") return result;
    if (result && typeof result.articleId === "string") return result.articleId;
    if (result && typeof result.id === "string") return result.id;
    throw runnerError("GENERATION_ARTICLE_INVALID", "Generation task did not return an article");
  }

  async function runTask(batchId, task, stopSignal) {
    let claimed = false;
    const controller = new AbortController();
    const onStop = function() { controller.abort(); };
    stopSignal.addEventListener("abort", onStop, { once: true });
    activeTasks.set(task.id, controller);
    try {
      const existingBeforeClaim = await findExistingArticle(task);
      if (existingBeforeClaim) {
        const current = deps.batchStore.getBatch(batchId).tasks.find(function(item) { return item.id === task.id; });
        if (!stopSignal.aborted && current && current.status !== "cancelled") deps.batchStore.markTaskSucceeded(batchId, task.id, existingBeforeClaim.id);
        return;
      }
      if (stopSignal.aborted) throw abortError();
      try {
        deps.batchStore.markTaskRunning(batchId, task.id);
        claimed = true;
      } catch (error) {
        if (error && (error.code === "GENERATION_TASK_ALREADY_SUCCEEDED" || error.code === "GENERATION_TASK_BUSY" || error.code === "GENERATION_TASK_CANCELLED")) return;
        throw error;
      }
      const result = await executeWithRetry(task, controller.signal);
      if (stopSignal.aborted) throw abortError();
      if (deps.articleStore && typeof deps.articleStore.saveArticle === "function" && result && typeof result === "object" &&
          typeof result.title === "string" && typeof result.content === "string") {
        deps.articleStore.saveArticle(result);
      }
      const articleId = articleIdFromResult(result);
      deps.batchStore.markTaskSucceeded(batchId, task.id, articleId);
    } catch (error) {
      if (stopSignal.aborted || isAborted(error, controller.signal)) {
        if (claimed) deps.batchStore.markTaskInterrupted(batchId, task.id);
        return;
      }
      if (isConfigurationError(error)) {
        deps.batchStore.markTaskFailed(batchId, task.id, safeError(error));
        deps.batchStore.updateBatchStatus(batchId, "paused_configuration");
        throw error;
      }
      deps.batchStore.markTaskFailed(batchId, task.id, safeError(error));
    } finally {
      stopSignal.removeEventListener("abort", onStop);
      activeTasks.delete(task.id);
    }
  }

  function finishStatus(batchId, stopped) {
    const batch = deps.batchStore.getBatch(batchId);
    if (stopped) {
      if (batch.status !== "paused_configuration") deps.batchStore.updateBatchStatus(batchId, "stopped");
      return deps.batchStore.getBatch(batchId);
    }
    if (batch.status === "paused_configuration") return batch;
    if (batch.tasks.every(function(task) { return task.status === "succeeded" || task.status === "cancelled"; })) {
      if (batch.status !== "completed") deps.batchStore.updateBatchStatus(batchId, "completed");
    } else if (batch.tasks.some(function(task) { return task.status === "failed"; })) {
      if (batch.status !== "failed") deps.batchStore.updateBatchStatus(batchId, "failed");
    } else if (batch.tasks.some(function(task) { return task.status === "interrupted"; })) {
      if (batch.status !== "interrupted") deps.batchStore.updateBatchStatus(batchId, "interrupted");
    }
    return deps.batchStore.getBatch(batchId);
  }

  async function run(batchId, selection) {
    if (disposed) throw runnerError("GENERATION_RUNNER_DISPOSED", "Generation runner is disposed");
    if (typeof batchId !== "string" || !batchId.trim()) throw runnerError("GENERATION_BATCH_ID_INVALID", "Batch id is required");
    const chosen = selection === undefined ? "pending" : selection;
    if (!VALID_SELECTIONS.has(chosen)) throw runnerError("GENERATION_SELECTION_INVALID", "Generation task selection is invalid");
    if (activeRun) throw runnerError("GENERATION_BATCH_BUSY", "A generation batch is already running");

    const stopController = new AbortController();
    const work = (async function() {
      let batch = deps.batchStore.getBatch(batchId);
      setState(batch, "running");
      const taskIds = batch.tasks.filter(function(task) { return selected(task, chosen); }).map(function(task) { return task.id; });
      let nextIndex = 0;
      let configurationPaused = false;
      async function worker() {
        while (!stopController.signal.aborted) {
          const taskId = taskIds[nextIndex];
          nextIndex += 1;
          if (!taskId) return;
          const current = deps.batchStore.getBatch(batchId);
          const task = current.tasks.find(function(item) { return item.id === taskId; });
          if (!task || !selected(task, chosen)) continue;
          try {
            await runTask(batchId, task, stopController.signal);
          } catch (error) {
            configurationPaused = true;
            stopController.abort();
            return;
          }
          batch = deps.batchStore.getBatch(batchId);
          emit(batch, task);
          if (batch.status === "paused_configuration") {
            configurationPaused = true;
            stopController.abort();
            return;
          }
        }
      }
      await Promise.all(Array.from({ length: concurrency }, worker));
      const result = finishStatus(batchId, stopController.signal.aborted && !configurationPaused);
      setState(result, result.status);
      return result;
    })();
    activeRun = { promise: work, stopController: stopController };
    try {
      return await work;
    } finally {
      activeRun = null;
      activeTasks.clear();
    }
  }

  async function stop() {
    if (!activeRun) return state.batchId ? deps.batchStore.getBatch(state.batchId) : null;
    activeRun.stopController.abort();
    return activeRun.promise;
  }

  function getState() { return clone(state); }

  function subscribe(listener) {
    if (typeof listener !== "function") throw runnerError("GENERATION_LISTENER_INVALID", "Generation listener is invalid");
    listeners.add(listener);
    return function() { listeners.delete(listener); };
  }

  async function dispose() {
    if (disposed) return;
    disposed = true;
    await stop();
    listeners.clear();
  }

  return { run: run, stop: stop, getState: getState, subscribe: subscribe, dispose: dispose };
}

module.exports = { createGenerationBatchRunner };
