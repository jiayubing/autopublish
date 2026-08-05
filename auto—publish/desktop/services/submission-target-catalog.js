"use strict";

const { loadPlatforms } = require("../../src/core/platforms");

function queueTarget(platform) {
  return {
    id: platform.id,
    displayName: platform.displayName,
    scanDir: platform.scanDir || platform.id,
    contentQueueImport: platform.contentQueueImport === true,
    publicationTarget: platform.publicationTarget || { kind: "platform" },
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
          !platform.publicationTarget ||
          platform.publicationTarget.kind === "platform",
      )
      .map(queueTarget);
  }

  function find(id) {
    return all().find((platform) => platform && platform.id === id) || null;
  }

  function list() {
    return queueTargets().map((platform) => ({
      id: platform.id,
      displayName: platform.displayName || platform.id,
      scanDir: platform.scanDir || platform.id,
      contentQueueImport: platform.contentQueueImport === true,
    }));
  }

  return Object.freeze({ all, find, queueTargets, list });
}

module.exports = { createSubmissionTargetCatalog };
