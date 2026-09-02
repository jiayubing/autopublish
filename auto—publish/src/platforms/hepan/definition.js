"use strict";
module.exports = Object.freeze({
  schemaVersion: 1,
  id: "hepan",
  displayName: "蓝色河畔",
  publicationTargetKind: "platform",
  scanDir: "hepan",
  capabilities: Object.freeze({ regularSubmission: true, legacyQueueImport: false, loginSession: false, accountInspection: true, imagePublishing: false }),
  contributions: Object.freeze({ settings: true, clientProfile: false, runtimeArtifacts: false }),
  externalHosts: Object.freeze(["www.hepan.com"]),
});
