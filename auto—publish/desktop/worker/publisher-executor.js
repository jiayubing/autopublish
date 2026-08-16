"use strict";

const fs = require("node:fs");
const path = require("node:path");

function workerError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function safeTask(value) {
  if (!value || typeof value !== "object") throw workerError("SUBMISSION_INPUT_INVALID");
  for (const field of ["sourcePlatformId", "targetPlatformId", "filename"]) {
    if (typeof value[field] !== "string" || !value[field].trim())
      throw workerError("SUBMISSION_INPUT_INVALID");
  }
  if (path.basename(value.filename) !== value.filename || path.isAbsolute(value.filename))
    throw workerError("SUBMISSION_INPUT_INVALID");
  return Object.freeze({
    sourcePlatformId: value.sourcePlatformId,
    targetPlatformId: value.targetPlatformId,
    filename: value.filename,
  });
}

function safeOutcome(value) {
  const raw = value || {};
  if (["accepted", "article_rejected", "group_blocked", "uncertain"].includes(raw.status)) {
    return Object.freeze({
      status: raw.status,
      ...(typeof raw.errorCode === "string" ? { errorCode: raw.errorCode } : {}),
      ...(typeof raw.remoteId === "string" ? { remoteId: raw.remoteId } : {}),
      ...(typeof raw.remoteUrl === "string" ? { remoteUrl: raw.remoteUrl } : {}),
    });
  }
  return Object.freeze({ status: "uncertain", errorCode: "PUBLISHER_RESULT_INVALID" });
}

function closeWorkerPlatforms(platforms, onFailure) {
  for (const platform of platforms || []) {
    const close = platform && platform.legacyQueue && platform.legacyQueue.close;
    if (typeof close !== "function") continue;
    try {
      close();
    } catch (error) {
      if (typeof onFailure === "function") onFailure(error, platform);
    }
  }
}

function createWorkerPublisherExecutor(options) {
  const value = options || {};
  const adapters = value.adapters || {};
  const inputRoot = value.paths && value.paths.input;
  if (typeof inputRoot !== "string") throw workerError("WORKER_INPUT_ROOT_REQUIRED");
  function resolveFile(task, platform) {
    const directory = path.resolve(inputRoot, platform.definition.scanDir);
    const filename = path.resolve(directory, task.filename);
    if (path.dirname(filename) !== directory) throw workerError("SUBMISSION_INPUT_INVALID");
    const stat = fs.lstatSync(filename);
    if (!stat.isFile() || stat.isSymbolicLink()) throw workerError("SUBMISSION_INPUT_INVALID");
    return filename;
  }
  async function execute(plan, publishOptions) {
    const tasks = plan && Array.isArray(plan.tasks) ? plan.tasks : [];
    const results = [];
    for (const rawTask of tasks) {
      let task;
      try {
        task = safeTask(rawTask);
        const platform = adapters[task.targetPlatformId];
        const legacyQueue = platform && platform.legacyQueue;
        if (!legacyQueue) throw workerError("SUBMISSION_ADAPTER_MISSING");
        if (value.shouldStop && value.shouldStop()) {
          results.push({ task, outcome: { status: "group_blocked", errorCode: "STOP_REQUESTED" } });
          continue;
        }
        const filename = resolveFile(task, platform);
        const source = { file: filename, filePath: filename, sourceFile: filename, filename: task.filename, fileBaseName: path.basename(task.filename, path.extname(task.filename)) };
        const articles = await legacyQueue.parse([source]);
        if (!articles || !articles.length) throw workerError("ARTICLE_PARSE_FAILED");
        const article = articles[0];
        if (value.onState) value.onState({ phase: "remote-started", task });
        let outcome;
        try { outcome = safeOutcome(await legacyQueue.publish(article, publishOptions || {})); }
        catch (_) { outcome = { status: "uncertain", errorCode: "PUBLISHER_EXCEPTION" }; }
        if (value.onState) value.onState({ phase: "remote-finished", task, status: outcome.status, errorCode: outcome.errorCode });
        results.push(Object.freeze({ task, outcome }));
      } catch (error) {
        results.push(Object.freeze({ task: rawTask || {}, outcome: { status: "group_blocked", errorCode: error.code || "PUBLISHER_PREPARE_FAILED" } }));
      }
    }
    return Object.freeze({ results });
  }
  return Object.freeze({ execute });
}

module.exports = { closeWorkerPlatforms, createWorkerPublisherExecutor };
