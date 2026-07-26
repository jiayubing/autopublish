const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const RUN_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

function createRunId() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return crypto.randomBytes(16).toString("hex");
}

function isoNow(now) {
  const value = typeof now === "function" ? now() : now;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" && !Number.isNaN(Date.parse(value))) return new Date(value).toISOString();
  return new Date().toISOString();
}

function safeTask(task) {
  if (!task || typeof task !== "object") return null;
  return {
    sourcePlatformId: typeof task.sourcePlatformId === "string" ? task.sourcePlatformId : "",
    filename: typeof task.filename === "string" ? task.filename : "",
    targetPlatformId: typeof task.targetPlatformId === "string" ? task.targetPlatformId : ""
  };
}

function taskKey(task) {
  const safe = safeTask(task);
  if (!safe) return "";
  return [safe.sourcePlatformId, safe.filename, safe.targetPlatformId].join("\u0000");
}

function phaseForState(value) {
  const phase = typeof value === "string" ? value : "";
  if (phase === "heartbeat" || phase === "before-remote" || phase === "remote-started" || phase === "remote-finished") return "running";
  if (phase === "waiting_interval") return "waiting-interval";
  if (["running", "waiting-interval", "stopping", "paused", "completed", "failed", "stopped", "interrupted", "idle"].includes(phase)) return phase;
  return phase || "running";
}

function createEmptySnapshot() {
  return {
    runId: null,
    phase: "idle",
    total: 0,
    processed: 0,
    succeeded: 0,
    failed: 0,
    skipped: 0,
    uncertain: 0,
    currentTask: null,
    nextTask: null,
    waitRemainingMs: 0,
    startedAt: null,
    updatedAt: null,
    terminalResult: null,
    isBatchRunning: false,
    isStopPending: false,
    isPlatformRunning: false
  };
}

function clone(value) {
  if (value === undefined || value === null) return value;
  return JSON.parse(JSON.stringify(value));
}

function createPlatformTaskStateStore(options) {
  const opts = options || {};
  const now = opts.now || (() => new Date().toISOString());
  const persistedSnapshotPath = opts.persistedSnapshotPath || null;
  let snapshot = createEmptySnapshot();
  let taskKeys = new Set();
  let terminalKeys = new Set();
  let listeners = new Set();

  if (persistedSnapshotPath) {
    try {
      const restored = JSON.parse(fs.readFileSync(persistedSnapshotPath, "utf8"));
      if (restored && restored.phase === "interrupted" && restored.runId) snapshot = Object.assign(createEmptySnapshot(), restored);
    } catch (_) {}
  }

  function persist() {
    if (!persistedSnapshotPath) return;
    try {
      fs.mkdirSync(path.dirname(persistedSnapshotPath), { recursive: true });
      const temporary = `${persistedSnapshotPath}.tmp-${process.pid}`;
      fs.writeFileSync(temporary, JSON.stringify(snapshot) + "\n", { mode: 0o600 });
      fs.renameSync(temporary, persistedSnapshotPath);
    } catch (_) {}
  }

  function notify() {
    persist();
    const value = getSnapshot();
    listeners.forEach((listener) => {
      try { listener(value); } catch (_) {}
    });
  }

  function touch(updatedAt) {
    const candidate = updatedAt ? isoNow(updatedAt) : isoNow(now);
    const previous = snapshot.updatedAt && Date.parse(snapshot.updatedAt);
    const next = Date.parse(candidate);
    if (Number.isFinite(previous) && Number.isFinite(next) && next <= previous) {
      return new Date(previous + 1).toISOString();
    }
    return candidate;
  }

  function updateCounts(kind) {
    if (kind === "succeeded") snapshot.succeeded += 1;
    else if (kind === "failed") snapshot.failed += 1;
    else if (kind === "skipped") snapshot.skipped += 1;
    else if (kind === "uncertain") snapshot.uncertain += 1;
    snapshot.processed = snapshot.succeeded + snapshot.failed + snapshot.skipped + snapshot.uncertain;
  }

  function classifyResult(result) {
    const publicationStatus = result && result.publicationStatus;
    const status = result && result.status;
    if (publicationStatus === "uncertain" || status === "uncertain") return "uncertain";
    if (publicationStatus === "published" || publicationStatus === "submitted" || status === "success" || status === "submitted") return "succeeded";
    if (publicationStatus === "cancelled" || status === "skipped" || status === "pending") return "skipped";
    return "failed";
  }

  function recordResult(result) {
    const key = taskKey(result && result.task);
    if (!key || terminalKeys.has(key)) return false;
    terminalKeys.add(key);
    updateCounts(classifyResult(result));
    return true;
  }

  function normalizeWorkerResult(item) {
    if (!item || typeof item !== "object") return item;
    if (!item.outcome || typeof item.outcome !== "object") return item;
    return Object.assign({}, item, {
      status: item.outcome.status,
      publicationStatus: item.outcome.status,
      error: item.outcome.errorCode
    });
  }

  function terminalizeRemaining(kind) {
    const remaining = Math.max(0, snapshot.total - snapshot.processed);
    for (let index = 0; index < remaining; index += 1) updateCounts(kind);
  }

  function start(input) {
    const value = input || {};
    const runId = typeof value.runId === "string" && RUN_ID_PATTERN.test(value.runId) ? value.runId : createRunId();
    const tasks = Array.isArray(value.tasks) ? value.tasks.map(safeTask).filter(Boolean) : [];
    taskKeys = new Set(tasks.map(taskKey).filter(Boolean));
    terminalKeys = new Set();
    const startedAt = isoNow(value.startedAt || now);
    snapshot = Object.assign(createEmptySnapshot(), {
      runId,
      phase: "running",
      total: tasks.length,
      startedAt,
      updatedAt: startedAt,
      isPlatformRunning: true
    });
    notify();
    return getSnapshot();
  }

  function markInterrupted() {
    if (!snapshot.runId || !snapshot.isPlatformRunning) return getSnapshot();
    snapshot = Object.assign({}, snapshot, {
      phase: "interrupted",
      isPlatformRunning: false,
      isStopPending: false,
      updatedAt: touch()
    });
    notify();
    return getSnapshot();
  }

  function applyWorkerState(event) {
    const value = event || {};
    if (!snapshot.runId || value.runId !== snapshot.runId) return getSnapshot();
    if (value.updatedAt && snapshot.updatedAt && Date.parse(value.updatedAt) < Date.parse(snapshot.updatedAt)) return getSnapshot();
    const phase = phaseForState(value.phase || value.status);
    if (value.phase === "remote-finished") recordResult({ task: value.task, status: value.status, publicationStatus: value.status });
    const currentTask = safeTask(value.task || value.currentTask);
    const nextTask = safeTask(value.nextTask);
    if (currentTask) snapshot.currentTask = currentTask;
    if (nextTask) snapshot.nextTask = nextTask;
    if (Number.isFinite(Number(value.waitRemainingMs))) snapshot.waitRemainingMs = Math.max(0, Number(value.waitRemainingMs));
    if (!(value.phase === "heartbeat" && snapshot.phase === "waiting-interval")) snapshot.phase = phase;
    snapshot.isPlatformRunning = phase === "running" || phase === "waiting-interval" || phase === "stopping";
    snapshot.updatedAt = touch(value.updatedAt);
    notify();
    return getSnapshot();
  }

  function finish(result, phase, extra) {
    const value = result || {};
    const data = value.data && typeof value.data === "object" ? value.data : value;
    const results = Array.isArray(data.results) ? data.results : [];
    results.map(normalizeWorkerResult).forEach(recordResult);
    const finalPhase = phase || (value.errorCode === "STOP_REQUESTED" ? "stopped" : "completed");
    if (snapshot.total > snapshot.processed) {
      terminalizeRemaining(finalPhase === "stopped" ? "skipped" : "uncertain");
    }
    const terminalResults = results.map(normalizeWorkerResult).map((item) => ({
      task: safeTask(item && item.task),
      status: typeof item?.status === "string" ? item.status : "failed",
      publicationStatus: typeof item?.publicationStatus === "string" ? item.publicationStatus : null,
      error: typeof item?.error === "string" && /^[A-Z0-9_.:-]{1,128}$/.test(item.error) ? item.error : null
    })).filter((item) => item.task);
    snapshot = Object.assign({}, snapshot, {
      phase: finalPhase,
      isPlatformRunning: false,
      isStopPending: false,
      waitRemainingMs: 0,
      updatedAt: touch(extra && extra.updatedAt),
      queueRevision: extra && typeof extra.queueRevision === "number" ? extra.queueRevision : undefined,
      terminalResult: {
        ok: snapshot.succeeded,
        fail: snapshot.failed,
        skipped: snapshot.skipped,
        uncertain: snapshot.uncertain,
        results: terminalResults
      }
    });
    notify();
    return getSnapshot();
  }

  function setControls(input) {
    const value = input || {};
    snapshot = Object.assign({}, snapshot, {
      phase: value.phase || snapshot.phase,
      isStopPending: value.isStopPending === undefined ? snapshot.isStopPending : Boolean(value.isStopPending),
      isPlatformRunning: value.isPlatformRunning === undefined ? snapshot.isPlatformRunning : Boolean(value.isPlatformRunning),
      updatedAt: touch(value.updatedAt)
    });
    notify();
    return getSnapshot();
  }

  function getSnapshot() { return clone(snapshot); }

  return {
    start,
    applyWorkerState,
    finish,
    markInterrupted,
    setControls,
    getSnapshot,
    subscribe: function(listener) {
      if (typeof listener !== "function") return () => {};
      listeners.add(listener);
      return function() { listeners.delete(listener); };
    },
    getTaskCount: function() { return taskKeys.size; }
  };
}

module.exports = { createPlatformTaskStateStore, createRunId, safeTask };
