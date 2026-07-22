"use strict";

// A request-scoped read model for submission queries.  It deliberately owns no
// persistent state: callers create a new instance before a mutation so an
// action can never rely on an old query's observations.
function createSubmissionReadSnapshot(batchStore, options) {
  const batches = (options && options.batches || batchStore.list()).slice();
  const batchById = new Map(batches.map(function(batch) { return [batch.id, batch]; }));
  const entriesByArticle = new Map();
  const sidecars = new Map();
  const publications = new Map();

  batches.forEach(function(batch) {
    (batch.items || []).forEach(function(item) {
      const key = batch.clientId + "\0" + item.articleId;
      const entries = entriesByArticle.get(key) || [];
      entries.push({ batch: batch, item: item });
      entriesByArticle.set(key, entries);
    });
  });

  return {
    batches: batches,
    getBatch: function(id) { return batchById.get(id) || null; },
    entriesForArticle: function(clientId, articleId) { return (entriesByArticle.get(clientId + "\0" + articleId) || []).slice(); },
    readSidecar: function(item, read) {
      const key = item.sidecarPath || "";
      if (!sidecars.has(key)) sidecars.set(key, read(item));
      return sidecars.get(key);
    },
    publicationFor: function(item, read) {
      const key = item.publicationId || "";
      if (!key) return null;
      if (!publications.has(key)) publications.set(key, read(item));
      return publications.get(key);
    },
    replaceBatch: function(batch) {
      batchById.set(batch.id, batch);
      const index = batches.findIndex(function(candidate) { return candidate.id === batch.id; });
      if (index >= 0) batches[index] = batch;
    }
  };
}

module.exports = { createSubmissionReadSnapshot };
