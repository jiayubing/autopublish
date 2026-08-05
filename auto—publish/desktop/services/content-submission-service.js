"use strict";

const { createOperationalContentSubmissionService } = require("./operational-content-submission-service");
const {
  createContentSubmissionApplication,
} = require("./content-submission-application");

// Production content submission state is exclusively owned by OperationalStore.
// Legacy JSON batch/ledger behavior intentionally lives only in tests/helpers
// for read-only historical fixtures and migration assertions.
function createContentSubmissionService(options) {
  const value = options || {};
  if (!value.operationalStore) {
    const error = new Error("OperationalStore is required for content submission");
    error.code = "OPERATIONAL_STORE_REQUIRED";
    throw error;
  }
  return createContentSubmissionApplication(
    createOperationalContentSubmissionService(value),
  );
}

module.exports = { createContentSubmissionService };
