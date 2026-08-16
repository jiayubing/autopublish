"use strict";
module.exports = Object.freeze({
  schemaVersion: 1,
  id: "lieju",
  displayName: "列举网",
  publicationTargetKind: "platform",
  scanDir: "lieju",
  capabilities: Object.freeze({ regularSubmission: true, legacyQueueImport: false, loginSession: true, accountInspection: true, imagePublishing: true }),
  contributions: Object.freeze({ settings: false, clientProfile: true, runtimeArtifacts: false }),
  externalHosts: Object.freeze(["www.lieju.com"]),
});
