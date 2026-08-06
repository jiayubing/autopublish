const { SCHEMA_VERSION } = require("./internal/operational-store-schema");
const {
  openOperationalStoreRuntime,
  dryRunOperationalStoreMigration,
} = require("./internal/operational-store-runtime");
const storeContext = require("./internal/operational-store-context");
const {
  createPublicationAggregate,
} = require("./internal/operational-store-publication-aggregate");
const {
  createSubmissionAggregate,
} = require("./internal/operational-store-submission-aggregate");
const {
  createSubmissionPreparationAggregate,
} = require("./internal/operational-store-submission-preparation");
const recovery = require("./internal/operational-store-recovery-aggregate");
const orders = require("./internal/operational-store-order-aggregate");
const {
  createOperationalStoreQueueAggregate,
} = require("./internal/operational-store-queue-aggregate");
const {
  createOperationalStoreActiveTargetAggregate,
} = require("./internal/operational-store-active-target-aggregate");
const {
  createOperationalStoreReconciliationAggregate,
} = require("./internal/operational-store-reconciliation-aggregate");
const {
  createOperationalStoreFactReader,
} = require("./internal/operational-store-fact-reader");
const {
  createMaintenanceAggregate,
  verifyOperationalDatabase,
} = require("./internal/operational-store-maintenance");
const {
  exposeOperationalStoreTransitionPorts,
} = require("./internal/operational-store-transition-ports");
function createOperationalStore(options) {
  const runtime = openOperationalStoreRuntime(options);
  const context = storeContext.createOperationalStoreContext(runtime, options);
  try {
    const activeTarget = createOperationalStoreActiveTargetAggregate(context);
    const pub = createPublicationAggregate(context, activeTarget);
    const submission = createSubmissionAggregate(context);
    const prep = createSubmissionPreparationAggregate(context);
    const recover = recovery.createRecoveryAggregate(context, activeTarget);
    const order = orders.createOrderAggregate(context, activeTarget);
    const queue = createOperationalStoreQueueAggregate(context);
    const reconcile = createOperationalStoreReconciliationAggregate(context);
    const facts = createOperationalStoreFactReader(context);
    const maintain = createMaintenanceAggregate(context);
    exposeOperationalStoreTransitionPorts(options, {
      facts,
      publication: pub,
      recovery: recover,
      queue,
    });
    return Object.freeze({
      databasePath: runtime.filename,
      createAccountProfile: pub.createAccountProfile,
      listAccountProfiles: pub.listAccountProfiles,
      assertExecutableAccountProfile: pub.assertExecutableAccountProfile,
      reservePublicationTarget: pub.reservePublicationTarget,
      commitRemoteOutcome: pub.commitRemoteOutcome,
      listActionableRecovery: recover.listActionableRecovery,
      markRecoveryUncertain: recover.markRecoveryUncertain,
      createSubmissionBatch: prep.createSubmissionBatch,
      queueSubmissionBatch: prep.queueSubmissionBatch,
      discardPreparedSubmissionBatch: prep.discardPreparedSubmissionBatch,
      prepareSubmissionItemAction: submission.prepareSubmissionItemAction,
      getSubmissionItemAction: submission.getSubmissionItemAction,
      checkpointSubmissionItemAction: submission.checkpointSubmissionItemAction,
      claimSubmissionItem: submission.claimSubmissionItem,
      claimSubmissionItemById: submission.claimSubmissionItemById,
      renewSubmissionItemClaim: submission.renewSubmissionItemClaim,
      updateSubmissionItem: submission.updateSubmissionItem,
      cancelQueuedSubmissionItem: submission.cancelQueuedSubmissionItem,
      markSubmissionItemCleaned: submission.markSubmissionItemCleaned,
      getSubmissionBatch: submission.getSubmissionBatch,
      listSubmissionBatches: submission.listSubmissionBatches,
      findSubmissionItem: submission.findSubmissionItem,
      getArchiveEligibility: submission.getArchiveEligibility,
      attachRemoteOrderEvidence: order.attachRemoteOrderEvidence,
      claimPostProcessing: recover.claimPostProcessing,
      completePostProcessing: recover.completePostProcessing,
      retryPostProcessing: recover.retryPostProcessing,
      listPostProcessingAttention: recover.listPostProcessingAttention,
      listPublicationAttention: recover.listPublicationAttention,
      listPublicationRecords: pub.listPublicationRecords,
      listRemoteOrders: order.listRemoteOrders,
      listOrderDisplayViews: order.listOrderDisplayViews,
      recordRemoteOrderObservation: order.recordRemoteOrderObservation,
      createSubmissionQueueGroup: queue.createSubmissionQueueGroup,
      setSubmissionQueueGroupPause: queue.setSubmissionQueueGroupPause,
      listSubmissionQueueGroups: queue.listSubmissionQueueGroups,
      enqueueSubmissionQueueItem: queue.enqueueSubmissionQueueItem,
      listSubmissionQueueItems: queue.listSubmissionQueueItems,
      createPaidSubmissionBatch: queue.createPaidSubmissionBatch,
      getPaidSubmissionBatch: queue.getPaidSubmissionBatch,
      listPaidSubmissionBatches: queue.listPaidSubmissionBatches,
      setPaidSubmissionBatchPause: queue.setPaidSubmissionBatchPause,
      recordManualReconciliation: reconcile.recordManualReconciliation,
      listManualReconciliations: reconcile.listManualReconciliations,
      listArticleLifecycleFacts: facts.listArticleLifecycleFacts,
      deriveAttentionInput: recover.listActionableRecovery,
      verify: maintain.verify,
      backup: maintain.backup,
      close: context.close,
    });
  } catch (error) {
    context.close();
    throw error;
  }
}
module.exports = {
  SCHEMA_VERSION,
  createOperationalStore,
  dryRunOperationalStoreMigration,
  verifyOperationalDatabase,
};
