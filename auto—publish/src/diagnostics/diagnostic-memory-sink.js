"use strict";

const { parseDiagnosticRecord } = require("./diagnostic-schema");

function boundedLimit(value, fallback, maximum) {
  return Number.isSafeInteger(value) && value > 0
    ? Math.min(value, maximum)
    : fallback;
}

function fingerprint(record) {
  return JSON.stringify([
    record.code,
    record.module,
    record.category,
    record.operationId,
    record.runId,
    record.metadata,
  ]);
}

function cloneRecord(record) {
  return Object.freeze({
    ...record,
    metadata: Object.freeze({ ...record.metadata }),
  });
}

function createDiagnosticMemorySink(options) {
  const opts = options || {};
  const maxRecords = boundedLimit(opts.maxRecords, 100, 1000);
  const records = [];
  const fingerprints = new Map();

  function evict() {
    while (records.length > maxRecords) {
      const removed = records.shift();
      fingerprints.delete(fingerprint(removed));
    }
  }

  function append(input) {
    const record = cloneRecord(parseDiagnosticRecord(input));
    const key = fingerprint(record);
    const existing = fingerprints.get(key);
    if (existing) return existing;
    records.push(record);
    fingerprints.set(key, record);
    evict();
    return record;
  }

  function getSnapshot(filter) {
    const values = filter || {};
    let result = records;
    if (values.runId !== undefined)
      result = result.filter((record) => record.runId === values.runId);
    if (values.operationId !== undefined)
      result = result.filter((record) => record.operationId === values.operationId);
    if (values.code !== undefined)
      result = result.filter((record) => record.code === values.code);
    const limit = boundedLimit(values.limit, result.length || 1, maxRecords);
    return Object.freeze(result.slice(-limit).map(cloneRecord));
  }

  function findByDiagnosticId(diagnosticId) {
    const record = records.find((item) => item.diagnosticId === diagnosticId);
    return record ? cloneRecord(record) : null;
  }

  function clear() {
    records.length = 0;
    fingerprints.clear();
  }

  return Object.freeze({
    append,
    add: append,
    write: append,
    getSnapshot,
    snapshot: getSnapshot,
    findByDiagnosticId,
    clear,
    size: () => records.length,
    maxRecords,
  });
}

module.exports = { createDiagnosticMemorySink, fingerprint };
