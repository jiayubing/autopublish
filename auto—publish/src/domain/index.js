const identities = require("./identities");
const target = require("./publication-target");
const publisher = require("./publisher-contract");
const error = require("./safe-operational-error");
const dto = require("./dto");
const regularPublication = require("./regular-publication-contract");
module.exports = Object.freeze({
  ...identities,
  ...target,
  ...publisher,
  parseSafeOperationalError: error.parseSafeOperationalError,
  ...dto,
  ...regularPublication,
});
