const {
  createRegularQueueRuntime,
} = require("./operational-store-regular-queue-runtime");
const {
  createQueueAdmissionTransaction,
} = require("./operational-store-queue-admission-transaction");

function createOperationalStoreQueueAggregate(context) {
  const runtime = createRegularQueueRuntime(context);
  const admission = createQueueAdmissionTransaction(context);
  return Object.freeze({
    createSubmissionQueueGroup: runtime.createSubmissionQueueGroup,
    setSubmissionQueueGroupPause: runtime.setSubmissionQueueGroupPause,
    listSubmissionQueueGroups: runtime.listSubmissionQueueGroups,
    enqueueSubmissionQueueItem: runtime.enqueueSubmissionQueueItem,
    listSubmissionQueueItems: runtime.listSubmissionQueueItems,
    listRegularQueueGroupSnapshots: runtime.listRegularQueueGroupSnapshots,
    setRegularQueueGroupRunIntent: runtime.setRegularQueueGroupRunIntent,
    setRegularQueueGroupImageCount: runtime.setRegularQueueGroupImageCount,
    setRegularQueueGroupSubmissionInterval:
      runtime.setRegularQueueGroupSubmissionInterval,
    startAllRegularQueueGroups: runtime.startAllRegularQueueGroups,
    pauseAllRegularQueueGroups: runtime.pauseAllRegularQueueGroups,
    pauseRegularQueueGroupsOnStartup: runtime.pauseRegularQueueGroupsOnStartup,
    claimRegularQueueGroupHead: runtime.claimRegularQueueGroupHead,
    renewRegularQueueGroupClaim: runtime.renewRegularQueueGroupClaim,
    beginRegularRemoteSubmission: runtime.beginRegularRemoteSubmission,
    admitRegularQueueItem: admission.admitRegularQueueItem,
    removePendingQueueItem: admission.removePendingQueueItem,
    admitPaidBatch: admission.admitPaidBatch,
    createPaidSubmissionBatch: admission.createPaidSubmissionBatch,
    getPaidSubmissionBatch: admission.getPaidSubmissionBatch,
    listPaidSubmissionBatches: admission.listPaidSubmissionBatches,
    setPaidSubmissionBatchPause: admission.setPaidSubmissionBatchPause,
  });
}

module.exports = { createOperationalStoreQueueAggregate };
