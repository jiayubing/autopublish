// auto—publish/src/platforms/media/media-resource-store.js
// Local JSON store for cached media resources fetched from the API.

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
    module: 'media-resource-store',
    category: 'storage',
    operationId: 'media-resource-store',
    metadata: { action },
  });
}

class MediaResourceStore {
  constructor(opts) {
    opts = opts || {};
    this.filePath = resolveStorePath(opts, 'media-resources.json');
    this.cachedRead = null;
  }

  /** Read the cache file and return parsed data, or null when it is missing. */
  _read(copy = true) {
    let raw;
    let version;
    try {
      const stat = fs.statSync(this.filePath, { bigint: true });
      version = [stat.dev, stat.ino, stat.size, stat.mtimeNs, stat.ctimeNs].join(':');
      if (this.cachedRead && this.cachedRead.version === version)
        return copy ? structuredClone(this.cachedRead.value) : this.cachedRead.value;
      raw = fs.readFileSync(this.filePath, 'utf-8');
    } catch (error) {
      this.cachedRead = null;
      if (error && error.code === 'ENOENT') return null;
      diagnose('MEDIA_RESOURCE_STORE_READ_FAILED', 'read');
      throw storeError('MEDIA_RESOURCE_STORE_READ_FAILED');
    }
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
        throw new Error('invalid resource store shape');
      // The pre-read version prevents a concurrent replacement from being
      // accepted as the cache key of the old contents on the next query.
      this.cachedRead = { version, value: parsed };
      return copy ? structuredClone(parsed) : parsed;
    } catch (_) {
      diagnose('MEDIA_RESOURCE_STORE_CORRUPT', 'parse');
      throw storeError('MEDIA_RESOURCE_STORE_CORRUPT');
    }
  }

  /** Write data to the cache file. */
  _write(data) {
    this.cachedRead = null;
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

  getResourceSnapshot(project) {
    const data = this._read(false);
    if (!data) return Object.freeze([]);
    if (this.cachedRead.project !== project) {
      const freeze = value => {
        if (value && typeof value === 'object' && !Object.isFrozen(value)) {
          Object.values(value).forEach(freeze);
          Object.freeze(value);
        }
        return value;
      };
      this.cachedRead.resources = freeze((Array.isArray(data.resources) ? data.resources : [])
        .map(project).filter(Boolean));
      this.cachedRead.project = project;
    }
    return this.cachedRead.resources;
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
      var price = r.price;
      if (typeof price !== 'number' || !Number.isFinite(price) || price < 0) return false;
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
    this.cachedRead = null;
    try {
      fs.unlinkSync(this.filePath);
    } catch (error) {
      if (error && error.code === 'ENOENT') return;
      diagnose('MEDIA_RESOURCE_STORE_CLEAR_FAILED', 'clear');
      throw storeError('MEDIA_RESOURCE_STORE_CLEAR_FAILED');
    }
  }
}

module.exports = { MediaResourceStore };
