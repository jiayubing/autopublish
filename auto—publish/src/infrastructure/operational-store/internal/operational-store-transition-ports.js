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
  const orderObservation = value.orderObservation;
  const orderCancellation = value.orderCancellation;
  const publishedArchiveQueries = value.publishedArchiveQueries;
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
  holder.regularQueueGroupImageCountTransitions = Object.freeze({
    setRegularQueueGroupImageCount: queue.setRegularQueueGroupImageCount,
  });
  holder.regularQueueGroupSubmissionIntervalTransitions = Object.freeze({
    setRegularQueueGroupSubmissionInterval:
      queue.setRegularQueueGroupSubmissionInterval,
  });
  holder.regularOutcomeTransitions = Object.freeze({
    confirmRegularAccepted: regularOutcome.confirmRegularAccepted,
    confirmRegularNotAccepted: regularOutcome.confirmRegularNotAccepted,
    getRegularOutcomeSnapshot: regularOutcome.getRegularOutcomeSnapshot,
    listRegularRemotePending: regularOutcome.listRegularRemotePending,
    markOrphanedRegularAttemptUncertain:
      regularOutcome.markOrphanedRegularAttemptUncertain,
    prepareRegularUncertainResolution:
      regularOutcome.prepareRegularUncertainResolution,
    recordRegularAccepted: regularOutcome.recordRegularAccepted,
    recordRegularArticleRejected: regularOutcome.recordRegularArticleRejected,
    recordRegularGroupBlocked: regularOutcome.recordRegularGroupBlocked,
    recordRegularRemotePending: regularOutcome.recordRegularRemotePending,
    recordRegularUncertain: regularOutcome.recordRegularUncertain,
  });
  holder.paidAdmissionTransitions = Object.freeze({
    listArticleLifecycleFacts: facts.listArticleLifecycleFacts,
    admitPaidBatch: queue.admitPaidBatch,
  });
  holder.paidExecutionTransitions = Object.freeze({
    beginOrderCreationRemoteCall: paidExecution.beginOrderCreationRemoteCall,
    cancelRemainingPaidSubmissionBatchItems:
      paidExecution.cancelRemainingPaidSubmissionBatchItems,
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
  holder.orderCreationResolutionTransitions = Object.freeze({
    prepareOrderCreationResolution: order.prepareOrderCreationResolution,
    bindVerifiedOrder: order.bindVerifiedOrder,
    confirmNoOrder: order.confirmNoOrder,
  });
  holder.orderObservationTransitions = Object.freeze({
    listOrderObservationViews: orderObservation.listOrderObservationViews,
    getOrderObservationContext: orderObservation.getOrderObservationContext,
    recordOrderObservation: orderObservation.recordOrderObservation,
    recordOrderStatusAnomaly: orderObservation.recordOrderStatusAnomaly,
    prepareOrderStatusAnomalyResolution:
      orderObservation.prepareOrderStatusAnomalyResolution,
    resumeOrderTracking: orderObservation.resumeOrderTracking,
    confirmOrderPublished: orderObservation.confirmOrderPublished,
    confirmOrderNotPublished: orderObservation.confirmOrderNotPublished,
    readOrderTransitionFacts: orderObservation.readOrderTransitionFacts,
  });
  holder.orderCancellationTransitions = Object.freeze({
    prepareOrderCancellation: orderCancellation.prepareOrderCancellation,
    beginOrderCancellation: orderCancellation.beginOrderCancellation,
    recordOrderCancellationOutcome:
      orderCancellation.recordOrderCancellationOutcome,
    getOrderCancellationContext: orderCancellation.getOrderCancellationContext,
    getOrderCancellationView: orderCancellation.getOrderCancellationView,
    prepareCancellationResolution:
      orderCancellation.prepareCancellationResolution,
    confirmCancellationSucceeded:
      orderCancellation.confirmCancellationSucceeded,
    confirmCancellationNotApplied:
      orderCancellation.confirmCancellationNotApplied,
  });
  holder.publishedArchiveQueries = Object.freeze({
    listPublishedArchives: publishedArchiveQueries.listPublishedArchives,
  });
}

module.exports = { exposeOperationalStoreTransitionPorts };
