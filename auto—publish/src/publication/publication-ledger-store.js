const nodeFs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { PUBLICATION_STATUSES } = require("./publication-state");

const PUBLICATION_RECORD_VERSION = 1;
const PUBLICATION_FILE_PATTERN = /^publication-[a-f0-9]{64}\.json$/;
const PATH_CHARACTERS = /[<>:"/\\|?*\x00-\x1f]/;

const RECORD_FIELDS = Object.freeze([
  "version",
  "publicationId",
  "articleKey",
  "clientId",
  "articleId",
  "contentHash",
  "targetKey",
  "platformId",
  "mediaResourceId",
  "displayName",
  "accountFingerprint",
  "titleSnapshot",
  "status",
  "attempts",
  "createdAt",
  "updatedAt"
]);

const ATTEMPT_FIELDS = Object.freeze([
  "attemptId",
  "status",
  "createdAt",
  "updatedAt",
  "startedAt",
  "finishedAt",
  "remoteId",
  "remoteUrl",
  "errorCode",
  "reasonCode"
]);

function storeError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function isAbsoluteDirectory(value) {
  return typeof value === "string" && value.trim() !== "" && path.isAbsolute(value) && !value.includes("\0");
}

function isContained(parent, child) {
  const relative = path.relative(parent, child);
  return relative === "" || (relative !== ".." && !relative.startsWith(".." + path.sep) && !path.isAbsolute(relative));
}

function safeText(value, field, options) {
  const opts = options || {};
  if (value === null && opts.nullable) return null;
  if (typeof value !== "string" || value.length > (opts.maxLength || 2048) || /[\x00-\x1f\x7f]/.test(value)) {
    throw storeError("PUBLICATION_RECORD_FIELD_INVALID", "Publication record field is invalid");
  }
  if (!opts.allowEmpty && value.trim() === "") {
    throw storeError("PUBLICATION_RECORD_FIELD_INVALID", "Publication record field is invalid");
  }
  return value;
}

function safeToken(value, field, options) {
  const opts = options || {};
  const text = safeText(value, field, { maxLength: opts.maxLength || 512, allowEmpty: false });
  if (text === "." || text === ".." || PATH_CHARACTERS.test(text)) {
    throw storeError("PUBLICATION_RECORD_FIELD_INVALID", "Publication record field is invalid");
  }
  return text;
}

function validateHash(value, nullable) {
  if (value === null && nullable) return null;
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) {
    throw storeError("PUBLICATION_RECORD_FIELD_INVALID", "Publication record field is invalid");
  }
  return value;
}

function validateFingerprint(value) {
  if (value === null) return null;
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) {
    throw storeError("PUBLICATION_RECORD_FIELD_INVALID", "Publication record field is invalid");
  }
  return value;
}

function validateOptionalSafeField(value, maxLength) {
  if (value === null) return null;
  return safeText(value, "optional", { maxLength: maxLength || 2048, allowEmpty: false });
}

function validateTimestamp(value) {
  const timestamp = safeText(value, "timestamp", { maxLength: 64, allowEmpty: false });
  if (!Number.isFinite(Date.parse(timestamp))) {
    throw storeError("PUBLICATION_RECORD_FIELD_INVALID", "Publication record field is invalid");
  }
  return timestamp;
}

function validateAttempt(attempt) {
  if (!attempt || typeof attempt !== "object" || Array.isArray(attempt)) {
    throw storeError("PUBLICATION_RECORD_CORRUPT", "Publication record is invalid");
  }
  const keys = Object.keys(attempt).sort();
  const allowed = ATTEMPT_FIELDS.slice().sort();
  if (keys.some((key, index) => key !== allowed[index])) {
    throw storeError("PUBLICATION_RECORD_CORRUPT", "Publication record is invalid");
  }
  safeToken(attempt.attemptId, "attemptId");
  if (PUBLICATION_STATUSES.indexOf(attempt.status) === -1) {
    throw storeError("PUBLICATION_RECORD_CORRUPT", "Publication record is invalid");
  }
  validateTimestamp(attempt.createdAt);
  validateTimestamp(attempt.updatedAt);
  ["startedAt", "finishedAt"].forEach(function(field) {
    if (attempt[field] !== null) validateTimestamp(attempt[field]);
  });
  ["remoteId", "remoteUrl", "errorCode", "reasonCode"].forEach(function(field) {
    validateOptionalSafeField(attempt[field], field === "remoteUrl" ? 2048 : 512);
  });
  return attempt;
}

function validatePublicationRecord(record) {
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    throw storeError("PUBLICATION_RECORD_CORRUPT", "Publication record is invalid");
  }
  const keys = Object.keys(record).sort();
  const allowed = RECORD_FIELDS.slice().sort();
  const legacyAllowed = allowed.filter(function(key) { return key !== "titleSnapshot"; });
  const matchesCurrent = keys.length === allowed.length && keys.every(function(key, index) { return key === allowed[index]; });
  const matchesLegacy = keys.length === legacyAllowed.length && keys.every(function(key, index) { return key === legacyAllowed[index]; });
  if (!matchesCurrent && !matchesLegacy) {
    throw storeError("PUBLICATION_RECORD_CORRUPT", "Publication record is invalid");
  }
  if (record.version !== PUBLICATION_RECORD_VERSION) {
    throw storeError("PUBLICATION_RECORD_VERSION_UNSUPPORTED", "Publication record version is unsupported");
  }
  safeToken(record.publicationId, "publicationId");
  safeText(record.articleKey, "articleKey", { maxLength: 2048 });
  safeToken(record.clientId, "clientId");
  if (record.articleId !== null) safeToken(record.articleId, "articleId");
  validateHash(record.contentHash, true);
  safeText(record.targetKey, "targetKey", { maxLength: 512 });
  if (!/^platform:[^\\/\x00-\x1f]+$/.test(record.targetKey) && !/^media-resource:[^\\/\x00-\x1f]+$/.test(record.targetKey)) {
    throw storeError("PUBLICATION_RECORD_CORRUPT", "Publication record is invalid");
  }
  safeToken(record.platformId, "platformId");
  if (record.mediaResourceId !== null) safeToken(record.mediaResourceId, "mediaResourceId");
  validateOptionalSafeField(record.displayName, 256);
  validateFingerprint(record.accountFingerprint);
  if (record.titleSnapshot !== undefined) validateOptionalSafeField(record.titleSnapshot, 200);
  if (PUBLICATION_STATUSES.indexOf(record.status) === -1) {
    throw storeError("PUBLICATION_RECORD_CORRUPT", "Publication record is invalid");
  }
  if (!Array.isArray(record.attempts) || record.attempts.length === 0) {
    throw storeError("PUBLICATION_RECORD_CORRUPT", "Publication record is invalid");
  }
  const attemptIds = new Set();
  record.attempts.forEach(function(attempt) {
    validateAttempt(attempt);
    if (attemptIds.has(attempt.attemptId)) {
      throw storeError("PUBLICATION_RECORD_CORRUPT", "Publication record is invalid");
    }
    attemptIds.add(attempt.attemptId);
  });
  if (record.attempts[record.attempts.length - 1].status !== record.status) {
    throw storeError("PUBLICATION_RECORD_CORRUPT", "Publication record is invalid");
  }
  validateTimestamp(record.createdAt);
  validateTimestamp(record.updatedAt);
  return record;
}

function aggregateFilename(articleKey, targetKey) {
  const digest = crypto.createHash("sha256").update(articleKey + "\0" + targetKey, "utf8").digest("hex");
  return "publication-" + digest + ".json";
}

function safeDirectory(io, root, directory) {
  if (!isAbsoluteDirectory(root) || !isAbsoluteDirectory(directory)) {
    throw storeError("PUBLICATION_PATHS_INVALID", "Publication storage path is invalid");
  }
  const workspaceRoot = path.resolve(root);
  const target = path.resolve(directory);
  if (!isContained(workspaceRoot, target)) {
    throw storeError("PUBLICATION_PATHS_INVALID", "Publication storage path is invalid");
  }

  const relative = path.relative(workspaceRoot, target);
  const segments = relative ? relative.split(path.sep) : [];
  let current = workspaceRoot;
  for (let index = -1; index < segments.length; index += 1) {
    if (index >= 0) current = path.join(current, segments[index]);
    try {
      const stat = io.lstatSync(current);
      if (stat.isSymbolicLink() || !stat.isDirectory()) {
        throw storeError("PUBLICATION_STORAGE_INVALID", "Publication storage is invalid");
      }
    } catch (error) {
      if (error && error.code === "ENOENT") {
        try {
          io.mkdirSync(current);
          const stat = io.lstatSync(current);
          if (stat.isSymbolicLink() || !stat.isDirectory()) {
            throw storeError("PUBLICATION_STORAGE_INVALID", "Publication storage is invalid");
          }
        } catch (mkdirError) {
          if (mkdirError && mkdirError.code === "EEXIST") {
            try {
              const racedStat = io.lstatSync(current);
              if (racedStat.isSymbolicLink() || !racedStat.isDirectory()) {
                throw storeError("PUBLICATION_STORAGE_INVALID", "Publication storage is invalid");
              }
            } catch (raceError) {
              if (raceError && raceError.code && raceError.code.indexOf("PUBLICATION_") === 0) throw raceError;
              throw storeError("PUBLICATION_STORAGE_INVALID", "Publication storage is invalid");
            }
          }
          if (mkdirError && mkdirError.code && mkdirError.code.indexOf("PUBLICATION_") === 0) throw mkdirError;
          throw storeError("PUBLICATION_STORAGE_INVALID", "Publication storage is invalid");
        }
      } else if (error && error.code && error.code.indexOf("PUBLICATION_") === 0) {
        throw error;
      } else {
        throw storeError("PUBLICATION_STORAGE_INVALID", "Publication storage is invalid");
      }
    }
  }
  return target;
}

function readRecordFile(io, filename) {
  let stat;
  try {
    stat = io.lstatSync(filename);
  } catch (_) {
    throw storeError("PUBLICATION_RECORD_NOT_FOUND", "Publication record was not found");
  }
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw storeError("PUBLICATION_STORAGE_INVALID", "Publication storage is invalid");
  }
  let raw;
  try {
    raw = io.readFileSync(filename, "utf8");
  } catch (_) {
    throw storeError("PUBLICATION_RECORD_READ_FAILED", "Publication record could not be read");
  }
  if (!raw || !raw.trim()) throw storeError("PUBLICATION_RECORD_CORRUPT", "Publication record is invalid");
  let record;
  try {
    record = JSON.parse(raw);
  } catch (_) {
    throw storeError("PUBLICATION_RECORD_CORRUPT", "Publication record is invalid");
  }
  try {
    validatePublicationRecord(record);
  } catch (error) {
    if (error && error.code && error.code.indexOf("PUBLICATION_") === 0) throw error;
    throw storeError("PUBLICATION_RECORD_CORRUPT", "Publication record is invalid");
  }
  return clone(record);
}

function writeError(error) {
  if (error && error.code && error.code.indexOf("PUBLICATION_") === 0) return error;
  return storeError("PUBLICATION_STORAGE_WRITE_FAILED", "Publication record could not be written");
}

function createPublicationLedgerStore(options) {
  const opts = options || {};
  const io = opts.fs || nodeFs;
  if (!isAbsoluteDirectory(opts.workspaceRoot)) {
    throw storeError("PUBLICATION_WORKSPACE_REQUIRED", "workspaceRoot is required");
  }
  const workspaceRoot = path.resolve(opts.workspaceRoot);
  const suppliedPaths = opts.paths || {};
  const directory = path.resolve(
    suppliedPaths.publications || suppliedPaths.publicationRecords ||
    (suppliedPaths.submissionRecords && path.join(suppliedPaths.submissionRecords, "publications")) ||
    opts.directory || path.join(workspaceRoot, ".autopublish", "submission-records", "publications")
  );
  safeDirectory(io, workspaceRoot, directory);

  function filenameFor(record) {
    return path.join(directory, aggregateFilename(record.articleKey, record.targetKey));
  }

  function listFiles() {
    safeDirectory(io, workspaceRoot, directory);
    let entries;
    try {
      entries = io.readdirSync(directory, { withFileTypes: true });
    } catch (_) {
      throw storeError("PUBLICATION_STORAGE_INVALID", "Publication storage is invalid");
    }
    const files = [];
    entries.forEach(function(entry) {
      if (entry.isSymbolicLink()) {
        throw storeError("PUBLICATION_STORAGE_INVALID", "Publication storage is invalid");
      }
      if (PUBLICATION_FILE_PATTERN.test(entry.name) && !entry.isFile()) {
        throw storeError("PUBLICATION_STORAGE_INVALID", "Publication storage is invalid");
      }
      if (entry.isFile() && PUBLICATION_FILE_PATTERN.test(entry.name)) {
        files.push(path.join(directory, entry.name));
      }
    });
    return files.sort();
  }

  function findWithPath(publicationId) {
    safeToken(publicationId, "publicationId");
    const files = listFiles();
    for (let index = 0; index < files.length; index += 1) {
      const record = readRecordFile(io, files[index]);
      if (record.publicationId === publicationId) return { record: record, filename: files[index] };
    }
    throw storeError("PUBLICATION_RECORD_NOT_FOUND", "Publication record was not found");
  }

  function findByAggregate(articleKey, targetKey) {
    const filename = path.join(directory, aggregateFilename(articleKey, targetKey));
    if (!io.existsSync(filename)) return null;
    const record = readRecordFile(io, filename);
    if (record.articleKey !== articleKey || record.targetKey !== targetKey) {
      throw storeError("PUBLICATION_RECORD_CORRUPT", "Publication record is invalid");
    }
    return { record: record, filename: filename };
  }

  function writeInitial(record) {
    validatePublicationRecord(record);
    const filename = filenameFor(record);
    const serialized = JSON.stringify(record, null, 2) + "\n";
    try {
      io.writeFileSync(filename, serialized, { encoding: "utf8", flag: "wx" });
      const written = io.readFileSync(filename, "utf8");
      if (written !== serialized) throw storeError("PUBLICATION_STORAGE_WRITE_FAILED", "Publication record could not be written");
    } catch (error) {
      if (error && error.code === "EEXIST") throw storeError("PUBLICATION_RECORD_EXISTS", "Publication record already exists");
      try {
        if (io.existsSync(filename) && !(error && error.code === "PUBLICATION_RECORD_EXISTS")) io.unlinkSync(filename);
      } catch (_) {}
      throw writeError(error);
    }
    return clone(record);
  }

  function acquireLock(filename) {
    const lock = filename + ".lock";
    try {
      io.writeFileSync(lock, String(process.pid), { encoding: "utf8", flag: "wx" });
    } catch (error) {
      if (error && error.code === "EEXIST") throw storeError("PUBLICATION_CONCURRENT_UPDATE", "Publication record is being updated");
      throw writeError(error);
    }
    return lock;
  }

  function writeUpdated(filename, record) {
    validatePublicationRecord(record);
    const temporary = filename + ".tmp-" + process.pid + "-" + Date.now() + "-" + crypto.randomBytes(6).toString("hex");
    const serialized = JSON.stringify(record, null, 2) + "\n";
    let written = false;
    try {
      io.writeFileSync(temporary, serialized, { encoding: "utf8", flag: "wx" });
      written = true;
      if (io.readFileSync(temporary, "utf8") !== serialized) {
        throw storeError("PUBLICATION_STORAGE_WRITE_FAILED", "Publication record could not be written");
      }
      const stat = io.lstatSync(temporary);
      if (stat.isSymbolicLink() || !stat.isFile()) {
        throw storeError("PUBLICATION_STORAGE_INVALID", "Publication storage is invalid");
      }
      io.renameSync(temporary, filename);
    } catch (error) {
      throw writeError(error);
    } finally {
      if (written) {
        try { if (io.existsSync(temporary)) io.unlinkSync(temporary); } catch (_) {}
      }
    }
    return clone(record);
  }

  function update(publicationId, updater) {
    const located = findWithPath(publicationId);
    const lock = acquireLock(located.filename);
    try {
      const current = readRecordFile(io, located.filename);
      const next = typeof updater === "function" ? updater(clone(current)) : updater;
      if (!next || typeof next !== "object") throw storeError("PUBLICATION_RECORD_INVALID", "Publication record is invalid");
      if (next.publicationId !== current.publicationId || next.articleKey !== current.articleKey || next.targetKey !== current.targetKey) {
        throw storeError("PUBLICATION_RECORD_INVALID", "Publication record identity cannot change");
      }
      return writeUpdated(located.filename, clone(next));
    } finally {
      try { if (io.existsSync(lock)) io.unlinkSync(lock); } catch (_) {}
    }
  }

  function get(publicationId) {
    return clone(findWithPath(publicationId).record);
  }

  function list() {
    return listFiles().map(function(filename) { return readRecordFile(io, filename); });
  }

  return {
    directory: directory,
    aggregateFilename: aggregateFilename,
    create: writeInitial,
    save: writeInitial,
    get: get,
    read: get,
    list: list,
    findByAggregate: findByAggregate,
    update: update,
    validate: validatePublicationRecord
  };
}

module.exports = {
  ATTEMPT_FIELDS,
  PUBLICATION_RECORD_VERSION,
  RECORD_FIELDS,
  aggregateFilename,
  createPublicationLedgerStore,
  validatePublicationRecord
};
