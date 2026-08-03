const { SCHEMA_VERSION } = require("./internal/operational-store-schema");
const {
  openOperationalStoreRuntime,
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
  createRecoveryAggregate,
} = require("./internal/operational-store-recovery-aggregate");
const {
  createOrderAggregate,
} = require("./internal/operational-store-order-aggregate");
const {
  createMaintenanceAggregate,
  verifyOperationalDatabase,
} = require("./internal/operational-store-maintenance");

function createOperationalStore(options) {
  const runtime = openOperationalStoreRuntime(options);
  const context = createOperationalStoreContext(runtime, options);
  try {
    const publication = createPublicationAggregate(context);
    const submission = createSubmissionAggregate(context);
    const recovery = createRecoveryAggregate(context);
    const order = createOrderAggregate(context);
    const maintenance = createMaintenanceAggregate(context);
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
      createSubmissionBatch: submission.createSubmissionBatch,
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
  verifyOperationalDatabase,
};
