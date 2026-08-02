"use strict";

const {
  createDiagnosticRecord,
  parseDiagnosticRecord,
} = require("./diagnostic-schema");

const NOOP = () => false;
let activeReporter = NOOP;

function createDiagnosticProducer(options) {
  const opts = options || {};
  const sinks = (Array.isArray(opts.sinks) ? opts.sinks : [opts.sink]).filter(
    (sink) => sink && typeof sink.append === "function",
  );
  const failOnSinkError = opts.failOnSinkError === true;

  function append(input) {
    const record = parseDiagnosticRecord(input);
    let firstError = null;
    for (const sink of sinks) {
      try {
        sink.append(record);
      } catch (error) {
        if (!firstError) firstError = error;
      }
    }
    if (firstError && failOnSinkError) throw firstError;
    return record;
  }

  return Object.freeze({ append, add: append, write: append });
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
