const { createSubmissionReadSnapshot } = require("./submission-read-snapshot");

// This module owns the public read model.  Reconciliation and action planning
// are collaborators because they also serve mutation-time revalidation; the
// snapshot passed to both prevents repeated batch-store scans and sidecar IO.
function createSubmissionQuery(deps) {
  function createReadSnapshot(input) {
    return createSubmissionReadSnapshot(deps, input);
  }

  function getBatch(batchId) {
    return deps.reconcileBatch(batchId, createReadSnapshot({ batchId: batchId })).batch;
  }

  function listBatches(clientId) {
    const snapshot = createReadSnapshot();
    return snapshot.batches
      .filter(function(batch) { return !clientId || batch.clientId === clientId; })
      .map(function(batch) {
        const result = deps.reconcileBatch(batch.id, snapshot);
        const reconciled = result.batch;
        const plan = deps.buildActionPlan(batch.id, "cancel", snapshot, result);
        return Object.assign({}, reconciled, {
          actionPlan: plan,
          items: reconciled.items.map(function(item) {
            const planned = plan.items.find(function(candidate) {
              return candidate.articleId === item.articleId && candidate.targetPlatformId === item.targetPlatformId &&
                candidate.publicationId === (item.publicationId || null) && candidate.attemptId === (item.attemptId || null);
            });
            return Object.assign({}, item, {
              canCancel: !!(planned && planned.allowed),
              actionFingerprint: planned && planned.fingerprint || null,
              reasonCode: planned && !planned.allowed ? planned.reasonCode : item.reasonCode
            });
          })
        });
      });
  }

  return Object.freeze({ createReadSnapshot, getBatch, listBatches });
}

module.exports = { createSubmissionQuery };
