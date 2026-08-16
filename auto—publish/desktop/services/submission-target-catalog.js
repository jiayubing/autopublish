"use strict";

const { loadPlatforms } = require("../../src/core/platforms");

function queueTarget(entry) {
  return {
    id: entry.id,
    displayName: entry.displayName,
    scanDir: entry.scanDir,
    contentQueueImport: true,
    publicationTarget: { kind: entry.publicationTargetKind },
    imagePublishingCapability: Object.freeze({ supported: entry.imagePublishing === true }),
  };
}

function createSubmissionTargetCatalog(options) {
  const configured =
    options && Array.isArray(options.directoryEntries)
      ? options.directoryEntries
      : null;

  function all() {
    return (
      configured ||
      loadPlatforms()
        .filter((platform) => Boolean(platform.regularSubmission))
        .map((platform) => platform.submissionDirectoryEntry)
    ).slice();
  }

  function queueTargets() {
    return all()
      .filter(
        (platform) =>
          platform.publicationTargetKind === "platform",
      )
      .map(queueTarget);
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
