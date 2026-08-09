const { doubaoContracts } = require("./doubao-contracts");
const { submissionPlatformContracts } = require("./submission-platform-contracts");
const { submissionBatchContracts } = require("./submission-batch-contracts");
const { submissionMaintenanceContracts } = require("./submission-maintenance-contracts");
const { submissionRegularContracts } = require("./submission-regular-contracts");
const { submissionPaidMediaContracts } = require("./submission-paid-media-contracts");

module.exports = {
  contentOperationsContracts: Object.freeze([
    ...submissionPlatformContracts,
    ...submissionBatchContracts,
    ...submissionMaintenanceContracts,
    ...submissionRegularContracts,
    ...submissionPaidMediaContracts,
    ...doubaoContracts,
  ]),
};
