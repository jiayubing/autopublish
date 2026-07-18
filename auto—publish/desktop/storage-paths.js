const fs = require("node:fs");
const path = require("node:path");

const STORAGE_ROOTS = Object.freeze(["installation", "roamingConfig", "localState", "contentLibrary"]);
const CONTENT_MARKER = ".autopublish-workspace.json";

function storagePathError(message) {
  const error = new Error(message);
  error.code = "STORAGE_PATHS_INVALID";
  return error;
}

function absoluteRoot(value, name) {
  if (typeof value !== "string" || value.trim() === "" || !path.isAbsolute(value) || value.includes("\0")) {
    throw storagePathError(name + " must be an absolute path");
  }
  return path.resolve(value);
}

function contains(parent, child) {
  const relative = path.relative(parent, child);
  return relative === "" || (relative !== ".." && !relative.startsWith(".." + path.sep) && !path.isAbsolute(relative));
}

function assertDistinctRoots(roots) {
  for (let i = 0; i < STORAGE_ROOTS.length; i += 1) {
    for (let j = i + 1; j < STORAGE_ROOTS.length; j += 1) {
      const first = roots[STORAGE_ROOTS[i]];
      const second = roots[STORAGE_ROOTS[j]];
      if (contains(first, second) || contains(second, first)) {
        throw storagePathError("storage roots must be distinct and must not overlap");
      }
    }
  }
}

function createStoragePaths(input) {
  const values = input || {};
  const roots = {
    installation: absoluteRoot(values.installation || values.appRoot, "installation"),
    roamingConfig: absoluteRoot(values.roamingConfig || values.userDataPath, "roamingConfig"),
    localState: absoluteRoot(values.localState || values.sessionDataPath, "localState"),
    contentLibrary: absoluteRoot(values.contentLibrary || values.workspaceRoot, "contentLibrary")
  };
  assertDistinctRoots(roots);

  const autopublish = path.join(roots.contentLibrary, ".autopublish");
  const localCache = path.join(roots.localState, "cache");
  const browser = path.join(roots.localState, "browser");
  const paths = Object.assign({}, roots, {
    appRoot: roots.installation,
    userDataPath: roots.roamingConfig,
    sessionDataPath: roots.localState,
    workspaceRoot: roots.contentLibrary,

    marker: path.join(roots.contentLibrary, CONTENT_MARKER),
    clients: path.join(roots.contentLibrary, "clients"),
    generated: path.join(roots.contentLibrary, "generated"),
    templates: path.join(roots.contentLibrary, "templates"),
    autopublish: autopublish,
    privateContent: autopublish,
    input: path.join(autopublish, "input"),
    data: path.join(autopublish, "data"),
    research: path.join(autopublish, "research"),
    generationBatches: path.join(autopublish, "batches"),
    queue: path.join(autopublish, "queue"),
    submissionRecords: path.join(autopublish, "submission-records"),
    publications: path.join(autopublish, "submission-records", "publications"),
    submissions: path.join(autopublish, "submission-records"),
    published: path.join(autopublish, "published"),
    failed: path.join(autopublish, "failed"),

    config: path.join(roots.roamingConfig, "runtime"),
    runtimeConfig: path.join(roots.roamingConfig, "runtime-config.json"),
    aiProviderConfig: path.join(roots.roamingConfig, "ai-provider.json"),

    logs: path.join(roots.localState, "logs"),
    cache: localCache,
    tmp: path.join(roots.localState, "tmp"),
    work: path.join(roots.localState, "work"),
    clientMaterialCache: path.join(localCache, "client-material"),
    browser: browser,
    doubaoBrowser: path.join(browser, "doubao"),
    doubaoDiagnostics: path.join(roots.localState, "logs", "doubao-diagnostics")
  });
  paths.inputRoot = paths.input;
  paths.mediaInput = path.join(paths.input, "media");
  paths.liejuInput = path.join(paths.input, "lieju");
  paths.toutiaoInput = path.join(paths.input, "toutiao");
  paths.hepanInput = path.join(paths.input, "hepan");
  return paths;
}

function validateStoragePaths(paths) {
  if (!paths || typeof paths !== "object") throw storagePathError("storage paths are required");
  const roots = {};
  STORAGE_ROOTS.forEach(function(name) { roots[name] = absoluteRoot(paths[name], name); });
  assertDistinctRoots(roots);
  STORAGE_ROOTS.forEach(function(name) {
    if (path.resolve(paths[name]) !== roots[name]) throw storagePathError(name + " is not normalized");
  });
  return paths;
}

function mkdirSafe(directory) {
  fs.mkdirSync(directory, { recursive: true });
  const stat = fs.lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw storagePathError("content library directory is invalid");
}

function ensureContentLibrary(paths) {
  const storage = validateStoragePaths(paths);
  [storage.contentLibrary, storage.clients, storage.generated, storage.templates, storage.autopublish,
    storage.input, storage.data, storage.research, storage.generationBatches, storage.queue,
    storage.submissionRecords, storage.publications, storage.published, storage.failed].forEach(mkdirSafe);
  if (!fs.existsSync(storage.marker)) {
    fs.writeFileSync(storage.marker, JSON.stringify({ version: 1, createdAt: new Date().toISOString() }) + "\n", { encoding: "utf8", flag: "wx" });
  }
  return storage;
}

module.exports = {
  STORAGE_ROOTS,
  CONTENT_MARKER,
  createStoragePaths,
  validateStoragePaths,
  ensureContentLibrary
};
