"use strict";

const path = require("node:path");
const { Worker } = require("node:worker_threads");

function docError(code) {
  return Object.assign(new Error(code), { code });
}

function extractDocText({ buffer }) {
  if (!Buffer.isBuffer(buffer) || buffer.length > 8 * 1024 * 1024)
    return Promise.reject(docError("MATERIAL_DOC_TOO_LARGE"));
  return new Promise((resolve, reject) => {
    const worker = new Worker(path.join(__dirname, "doc-text-worker.js"), {
      workerData: buffer,
      resourceLimits: { maxOldGenerationSizeMb: 96 },
    });
    let settled = false;
    const finish = (failure, content) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (failure) reject(docError(failure));
      else resolve(content);
    };
    const timer = setTimeout(() => {
      worker.terminate().catch(() => {
        // Best-effort cleanup; the timeout remains the reported failure.
      });
      finish("MATERIAL_DOC_TIMEOUT");
    }, 10000);
    worker.on("message", (result) => finish(result.code, result.content));
    worker.on("error", () => finish("MATERIAL_DOC_INVALID"));
    worker.on("exit", () => finish("MATERIAL_DOC_INVALID"));
  });
}

module.exports = { extractDocText };
