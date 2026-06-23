import FormData from "form-data";
import { maskApiKey } from "./config.js";

const DEFAULT_BASE_URL = "http://8.138.187.158:8082";
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
export class MediaClient {
  /**
   * @param {object} opts
   * @param {string} opts.apiKey - API key for authentication
   * @param {string} [opts.baseUrl] - API base URL (defaults to DEFAULT_BASE_URL)
   * @param {number} [opts.timeoutMs] - Request timeout in milliseconds
   */
  constructor({ apiKey, baseUrl = DEFAULT_BASE_URL, timeoutMs = DEFAULT_TIMEOUT_MS }) {
    if (!apiKey) {
      throw new Error("MediaClient requires an apiKey.");
    }
    this.apiKey = apiKey;
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.timeoutMs = timeoutMs;
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
    form.append("api_key", this.apiKey);
    return this._post("/api/geo/get_balance", form);
  }

  /**
   * List available media resources.
   * POST /api/media/media_list
   *
   * @param {object} [opts]
   * @param {number} [opts.page] - Page number (1-based, default 1, 20 per page)
   * @returns {Promise<object>} Raw API response
   */
  async mediaList(opts = {}) {
    const form = new FormData();
    form.append("api_key", this.apiKey);
    if (opts.page != null) {
      form.append("page", String(opts.page));
    }
    return this._post("/api/media/media_list", form);
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
    if (!resourceId) throw new Error("缺少 resourceId");
    if (!title) throw new Error("缺少 title");
    if (!content) throw new Error("缺少 content");

    const form = new FormData();
    form.append("api_key", this.apiKey);
    form.append("resource_id", String(resourceId));
    form.append("title", title);
    form.append("content", content);

    if (remark) {
      form.append("remark", remark);
    }
    if (thirdId) {
      form.append("third_id", thirdId);
    }

    return this._post("/api/media/send", form);
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
    if (nids.length === 0) throw new Error("缺少 order_nids");

    const form = new FormData();
    form.append("api_key", this.apiKey);

    for (const nid of nids) {
      form.append("order_nids[]", String(nid));
    }

    return this._post("/api/media/order_info", form);
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Perform a multipart/form-data POST request.
   *
   * @param {string} path - API path (e.g. "/api/media/send")
   * @param {FormData} form - FormData body
   * @returns {Promise<object>} Parsed JSON response
   */
  async _post(path, form) {
    const url = this.baseUrl + path;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: form.getHeaders(),
        body: form.getBuffer(),
        signal: controller.signal,
      });

      const text = await response.text();

      let data;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(
          `API 返回非 JSON 格式 (HTTP ${response.status}): ${text.slice(0, 200)}`
        );
      }

      if (!response.ok) {
        const msg = data?.msg || data?.message || `HTTP ${response.status}`;
        throw new Error(`API 请求失败: ${msg}`);
      }

      return data;
    } catch (err) {
      if (err.name === "AbortError") {
        throw new Error(`API 请求超时 (${this.timeoutMs}ms): ${path}`);
      }
      // Re-throw errors we already threw ourselves
      if (err.message.startsWith("API ") || err.message.startsWith("缺少 ")) {
        throw err;
      }
      // Network / other errors
      throw new Error(`网络请求失败 (${path}): ${err.message}`);
    } finally {
      clearTimeout(timer);
    }
  }
}
