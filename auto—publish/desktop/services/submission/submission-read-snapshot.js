// A query snapshot is intentionally an internal, immutable read boundary.  It
// loads the batch store once and indexes the facts that the submission query
// needs; mutation commands must always build a fresh snapshot.
function createSubmissionReadSnapshot(deps, input) {
  const source = input && Array.isArray(input.batches)
    ? input.batches
    : input && input.batchId ? [deps.batchStore.get(input.batchId)] : deps.batchStore.list();
  const snapshot = {
    revision: typeof deps.getDataRevision === "function" ? deps.getDataRevision() : null,
    batches: source,
    batchesById: new Map(),
    itemsByArticle: new Map(),
    itemsByIdentity: new Map(),
    publicationsById: new Map(),
    sidecarsByItem: new Map(),
    operationCounts: { batchVisits: 0, itemVisits: 0 }
  };
  source.forEach(function(batch) {
    snapshot.operationCounts.batchVisits += 1;
    snapshot.batchesById.set(batch.id, batch);
    (batch.items || []).forEach(function(item, index) {
      snapshot.operationCounts.itemVisits += 1;
      const entry = { batch: batch, item: item, itemKey: batch.id + "\0" + index };
      const articleKey = batch.clientId + "\0" + item.articleId;
      snapshot.itemsByArticle.set(articleKey, (snapshot.itemsByArticle.get(articleKey) || []).concat(entry));
      const identityKey = (item.publicationId || batch.id + ":" + item.targetPlatformId + ":" + item.articleId) + "\0" + (item.attemptId || "");
      snapshot.itemsByIdentity.set(identityKey, entry);
    });
  });
  if (typeof deps.onSnapshotCreated === "function") deps.onSnapshotCreated(snapshot.operationCounts);
  return snapshot;
}

module.exports = { createSubmissionReadSnapshot };
