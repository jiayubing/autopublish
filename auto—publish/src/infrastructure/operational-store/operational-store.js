const { SCHEMA_VERSION } = require("./internal/operational-store-schema");
const {
  databasePath,
  openOperationalStoreRuntime,
  dryRunOperationalStoreMigration,
} = require("./internal/operational-store-runtime");
const { fail } = require("./internal/operational-store-utils");
const {
  acquireMigrationOwner,
  releaseMigrationOwner,
} = require("./internal/operational-store-owner-lease");
const {
  inspectOperationalStoreMigrationJournals,
} = require("./internal/operational-store-migration-journal-inspector");
const storeContext = require("./internal/operational-store-context");
const publications = require("./internal/operational-store-publication-aggregate");
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
  createPaidExecutionAggregate,
} = require("./internal/operational-store-paid-execution-aggregate");
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
const successes = require("./internal/operational-store-publication-success");
const {
  createOperationalStorePublicationArchiveQuery,
} = require("./internal/operational-store-publication-archive-query");
const regularOutcomes = require("./internal/operational-store-regular-outcome-aggregate");
const {
  createOrderCancellationAggregate,
} = require("./internal/operational-store-order-cancellation-aggregate");
const {
  createOperationalStoreMigrationImport,
} = require("./internal/operational-store-migration-import");
const { reportDiagnostic } = require("../../diagnostics/diagnostic-producer");

function closeAfterFailure(context, error, operation) {
  try {
    context.close();
  } catch (cleanupError) {
    if (error && !error.cleanupCode)
      error.cleanupCode = cleanupError.code || "OPERATIONAL_STORE_CLOSE_FAILED";
    reportDiagnostic({
      code: "OPERATIONAL_STORE_CLOSE_FAILED",
      module: "operational-store",
      category: "storage",
      metadata: { operation, phase: "cleanup" },
    });
  }
}

function createOperationalStoreMigrationFacade(options) {
  const runtime = openOperationalStoreRuntime(options);
  const context = storeContext.createOperationalStoreContext(runtime, options);
  try {
    const migration = createOperationalStoreMigrationImport(context);
    return Object.freeze({
      databasePath: runtime.filename,
      bootstrapMigrationJournal: migration.bootstrapMigrationJournal,
      readMigrationJournal: migration.readMigrationJournal,
      persistMigrationJournalMetadata:
        migration.persistMigrationJournalMetadata,
      importLifecycleFacts: migration.importLifecycleFacts,
      listImportedLifecycleFacts: migration.listImportedLifecycleFacts,
      close: context.close,
    });
  } catch (error) {
    closeAfterFailure(context, error, "migration-facade-create");
    throw error;
  }
}

function acquireOperationalStoreMigrationLease(options) {
  const value = options || {};
  const filename = databasePath(value.workspaceRoot, null, false);
  const owner = acquireMigrationOwner(
    filename,
    fail,
    verifyOperationalDatabase,
  );
  return Object.freeze({ filename, owner });
}

function releaseOperationalStoreMigrationLease(lease) {
  if (!lease || typeof lease.filename !== "string" || !lease.owner)
    throw fail("OPERATIONAL_MIGRATION_LEASE_INVALID");
  releaseMigrationOwner(lease.filename, lease.owner);
}

function createOperationalStore(options) {
  const runtime = openOperationalStoreRuntime(options);
  const context = storeContext.createOperationalStoreContext(runtime, options);
  try {
    const activeTarget = createOperationalStoreActiveTargetAggregate(context);
    const pub = publications.createPublicationAggregate(context, activeTarget);
    const submission = createSubmissionAggregate(context);
    const prep = createSubmissionPreparationAggregate(context);
    const recover = recovery.createRecoveryAggregate(context, activeTarget);
    const order = orders.createOrderAggregate(context, activeTarget);
    const queue = createOperationalStoreQueueAggregate(context);
    const paidExecution = createPaidExecutionAggregate(context);
    const publicationSuccess =
      successes.createPublicationSuccessPrimitive(context);
    const publishedArchiveQueries =
      createOperationalStorePublicationArchiveQuery(
        context,
        publicationSuccess,
      );
    const orderObservation = orders.createOrderObservationAggregate(
      context,
      activeTarget,
      publicationSuccess,
    );
    const orderCancellation = createOrderCancellationAggregate(
      context,
      orderObservation,
    );
    const regularOutcome = regularOutcomes.createRegularOutcomeAggregate(
      context,
      publicationSuccess,
    );
    const reconcile = createOperationalStoreReconciliationAggregate(context);
    const facts = createOperationalStoreFactReader(context);
    const maintain = createMaintenanceAggregate(context);
    exposeOperationalStoreTransitionPorts(options, {
      facts,
      publication: pub,
      recovery: recover,
      queue,
      order,
      paidExecution,
      regularOutcome,
      orderObservation,
      orderCancellation,
      publishedArchiveQueries,
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
      createSubmissionQueueGroup: queue.createSubmissionQueueGroup,
      setSubmissionQueueGroupPause: queue.setSubmissionQueueGroupPause,
      listSubmissionQueueGroups: queue.listSubmissionQueueGroups,
      enqueueSubmissionQueueItem: queue.enqueueSubmissionQueueItem,
      listSubmissionQueueItems: queue.listSubmissionQueueItems,
      createPaidSubmissionBatch: queue.createPaidSubmissionBatch,
      getPaidSubmissionBatch: queue.getPaidSubmissionBatch,
      listPaidSubmissionBatches: queue.listPaidSubmissionBatches,
      setPaidSubmissionBatchPause: queue.setPaidSubmissionBatchPause,
      beginOrderCreationRemoteCall: paidExecution.beginOrderCreationRemoteCall,
      claimPaidSubmissionBatchItem: paidExecution.claimPaidSubmissionBatchItem,
      listPaidSubmissionBatchSnapshots:
        paidExecution.listPaidSubmissionBatchSnapshots,
      pauseAllPaidSubmissionBatches:
        paidExecution.pauseAllPaidSubmissionBatches,
      pausePaidSubmissionBatchesOnStartup:
        paidExecution.pausePaidSubmissionBatchesOnStartup,
      releasePaidOrderCreationClaim:
        paidExecution.releasePaidOrderCreationClaim,
      renewPaidOrderCreationClaim: paidExecution.renewPaidOrderCreationClaim,
      setPaidSubmissionBatchRunIntent:
        paidExecution.setPaidSubmissionBatchRunIntent,
      startAllPaidSubmissionBatches:
        paidExecution.startAllPaidSubmissionBatches,
      recordPaidOrderCreationArticleRejection:
        order.recordPaidOrderCreationArticleRejection,
      recordPaidOrderCreationSystemRejection:
        order.recordPaidOrderCreationSystemRejection,
      recordPaidOrderCreationSuccess: order.recordPaidOrderCreationSuccess,
      recordPaidOrderCreationUncertain: order.recordPaidOrderCreationUncertain,
      recordManualReconciliation: reconcile.recordManualReconciliation,
      listManualReconciliations: reconcile.listManualReconciliations,
      listArticleLifecycleFacts: facts.listArticleLifecycleFacts,
      deriveAttentionInput: recover.listActionableRecovery,
      verify: maintain.verify,
      backup: maintain.backup,
      close: context.close,
    });
  } catch (error) {
    closeAfterFailure(context, error, "store-create");
    throw error;
  }
}
module.exports = {
  acquireOperationalStoreMigrationLease,
  SCHEMA_VERSION,
  createOperationalStore,
  createOperationalStoreMigrationFacade,
  inspectOperationalStoreMigrationJournals,
  releaseOperationalStoreMigrationLease,
  dryRunOperationalStoreMigration,
  verifyOperationalDatabase,
};
