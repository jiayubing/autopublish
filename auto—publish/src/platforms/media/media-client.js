// auto—publish/src/platforms/media/media-client.js
// Media API client for the media submission platform.
// CommonJS port from root src/core/media-client.js.

const FormData = require('form-data');
const { maskApiKey } = require('./config');

const DEFAULT_BASE_URL = 'http://8.138.187.158:8082';
const DEFAULT_TIMEOUT_MS = 30000;

/**
 * Media API client for interacting with the media submission platform.
 *
 * Endpoints:
 *   - POST /api/media/media_list   — list available media resources
 *   - POST /api/media/send         — submit an article
 *   - POST /api/media/order_info   — query order status
 *   - POST /api/geo/get_balance    — check account balance
 */
class MediaClient {
  /**
   * @param {object} opts
   * @param {string} opts.apiKey - API key for authentication
   * @param {string} [opts.baseUrl] - API base URL (defaults to DEFAULT_BASE_URL)
   * @param {number} [opts.timeoutMs] - Request timeout in milliseconds
   */
  constructor({ apiKey, baseUrl, timeoutMs } = {}) {
    if (!apiKey) {
      throw new Error('MediaClient requires an apiKey.');
    }
    this.apiKey = apiKey;
    this.baseUrl = (baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.timeoutMs = timeoutMs || DEFAULT_TIMEOUT_MS;
  }

  // ---------------------------------------------------------------------------
  // Public API methods
  // ---------------------------------------------------------------------------

  /**
   * Get account balance.
   * POST /api/geo/get_balance
   *
   * @returns {Promise<object>} Raw API response
   */
  async getBalance() {
    const form = new FormData();
    form.append('api_key', this.apiKey);
    return this._post('/api/geo/get_balance', form);
  }

  /**
   * List available media resources.
   * POST /api/media/media_list
   *
   * @param {object} [opts]
   * @param {number} [opts.page] - Page number (1-based, default 1, 20 per page)
   * @returns {Promise<object>} Raw API response
   */
  async mediaList(opts) {
    opts = opts || {};
    const form = new FormData();
    form.append('api_key', this.apiKey);
    if (opts.page != null) {
      form.append('page', String(opts.page));
    }
    return this._post('/api/media/media_list', form);
  }

  /**
   * Submit an article to a media resource.
   * POST /api/media/send
   *
   * @param {object} params
   * @param {string|number} params.resourceId - Target media resource ID
   * @param {string} params.title - Article title
   * @param {string} params.content - Article content (HTML)
   * @param {string} [params.remark] - Remark for the editor
   * @param {string} [params.thirdId] - Client-side tracking ID
   * @returns {Promise<object>} Raw API response
   */
  async sendArticle({ resourceId, title, content, remark, thirdId }) {
    if (!resourceId) throw new Error('缺少 resourceId');
    if (!title) throw new Error('缺少 title');
    if (!content) throw new Error('缺少 content');

    const form = new FormData();
    form.append('api_key', this.apiKey);
    form.append('resource_id', String(resourceId));
    form.append('title', title);
    form.append('content', content);

    if (remark) {
      form.append('remark', remark);
    }
    if (thirdId) {
      form.append('third_id', thirdId);
    }

    return this._post('/api/media/send', form);
  }

  /**
   * Query order details.
   * POST /api/media/order_info
   *
   * @param {string|string[]} orderNids - One or more order IDs
   * @returns {Promise<object>} Raw API response
   */
  async orderInfo(orderNids) {
    const nids = Array.isArray(orderNids) ? orderNids : [orderNids];
    if (nids.length === 0) throw new Error('缺少 order_nids');

    const form = new FormData();
    form.append('api_key', this.apiKey);

    for (const nid of nids) {
      form.append('order_nids[]', String(nid));
    }

    return this._post('/api/media/order_info', form);
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Perform a multipart/form-data POST request.
   */
  async _post(path, form) {
    const url = this.baseUrl + path;
    const controller = new AbortController();
    const timer = setTimeout(function () {
      controller.abort();
    }, this.timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: form.getHeaders(),
        body: form.getBuffer(),
        signal: controller.signal
      });

      const text = await response.text();

      let data;
      try {
        data = JSON.parse(text);
      } catch (_) {
        throw new Error(
          'API 返回非 JSON 格式 (HTTP ' + response.status + '): ' + text.slice(0, 200)
        );
      }

      if (!response.ok) {
        const msg = data && data.msg || data && data.message || 'HTTP ' + response.status;
        throw new Error('API 请求失败: ' + msg);
      }

      return data;
    } catch (err) {
      if (err.name === 'AbortError') {
        throw new Error('API 请求超时 (' + this.timeoutMs + 'ms): ' + path);
      }
      // Re-throw errors we already threw ourselves
      if (err.message && (err.message.indexOf('API ') === 0 || err.message.indexOf('缺少 ') === 0)) {
        throw err;
      }
      // Network / other errors
      throw new Error('网络请求失败 (' + path + '): ' + err.message);
    } finally {
      clearTimeout(timer);
    }
  }
}

module.exports = { MediaClient };
