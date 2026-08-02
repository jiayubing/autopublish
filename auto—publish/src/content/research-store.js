const fs = require("fs");
const path = require("path");

const { getContentWorkspace } = require("../core/files");
const { createContentPathPolicy } = require("./content-path-policy");

const COLLECTION_METHODS = new Set(["automatic", "manual", "legacy"]);

function storeError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function assertPathSegment(value, label) {
  const deviceName = typeof value === "string" && value.split(".")[0].replace(/[ .]+$/g, "").toUpperCase();
  if (typeof value !== "string" || !value || !value.trim() || value === "." || value === ".." ||
      value.endsWith(" ") || value.endsWith(".") || value.includes("/") || value.includes("\\") ||
      /[<>:"|?*\u0000-\u001F]/.test(value) || /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/.test(deviceName) ||
      path.isAbsolute(value) || path.win32.isAbsolute(value)) {
    throw storeError("RESEARCH_INVALID_ID", "Invalid " + label);
  }
}

function normalizeResearch(clientId, research) {
  if (!research || typeof research !== "object") {
    throw storeError("RESEARCH_INVALID", "Research record is invalid");
  }
  const collectionMethod = research.collectionMethod === undefined ? "legacy" : research.collectionMethod;
  if (!COLLECTION_METHODS.has(collectionMethod)) {
    throw storeError("RESEARCH_INVALID_METHOD", "Research collection method is invalid");
  }
  if (typeof research.answerText !== "string" || !research.answerText.trim()) {
    throw storeError("RESEARCH_EMPTY_ANSWER", "Research answer is empty");
  }
  const answerLength = research.answerText.trim().length;
  const minimumLength = collectionMethod === "legacy" ? 1 : 10;
  if (answerLength < minimumLength || answerLength > 200000) {
    throw storeError("RESEARCH_INVALID_ANSWER", "Research answer length is invalid");
  }
  const collectedAt = collectionMethod === "legacy" && research.collectedAt === undefined
    ? research.createdAt : research.collectedAt;
  return {
    id: research.id,
    clientId: clientId,
    question: research.question,
    answerText: research.answerText,
    references: normalizeReferences(research.references),
    collectionMethod: collectionMethod,
    collectedAt: collectedAt,
    updatedAt: collectionMethod === "legacy" && research.updatedAt === undefined ? collectedAt : research.updatedAt,
    isAnswerComplete: true
  };
}

function normalizeReferences(references) {
  if (!Array.isArray(references)) {
    throw storeError("RESEARCH_INVALID_REFERENCE", "Research references must be an array");
  }
  return references.map(function(reference) {
    if (!reference || typeof reference.title !== "string" || !reference.title.trim() ||
        typeof reference.url !== "string" || !reference.url.trim()) {
      throw storeError("RESEARCH_INVALID_REFERENCE", "Research reference requires title and url");
    }
    let url;
    try {
      url = new URL(reference.url);
    } catch (error) {
      throw storeError("RESEARCH_INVALID_REFERENCE", "Research reference URL is invalid");
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw storeError("RESEARCH_INVALID_REFERENCE", "Research reference URL protocol is invalid");
    }
    return {
      title: reference && reference.title,
      url: reference && reference.url,
      snippet: reference && reference.snippet
    };
  });
}

function readRecord(filename, clientId) {
  let record;
  try {
    record = JSON.parse(fs.readFileSync(filename, "utf8"));
  } catch (error) {
    const invalid = storeError("RESEARCH_INVALID_JSON", "Research JSON is invalid");
    invalid.cause = error;
    throw invalid;
  }
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    throw storeError("RESEARCH_INVALID_JSON", "Research JSON is invalid");
  }
  return normalizeResearch(clientId, record);
}

function pathExists(filename) {
  try {
    fs.lstatSync(filename);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

function assertRegularFile(filename) {
  let stats;
  try {
    stats = fs.lstatSync(filename);
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw storeError("RESEARCH_PATH_OUT_OF_BOUNDS", "Research file is unsafe");
  }
  if (!stats.isFile() || stats.isSymbolicLink()) {
    throw storeError("RESEARCH_PATH_OUT_OF_BOUNDS", "Research file is unsafe");
  }
  return true;
}

function createResearchStore(workspaceRoot, options) {
  const workspace = getContentWorkspace(workspaceRoot, options && options.paths);
  const pathPolicy = createContentPathPolicy(workspaceRoot, {
    paths: options && options.paths,
    error: storeError
  });

  function researchDirectory(create) {
    pathPolicy.assertWorkspaceRoot({ code: "RESEARCH_PATH_OUT_OF_BOUNDS", label: "Workspace root" });
    if (!pathExists(workspace.research)) {
      if (!create) return null;
      fs.mkdirSync(workspace.research, { recursive: true });
    }
    let stats;
    try {
      stats = fs.lstatSync(workspace.research);
    } catch (error) {
      throw storeError("RESEARCH_PATH_OUT_OF_BOUNDS", "Research directory is unsafe");
    }
    if (!stats.isDirectory() || stats.isSymbolicLink()) {
      throw storeError("RESEARCH_PATH_OUT_OF_BOUNDS", "Research directory is unsafe");
    }
    return workspace.research;
  }

  function clientDirectory(clientId, create) {
    assertPathSegment(clientId, "client id");
    const research = researchDirectory(create);
    if (!research) return null;
    const directory = path.resolve(research, clientId);
    const relative = path.relative(research, directory);
    if (relative === ".." || relative.startsWith(".." + path.sep) || path.isAbsolute(relative)) {
      throw storeError("RESEARCH_PATH_OUT_OF_BOUNDS", "Research client directory is unsafe");
    }
    if (!pathExists(directory)) {
      if (!create) return directory;
      fs.mkdirSync(directory, { recursive: true });
    }
    let stats;
    try {
      stats = fs.lstatSync(directory);
    } catch (error) {
      throw storeError("RESEARCH_PATH_OUT_OF_BOUNDS", "Research client directory is unsafe");
    }
    if (!stats.isDirectory() || stats.isSymbolicLink()) {
      throw storeError("RESEARCH_PATH_OUT_OF_BOUNDS", "Research client directory is unsafe");
    }
    return directory;
  }

  function recordPath(clientId, queryId, create) {
    assertPathSegment(queryId, "query id");
    const directory = clientDirectory(clientId, create);
    return path.join(directory || path.join(workspace.research, clientId), queryId + ".json");
  }

  function listResearch(clientId) {
    const directory = clientDirectory(clientId, false);
    if (!directory || !pathExists(directory)) return [];
    return fs.readdirSync(directory, { withFileTypes: true })
      .filter(function(entry) { return entry.isFile() && path.extname(entry.name).toLowerCase() === ".json"; })
      .sort(function(a, b) { return a.name.localeCompare(b.name); })
      .map(function(entry) { return readRecord(path.join(directory, entry.name), clientId); });
  }

  function getResearch(clientId, queryId) {
    const filename = recordPath(clientId, queryId, false);
    if (!pathExists(filename)) throw storeError("RESEARCH_NOT_FOUND", "Research was not found");
    assertRegularFile(filename);
    return readRecord(filename, clientId);
  }

  function deleteResearch(clientId, queryId) {
    const filename = recordPath(clientId, queryId, false);
    if (!pathExists(filename)) return false;
    assertRegularFile(filename);
    fs.unlinkSync(filename);
    return true;
  }

  function saveResearch(clientId, research) {
    assertPathSegment(clientId, "client id");
    assertPathSegment(research && research.id, "query id");
    const record = normalizeResearch(clientId, research);
    const filename = recordPath(clientId, record.id, true);
    const temporary = filename + ".tmp-" + process.pid + "-" + Date.now();
    try {
      fs.writeFileSync(temporary, JSON.stringify(record, null, 2) + "\n", "utf8");
      const backup = filename + ".bak-" + process.pid + "-" + Date.now();
      let movedExisting = false;
      try {
        try {
          if (pathExists(filename)) {
            assertRegularFile(filename);
            fs.renameSync(filename, backup);
            movedExisting = true;
          }
        } catch (error) {
          if (error.code !== "ENOENT") throw error;
        }
        try {
          fs.renameSync(temporary, filename);
        } catch (error) {
          if (movedExisting) fs.renameSync(backup, filename);
          throw error;
        }
        if (movedExisting) fs.unlinkSync(backup);
      } catch (error) {
        if (fs.existsSync(backup) && !fs.existsSync(filename)) fs.renameSync(backup, filename);
        throw error;
      }
    } finally {
      if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
    }
    return record;
  }

  return { listResearch, getResearch, saveResearch, deleteResearch };
}

module.exports = { createResearchStore };
