// auto—publish/src/platforms/media/media-pool-store.js
// Local JSON store for the user's curated media pool (favorites).

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.resolve(__dirname, '..', '..', '..', 'data');
const DEFAULT_PATH = path.join(DATA_DIR, 'media-pool.json');

class MediaPoolStore {
  constructor(opts) {
    opts = opts || {};
    this.filePath = opts.filePath || DEFAULT_PATH;
  }

  _read() {
    try {
      const raw = fs.readFileSync(this.filePath, 'utf-8');
      return JSON.parse(raw);
    } catch (_) {
      return [];
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
      existing.updatedAt = new Date().toISOString();
      if (opts.note !== undefined) existing.note = opts.note;
      if (opts.tags) existing.tags = opts.tags;
    } else {
      entries.push({
        resourceId: rid,
        name: resource.name || resource.title || '',
        price: resource.price,
        category: resource.category || resource.channelType || resource.mediaType || '',
        addedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        note: opts.note || '',
        tags: opts.tags || [],
        enabled: true
      });
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
