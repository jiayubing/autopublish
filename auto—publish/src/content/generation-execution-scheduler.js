"use strict";

function schedulerError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function createGenerationExecutionScheduler(options) {
  const value = options || {};
  const maxConcurrency = value.maxConcurrency === undefined ? 4 : value.maxConcurrency;
  if (!Number.isInteger(maxConcurrency) || maxConcurrency < 1 || maxConcurrency > 32) {
    throw schedulerError("GENERATION_SCHEDULER_CONCURRENCY_INVALID", "Generation scheduler concurrency is invalid");
  }

  const groups = new Map();
  const readyGroups = [];
  const readySet = new Set();
  let active = 0;
  let disposed = false;

  function queuedCount() {
    let total = 0;
    groups.forEach(function(queue) {
      total += queue.reduce(function(count, job) { return count + (job.settled ? 0 : 1); }, 0);
    });
    return total;
  }

  function getState() {
    return {
      active: active,
      queued: queuedCount(),
      maxConcurrency: maxConcurrency,
      isRunning: active > 0 || queuedCount() > 0,
    };
  }

  function markReady(groupId) {
    const queue = groups.get(groupId);
    if (!queue || !queue.some(function(job) { return !job.settled; }) || readySet.has(groupId)) return;
    readySet.add(groupId);
    readyGroups.push(groupId);
  }

  function cleanupGroup(groupId) {
    const queue = groups.get(groupId);
    if (!queue) return;
    while (queue.length && queue[0].settled) queue.shift();
    if (!queue.length) {
      groups.delete(groupId);
      readySet.delete(groupId);
    }
  }

  function finishJob(job, outcome, value) {
    if (job.settled) return;
    job.settled = true;
    if (job.signal && job.abortListener) job.signal.removeEventListener("abort", job.abortListener);
    if (outcome === "resolve") job.resolve(value);
    else job.reject(value);
  }

  function pump() {
    if (disposed) return;
    while (active < maxConcurrency && readyGroups.length) {
      const groupId = readyGroups.shift();
      readySet.delete(groupId);
      cleanupGroup(groupId);
      const queue = groups.get(groupId);
      if (!queue) continue;
      let job = queue.shift();
      while (job && job.settled) job = queue.shift();
      if (!job) {
        cleanupGroup(groupId);
        continue;
      }
      if (job.signal && job.signal.aborted) {
        finishJob(job, "reject", schedulerError("AI_ABORTED", "Generation task was aborted before execution"));
        cleanupGroup(groupId);
        markReady(groupId);
        continue;
      }
      if (queue.some(function(item) { return !item.settled; })) markReady(groupId);
      active += 1;
      Promise.resolve()
        .then(job.work)
        .then(function(result) { finishJob(job, "resolve", result); }, function(error) { finishJob(job, "reject", error); })
        .finally(function() {
          active -= 1;
          cleanupGroup(groupId);
          markReady(groupId);
          pump();
        });
    }
  }

  function schedule(groupId, work, options) {
    if (disposed) return Promise.reject(schedulerError("GENERATION_SCHEDULER_DISPOSED", "Generation scheduler is disposed"));
    if (typeof groupId !== "string" || !groupId.trim() || typeof work !== "function") {
      return Promise.reject(schedulerError("GENERATION_SCHEDULER_INPUT_INVALID", "Generation scheduler input is invalid"));
    }
    const signal = options && options.signal;
    if (signal && typeof signal.addEventListener !== "function") {
      return Promise.reject(schedulerError("GENERATION_SCHEDULER_INPUT_INVALID", "Generation scheduler abort signal is invalid"));
    }
    if (signal && signal.aborted) return Promise.reject(schedulerError("AI_ABORTED", "Generation task was aborted before execution"));

    return new Promise(function(resolve, reject) {
      const job = { work: work, resolve: resolve, reject: reject, signal: signal || null, abortListener: null, settled: false };
      if (signal) {
        job.abortListener = function() {
          finishJob(job, "reject", schedulerError("AI_ABORTED", "Generation task was aborted before execution"));
          cleanupGroup(groupId);
          pump();
        };
        signal.addEventListener("abort", job.abortListener, { once: true });
      }
      const queue = groups.get(groupId) || [];
      queue.push(job);
      groups.set(groupId, queue);
      markReady(groupId);
      pump();
    });
  }

  async function dispose() {
    if (disposed) return;
    disposed = true;
    groups.forEach(function(queue) {
      queue.forEach(function(job) {
        finishJob(job, "reject", schedulerError("GENERATION_SCHEDULER_DISPOSED", "Generation scheduler is disposed"));
      });
    });
    groups.clear();
    readyGroups.splice(0);
    readySet.clear();
  }

  return { schedule: schedule, getState: getState, dispose: dispose };
}

module.exports = { createGenerationExecutionScheduler };
