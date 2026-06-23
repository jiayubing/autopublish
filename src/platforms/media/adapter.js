import { MediaClient } from "../../core/media-client.js";
import { convertArticle } from "../../core/article-converter.js";
import { SubmissionStore } from "../../core/submission-store.js";
import { resolveApiKey } from "../../core/config.js";

/**
 * Media platform adapter for Electron auto-publishing workflow.
 *
 * Usage from Electron main process or task queue:
 *
 *   import { createMediaAdapter } from "./platforms/media/adapter.js";
 *   const adapter = createMediaAdapter({ apiKey });
 *   const result = await adapter.publish({
 *     title: "...",
 *     contentFile: "/path/to/article.docx",
 *     resourceId: "123456",
 *     remark: "请按原文发布",
 *   });
 *
 * @param {object} opts
 * @param {string} [opts.apiKey] - API key (or use env/.env fallback)
 * @param {string} [opts.baseUrl] - Custom API base URL
 * @returns {object} adapter instance with { publish, queryOrder, getBalance }
 */
export function createMediaAdapter(opts = {}) {
  const apiKey = resolveApiKey(opts.apiKey ?? null);
  const client = new MediaClient({
    apiKey,
    baseUrl: opts.baseUrl,
  });
  const store = new SubmissionStore();

  return {
    /**
     * Submit an article to the media platform.
     *
     * @param {object} params
     * @param {string} params.title          - Article title
     * @param {string} params.contentFile     - Path to .txt or .docx file
     * @param {string|number} params.resourceId - Target media resource ID
     * @param {string} [params.remark]        - Remark for editor
     * @param {string} [params.thirdId]       - Client-side tracking ID
     * @returns {Promise<object>} Unified publish result
     */
    async publish({ title, contentFile, resourceId, remark, thirdId }) {
      // Convert article
      const article = await convertArticle(contentFile);

      // Submit
      let response;
      try {
        response = await client.sendArticle({
          resourceId,
          title,
          content: article.html,
          remark,
          thirdId,
        });
      } catch (err) {
        // Record failure
        await store.record({
          command: "submit",
          dryRun: false,
          params: {
            resource_id: resourceId,
            title,
            content_file: contentFile,
            remark,
            third_id: thirdId,
          },
          result: { success: false, error: err.message },
        });

        return {
          platform: "media",
          status: "error",
          title,
          resourceId,
          error: err.message,
        };
      }

      // Record success
      await store.record({
        command: "submit",
        dryRun: false,
        params: {
          resource_id: resourceId,
          title,
          content_file: contentFile,
          remark,
          third_id: thirdId,
        },
        result: { success: true, data: response },
      });

      // Extract key fields from response
      const data = response?.data ?? {};
      return {
        platform: "media",
        status: "submitted",
        title,
        resourceId,
        thirdId: thirdId ?? null,
        orderNid: data.order_nid ?? null,
        raw: response,
        htmlContent: article.html,
        plainText: article.plainText,
      };
    },

    /**
     * Query order status.
     *
     * @param {string} orderNid - Order ID
     * @returns {Promise<object>} Unified query result
     */
    async queryOrder(orderNid) {
      let response;
      try {
        response = await client.orderInfo(orderNid);
      } catch (err) {
        await store.record({
          command: "order",
          dryRun: false,
          params: { order_nids: [orderNid] },
          result: { success: false, error: err.message },
        });
        return {
          platform: "media",
          status: "error",
          orderNid,
          error: err.message,
        };
      }

      await store.record({
        command: "order",
        dryRun: false,
        params: { order_nids: [orderNid] },
        result: { success: true, data: response },
      });

      return {
        platform: "media",
        status: "ok",
        orderNid,
        raw: response,
      };
    },

    /**
     * Get account balance.
     *
     * @returns {Promise<object>} Balance info
     */
    async getBalance() {
      let response;
      try {
        response = await client.getBalance();
      } catch (err) {
        return {
          platform: "media",
          status: "error",
          error: err.message,
        };
      }

      return {
        platform: "media",
        status: "ok",
        raw: response,
      };
    },
  };
}
