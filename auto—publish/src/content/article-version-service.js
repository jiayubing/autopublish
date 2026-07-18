const crypto = require("node:crypto");
const path = require("node:path");

function versionError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function isSafeStorageSegment(value) {
  if (typeof value !== "string" || !value || value !== value.trim() || value === "." || value === ".." ||
      value.endsWith(" ") || value.endsWith(".") || value.includes("/") || value.includes("\\") ||
      /[<>:\"|?*\u0000-\u001F]/.test(value) || path.isAbsolute(value) || path.win32.isAbsolute(value)) {
    return false;
  }
  const deviceName = value.split(".")[0].replace(/[ .]+$/g, "").toUpperCase();
  return !/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/.test(deviceName);
}

function isSafeArticleId(value) {
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(value);
}

function cloneValue(value) {
  if (Array.isArray(value)) return value.map(cloneValue);
  if (!value || typeof value !== "object") return value;
  return Object.keys(value).reduce(function(result, key) {
    result[key] = cloneValue(value[key]);
    return result;
  }, {});
}

function resolveTimestamp(now) {
  let value;
  try {
    value = now();
    if (value instanceof Date) value = value.toISOString();
  } catch (error) {
    throw versionError("ARTICLE_VERSION_TIMESTAMP_INVALID", "Article version timestamp is invalid");
  }
  if (typeof value !== "string" || !value.trim() || Number.isNaN(Date.parse(value))) {
    throw versionError("ARTICLE_VERSION_TIMESTAMP_INVALID", "Article version timestamp is invalid");
  }
  return value;
}

function sourceVersion(source) {
  if (source.version === undefined) return 1;
  if (!Number.isSafeInteger(source.version) || source.version < 1 || source.version >= Number.MAX_SAFE_INTEGER) {
    throw versionError("ARTICLE_VERSION_METADATA_INVALID", "Article version metadata is invalid");
  }
  return source.version;
}

function sourceLineageId(source) {
  const value = source.sourceArticleId === undefined || source.sourceArticleId === null ? source.id : source.sourceArticleId;
  if (!isSafeStorageSegment(value)) {
    throw versionError("ARTICLE_VERSION_METADATA_INVALID", "Article source metadata is invalid");
  }
  return value;
}

function copyContentFields(source, clientId, articleId, lineageId, version, timestamp) {
  const copy = { id: articleId, clientId: clientId };
  [
    "researchQueryIds",
    "researchQueryId",
    "researchSnapshots",
    "platform",
    "scenario",
    "templateId",
    "title",
    "content",
    "source",
    "materialSnapshots",
    "templateSnapshot"
  ].forEach(function(field) {
    if (hasOwn(source, field) && source[field] !== undefined) copy[field] = cloneValue(source[field]);
  });
  copy.sourceArticleId = lineageId;
  copy.version = version;
  copy.status = "generated";
  copy.reviewedAt = null;
  copy.createdAt = timestamp;
  copy.updatedAt = timestamp;
  return copy;
}

function createArticleVersionService(options) {
  const settings = options || {};
  if (!settings.articleStore || typeof settings.articleStore.getArticle !== "function") {
    throw versionError("ARTICLE_VERSION_SERVICE_INVALID", "Article version store is invalid");
  }
  const articleStore = settings.articleStore;
  const createId = typeof settings.createId === "function" ? settings.createId : function() { return crypto.randomUUID(); };
  const now = typeof settings.now === "function" ? settings.now : function() { return new Date().toISOString(); };

  function normalizeInput(input) {
    if (!input || typeof input !== "object" || Array.isArray(input) ||
        !isSafeStorageSegment(input.clientId) || !isSafeStorageSegment(input.sourceArticleId) ||
        Object.keys(input).some(function(key) { return key !== "clientId" && key !== "sourceArticleId"; })) {
      throw versionError("ARTICLE_VERSION_INPUT_INVALID", "Article version input is invalid");
    }
    return { clientId: input.clientId, sourceArticleId: input.sourceArticleId };
  }

  function readSource(input) {
    const source = articleStore.getArticle(input.clientId, input.sourceArticleId);
    if (!source || typeof source !== "object" || Array.isArray(source) ||
        source.id !== input.sourceArticleId || source.clientId !== input.clientId) {
      throw versionError("ARTICLE_VERSION_SOURCE_INVALID", "Source article is invalid");
    }
    return source;
  }

  function createUniqueId(clientId, sourceArticleId) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const articleId = createId();
      if (!isSafeArticleId(articleId)) {
        throw versionError("ARTICLE_ID_INVALID", "Generated article id is invalid");
      }
      let existing;
      try {
        existing = articleStore.getArticle(clientId, articleId);
      } catch (error) {
        if (!error || error.code !== "ARTICLE_NOT_FOUND") throw error;
      }
      if (!existing) return articleId;
      if (articleId === sourceArticleId || existing) continue;
    }
    throw versionError("ARTICLE_ID_DUPLICATE", "Generated article id is duplicated");
  }

  function copyArticleVersion(input) {
    const normalized = normalizeInput(input);
    const source = readSource(normalized);
    if (typeof articleStore.saveArticle !== "function") {
      throw versionError("ARTICLE_VERSION_SERVICE_INVALID", "Article version store cannot save articles");
    }
    const articleId = createUniqueId(normalized.clientId, normalized.sourceArticleId);
    const timestamp = resolveTimestamp(now);
    const version = sourceVersion(source) + 1;
    const copied = copyContentFields(source, normalized.clientId, articleId, sourceLineageId(source), version, timestamp);
    const saved = articleStore.saveArticle(copied);
    return saved === undefined ? copied : saved;
  }

  return { copyArticleVersion: copyArticleVersion };
}

module.exports = { createArticleVersionService };
