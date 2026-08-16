const { doubaoContracts } = require("./doubao-contracts");
const { submissionMaintenanceContracts } = require("./submission-maintenance-contracts");
const { submissionRegularContracts } = require("./submission-regular-contracts");
const { submissionPaidMediaContracts } = require("./submission-paid-media-contracts");
const { submissionCenterContracts } = require("./submission-center-contracts");

module.exports = {
  contentOperationsContracts: Object.freeze([
    ...submissionMaintenanceContracts,
    ...submissionRegularContracts,
    ...submissionPaidMediaContracts,
    ...submissionCenterContracts,
    ...doubaoContracts,
  ]),
};
