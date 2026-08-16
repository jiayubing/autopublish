const PATH_CHARACTERS = /[<>:"/\\|?*\x00-\x1f]/;
const { loadEnabledPlatformDefinitions } = require("../core/platforms");

const DECLARED_PLATFORMS = Object.freeze(
  Object.fromEntries(
    loadEnabledPlatformDefinitions().map(function (definition) {
      return [
        definition.id,
        Object.freeze({ kind: definition.publicationTargetKind }),
      ];
    }),
  ),
);

function targetError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function validIdentifier(value) {
  if (typeof value !== "string") return false;
  const normalized = value.trim();
  return !!normalized && normalized !== "." && normalized !== ".." && !PATH_CHARACTERS.test(normalized);
}

function resolvePublicationTarget(input) {
  const values = input || {};
  const hasPlatform = Object.prototype.hasOwnProperty.call(values, "platformId");
  const hasResource = Object.prototype.hasOwnProperty.call(values, "mediaResourceId");
  if (!hasPlatform && !hasResource) {
    throw targetError("PUBLICATION_TARGET_REQUIRED", "A publication target is required");
  }
  if (hasPlatform && hasResource) {
    throw targetError("PUBLICATION_TARGET_AMBIGUOUS", "Publication target must be a platform or media resource");
  }

  if (hasPlatform) {
    const platformId = typeof values.platformId === "string" ? values.platformId.trim() : "";
    if (!platformId) {
      throw targetError("PUBLICATION_TARGET_REQUIRED", "A publication target is required");
    }
    const declaration = DECLARED_PLATFORMS[platformId];
    if (!declaration) {
      throw targetError("PUBLICATION_PLATFORM_UNDECLARED", "Publication platform is not declared");
    }
    if (declaration.kind !== "platform") {
      throw targetError("PUBLICATION_PLATFORM_RESOURCE_REQUIRED", "This platform requires a media resource");
    }
    return {
      kind: "platform",
      platformId: platformId,
      mediaResourceId: null,
      resourceId: null,
      targetKey: "platform:" + platformId
    };
  }

  const mediaResourceId = typeof values.mediaResourceId === "string" ? values.mediaResourceId.trim() : "";
  if (!validIdentifier(mediaResourceId)) {
    throw targetError("PUBLICATION_MEDIA_RESOURCE_ID_INVALID", "Media resource id is invalid");
  }
  if (!DECLARED_PLATFORMS.media || DECLARED_PLATFORMS.media.kind !== "resource") {
    throw targetError("PUBLICATION_PLATFORM_UNDECLARED", "Publication platform is not declared");
  }
  return {
    kind: "resource",
    platformId: "media",
    mediaResourceId: mediaResourceId,
    resourceId: mediaResourceId,
    targetKey: "media-resource:" + mediaResourceId
  };
}

module.exports = {
  DECLARED_PLATFORMS,
  resolvePublicationTarget
};
