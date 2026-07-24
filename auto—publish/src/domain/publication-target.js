const { AccountProfileId, MediaResourceId } = require("./identities");

function targetError(code) {
  const error = new Error("Publication target is invalid");
  error.code = code;
  return error;
}
function exact(input, fields) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw targetError("PUBLICATION_TARGET_INVALID");
  for (const key of Object.keys(input))
    if (!fields.includes(key))
      throw targetError("PUBLICATION_TARGET_EXTRA_FIELD");
}
function platformId(value) {
  if (typeof value !== "string" || !/^[a-z][a-z0-9-]{0,63}$/.test(value.trim()))
    throw targetError("PUBLICATION_TARGET_INVALID");
  return value.trim();
}
function parsePublicationTarget(input) {
  if (!input || typeof input !== "object")
    throw targetError("PUBLICATION_TARGET_INVALID");
  if (input.kind === "platform") {
    exact(input, ["kind", "platformId", "accountProfileId"]);
    try {
      return Object.freeze({
        kind: "platform",
        platformId: platformId(input.platformId),
        accountProfileId: AccountProfileId.serialize(
          AccountProfileId.parse(input.accountProfileId),
        ),
      });
    } catch (_) {
      throw targetError("PUBLICATION_TARGET_INVALID");
    }
  }
  if (input.kind === "media") {
    exact(input, ["kind", "mediaResourceId"]);
    try {
      return Object.freeze({
        kind: "media",
        mediaResourceId: MediaResourceId.serialize(
          MediaResourceId.parse(input.mediaResourceId),
        ),
      });
    } catch (_) {
      throw targetError("PUBLICATION_TARGET_INVALID");
    }
  }
  if (input.kind === "legacy-unknown-account") {
    exact(input, ["kind", "platformId", "autoExecutable"]);
    if (input.autoExecutable !== undefined && input.autoExecutable !== false)
      throw targetError("PUBLICATION_TARGET_INVALID");
    return Object.freeze({
      kind: "legacy-unknown-account",
      platformId: platformId(input.platformId),
      autoExecutable: false,
    });
  }
  throw targetError("PUBLICATION_TARGET_INVALID");
}
function publicationTargetKey(target) {
  const value = parsePublicationTarget(target);
  if (value.kind === "platform")
    return `platform:${value.platformId}:account:${value.accountProfileId}`;
  if (value.kind === "media") return `media-resource:${value.mediaResourceId}`;
  return `platform:${value.platformId}:legacy-unknown-account`;
}
module.exports = { parsePublicationTarget, publicationTargetKey };
