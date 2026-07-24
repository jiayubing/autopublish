const identities = require("./identities");
const target = require("./publication-target");
const publisher = require("./publisher-contract");
const error = require("./safe-operational-error");
const dto = require("./dto");
module.exports = Object.freeze({
  ...identities,
  ...target,
  ...publisher,
  parseSafeOperationalError: error.parseSafeOperationalError,
  ...dto,
});
