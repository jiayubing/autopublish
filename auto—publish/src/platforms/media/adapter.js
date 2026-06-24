// auto—publish/src/platforms/media/adapter.js
// Media platform adapter for Electron auto-publishing workflow.
// CommonJS port from root src/platforms/media/adapter.js.

const { MediaClient } = require('./media-client');
const { convertArticle } = require('./article-converter');
const { SubmissionOrderStore } = require('./submission-order-store');
const { resolveApiKey } = require('./config');

/**
 * Media platform adapter for Electron auto-publishing workflow.
 *
 * Usage from Electron main process or task queue:
 *
 *   const { createMediaAdapter } = require('./platforms/media/adapter');
 *   const adapter = createMediaAdapter({ apiKey });
 *   const result = await adapter.publish({
 *     title: '...',
 *     contentFile: '/path/to/article.docx',
 *     resourceId: '123456',
 *     remark: '请按原文发布',
 *   });
 *
 * @param {object} opts
 * @param {string} [opts.apiKey] - API key (or use env/.env fallback)
 * @param {string} [opts.baseUrl] - Custom API base URL
 * @returns {object} adapter instance with { publish, queryOrder, getBalance }
 */
function createMediaAdapter(opts) {
  opts = opts || {};
  const apiKey = resolveApiKey(opts.apiKey || null);
  const client = new MediaClient({
    apiKey: apiKey,
    baseUrl: opts.baseUrl
  });
  const store = new SubmissionOrderStore();

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
    publish: async function (params) {
      var title = params.title;
      var contentFile = params.contentFile;
      var resourceId = params.resourceId;
      var remark = params.remark;
      var thirdId = params.thirdId;

      // Convert article
      var article;
      try {
        article = await convertArticle(contentFile);
      } catch (err) {
        return {
          platform: 'media',
          status: 'error',
          title: title,
          resourceId: resourceId,
          error: '文章转换失败: ' + err.message
        };
      }

      // Submit
      var response;
      try {
        response = await client.sendArticle({
          resourceId: resourceId,
          title: title,
          content: article.html,
          remark: remark,
          thirdId: thirdId
        });
      } catch (err) {
        // Record failure
        await store.record({
          command: 'submit',
          dryRun: false,
          params: {
            resource_id: resourceId,
            title: title,
            content_file: contentFile,
            remark: remark,
            third_id: thirdId
          },
          result: { success: false, error: err.message }
        });

        return {
          platform: 'media',
          status: 'error',
          title: title,
          resourceId: resourceId,
          error: err.message
        };
      }

      // Record success
      await store.record({
        command: 'submit',
        dryRun: false,
        params: {
          resource_id: resourceId,
          title: title,
          content_file: contentFile,
          remark: remark,
          third_id: thirdId
        },
        result: { success: true, data: response }
      });

      // Extract key fields from response
      var data = response && response.data ? response.data : {};
      return {
        platform: 'media',
        status: 'submitted',
        title: title,
        resourceId: resourceId,
        thirdId: thirdId || null,
        orderNid: data.order_nid || null,
        raw: response,
        htmlContent: article.html,
        plainText: article.plainText
      };
    },

    /**
     * Query order status.
     */
    queryOrder: async function (orderNid) {
      var response;
      try {
        response = await client.orderInfo(orderNid);
      } catch (err) {
        await store.record({
          command: 'order',
          dryRun: false,
          params: { order_nids: [orderNid] },
          result: { success: false, error: err.message }
        });
        return {
          platform: 'media',
          status: 'error',
          orderNid: orderNid,
          error: err.message
        };
      }

      await store.record({
        command: 'order',
        dryRun: false,
        params: { order_nids: [orderNid] },
        result: { success: true, data: response }
      });

      return {
        platform: 'media',
        status: 'ok',
        orderNid: orderNid,
        raw: response
      };
    },

    /**
     * Get account balance.
     */
    getBalance: async function () {
      var response;
      try {
        response = await client.getBalance();
      } catch (err) {
        return {
          platform: 'media',
          status: 'error',
          error: err.message
        };
      }

      return {
        platform: 'media',
        status: 'ok',
        raw: response
      };
    }
  };
}

module.exports = { createMediaAdapter };
