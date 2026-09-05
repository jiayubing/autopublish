"use strict";

const { loadPlatforms } = require("../../src/core/platforms");

function queueTarget(entry, allowLegacyCompatibility) {
  return {
    id: entry.id,
    displayName: entry.displayName,
    scanDir: entry.scanDir,
    contentQueueImport:
      entry.legacyQueueImport === true || allowLegacyCompatibility === true,
    publicationTarget: { kind: entry.publicationTargetKind },
    imagePublishingCapability: Object.freeze({ supported: entry.imagePublishing === true }),
  };
}

function createSubmissionTargetCatalog(options) {
  const value = options || {};
  const configured = Array.isArray(value.directoryEntries)
    ? value.directoryEntries
    : null;
  const allowLegacyCompatibility = value.allowLegacyCompatibility === true;

  function all() {
    return (
      configured ||
      loadPlatforms()
        .filter((platform) => Boolean(platform.regularSubmission))
        .map((platform) =>
          Object.assign({}, platform.submissionDirectoryEntry, {
            legacyQueueImport: Boolean(platform.legacyQueue),
          }),
        )
    ).slice();
  }

  function queueTargets() {
    return all()
      .filter(
        (platform) =>
          platform.publicationTargetKind === "platform",
      )
      .map((entry) => queueTarget(entry, allowLegacyCompatibility));
  }

  function find(id) {
    return all().find((platform) => platform && platform.id === id) || null;
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
