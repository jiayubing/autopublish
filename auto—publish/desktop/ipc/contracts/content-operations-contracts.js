const { doubaoContracts } = require("./doubao-contracts");
const { submissionContracts } = require("./submission-contracts");

module.exports = { contentOperationsContracts: Object.freeze([...submissionContracts, ...doubaoContracts]) };
