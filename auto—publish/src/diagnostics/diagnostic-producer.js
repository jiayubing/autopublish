"use strict";

const {
  createDiagnosticRecord,
  parseDiagnosticRecord,
} = require("./diagnostic-schema");

const NOOP = () => false;
const SAFE_ERROR_CODE = /^[A-Z][A-Z0-9_]{1,127}$/;
let activeReporter = NOOP;

function safeErrorCode(value) {
  return value && typeof value.code === "string" && SAFE_ERROR_CODE.test(value.code)
    ? value.code
    : null;
}

function createDiagnosticProducer(options) {
  const opts = options || {};
  const sinks = (Array.isArray(opts.sinks) ? opts.sinks : [opts.sink]).filter(
    (sink) => sink && typeof sink.append === "function",
  );
  const failOnSinkError = opts.failOnSinkError === true;
  let attemptedCount = 0;
  let deliveredCount = 0;
  let failedCount = 0;
  let lastFailureCode = null;

  function append(input) {
    const record = parseDiagnosticRecord(input);
    attemptedCount += 1;
    let firstError = null;
    for (const sink of sinks) {
      try {
        sink.append(record);
      } catch (error) {
        if (!firstError) firstError = error;
      }
    }
    if (firstError) {
      failedCount += 1;
      lastFailureCode = safeErrorCode(firstError);
      if (failOnSinkError) throw firstError;
    } else {
      deliveredCount += 1;
    }
    return record;
  }

  function getStatus() {
    return Object.freeze({
      status: failedCount > 0 ? "degraded" : "ready",
      attemptedCount,
      deliveredCount,
      failedCount,
      lastFailureCode,
    });
  }

  return Object.freeze({ append, add: append, write: append, getStatus });
}

function setDiagnosticReporter(reporter) {
  const previous = activeReporter;
  activeReporter = typeof reporter === "function" ? reporter : NOOP;
  return function restore() {
    if (activeReporter === reporter) activeReporter = previous;
  };
}

function reportDiagnostic(input) {
  try {
    const record = createDiagnosticRecord(input);
    return activeReporter(record) === true;
  } catch (_) {
    return false;
  }
}

module.exports = {
  createDiagnosticProducer,
  setDiagnosticReporter,
  reportDiagnostic,
};
