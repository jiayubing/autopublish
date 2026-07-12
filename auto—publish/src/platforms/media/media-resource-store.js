// auto—publish/src/platforms/media/media-resource-store.js
// Local JSON store for cached media resources fetched from the API.

const fs = require('fs');
const path = require('path');
const { resolveStorePath } = require('./store-paths');

class MediaResourceStore {
  constructor(opts) {
    opts = opts || {};
    this.filePath = resolveStorePath(opts, 'media-resources.json');
  }

  /** Read the cache file and return parsed data, or null if missing/corrupt. */
  _read() {
    try {
      const raw = fs.readFileSync(this.filePath, 'utf-8');
      return JSON.parse(raw);
    } catch (_) {
      return null;
    }
  }

  /** Write data to the cache file. */
  _write(data) {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2), 'utf-8');
  }

  /**
   * Replace the entire cache with fresh media list data.
   * @param {object[]} resources - Array of media resource objects from API
   * @param {object} [meta] - Optional metadata (total, page info, etc.)
   */
  setAll(resources, meta) {
    var data = {
      updatedAt: new Date().toISOString(),
      count: Array.isArray(resources) ? resources.length : 0,
      resources: resources || [],
      meta: meta || {}
    };
    this._write(data);
  }

  /**
   * Get all cached resources.
   * @returns {{ updatedAt: string, count: number, resources: object[], meta: object }|null}
   */
  getAll() {
    return this._read();
  }

  /**
   * Search cached resources by keyword (matches name, category, etc.).
   * @param {string} keyword
   * @returns {object[]}
   */
  search(keyword) {
    var data = this._read();
    if (!data || !data.resources) return [];

    var lower = String(keyword || '').toLowerCase();
    if (!lower) return data.resources;

    return data.resources.filter(function (r) {
      var name = String(r.name || r.title || '').toLowerCase();
      var cat = String(r.category || r.channelType || r.mediaType || '').toLowerCase();
      return name.indexOf(lower) !== -1 || cat.indexOf(lower) !== -1;
    });
  }

  /**
   * Filter by price range.
   * @param {number} [minPrice]
   * @param {number} [maxPrice]
   * @returns {object[]}
   */
  filterByPrice(minPrice, maxPrice) {
    var data = this._read();
    if (!data || !data.resources) return [];

    return data.resources.filter(function (r) {
      var price = Number(r.price);
      if (!Number.isFinite(price)) return false;
      if (minPrice != null && price < minPrice) return false;
      if (maxPrice != null && price > maxPrice) return false;
      return true;
    });
  }

  /**
   * Get a single resource by its ID.
   * @param {string|number} id
   * @returns {object|null}
   */
  getById(id) {
    var data = this._read();
    if (!data || !data.resources) return null;
    var sid = String(id);
    return data.resources.find(function (r) {
      return String(r.id || r.resource_id) === sid;
    }) || null;
  }

  /**
   * Clear the cache.
   */
  clear() {
    try { fs.unlinkSync(this.filePath); } catch (_) {}
  }
}

module.exports = { MediaResourceStore };
