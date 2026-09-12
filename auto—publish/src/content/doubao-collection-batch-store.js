"use strict";

const fs = require("node:fs");
const path = require("node:path");

const VERSION = 1;
const DEFAULT_FILENAME = "doubao-collection-batch.json";
const TASK_STATUSES = new Set(["pending", "running", "succeeded", "failed", "waiting_login", "waiting_human", "cancelled"]);

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
  if (!isObject(value) || typeof value.id !== "string" || !value.id ||
      typeof value.clientId !== "string" || !value.clientId ||
      typeof value.questionId !== "string" || !value.questionId ||
      !isObject(value.input) || !TASK_STATUSES.has(value.status)) {
    throw storeError("DOUBAO_COLLECTION_RECOVERY_INVALID", "Doubao recovery task is invalid");
  }
  return {
    id: value.id,
    clientId: value.clientId,
    questionId: value.questionId,
    input: clone(value.input),
    status: value.status,
    answerLength: Number.isInteger(value.answerLength) && value.answerLength >= 0 ? value.answerLength : 0,
    referenceCount: Number.isInteger(value.referenceCount) && value.referenceCount >= 0 ? value.referenceCount : 0,
    error: isObject(value.error) && typeof value.error.code === "string"
      ? {
          code: value.error.code.slice(0, 100),
          message: typeof value.error.message === "string" ? value.error.message.slice(0, 500) : "Doubao collection failed",
        }
      : null,
  };
}

function normalizeBatch(value) {
  if (!isObject(value) || !Array.isArray(value.tasks)) {
    throw storeError("DOUBAO_COLLECTION_RECOVERY_INVALID", "Doubao recovery state is invalid");
  }
  return {
    status: typeof value.status === "string" ? value.status : "completed",
    currentTaskId: typeof value.currentTaskId === "string" ? value.currentTaskId : null,
    completed: Number.isInteger(value.completed) && value.completed >= 0 ? value.completed : 0,
    total: Number.isInteger(value.total) && value.total >= 0 ? value.total : value.tasks.length,
    tasks: value.tasks.map(normalizeTask),
  };
}

function createDoubaoCollectionBatchStore(options) {
  const value = options || {};
  if (typeof value.workspaceRoot !== "string" || !value.workspaceRoot.trim()) {
    throw storeError("DOUBAO_COLLECTION_RECOVERY_STORE_INVALID", "Workspace root is required");
  }
  const fsApi = value.fs || fs;
  const directory = value.directory || path.join(value.workspaceRoot, ".autopublish", "data");
  const filename = value.filename || path.join(directory, DEFAULT_FILENAME);

  function load() {
    let raw;
    try { raw = fsApi.readFileSync(filename, "utf8"); }
    catch (error) {
      if (error && error.code === "ENOENT") return null;
      throw storeError("DOUBAO_COLLECTION_RECOVERY_READ_FAILED", "Doubao recovery state could not be read", error);
    }
    let parsed;
    try { parsed = JSON.parse(raw); }
    catch (error) { throw storeError("DOUBAO_COLLECTION_RECOVERY_INVALID", "Doubao recovery state is invalid", error); }
    if (!isObject(parsed) || parsed.version !== VERSION || !isObject(parsed.batch)) {
      throw storeError("DOUBAO_COLLECTION_RECOVERY_INVALID", "Doubao recovery state is invalid");
    }
    return normalizeBatch(parsed.batch);
  }

  function save(batch) {
    const normalized = normalizeBatch(batch);
    try {
      fsApi.mkdirSync(directory, { recursive: true });
      const temporary = filename + ".tmp";
      fsApi.writeFileSync(temporary, JSON.stringify({ version: VERSION, batch: normalized }, null, 2) + "\n", "utf8");
      fsApi.renameSync(temporary, filename);
    } catch (error) {
      throw storeError("DOUBAO_COLLECTION_RECOVERY_WRITE_FAILED", "Doubao recovery state could not be saved", error);
    }
    return clone(normalized);
  }

  return Object.freeze({ load, save, filename });
}

module.exports = { createDoubaoCollectionBatchStore };
