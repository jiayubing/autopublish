"use strict";

// The preparation boundary intentionally contains only pure request shaping;
// filesystem and ledger writes remain in the action module/service.
function uniqueSelection(values) {
  return new Set(values).size === values.length && values.every(function(item) { return typeof item === "string" && /^[A-Za-z0-9_.-]+$/.test(item); });
}

module.exports = { uniqueSelection };
