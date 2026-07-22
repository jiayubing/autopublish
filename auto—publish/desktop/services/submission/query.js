"use strict";

// Query facade kept independent from IPC.  The service supplies its domain
// operations, while this module owns the request-scoped snapshot lifetime.
function createSubmissionQuery(deps) {
  return {
    listBatches: function(clientId) {
      const snapshot = deps.createSnapshot();
      return snapshot.batches.filter(function(batch) { return !clientId || batch.clientId === clientId; }).map(function(batch) {
        const reconciled = deps.reconcileBatch(batch.id, snapshot).batch;
        const plan = deps.buildActionPlan(batch.id, "cancel", snapshot);
        return Object.assign({}, reconciled, {
          actionPlan: plan,
          items: reconciled.items.map(function(item) {
            const planned = plan.items.find(function(candidate) {
              return candidate.articleId === item.articleId && candidate.targetPlatformId === item.targetPlatformId &&
                candidate.publicationId === (item.publicationId || null) && candidate.attemptId === (item.attemptId || null);
            });
            return Object.assign({}, item, { canCancel: !!(planned && planned.allowed), actionFingerprint: planned && planned.fingerprint || null, reasonCode: planned && !planned.allowed ? planned.reasonCode : item.reasonCode });
          })
        });
      });
    }
  };
}

module.exports = { createSubmissionQuery };
