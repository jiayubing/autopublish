function exposeOperationalStoreTransitionPorts(options, dependencies) {
  const holder = options && options.transitionPorts;
  if (!holder || typeof holder !== "object") return;
  const value = dependencies || {};
  const facts = value.facts;
  const publication = value.publication;
  const recovery = value.recovery;
  const queue = value.queue;
  const order = value.order;
  const paidExecution = value.paidExecution;
  const regularOutcome = value.regularOutcome;
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
  holder.regularOutcomeTransitions = Object.freeze({
    confirmRegularAccepted: regularOutcome.confirmRegularAccepted,
    confirmRegularNotAccepted: regularOutcome.confirmRegularNotAccepted,
    getRegularOutcomeSnapshot: regularOutcome.getRegularOutcomeSnapshot,
    markOrphanedRegularAttemptUncertain:
      regularOutcome.markOrphanedRegularAttemptUncertain,
    prepareRegularUncertainResolution:
      regularOutcome.prepareRegularUncertainResolution,
    recordRegularAccepted: regularOutcome.recordRegularAccepted,
    recordRegularArticleRejected: regularOutcome.recordRegularArticleRejected,
    recordRegularGroupBlocked: regularOutcome.recordRegularGroupBlocked,
    recordRegularUncertain: regularOutcome.recordRegularUncertain,
  });
  holder.paidAdmissionTransitions = Object.freeze({
    listArticleLifecycleFacts: facts.listArticleLifecycleFacts,
    admitPaidBatch: queue.admitPaidBatch,
  });
  holder.paidExecutionTransitions = Object.freeze({
    beginOrderCreationRemoteCall: paidExecution.beginOrderCreationRemoteCall,
    claimPaidSubmissionBatchItem: paidExecution.claimPaidSubmissionBatchItem,
    listPaidSubmissionBatchSnapshots:
      paidExecution.listPaidSubmissionBatchSnapshots,
    pauseAllPaidSubmissionBatches: paidExecution.pauseAllPaidSubmissionBatches,
    pausePaidSubmissionBatchesOnStartup:
      paidExecution.pausePaidSubmissionBatchesOnStartup,
    recordPaidOrderCreationArticleRejection:
      order.recordPaidOrderCreationArticleRejection,
    recordPaidOrderCreationSuccess: order.recordPaidOrderCreationSuccess,
    recordPaidOrderCreationSystemRejection:
      order.recordPaidOrderCreationSystemRejection,
    recordPaidOrderCreationUncertain: order.recordPaidOrderCreationUncertain,
    releasePaidOrderCreationClaim: paidExecution.releasePaidOrderCreationClaim,
    renewPaidOrderCreationClaim: paidExecution.renewPaidOrderCreationClaim,
    setPaidSubmissionBatchRunIntent:
      paidExecution.setPaidSubmissionBatchRunIntent,
    startAllPaidSubmissionBatches: paidExecution.startAllPaidSubmissionBatches,
  });
}

module.exports = { exposeOperationalStoreTransitionPorts };
