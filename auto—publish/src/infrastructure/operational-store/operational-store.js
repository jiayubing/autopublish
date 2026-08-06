const { SCHEMA_VERSION } = require("./internal/operational-store-schema");
const {
  openOperationalStoreRuntime,
  dryRunOperationalStoreMigration,
} = require("./internal/operational-store-runtime");
const {
  createOperationalStoreContext,
} = require("./internal/operational-store-context");
const {
  createPublicationAggregate,
} = require("./internal/operational-store-publication-aggregate");
const {
  createSubmissionAggregate,
} = require("./internal/operational-store-submission-aggregate");
const {
  createSubmissionPreparationAggregate,
} = require("./internal/operational-store-submission-preparation");
const {
  createRecoveryAggregate,
} = require("./internal/operational-store-recovery-aggregate");
const {
  createOrderAggregate,
} = require("./internal/operational-store-order-aggregate");
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
  const context = createOperationalStoreContext(runtime, options);
  try {
    const activeTarget = createOperationalStoreActiveTargetAggregate(context);
    const publication = createPublicationAggregate(context, activeTarget);
    const submission = createSubmissionAggregate(context);
    const submissionPreparation = createSubmissionPreparationAggregate(context);
    const recovery = createRecoveryAggregate(context, activeTarget);
    const order = createOrderAggregate(context, activeTarget);
    const queue = createOperationalStoreQueueAggregate(context);
    const reconciliation =
      createOperationalStoreReconciliationAggregate(context);
    const facts = createOperationalStoreFactReader(context);
    const maintenance = createMaintenanceAggregate(context);
    exposeOperationalStoreTransitionPorts(options, {
      facts,
      publication,
      recovery,
      queue,
    });
    return Object.freeze({
      databasePath: runtime.filename,
      createAccountProfile: publication.createAccountProfile,
      listAccountProfiles: publication.listAccountProfiles,
      assertExecutableAccountProfile:
        publication.assertExecutableAccountProfile,
      reservePublicationTarget: publication.reservePublicationTarget,
      commitRemoteOutcome: publication.commitRemoteOutcome,
      listActionableRecovery: recovery.listActionableRecovery,
      markRecoveryUncertain: recovery.markRecoveryUncertain,
      createSubmissionBatch: submissionPreparation.createSubmissionBatch,
      queueSubmissionBatch: submissionPreparation.queueSubmissionBatch,
      discardPreparedSubmissionBatch:
        submissionPreparation.discardPreparedSubmissionBatch,
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
      claimPostProcessing: recovery.claimPostProcessing,
      completePostProcessing: recovery.completePostProcessing,
      retryPostProcessing: recovery.retryPostProcessing,
      listPostProcessingAttention: recovery.listPostProcessingAttention,
      listPublicationAttention: recovery.listPublicationAttention,
      listPublicationRecords: publication.listPublicationRecords,
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
      recordManualReconciliation: reconciliation.recordManualReconciliation,
      listManualReconciliations: reconciliation.listManualReconciliations,
      listArticleLifecycleFacts: facts.listArticleLifecycleFacts,
      deriveAttentionInput: recovery.listActionableRecovery,
      verify: maintenance.verify,
      backup: maintenance.backup,
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
