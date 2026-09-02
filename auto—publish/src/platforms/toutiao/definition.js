"use strict";
module.exports = Object.freeze({
  schemaVersion: 1,
  id: "toutiao",
  displayName: "头条",
  publicationTargetKind: "platform",
  scanDir: "toutiao",
  capabilities: Object.freeze({"regularSubmission":false,"legacyQueueImport":true,"loginSession":true,"accountInspection":true,"imagePublishing":false}),
  contributions: Object.freeze({"settings":false,"clientProfile":false,"runtimeArtifacts":false,"remoteReview":false}),
  externalHosts: Object.freeze(["www.toutiao.com"]),
});
