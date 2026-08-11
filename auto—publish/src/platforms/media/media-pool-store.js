// auto—publish/src/platforms/media/media-pool-store.js
// Local JSON store for the user's curated media pool (favorites).

const fs = require('fs');
const path = require('path');
const { resolveStorePath } = require('./store-paths');
const { reportDiagnostic } = require('../../diagnostics/diagnostic-producer');

function storeError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function diagnose(code, action) {
  reportDiagnostic({
    code,
    module: 'media-pool-store',
    category: 'storage',
    operationId: 'media-pool-store',
    metadata: { action },
  });
}

class MediaPoolStore {
  constructor(opts) {
    opts = opts || {};
    this.filePath = resolveStorePath(opts, 'media-pool.json');
  }

  _read() {
    let raw;
    try {
      raw = fs.readFileSync(this.filePath, 'utf-8');
    } catch (error) {
      if (error && error.code === 'ENOENT') return [];
      diagnose('MEDIA_POOL_STORE_READ_FAILED', 'read');
      throw storeError('MEDIA_POOL_STORE_READ_FAILED');
    }
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) throw new Error('invalid pool store shape');
      return parsed;
    } catch (_) {
      diagnose('MEDIA_POOL_STORE_CORRUPT', 'parse');
      throw storeError('MEDIA_POOL_STORE_CORRUPT');
    }
  }

  _write(entries) {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(this.filePath, JSON.stringify(entries, null, 2), 'utf-8');
  }

  /**
   * Get all pool entries.
   * @returns {object[]}
   */
  getAll() {
    return this._read();
  }

  /**
   * Add a resource to the media pool.
   * Deduplicates by resourceId.
   * @param {object} resource - Resource object (must have id or resource_id)
   * @param {object} [opts]
   * @param {string} [opts.note] - User note
   * @param {string[]} [opts.tags] - User tags
   */
  add(resource, opts) {
    opts = opts || {};
    var entries = this._read();
    var rid = String(resource.id || resource.resource_id);

    var existing = entries.find(function (e) {
      return String(e.resourceId) === rid;
    });

    if (existing) {
      // Update existing
      existing.name = resource.name || resource.title || existing.name;
      existing.price = resource.price !== undefined ? resource.price : existing.price;
      if (resource.type !== undefined) existing.type = resource.type;
      existing.updatedAt = new Date().toISOString();
      if (opts.note !== undefined) existing.note = opts.note;
      if (opts.tags) existing.tags = opts.tags;
    } else {
      var entry = {
        resourceId: rid,
        name: resource.name || resource.title || '',
        price: resource.price,
        category: resource.category || resource.channelType || resource.mediaType || '',
        addedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        note: opts.note || '',
        tags: opts.tags || [],
        enabled: true
      };
      if (resource.type !== undefined) entry.type = resource.type;
      entries.push(entry);
    }

    this._write(entries);
  }

  /**
   * Remove a resource from the pool by resourceId.
   * @param {string|number} resourceId
   */
  remove(resourceId) {
    var entries = this._read();
    var rid = String(resourceId);
    entries = entries.filter(function (e) {
      return String(e.resourceId) !== rid;
    });
    this._write(entries);
  }

  /**
   * Toggle enabled state for a pool entry.
   * @param {string|number} resourceId
   * @param {boolean} enabled
   */
  setEnabled(resourceId, enabled) {
    var entries = this._read();
    var rid = String(resourceId);
    var entry = entries.find(function (e) { return String(e.resourceId) === rid; });
    if (entry) {
      entry.enabled = !!enabled;
      entry.updatedAt = new Date().toISOString();
      this._write(entries);
    }
  }

  /**
   * Check if a resource is in the pool.
   * @param {string|number} resourceId
   * @returns {boolean}
   */
  contains(resourceId) {
    var entries = this._read();
    var rid = String(resourceId);
    return entries.some(function (e) { return String(e.resourceId) === rid; });
  }

  /**
   * Get enabled pool entries only.
   * @returns {object[]}
   */
  getEnabled() {
    return this._read().filter(function (e) { return e.enabled !== false; });
  }
}

module.exports = { MediaPoolStore };
