const MAX_TASKS = 500;
const SAME_CLIENT_MIN_DELAY_MS = 3000;
const SAME_CLIENT_MAX_DELAY_MS = 8000;
const CLIENT_SWITCH_MIN_DELAY_MS = 6000;
const CLIENT_SWITCH_MAX_DELAY_MS = 12000;
const DEFAULT_COUNTDOWN_INTERVAL_MS = 1000;
const { reportDiagnostic } = require("../diagnostics/diagnostic-producer");

function queueError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function defaultSleep(milliseconds) {
  return new Promise(function(resolve) { setTimeout(resolve, milliseconds); });
}

function safeError(error) {
  const code = error && typeof error.code === "string" && error.code.trim() ? error.code.trim().slice(0, 100) : "DOUBAO_COLLECTION_FAILED";
  const message = error && typeof error.message === "string" && error.message.trim() ? error.message.trim().slice(0, 500) : "Doubao collection failed";
  return { code: code, message: message };
}

function clampDelay(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, Math.floor(number)));
}

function createDoubaoCollectionQueue(options) {
  const opts = options || {};
  if (typeof opts.collectOne !== "function") {
    throw queueError("DOUBAO_QUEUE_DEPENDENCY_INVALID", "Doubao collection queue requires collectOne");
  }

  const collectOne = opts.collectOne;
  const hasCustomSleep = typeof opts.sleep === "function";
  const sleep = hasCustomSleep ? opts.sleep : defaultSleep;
  const legacyDelay = typeof opts.randomDelayMs === "function" ? opts.randomDelayMs : null;
  const sameClientDelayMs = typeof opts.sameClientDelayMs === "function"
    ? opts.sameClientDelayMs
    : legacyDelay || function() {
        return SAME_CLIENT_MIN_DELAY_MS + Math.floor(Math.random() * (SAME_CLIENT_MAX_DELAY_MS - SAME_CLIENT_MIN_DELAY_MS + 1));
      };
  const clientSwitchDelayMs = typeof opts.clientSwitchDelayMs === "function"
    ? opts.clientSwitchDelayMs
    : legacyDelay || function() {
        return CLIENT_SWITCH_MIN_DELAY_MS + Math.floor(Math.random() * (CLIENT_SWITCH_MAX_DELAY_MS - CLIENT_SWITCH_MIN_DELAY_MS + 1));
      };
  const countdownIntervalMs = Number.isFinite(Number(opts.countdownIntervalMs)) && Number(opts.countdownIntervalMs) > 0
    ? Number(opts.countdownIntervalMs) : DEFAULT_COUNTDOWN_INTERVAL_MS;

  let disposed = false;
  let status = "idle";
  let currentTaskId = null;
  let completed = 0;
  let total = 0;
  let waitRemainingMs = 0;
  let nextTaskNumber = 1;
  let pauseRequested = false;
  let stopRequested = false;
  let runPromise = null;
  let resolveRun = null;
  let countdownTimer = null;
  let controlPromise = null;
  let controlResolve = null;
  const subscribers = new Set();
  const tasks = [];

  function publicTask(task) {
    return {
      id: task.id,
      clientId: task.clientId,
      questionId: task.questionId,
      status: task.status,
      answerLength: task.answerLength,
      referenceCount: task.referenceCount,
      error: task.error
    };
  }

  function snapshot() {
    return {
      status: status,
      currentTaskId: currentTaskId,
      completed: completed,
      total: total,
      waitRemainingMs: waitRemainingMs,
      tasks: tasks.map(publicTask)
    };
  }

  function emit(type) {
    if (disposed) return;
    const state = snapshot();
    const event = Object.assign({ type: type || "state", state: state }, state);
    Array.from(subscribers).forEach(function(listener) {
      try { listener(event); } catch (error) {
        reportDiagnostic({
          code: "DOUBAO_COLLECTION_LISTENER_FAILED",
          module: "doubao-collection-queue",
          category: "internal",
          operationId: "doubao-collection-queue-notify",
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

  function orderByClient(inputTasks) {
    const order = [];
    const groups = new Map();
    inputTasks.forEach(function(input) {
      const clientId = input && input.clientId;
      if (!groups.has(clientId)) {
        groups.set(clientId, []);
        order.push(clientId);
      }
      groups.get(clientId).push(input);
    });
    return order.flatMap(function(clientId) { return groups.get(clientId); });
  }

  function createTask(input, sourceId) {
    if (!input || typeof input !== "object" || Array.isArray(input) ||
        typeof input.clientId !== "string" || !input.clientId.trim() ||
        typeof input.questionId !== "string" || !input.questionId.trim()) {
      throw queueError("DOUBAO_QUEUE_TASK_INVALID", "Queue task requires clientId and questionId");
    }
    if (input.force !== undefined && typeof input.force !== "boolean") {
      throw queueError("DOUBAO_FORCE_INVALID", "Force flag is invalid");
    }
    const id = sourceId || ("task-" + nextTaskNumber++);
    return {
      id: id,
      clientId: input.clientId,
      questionId: input.questionId,
      input: Object.assign({}, input),
      status: "pending",
      answerLength: 0,
      referenceCount: 0,
      error: null
    };
  }

  function makeControlPromise() {
    if (!controlPromise) {
      controlPromise = new Promise(function(resolve) { controlResolve = resolve; });
    }
    return controlPromise;
  }

  function clearControlPromise(promise) {
    if (controlPromise === promise) {
      controlPromise = null;
      controlResolve = null;
    }
  }

  function notifyControl() {
    if (!controlResolve) return;
    const resolve = controlResolve;
    controlResolve = null;
    controlPromise = null;
    resolve();
  }

  function markTerminal(task, nextStatus) {
    task.status = nextStatus;
    completed += 1;
  }

  function cancelPendingTasks() {
    tasks.forEach(function(task) {
      if (task.status === "pending" || task.status === "waiting_login" || task.status === "waiting_human") {
        markTerminal(task, "cancelled");
      }
    });
  }

  function finishRun() {
    if (countdownTimer) {
      clearInterval(countdownTimer);
      countdownTimer = null;
    }
    waitRemainingMs = 0;
    currentTaskId = null;
    status = "completed";
    const finalState = snapshot();
    const resolve = resolveRun;
    resolveRun = null;
    runPromise = null;
    emit("completed");
    if (resolve) resolve(finalState);
    return finalState;
  }

  async function cancellableDefaultSleep(milliseconds, controlPromise) {
    let timer;
    let completedNaturally = false;
    const delayPromise = new Promise(function(resolve) {
      timer = setTimeout(function() {
        completedNaturally = true;
        resolve();
      }, milliseconds);
    });
    await Promise.race([delayPromise, controlPromise]);
    clearTimeout(timer);
    return completedNaturally;
  }

  async function waitBetweenTasks(milliseconds) {
    waitRemainingMs = milliseconds;
    emit("countdown");
    while (waitRemainingMs > 0 && !stopRequested) {
      const controlPromise = makeControlPromise();
      const requestedMs = waitRemainingMs;
      const startedAt = Date.now();
      let completedNaturally = false;
      countdownTimer = setInterval(function() {
        const elapsed = Date.now() - startedAt;
        waitRemainingMs = Math.max(0, requestedMs - elapsed);
        emit("countdown");
      }, countdownIntervalMs);

      try {
        if (hasCustomSleep) {
          const sleepPromise = Promise.resolve().then(function() { return sleep(requestedMs); });
          await Promise.race([
            sleepPromise.then(function() { completedNaturally = true; }),
            controlPromise
          ]);
        } else {
          completedNaturally = await cancellableDefaultSleep(requestedMs, controlPromise);
        }
      } finally {
        if (countdownTimer) {
          clearInterval(countdownTimer);
          countdownTimer = null;
        }
        if (completedNaturally) {
          waitRemainingMs = 0;
        } else {
          waitRemainingMs = Math.max(0, requestedMs - (Date.now() - startedAt));
        }
        emit("countdown");
        clearControlPromise(controlPromise);
      }

      if (stopRequested || completedNaturally) return;
      if (pauseRequested) {
        status = "paused";
        emit("paused");
        await waitUntilResumed();
      }
    }
    waitRemainingMs = 0;
    emit("countdown");
  }

  async function waitUntilResumed() {
    while (!stopRequested && pauseRequested) {
      await makeControlPromise();
    }
  }

  async function processQueue() {
    while (true) {
      if (stopRequested) {
        cancelPendingTasks();
        return finishRun();
      }

      if (pauseRequested || status === "paused") {
        status = "paused";
        emit("paused");
        await waitUntilResumed();
        continue;
      }

      const task = tasks.find(function(item) { return item.status === "pending"; });
      if (!task) return finishRun();

      task.status = "running";
      task.error = null;
      currentTaskId = task.id;
      emit("task_started");
      try {
        const result = await collectOne(task.input);
        const answerText = result && typeof result.answerText === "string" ? result.answerText : "";
        const references = result && Array.isArray(result.references) ? result.references : [];
        task.answerLength = answerText.length;
        task.referenceCount = references.length;
        markTerminal(task, "succeeded");
        emit("task_succeeded");
      } catch (error) {
        if (error && (error.code === "DOUBAO_LOGIN_REQUIRED" || error.code === "DOUBAO_CHALLENGE") && !stopRequested) {
          task.status = error.code === "DOUBAO_LOGIN_REQUIRED" ? "waiting_login" : "waiting_human";
          task.error = safeError(error);
          status = "paused";
          pauseRequested = true;
          emit(task.status);
          await waitUntilResumed();
          continue;
        }
        task.error = safeError(error);
        markTerminal(task, "failed");
        emit("task_failed");
      }

      currentTaskId = null;
      emit("task_finished");
      if (stopRequested) continue;
      const nextTask = tasks.find(function(item) { return item.status === "pending"; });
      if (!nextTask) return finishRun();
      if (pauseRequested) continue;
      const sameClient = nextTask.clientId === task.clientId;
      const delay = sameClient
        ? clampDelay(sameClientDelayMs(task.input, nextTask.input), SAME_CLIENT_MIN_DELAY_MS, SAME_CLIENT_MAX_DELAY_MS)
        : clampDelay(clientSwitchDelayMs(task.input, nextTask.input), CLIENT_SWITCH_MIN_DELAY_MS, CLIENT_SWITCH_MAX_DELAY_MS);
      await waitBetweenTasks(delay);
    }
  }

  function beginRun() {
    stopRequested = false;
    pauseRequested = false;
    status = "running";
    runPromise = new Promise(function(resolve) { resolveRun = resolve; });
    emit("running");
    emit("started");
    processQueue().catch(function(error) {
      tasks.forEach(function(task) {
        if (task.status === "pending" || task.status === "running" || task.status === "waiting_login" || task.status === "waiting_human") {
          task.error = safeError(error);
          markTerminal(task, "failed");
        }
      });
      finishRun();
    });
    return runPromise;
  }

  function start(inputTasks) {
    if (disposed) return Promise.reject(queueError("DOUBAO_QUEUE_DISPOSED", "Queue has been disposed"));
    if (status !== "idle" && status !== "completed") return Promise.reject(queueError("DOUBAO_QUEUE_ACTIVE", "Queue is already active or completed"));
    if (!Array.isArray(inputTasks)) return Promise.reject(queueError("DOUBAO_QUEUE_TASKS_INVALID", "Queue tasks must be an array"));
    if (inputTasks.length > MAX_TASKS) return Promise.reject(queueError("DOUBAO_QUEUE_LIMIT", "Queue cannot contain more than 500 tasks"));
    const nextTasks = [];
    try {
      orderByClient(inputTasks).forEach(function(input) { nextTasks.push(createTask(input)); });
    } catch (error) {
      return Promise.reject(error);
    }
    if (status === "completed") {
      tasks.length = 0;
      completed = 0;
      total = 0;
      currentTaskId = null;
      waitRemainingMs = 0;
    }
    nextTasks.forEach(function(task) { tasks.push(task); });
    total = tasks.length;
    if (total === 0) {
      status = "completed";
      emit("completed");
      return Promise.resolve(snapshot());
    }
    return beginRun();
  }

  function pause() {
    if (disposed || status === "completed" || status === "idle" || status === "stopping") return snapshot();
    pauseRequested = true;
    if (currentTaskId === null) {
      status = "paused";
      notifyControl();
      emit("paused");
    } else {
      emit("pause_requested");
    }
    return snapshot();
  }

  function resume() {
    if (disposed || status === "completed" || status === "idle" || status === "stopping") return snapshot();
    pauseRequested = false;
    tasks.forEach(function(task) {
      if (task.status === "waiting_login" || task.status === "waiting_human") task.status = "pending";
    });
    status = "running";
    notifyControl();
    emit("resumed");
    return snapshot();
  }

  function stop() {
    if (disposed) return Promise.resolve(snapshot());
    if (status === "idle" || status === "completed") {
      status = "stopping";
      emit("stopping");
      return Promise.resolve(finishRun());
    }
    stopRequested = true;
    pauseRequested = false;
    cancelPendingTasks();
    status = "stopping";
    notifyControl();
    emit("stopping");
    return runPromise || Promise.resolve(finishRun());
  }

  function retryFailed() {
    if (disposed) return Promise.reject(queueError("DOUBAO_QUEUE_DISPOSED", "Queue has been disposed"));
    if (status !== "completed") return Promise.reject(queueError("DOUBAO_QUEUE_ACTIVE", "Queue is already active or not completed"));
    const failed = tasks.filter(function(task) { return task.status === "failed"; });
    if (failed.length === 0) return Promise.resolve(snapshot());
    failed.forEach(function(task) {
      task.status = "pending";
      task.answerLength = 0;
      task.referenceCount = 0;
      task.error = null;
    });
    completed = Math.max(0, completed - failed.length);
    currentTaskId = null;
    waitRemainingMs = 0;
    return beginRun();
  }

  function getState() {
    return snapshot();
  }

  function subscribe(listener) {
    if (typeof listener !== "function") throw queueError("DOUBAO_QUEUE_LISTENER_INVALID", "Queue listener must be a function");
    if (disposed) return function() {};
    subscribers.add(listener);
    return function() { subscribers.delete(listener); };
  }

  async function dispose() {
    if (disposed) return snapshot();
    const pending = status !== "idle" && status !== "completed" ? stop() : null;
    disposed = true;
    subscribers.clear();
    notifyControl();
    if (pending) await pending;
    return snapshot();
  }

  return {
    start: start,
    pause: pause,
    resume: resume,
    stop: stop,
    retryFailed: retryFailed,
    getState: getState,
    subscribe: subscribe,
    dispose: dispose
  };
}

module.exports = { createDoubaoCollectionQueue: createDoubaoCollectionQueue };
