const fs = require("fs");
const path = require("path");

const { getContentWorkspace } = require("../core/files");

function storeError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function assertPathSegment(value, label) {
  if (typeof value !== "string" || !value || value === "." || value === ".." ||
      value.includes("/") || value.includes("\\") || path.isAbsolute(value) || path.win32.isAbsolute(value)) {
    throw storeError("RESEARCH_INVALID_ID", "Invalid " + label);
  }
}

function normalizeResearch(clientId, research) {
  if (!research || typeof research !== "object") {
    throw storeError("RESEARCH_INVALID", "Research record is invalid");
  }
  if (typeof research.answerText === "string" && research.answerText.trim()) {
    return {
      id: research.id,
      clientId: clientId,
      question: research.question,
      answerText: research.answerText,
      references: normalizeReferences(research.references),
      createdAt: research.createdAt,
      isAnswerComplete: true
    };
  }
  throw storeError("RESEARCH_EMPTY_ANSWER", "Research answer is empty");
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

function readRecord(filename) {
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
  return Object.assign({}, record, {
    references: normalizeReferences(record.references),
    isAnswerComplete: typeof record.answerText === "string" && Boolean(record.answerText.trim())
  });
}

function createResearchStore(workspaceRoot) {
  const workspace = getContentWorkspace(workspaceRoot);

  function recordPath(clientId, queryId) {
    assertPathSegment(clientId, "client id");
    assertPathSegment(queryId, "query id");
    return path.join(workspace.research, clientId, queryId + ".json");
  }

  function listResearch(clientId) {
    assertPathSegment(clientId, "client id");
    const directory = path.join(workspace.research, clientId);
    if (!fs.existsSync(directory)) return [];
    return fs.readdirSync(directory, { withFileTypes: true })
      .filter(function(entry) { return entry.isFile() && path.extname(entry.name).toLowerCase() === ".json"; })
      .sort(function(a, b) { return a.name.localeCompare(b.name); })
      .map(function(entry) { return readRecord(path.join(directory, entry.name)); });
  }

  function getResearch(clientId, queryId) {
    const filename = recordPath(clientId, queryId);
    if (!fs.existsSync(filename)) throw storeError("RESEARCH_NOT_FOUND", "Research was not found");
    return readRecord(filename);
  }

  function saveResearch(clientId, research) {
    assertPathSegment(clientId, "client id");
    assertPathSegment(research && research.id, "query id");
    const record = normalizeResearch(clientId, research);
    const directory = path.dirname(recordPath(clientId, record.id));
    fs.mkdirSync(directory, { recursive: true });
    const filename = recordPath(clientId, record.id);
    const temporary = filename + ".tmp-" + process.pid + "-" + Date.now();
    try {
      fs.writeFileSync(temporary, JSON.stringify(record, null, 2) + "\n", "utf8");
      const backup = filename + ".bak-" + process.pid + "-" + Date.now();
      let movedExisting = false;
      try {
        try {
          fs.renameSync(filename, backup);
          movedExisting = true;
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

  return { listResearch, getResearch, saveResearch };
}

module.exports = { createResearchStore };
