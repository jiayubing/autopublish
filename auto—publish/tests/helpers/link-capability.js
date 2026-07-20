const { probeLinkCapability } = require("../../scripts/verify-link-capability");

function skipUnavailable(testContext) {
  const capability = probeLinkCapability();
  if (capability.supported) return true;
  testContext.skip(
    "symbolic-link capability unavailable: enable Windows Developer Mode or run with symlink permission",
  );
  return false;
}

module.exports = { skipUnavailable, probeLinkCapability };
