const identities = require("./identities");
const target = require("./publication-target");
const publisher = require("./publisher-contract");
const error = require("./safe-operational-error");
const dto = require("./dto");
const regularPublication = require("./regular-publication-contract");
const publicationEvidence = require("./publication-evidence-contract");
const publicationFailureReadModel = require("./publication-failure-read-model");
const paidMediaOrder = require("./paid-media-order-contract");
const orderObservation = require("./order-observation-contract");
const articleLifecycleTerminal = require("./article-lifecycle-terminal-contract");
const migrationImport = require("./migration-import-contract");
module.exports = Object.freeze({
  ...identities,
  ...target,
  ...publisher,
  parseSafeOperationalError: error.parseSafeOperationalError,
  ...dto,
  ...regularPublication,
  ...publicationEvidence,
  ...publicationFailureReadModel,
  ...paidMediaOrder,
  ...orderObservation,
  ...articleLifecycleTerminal,
  ...migrationImport,
});
