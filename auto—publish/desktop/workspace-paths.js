const fs = require("node:fs");
const path = require("node:path");
const { createStoragePaths, validateStoragePaths } = require("./storage-paths");

const CONTENT_DIRECTORY_KEYS = Object.freeze([
  "clients", "generated", "templates", "autopublish", "input", "data", "research",
  "generationBatches", "queue", "submissionRecords", "published", "failed",
  "mediaInput", "liejuInput", "toutiaoInput", "hepanInput"
]);

function createPortableContentPaths(contentLibrary) {
  const root = path.resolve(contentLibrary);
  const autopublish = path.join(root, ".autopublish");
  return {
    root: root,
    contentLibrary: root,
    clients: path.join(root, "clients"),
    generated: path.join(root, "generated"),
    templates: path.join(root, "templates"),
    autopublish: autopublish,
    privateContent: autopublish,
    input: path.join(autopublish, "input"),
    mediaInput: path.join(autopublish, "input", "media"),
    liejuInput: path.join(autopublish, "input", "lieju"),
    toutiaoInput: path.join(autopublish, "input", "toutiao"),
    hepanInput: path.join(autopublish, "input", "hepan"),
    data: path.join(autopublish, "data"),
    research: path.join(autopublish, "research"),
    generationBatches: path.join(autopublish, "batches"),
    queue: path.join(autopublish, "queue"),
    submissionRecords: path.join(autopublish, "submission-records"),
    submissions: path.join(autopublish, "submission-records"),
    published: path.join(autopublish, "published"),
    failed: path.join(autopublish, "failed")
  };
}

function createWorkspacePaths(root, storage) {
  const content = createPortableContentPaths(root);
  if (!storage) {
    return Object.assign(content, {
      legacyInput: path.join(content.root, "input"),
      legacyData: path.join(content.root, "data"),
      legacyLogs: path.join(content.root, "logs"),
      legacyPublished: path.join(content.root, "published"),
      legacyFailed: path.join(content.root, "failed"),
      legacyTmp: path.join(content.root, "tmp"),
      legacyWork: path.join(content.root, "work"),
      legacyConfig: path.join(content.root, "config"),
      legacyBrowser: path.join(content.root, "browser"),
      legacyMedia: path.join(content.root, "input", "media"),
      legacyBrowserDoubao: path.join(content.root, "browser", "doubao"),
      legacyLogsDiagnostics: path.join(content.root, "logs", "doubao-diagnostics"),
      legacyResearch: path.join(content.root, "research")
    });
  }
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
