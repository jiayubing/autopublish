"use strict";

const SAFE_CODE = /^[A-Z][A-Z0-9_]{1,127}$/;

function safeCode(value) {
  return typeof value === "string" && SAFE_CODE.test(value)
    ? value
    : "DIAGNOSTIC_STARTUP_CLEANUP_FAILED";
}

function initializeDiagnosticSink(sink) {
  if (!sink || typeof sink.initialize !== "function")
    return Object.freeze({ status: "NOT_CONFIGURED" });
  try {
    const result = sink.initialize();
    return Object.freeze({
      status: "PASSED",
      ...(result && typeof result === "object" ? { cleanup: result } : {}),
    });
  } catch (error) {
    return Object.freeze({
      status: "FAILED",
      code: safeCode(error && error.code),
    });
  }
}

module.exports = { initializeDiagnosticSink };
