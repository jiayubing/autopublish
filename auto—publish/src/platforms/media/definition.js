"use strict";
module.exports = Object.freeze({
  schemaVersion: 1,
  id: "media",
  displayName: "付费媒体",
  publicationTargetKind: "resource",
  scanDir: "media",
  capabilities: Object.freeze({"regularSubmission":false,"legacyQueueImport":false,"loginSession":false,"accountInspection":false,"imagePublishing":false}),
  contributions: Object.freeze({"settings":true,"clientProfile":false,"runtimeArtifacts":false,"remoteReview":false}),
  externalHosts: Object.freeze([]),
});
