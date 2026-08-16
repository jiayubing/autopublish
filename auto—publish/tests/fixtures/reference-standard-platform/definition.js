"use strict";

const PLATFORM_ID = "reference-standard-platform";

function createReferenceStandardPlatformDefinition(options) {
  const value = options || {};
  return Object.freeze({
    schemaVersion: 1,
    id: PLATFORM_ID,
    displayName: "合成标准平台",
    publicationTargetKind: "platform",
    scanDir: PLATFORM_ID,
    capabilities: Object.freeze({
      regularSubmission: true,
      legacyQueueImport: false,
      loginSession: true,
      accountInspection: true,
      imagePublishing: value.imagePublishing === true,
    }),
    contributions: Object.freeze({
      settings: false,
      clientProfile: false,
      runtimeArtifacts: false,
    }),
    externalHosts: Object.freeze([]),
  });
}

module.exports = Object.freeze({
  PLATFORM_ID,
  createReferenceStandardPlatformDefinition,
});
