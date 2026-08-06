function exposeOperationalStoreTransitionPorts(options, dependencies) {
  const holder = options && options.transitionPorts;
  if (!holder || typeof holder !== "object") return;
  const value = dependencies || {};
  const facts = value.facts;
  const publication = value.publication;
  const recovery = value.recovery;
  const queue = value.queue;
  holder.publicationTransitions = Object.freeze({
    listArticleLifecycleFacts: facts.listArticleLifecycleFacts,
    reservePublicationTarget: publication.reservePublicationTarget,
    commitRemoteOutcome: publication.commitRemoteOutcome,
    markRecoveryUncertain: recovery.markRecoveryUncertain,
  });
  holder.regularQueueTransitions = Object.freeze({
    listArticleLifecycleFacts: facts.listArticleLifecycleFacts,
    admitRegularQueueItem: queue.admitRegularQueueItem,
    removePendingQueueItem: queue.removePendingQueueItem,
  });
}

module.exports = { exposeOperationalStoreTransitionPorts };
