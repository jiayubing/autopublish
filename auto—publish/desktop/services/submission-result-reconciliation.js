"use strict";

function fail(code, message) {
  const error = new Error(message || code);
  error.code = code;
  return error;
}

function createSubmissionResultReconciliation(options) {
  const value = options || {};
  if (!value.operationalStore) throw fail("OPERATIONAL_STORE_REQUIRED");
  if (!value.projection || !value.batchReader)
    throw fail("SUBMISSION_RECONCILIATION_PORT_REQUIRED");
  const projection = value.projection;

  function reconcileBatch(batchId) {
    const batch = value.operationalStore.getSubmissionBatch(batchId);
    const items = projection.batchViews(batch).map(projection.publicItem);
    return {
      batch: Object.assign(value.batchReader.toPublicBatch(batch), { items }),
      items,
    };
  }

  function inspectPair(input) {
    const item = projection.findItemView(input);
    if (!item) throw fail("SUBMISSION_QUEUE_ITEM_NOT_FOUND");
    return item.pair;
  }

  return Object.freeze({
    reconcileBatch,
    inspectPair,
  });
}

module.exports = { createSubmissionResultReconciliation };
