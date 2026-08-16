"use strict";

const {
  loadPlatforms,
  imagePublishingCapability,
} = require("../../src/core/platforms");

function queueTarget(platform) {
  const entry = platform.submissionDirectoryEntry;
  return {
    id: entry.id,
    displayName: entry.displayName,
    scanDir: entry.scanDir,
    contentQueueImport: Boolean(platform.regularSubmission),
    publicationTarget: { kind: entry.publicationTargetKind },
    imagePublishingCapability: imagePublishingCapability(platform),
  };
}

function createSubmissionTargetCatalog(options) {
  const configured =
    options && Array.isArray(options.platforms) ? options.platforms : null;

  function all() {
    return (configured || loadPlatforms()).slice();
  }

  function queueTargets() {
    return all()
      .filter(
        (platform) =>
          platform.submissionDirectoryEntry.publicationTargetKind === "platform",
      )
      .map(queueTarget);
  }

  function find(id) {
    return all().find((platform) => platform && platform.definition.id === id) || null;
  }

  function list() {
    return queueTargets().map((platform) => ({
      id: platform.id,
      displayName: platform.displayName,
      scanDir: platform.scanDir,
      contentQueueImport: platform.contentQueueImport,
      imagePublishingCapability: platform.imagePublishingCapability,
    }));
  }

  return Object.freeze({ all, find, queueTargets, list });
}

module.exports = { createSubmissionTargetCatalog };
