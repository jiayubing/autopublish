"use strict";

function createSubmissionBatchReader(options) {
  const value = options || {};
  if (!value.operationalStore) {
    const error = new Error(
      "OperationalStore is required for submission reads",
    );
    error.code = "OPERATIONAL_STORE_REQUIRED";
    throw error;
  }

  function toPublicBatch(batch) {
    function publicPayload(payload) {
      const output = payload && typeof payload === "object" && !Array.isArray(payload)
        ? Object.assign({}, payload)
        : {};
      delete output.publicationSnapshot;
      delete output.articleRef;
      return output;
    }
    const first = batch.items.find(
      (stored) => stored.payload && typeof stored.payload.clientId === "string",
    );
    return {
      id: batch.batchId,
      batchId: batch.batchId,
      clientId: (first && first.payload.clientId) || null,
      status: batch.status,
      revision: batch.revision,
      createdAt: batch.createdAt,
      updatedAt: batch.updatedAt,
      items: batch.items.map((stored) => {
        const item = {
          itemId: stored.itemId,
          articleId: stored.articleId,
          targetKey: stored.targetKey,
          status: stored.status,
          revision: stored.revision,
          ...publicPayload(stored.payload),
        };
        if (stored.queueGroupId !== undefined) item.queueGroupId = stored.queueGroupId;
        if (stored.position !== undefined) item.position = stored.position;
        return item;
      }),
    };
  }

  function listBatches(clientId) {
    return value.operationalStore
      .listSubmissionBatches(clientId === undefined ? {} : { clientId })
      .map(toPublicBatch);
  }

  function getBatch(batchId) {
    return toPublicBatch(value.operationalStore.getSubmissionBatch(batchId));
  }

  return Object.freeze({ toPublicBatch, listBatches, getBatch });
}

module.exports = { createSubmissionBatchReader };
