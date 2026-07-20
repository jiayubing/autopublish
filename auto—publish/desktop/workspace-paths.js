const fs = require("node:fs");
const path = require("node:path");
const { createPortableContentPaths, createStoragePaths, validateStoragePaths } = require("./storage-paths");

const CONTENT_DIRECTORY_KEYS = Object.freeze([
  "clients", "generated", "templates", "autopublish", "input", "data", "research",
  "generationBatches", "queue", "submissionRecords", "publications", "published", "failed",
  "mediaInput", "liejuInput", "toutiaoInput", "hepanInput"
]);

function createWorkspacePaths(root, storage) {
  const content = createPortableContentPaths(root);
  if (!storage) return content;
  validateStoragePaths(storage);
  if (path.resolve(storage.contentLibrary) !== content.root) {
    throw new Error("storage contentLibrary must match workspace root");
  }
  return Object.assign({}, storage, content);
}

function ensureWorkspaceDirectories(paths) {
  const values = paths || {};
  const directories = CONTENT_DIRECTORY_KEYS.map(function(key) { return values[key]; }).filter(Boolean);
  Array.from(new Set(directories.map(function(value) { return path.resolve(value); }))).forEach(function(directory) {
    fs.mkdirSync(directory, { recursive: true });
  });
  return paths;
}

function createWorkspaceStoragePaths(input) {
  return createStoragePaths(input);
}

module.exports = {
  createWorkspacePaths,
  ensureWorkspaceDirectories,
  createWorkspaceStoragePaths
};
