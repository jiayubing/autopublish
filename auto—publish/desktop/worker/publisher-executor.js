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
  if (["published", "submitted", "failed", "uncertain"].includes(raw.status)) {
    return Object.freeze({
      status: raw.status,
      ...(typeof raw.errorCode === "string" ? { errorCode: raw.errorCode } : {}),
      ...(typeof raw.remoteId === "string" ? { remoteId: raw.remoteId } : {}),
      ...(typeof raw.remoteUrl === "string" ? { remoteUrl: raw.remoteUrl } : {}),
    });
  }
  return Object.freeze({ status: "uncertain", errorCode: "PUBLISHER_RESULT_INVALID" });
}

function createWorkerPublisherExecutor(options) {
  const value = options || {};
  const adapters = value.adapters || {};
  const inputRoot = value.paths && value.paths.input;
  if (typeof inputRoot !== "string") throw workerError("WORKER_INPUT_ROOT_REQUIRED");
  function resolveFile(task, adapter) {
    const directory = path.resolve(inputRoot, adapter.scanDir || task.sourcePlatformId);
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
        if (task.targetPlatformId === "media") {
          results.push(Object.freeze({ task, outcome: { status: "failed", errorCode: "MEDIA_MAIN_PROCESS_REQUIRED" } }));
          continue;
        }
        const adapter = adapters[task.targetPlatformId];
        if (!adapter || typeof adapter.publishArticle !== "function") throw workerError("SUBMISSION_ADAPTER_MISSING");
        if (value.shouldStop && value.shouldStop()) {
          results.push({ task, outcome: { status: "failed", errorCode: "STOP_REQUESTED" } });
          continue;
        }
        const filename = resolveFile(task, adapter);
        const source = { file: filename, filePath: filename, sourceFile: filename, filename: task.filename, fileBaseName: path.basename(task.filename, path.extname(task.filename)) };
        const articles = adapter.parseArticleFiles ? await adapter.parseArticleFiles([source]) : [source];
        if (!articles || !articles.length) throw workerError("ARTICLE_PARSE_FAILED");
        const article = articles[0];
        if (typeof adapter.ensureSession === "function") await adapter.ensureSession();
        if (typeof adapter.ensureLoggedIn === "function") await adapter.ensureLoggedIn(publishOptions || {});
        if (value.onState) value.onState({ phase: "remote-started", task });
        let outcome;
        try { outcome = safeOutcome(await adapter.publishArticle(article, publishOptions || {})); }
        catch (_) { outcome = { status: "uncertain", errorCode: "PUBLISHER_EXCEPTION" }; }
        if (value.onState) value.onState({ phase: "remote-finished", task, status: outcome.status, errorCode: outcome.errorCode });
        results.push(Object.freeze({ task, outcome }));
      } catch (error) {
        results.push(Object.freeze({ task: rawTask || {}, outcome: { status: "failed", errorCode: error.code || "PUBLISHER_PREPARE_FAILED" } }));
      }
    }
    return Object.freeze({ results });
  }
  return Object.freeze({ execute });
}

module.exports = { createWorkerPublisherExecutor };
