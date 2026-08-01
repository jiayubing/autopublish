// auto—publish/src/platforms/media/media-client.js
// Media API client for the media submission platform.

const FormData = require("form-data");
const { createMediaError } = require("./media-errors");
const { createEndpointPolicy } = require("./endpoint-policy");
const { createMediaTransport } = require("./media-transport");

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
   * @param {string} [opts.baseUrl] - API base URL
   * @param {number} [opts.timeoutMs] - Request timeout in milliseconds
   * @param {boolean} [opts.allowInsecure] - Explicit approval for an HTTP provider endpoint
   * @param {string} [opts.insecureEndpoint] - Persisted endpoint bound to the approval
   * @param {object} [opts.endpointPolicy] - Injected endpoint policy
   * @param {object} [opts.transport] - Injected media transport
   */
  constructor(options) {
    const values = options || {};
    if (!hasText(values.apiKey)) {
      throw createMediaError("MEDIA_CONFIG_INVALID", "MediaClient requires an apiKey.");
    }
    this.apiKey = String(values.apiKey).trim();
    this.endpointPolicy = values.endpointPolicy || createEndpointPolicy({
      endpoint: values.baseUrl,
      allowInsecure: values.allowInsecure === true,
      insecureEndpoint: values.insecureEndpoint,
    });
    if (!this.endpointPolicy || typeof this.endpointPolicy.assertCanSend !== "function") {
      throw createMediaError("MEDIA_CONFIG_INVALID");
    }
    this.endpointPolicy.assertCanSend();
    this.baseUrl = this.endpointPolicy.endpoint;
    this.timeoutMs = clientTimeout(values.timeoutMs);
    this.transport = values.transport || createMediaTransport({
      fetch: values.fetch || values.fetchImpl,
      timeoutMs: this.timeoutMs,
    });
  }

  async getBalance() {
    return this._post("/api/geo/get_balance", () => {
      const form = new FormData();
      form.append("api_key", this.apiKey);
      return form;
    });
  }

  async mediaList(options) {
    const values = options || {};
    return this._post("/api/media/media_list", () => {
      const form = new FormData();
      form.append("api_key", this.apiKey);
      if (values.page != null) form.append("page", String(parsePositiveInteger(values.page, "page")));
      if (values.pageSize != null) form.append("page_size", String(parsePositiveInteger(values.pageSize, "pageSize")));
      return form;
    });
  }

  async sendArticle(options) {
    const values = options || {};
    const resourceId = requireText(values.resourceId, "resourceId");
    const title = requireText(values.title, "title");
    const content = requireText(values.content, "content");
    return this._post("/api/media/send", () => {
      const form = new FormData();
      form.append("api_key", this.apiKey);
      form.append("resource_id", resourceId);
      form.append("title", title);
      form.append("content", content);
      if (hasText(values.remark)) form.append("remark", String(values.remark).trim());
      if (hasText(values.thirdId)) form.append("third_id", String(values.thirdId).trim());
      return form;
    });
  }

  async orderInfo(orderNids) {
    const nids = (Array.isArray(orderNids) ? orderNids : [orderNids])
      .map((nid) => String(nid == null ? "" : nid).trim())
      .filter(Boolean);
    if (nids.length === 0) throw new Error("缺少 order_nids");
    return this._post("/api/media/order_info", () => {
      const form = new FormData();
      form.append("api_key", this.apiKey);
      nids.forEach((nid) => form.append("order_nids[]", nid));
      return form;
    });
  }

  _post(path, prepare) {
    return this.transport.post({
      policy: this.endpointPolicy,
      path,
      prepare,
      timeoutMs: this.timeoutMs,
    });
  }
}

function clientTimeout(value) {
  const number = Number(value == null ? DEFAULT_TIMEOUT_MS : value);
  if (!Number.isInteger(number) || number < 1 || number > 300000) {
    throw createMediaError("MEDIA_CONFIG_INVALID");
  }
  return number;
}

function parsePositiveInteger(value, label) {
  const normalized = Number(value);
  if (!Number.isInteger(normalized) || normalized < 1) throw new Error(`${label} 必须是大于 0 的整数`);
  return normalized;
}

function requireText(value, label) {
  const text = String(value == null ? "" : value).trim();
  if (!text) throw new Error(`缺少 ${label}`);
  return text;
}

function hasText(value) {
  return String(value == null ? "" : value).trim().length > 0;
}

module.exports = { MediaClient };
