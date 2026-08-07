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
  holder.regularQueueGroupTransitions = Object.freeze({
    listRegularQueueGroupSnapshots: queue.listRegularQueueGroupSnapshots,
    setRegularQueueGroupRunIntent: queue.setRegularQueueGroupRunIntent,
    startAllRegularQueueGroups: queue.startAllRegularQueueGroups,
    pauseAllRegularQueueGroups: queue.pauseAllRegularQueueGroups,
    pauseRegularQueueGroupsOnStartup: queue.pauseRegularQueueGroupsOnStartup,
    claimRegularQueueGroupHead: queue.claimRegularQueueGroupHead,
    renewRegularQueueGroupClaim: queue.renewRegularQueueGroupClaim,
    beginRegularRemoteSubmission: queue.beginRegularRemoteSubmission,
  });
  holder.paidAdmissionTransitions = Object.freeze({
    listArticleLifecycleFacts: facts.listArticleLifecycleFacts,
    admitPaidBatch: queue.admitPaidBatch,
  });
}

module.exports = { exposeOperationalStoreTransitionPorts };
