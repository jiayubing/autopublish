const { dtoError, exact } = require("./safe-operational-error");
function parseEnvelope(input) {
  exact(input, ["version", "command"]);
  if (
    input.version !== 1 ||
    !input.command ||
    typeof input.command !== "object" ||
    Array.isArray(input.command)
  )
    throw dtoError("DTO_VERSION_INVALID");
  return Object.freeze({
    version: 1,
    command: Object.freeze({ ...input.command }),
  });
}
module.exports = {
  parseIpcPublishDto: parseEnvelope,
  parseWorkerPublishDto: parseEnvelope,
};
