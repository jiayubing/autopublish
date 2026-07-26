"use strict";

const { createRunId } = require("./platform-task-state-store");

const WORKER_SCHEMA_VERSION = 1;
const WORKER_MESSAGE_TYPES = new Set(["state", "progress", "heartbeat", "result", "error"]);

function codedError(code, message) {
  const error = new Error(message || code);
  error.code = code;
  return error;
}

function safeSnapshot(context) {
  return Object.freeze({
    runId: context.runId,
    phase: context.phase,
    remoteStarted: context.remoteStarted,
    stopReason: context.stopReason || null,
    startedAt: context.startedAt,
      terminalResult: context.terminalResult || null,
  });
}

function freezeRunContext(input) {
  const source = input && typeof input === "object" ? input : {};
  const tasks = Array.isArray(source.tasks) ? source.tasks.map((task) => Object.freeze({
    sourcePlatformId: typeof task.sourcePlatformId === "string" ? task.sourcePlatformId : "",
    targetPlatformId: typeof task.targetPlatformId === "string" ? task.targetPlatformId : "",
    filename: typeof task.filename === "string" ? task.filename : "",
    accountProfileId: typeof task.accountProfileId === "string" ? task.accountProfileId : "",
  })) : [];
  return Object.freeze({
    publisher: typeof source.publisher === "string" ? source.publisher : "",
    accountProfileId: typeof source.accountProfileId === "string" ? source.accountProfileId : "",
    target: typeof source.target === "string" ? source.target : "",
    tasks: Object.freeze(tasks),
  });
}

function createPlatformRun(options) {
  const value = options || {};
  if (typeof value.launch !== "function") throw new Error("PlatformRun launch is required");
  const now = value.now || (() => new Date().toISOString());
  const setTimer = value.setTimeout || setTimeout;
  const clearTimer = value.clearTimeout || clearTimeout;
  const watchdogMs = Number.isInteger(value.watchdogMs) && value.watchdogMs > 0 ? value.watchdogMs : 95000;
  let active = null;

  function emit(context) {
    if (typeof value.onSnapshot === "function") value.onSnapshot(safeSnapshot(context));
  }

  function clearWatchdog(context) {
    if (context.watchdog) clearTimer(context.watchdog);
    context.watchdog = null;
  }

  function cleanup(context) {
    if (context.cleaned) return;
    context.cleaned = true;
    clearWatchdog(context);
    for (const action of context.cleanups) {
      try { action(); } catch (_) {}
    }
  }

  function terminal(context, result) {
    if (context.terminalResult) return context.terminalResult;
    context.phase = "terminal";
    context.terminalResult = result || { ok: false, errorCode: "PLATFORM_RUN_TERMINATED" };
    // A watchdog result may be known before the OS reports child exit. Keep
    // the run active in that window so a second external publish cannot start.
    if (context.childExited || !context.child) {
      cleanup(context);
      if (active === context) active = null;
    }
    emit(context);
    if (typeof context.resolveTerminal === "function") context.resolveTerminal(context.terminalResult);
    return context.terminalResult;
  }

  function armWatchdog(context) {
    clearWatchdog(context);
    context.watchdog = setTimer(function() {
      if (active !== context || context.terminalResult) return;
      context.phase = "stopping";
      context.stopReason = "watchdog";
      emit(context);
      try { if (context.child && typeof context.child.kill === "function") context.child.kill(); } catch (_) {}
      // The parent durable workflow owns recovery intent; this only owns child lifecycle.
      const uncertain = Boolean(context.remoteStarted);
      terminal(context, {
        ok: uncertain,
        errorCode: "PLATFORM_WORKER_WATCHDOG_TIMEOUT",
        remoteStarted: uncertain,
        currentTask: context.currentTask || null,
        data: {
          ok: 0,
          fail: uncertain ? 0 : 1,
          skipped: uncertain ? 0 : Math.max(0, context.command.tasks.length - 1),
          uncertain: uncertain ? 1 : 0,
          results: uncertain && context.currentTask ? [{
            task: context.currentTask,
            status: "uncertain",
            publicationStatus: "uncertain",
            error: "PLATFORM_WORKER_WATCHDOG_TIMEOUT"
          }] : []
        }
      });
    }, watchdogMs);
  }

  function acceptMessage(context, message) {
    if (active !== context || context.terminalResult || !message || typeof message !== "object") return false;
    if (message.schemaVersion !== WORKER_SCHEMA_VERSION || message.runId !== context.runId || !WORKER_MESSAGE_TYPES.has(message.type)) return false;
    const payload = message.payload && typeof message.payload === "object" ? message.payload : {};
    if (message.type === "state" || message.type === "progress" || message.type === "heartbeat") {
      if (payload.phase === "remote-started") context.remoteStarted = true;
      if (payload.phase === "remote-finished") context.remoteStarted = false;
      if (payload.task && typeof payload.task === "object") context.currentTask = payload.task;
      armWatchdog(context);
      emit(context);
      if (typeof context.onMessage === "function") context.onMessage(message);
      return true;
    }
    if (message.type === "result") {
      terminal(context, payload);
      return true;
    }
    return true;
  }

  function start(command) {
    if (active) throw codedError("PLATFORM_RUN_ACTIVE", "A platform run is still terminating.");
    const input = command || {};
    const context = {
      runId: typeof input.runId === "string" && input.runId ? input.runId : createRunId(),
      phase: "starting",
      remoteStarted: false,
      stopReason: null,
      startedAt: now(),
      terminalResult: null,
      command: freezeRunContext(input),
      abortController: new AbortController(),
      child: null,
      watchdog: null,
      cleanups: [typeof input.cleanup === "function" ? input.cleanup : function() {}],
      cleaned: false,
      onMessage: input.onMessage,
    };
    context.terminalPromise = new Promise(function(resolve) { context.resolveTerminal = resolve; });
    active = context;
    emit(context);
    let launched;
    try {
      launched = value.launch({ runId: context.runId, command: context.command, signal: context.abortController.signal, onMessage: (message) => acceptMessage(context, message) });
    } catch (error) {
      terminal(context, { ok: false, errorCode: error.code || "PLATFORM_WORKER_LAUNCH_FAILED" });
      throw error;
    }
    context.child = launched && launched.child || null;
    if (context.child && typeof context.child.once === "function") {
      context.child.once("exit", function() {
        context.childExited = true;
        if (context.terminalResult) {
          cleanup(context);
          if (active === context) active = null;
          return;
        }
        if (context.completionResult) terminal(context, context.completionResult);
      });
    } else context.childExited = true;
    context.phase = "running";
    armWatchdog(context);
    emit(context);
    Promise.resolve(launched && launched.promise).then(function(result) {
      context.completionResult = result;
      if (context.childExited) terminal(context, result);
    }, function(error) {
      const result = { ok: false, errorCode: error && error.code || "PLATFORM_WORKER_FAILED" };
      context.completionResult = result;
      if (context.childExited) terminal(context, result);
    });
    return context.terminalPromise;
  }

  function stop(runId, reason) {
    const context = active;
    if (!context) return { alreadyStopped: true };
    if (runId !== undefined && runId !== null && runId !== context.runId) throw codedError("PLATFORM_RUN_MISMATCH", "The platform task run is no longer active.");
    if (context.phase === "stopping") return { alreadyRequested: true };
    context.phase = "stopping";
    context.stopReason = reason || "operator";
    context.abortController.abort(context.stopReason);
    emit(context);
    try { if (context.child && typeof context.child.send === "function") context.child.send({ schemaVersion: WORKER_SCHEMA_VERSION, runId: context.runId, type: "stop" }); } catch (_) {}
    if (!context.remoteStarted) {
      try { if (context.child && typeof context.child.kill === "function") context.child.kill(); } catch (_) {}
    }
    return { alreadyRequested: false };
  }

  return Object.freeze({ start, stop, snapshot: () => active ? safeSnapshot(active) : null, schemaVersion: WORKER_SCHEMA_VERSION });
}

module.exports = { createPlatformRun, WORKER_SCHEMA_VERSION, WORKER_MESSAGE_TYPES };
