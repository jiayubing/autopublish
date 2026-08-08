"use strict";

const path = require("node:path");

const {
  createPlatformQueueReader,
  readSubmissionMetadata,
  resolvePlatformSubmissionFile,
  taskKey,
} = require("./platform-workbench/queue-reader");
const {
  createPlatformCommandPreparer,
} = require("./platform-workbench/command-preparer");

function createPlatformWorkbenchService(options) {
  const value = options || {};
  const rootDir = value.rootDir || path.resolve(__dirname, "..", "..");
  const inputRoot =
    value.paths && typeof value.paths.input === "string"
      ? path.resolve(value.paths.input)
      : path.join(rootDir, "input");
  const platforms = Array.isArray(value.platforms) ? value.platforms : [];
  const adapters = value.adapters || {};

  const reader = createPlatformQueueReader({
    inputRoot,
    platforms,
    contentStore: value.contentStore,
  });
  const preparer = createPlatformCommandPreparer({
    platforms,
    adapters,
    reader,
    contentStore: value.contentStore,
  });

  return Object.freeze({
    scanQueue: reader.scanQueue,
    preparePublicationCommand: preparer.preparePublicationCommand,
    prepareMediaPublicationCommands: preparer.prepareMediaPublicationCommands,
    taskKey: reader.taskKey,
    resolveSubmissionFile: reader.resolveSubmissionFile,
    readSubmissionMetadata: reader.readSubmissionMetadata,
  });
}

module.exports = {
  createPlatformWorkbenchService,
  readSubmissionMetadata,
  resolvePlatformSubmissionFile,
  taskKey,
};
