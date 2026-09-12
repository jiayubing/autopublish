"use strict";

const fs = require("node:fs");
const path = require("node:path");

const VERSION = 1;
const DEFAULT_FILENAME = "client-generation-operations.json";

function storeError(code, message, cause) {
  const error = new Error(message || code);
  error.code = code;
  if (cause) error.cause = cause;
  return error;
}

function clone(value) {
  return value === undefined ? value : JSON.parse(JSON.stringify(value));
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function normalizeTask(value) {
  if (!isObject(value) || !Number.isInteger(value.index) || value.index < 0 ||
      !["pending", "running", "succeeded", "failed"].includes(value.status)) {
    throw storeError("CLIENT_GENERATION_RECOVERY_INVALID", "Client generation recovery task is invalid");
  }
  return {
    index: value.index,
    status: value.status,
    attempts: Number.isInteger(value.attempts) && value.attempts >= 0 ? value.attempts : 0,
    articleId: typeof value.articleId === "string" && value.articleId ? value.articleId : null,
    articleTitle: typeof value.articleTitle === "string" && value.articleTitle ? value.articleTitle.slice(0, 300) : null,
    error: isObject(value.error) && typeof value.error.code === "string"
      ? {
          code: value.error.code.slice(0, 100),
          message: typeof value.error.message === "string" ? value.error.message.slice(0, 500) : "文章生成失败",
        }
      : null,
  };
}

function normalizeOperation(value) {
  if (!isObject(value) || typeof value.id !== "string" || !value.id ||
      typeof value.clientId !== "string" || !value.clientId ||
      !Number.isInteger(value.articleCount) || value.articleCount < 1 || value.articleCount > 100 ||
      !Number.isInteger(value.concurrency) || value.concurrency < 1 || value.concurrency > 4 ||
      !isObject(value.request) || !Array.isArray(value.tasks) || value.tasks.length !== value.articleCount ||
      typeof value.createdAt !== "string" || typeof value.updatedAt !== "string") {
    throw storeError("CLIENT_GENERATION_RECOVERY_INVALID", "Client generation recovery operation is invalid");
  }
  const tasks = value.tasks.map(normalizeTask).sort(function(left, right) { return left.index - right.index; });
  if (tasks.some(function(task, index) { return task.index !== index; })) {
    throw storeError("CLIENT_GENERATION_RECOVERY_INVALID", "Client generation recovery task indexes are invalid");
  }
  return {
    id: value.id,
    clientId: value.clientId,
    articleCount: value.articleCount,
    concurrency: value.concurrency,
    status: ["running", "completed", "partial", "failed"].includes(value.status) ? value.status : "failed",
    request: clone(value.request),
    tasks,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}

function createClientGenerationOperationStore(options) {
  const value = options || {};
  if (typeof value.workspaceRoot !== "string" || !value.workspaceRoot.trim()) {
    throw storeError("CLIENT_GENERATION_RECOVERY_STORE_INVALID", "Workspace root is required");
  }
  const fsApi = value.fs || fs;
  const directory = value.directory || path.join(value.workspaceRoot, ".autopublish", "data");
  const filename = value.filename || path.join(directory, DEFAULT_FILENAME);

  function load() {
    let raw;
    try {
      raw = fsApi.readFileSync(filename, "utf8");
    } catch (error) {
      if (error && error.code === "ENOENT") return [];
      throw storeError("CLIENT_GENERATION_RECOVERY_READ_FAILED", "Client generation recovery state could not be read", error);
    }
    let parsed;
    try { parsed = JSON.parse(raw); }
    catch (error) { throw storeError("CLIENT_GENERATION_RECOVERY_INVALID", "Client generation recovery state is invalid", error); }
    if (!isObject(parsed) || parsed.version !== VERSION || !Array.isArray(parsed.operations)) {
      throw storeError("CLIENT_GENERATION_RECOVERY_INVALID", "Client generation recovery state is invalid");
    }
    return parsed.operations.map(normalizeOperation);
  }

  function save(operations) {
    if (!Array.isArray(operations)) throw storeError("CLIENT_GENERATION_RECOVERY_INVALID", "Client generation recovery state is invalid");
    const payload = {
      version: VERSION,
      operations: operations.map(normalizeOperation),
    };
    try {
      fsApi.mkdirSync(directory, { recursive: true });
      const temporary = filename + ".tmp";
      fsApi.writeFileSync(temporary, JSON.stringify(payload, null, 2) + "\n", "utf8");
      fsApi.renameSync(temporary, filename);
    } catch (error) {
      throw storeError("CLIENT_GENERATION_RECOVERY_WRITE_FAILED", "Client generation recovery state could not be saved", error);
    }
    return clone(payload.operations);
  }

  return Object.freeze({ load, save, filename });
}

module.exports = { createClientGenerationOperationStore };
