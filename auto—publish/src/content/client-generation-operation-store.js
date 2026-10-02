"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { createContentPathPolicy } = require("./content-path-policy");
const { createAtomicFileWriter } = require("./content-file-transaction");
const { acquireProcessLock } = require("./content-process-lock");

function createClientGenerationOperationStore(options) {
  const policy = createContentPathPolicy(options.workspaceRoot, { paths: options.paths });
  const writer = createAtomicFileWriter();
  const root = path.join(policy.workspace.operations, "client-generation");
  const boundary = { boundary: policy.root, code: "CONTENT_GENERATION_STORAGE_INVALID", label: "Generation operations" };
  let release = null;
  function acquire() {
    if (release) return;
    policy.assertDirectory(root, { ...boundary, create: true });
    try { release = acquireProcessLock(path.join(root, "active-owner")); }
    catch (_) { throw Object.assign(new Error("Generation operation store is already owned or requires recovery"), { code: "CONTENT_GENERATION_STORAGE_INVALID" }); }
  }
  function validate(record) {
    if (!record || record.version !== 1 || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,199}$/.test(record.id || "") ||
        typeof record.clientId !== "string" || !record.request || record.request.clientId !== record.clientId ||
        [record.createdAt, record.updatedAt, record.activatedAt].some(value => typeof value !== "string" || !Number.isFinite(Date.parse(value))) ||
        !Number.isInteger(record.articleCount) || record.articleCount < 1 || record.articleCount > 100 ||
        !Number.isInteger(record.concurrency) || record.concurrency < 1 || record.concurrency > 4 ||
        !Array.isArray(record.tasks) || record.tasks.length !== record.articleCount ||
        !["running", "completed", "failed", "partial", "uncertain"].includes(record.status) ||
        record.tasks.some((task, index) => !task || task.index !== index || !["pending", "running", "succeeded", "failed", "uncertain"].includes(task.status))) {
      throw Object.assign(new Error("Generation operation record is invalid"), { code: "CONTENT_GENERATION_STORAGE_INVALID" });
    }
    return record;
  }
  return {
    list() {
      acquire();
      if (!policy.assertDirectory(root, { ...boundary, create: false, returnMissing: false })) return [];
      return fs.readdirSync(root).filter(name => name.endsWith(".json")).map(name => {
        const file = path.join(root, name);
        policy.assertRegularFile(file, boundary);
        try {
          const record = validate(JSON.parse(fs.readFileSync(file, "utf8")));
          if (name !== record.id + ".json") throw new Error("Identity mismatch");
          return record;
        } catch (_) {
          throw Object.assign(new Error("Generation operation record is invalid"), { code: "CONTENT_GENERATION_STORAGE_INVALID" });
        }
      });
    },
    write(record) {
      acquire();
      validate(record);
      policy.assertDirectory(root, { ...boundary, create: true });
      const file = path.join(root, record.id + ".json");
      policy.assertRegularFile(file, { ...boundary, allowMissing: true });
      try { writer.write(file, JSON.stringify(record) + "\n", { keepExisting: false }); }
      catch (_) { throw Object.assign(new Error("Generation operation could not be saved"), { code: "CONTENT_GENERATION_STORAGE_FAILED" }); }
    },
    close() {
      if (release) { release(); release = null; }
    },
  };
}

module.exports = { createClientGenerationOperationStore };
