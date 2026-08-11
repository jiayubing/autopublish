// auto—publish/src/platforms/media/media-draft-store.js
// Local JSON store for media submission drafts.
// Tracks per-article settings: media selection, title override, notes, image handling.

const fs = require("fs");
const path = require("path");
const { resolveStorePath } = require("./store-paths");
const { reportDiagnostic } = require("../../diagnostics/diagnostic-producer");

function storeError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function diagnose(code, action) {
  reportDiagnostic({
    code,
    module: "media-draft-store",
    category: "storage",
    operationId: "media-draft-store",
    metadata: { action },
  });
}

function normalizeResource(resource) {
  if (!resource) return null;
  var resourceId = resource.resourceId || resource.id || resource.resource_id;
  if (!resourceId) return null;
  var normalized = {
    resourceId: String(resourceId),
    name: resource.name || resource.title || resource.resourceName || "",
    price: resource.price
  };
  if (["image", "video", "audio", "document"].includes(resource.type)) normalized.type = resource.type;
  return normalized;
}

function normalizeDraft(draft) {
  var source = draft || {};
  var selectedResources = [];

  if (Array.isArray(source.selectedResources)) {
    selectedResources = source.selectedResources.map(normalizeResource).filter(Boolean);
  } else if (source.resourceId) {
    selectedResources = [{
      resourceId: String(source.resourceId),
      name: source.resourceName || "",
      price: source.price
    }];
  }

  return Object.assign({}, source, {
    selectedResources: selectedResources,
    resourceId: selectedResources[0] ? selectedResources[0].resourceId : null,
    resourceName: selectedResources[0] ? selectedResources[0].name : ""
  });
}

class MediaDraftStore {
  constructor(opts) {
    opts = opts || {};
    this.filePath = resolveStorePath(opts, "media-drafts.json");
  }

  _read() {
    let raw;
    try {
      raw = fs.readFileSync(this.filePath, "utf-8");
    } catch (error) {
      if (error && error.code === "ENOENT") return {};
      diagnose("MEDIA_DRAFT_STORE_READ_FAILED", "read");
      throw storeError("MEDIA_DRAFT_STORE_READ_FAILED");
    }
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
        throw new Error("invalid draft store shape");
      return parsed;
    } catch (_) {
      diagnose("MEDIA_DRAFT_STORE_CORRUPT", "parse");
      throw storeError("MEDIA_DRAFT_STORE_CORRUPT");
    }
  }

  _write(drafts) {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(this.filePath, JSON.stringify(drafts, null, 2), "utf-8");
  }

  get(filename) {
    var drafts = this._read();
    var draft = drafts[filename];
    return draft ? normalizeDraft(draft) : null;
  }

  set(filename, draft) {
    var drafts = this._read();
    var existing = drafts[filename] || {};
    var normalized = normalizeDraft(Object.assign({}, existing, draft));
    drafts[filename] = Object.assign(normalized, {
      updatedAt: new Date().toISOString()
    });
    this._write(drafts);
  }

  remove(filename) {
    var drafts = this._read();
    delete drafts[filename];
    this._write(drafts);
  }

  getAll() {
    var drafts = this._read();
    var result = {};
    for (var key in drafts) {
      if (drafts.hasOwnProperty(key)) {
        result[key] = normalizeDraft(drafts[key]);
      }
    }
    return result;
  }

  setBulkResource(filenames, resourceId, resourceName) {
    var drafts = this._read();
    var now = new Date().toISOString();
    for (var i = 0; i < filenames.length; i++) {
      var fn = filenames[i];
      var existing = drafts[fn] || {};
      var merged = Object.assign({}, existing, {
        selectedResources: [normalizeResource({
          resourceId: resourceId,
          name: resourceName || existing.resourceName || ""
        })],
        updatedAt: now
      });
      drafts[fn] = normalizeDraft(merged);
    }
    this._write(drafts);
  }

  clearAll() {
    try {
      fs.unlinkSync(this.filePath);
    } catch (error) {
      if (error && error.code === "ENOENT") return;
      diagnose("MEDIA_DRAFT_STORE_CLEAR_FAILED", "clear");
      throw storeError("MEDIA_DRAFT_STORE_CLEAR_FAILED");
    }
  }
}

module.exports = { MediaDraftStore };
