// auto—publish/src/platforms/media/media-draft-store.js
// Local JSON store for media submission drafts.
// Tracks per-article settings: media selection, title override, notes, image handling.

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.resolve(__dirname, '..', '..', '..', 'data');
const DEFAULT_PATH = path.join(DATA_DIR, 'media-drafts.json');

class MediaDraftStore {
  constructor(opts) {
    opts = opts || {};
    this.filePath = opts.filePath || DEFAULT_PATH;
  }

  _read() {
    try {
      const raw = fs.readFileSync(this.filePath, 'utf-8');
      return JSON.parse(raw);
    } catch (_) {
      return {};
    }
  }

  _write(drafts) {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(this.filePath, JSON.stringify(drafts, null, 2), 'utf-8');
  }

  /**
   * Get draft for a specific article file.
   * Keyed by the article's filename (e.g. "article001.docx").
   * @param {string} filename
   * @returns {object|null}
   */
  get(filename) {
    var drafts = this._read();
    return drafts[filename] || null;
  }

  /**
   * Save or update a draft for an article.
   * @param {string} filename
   * @param {object} draft
   * @param {string} [draft.title] - Manual title override
   * @param {string|number} [draft.resourceId] - Selected media resource ID
   * @param {string} [draft.resourceName] - Selected media resource name
   * @param {string} [draft.remark] - Remark for the editor
   * @param {boolean} [draft.ignoreImages] - Explicitly allow submission despite images
   * @param {boolean} [draft.hasImages] - Whether the article has images
   * @param {number} [draft.imageCount] - Number of images detected
   * @param {string} [draft.autoTitle] - Auto-detected title from file
   */
  set(filename, draft) {
    var drafts = this._read();
    var existing = drafts[filename] || {};
    drafts[filename] = Object.assign({}, existing, draft, {
      updatedAt: new Date().toISOString()
    });
    this._write(drafts);
  }

  /**
   * Remove a draft.
   * @param {string} filename
   */
  remove(filename) {
    var drafts = this._read();
    delete drafts[filename];
    this._write(drafts);
  }

  /**
   * Get all drafts.
   * @returns {object} Map of filename -> draft
   */
  getAll() {
    return this._read();
  }

  /**
   * Bulk-set the same resourceId for multiple filenames.
   * @param {string[]} filenames
   * @param {string|number} resourceId
   * @param {string} [resourceName]
   */
  setBulkResource(filenames, resourceId, resourceName) {
    var drafts = this._read();
    var now = new Date().toISOString();
    for (var i = 0; i < filenames.length; i++) {
      var fn = filenames[i];
      var existing = drafts[fn] || {};
      drafts[fn] = Object.assign({}, existing, {
        resourceId: String(resourceId),
        resourceName: resourceName || existing.resourceName || '',
        updatedAt: now
      });
    }
    this._write(drafts);
  }

  /**
   * Clear all drafts.
   */
  clearAll() {
    try { fs.unlinkSync(this.filePath); } catch (_) {}
  }
}

module.exports = { MediaDraftStore };
