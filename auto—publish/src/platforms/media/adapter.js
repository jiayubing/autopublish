// auto—publish/src/platforms/media/adapter.js
// Media platform adapter for Electron auto-publishing workflow.
// Implements both createMediaAdapter() and the Platform Adapter contract.
// CommonJS port from root src/platforms/media/adapter.js.

const { MediaClient } = require('./media-client');
const { convertArticle } = require('./article-converter');
const { detectDocxImages } = require('./article-converter');
const { SubmissionOrderStore } = require('./submission-order-store');
const { MediaDraftStore } = require('./media-draft-store');
const { resolveApiKey } = require('./config');
const { DIRS } = require('../../../scripts/config');

// ---------------------------------------------------------------------------
// createMediaAdapter — standalone API adapter
// ---------------------------------------------------------------------------

function createMediaAdapter(opts) {
  opts = opts || {};
  const apiKey = resolveApiKey(opts.apiKey || null);
  const client = new MediaClient({
    apiKey: apiKey,
    baseUrl: opts.baseUrl
  });
  const store = new SubmissionOrderStore({ paths: opts.paths });

  return {
    publish: async function (params) {
      var title = params.title;
      var contentFile = params.contentFile;
      var resourceId = params.resourceId;
      var remark = params.remark;
      var thirdId = params.thirdId;

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

// ---------------------------------------------------------------------------
// Platform Adapter contract for auto-publish batch system
// ---------------------------------------------------------------------------

var draftStore = new MediaDraftStore();

module.exports = {
  id: 'media',
  scanDir: 'media',

  ensureSession: function() {},

  ensureLoggedIn: async function() {
    return true;
  },


  scanArticles: function(scanDir) {
    var fs = require("fs");
    var path = require("path");
    var inputDir = path.join(DIRS.inputDir, scanDir);
    if (!fs.existsSync(inputDir)) return [];
    return fs.readdirSync(inputDir).filter(function(name) {
      if (name.indexOf("~$") === 0) return false;
      if (name === ".gitkeep") return false;
      return name.endsWith(".docx") || name.endsWith(".txt") || name.endsWith(".md");
    }).map(function(name) {
      return {
        file: path.join(inputDir, name),
        filename: name,
        title: path.basename(name, path.extname(name))
      };
    });
  },

  parseArticleFiles: function(articles) {
    return articles.map(function(a) { return a; });
  },

  closeSession: function() {},

  publishArticle: async function(article, options) {
    var draft = draftStore.get(article.filename);
    if (!draft || !draft.resourceId) {
      throw new Error('未选择媒体资源: ' + article.filename);
    }

    var imgInfo = detectDocxImages(article.sourceFile || article.file);
    if (imgInfo.hasImages && !draft.ignoreImages) {
      throw new Error('文章包含 ' + imgInfo.imageCount + ' 张图片，未勾选忽略图片');
    }

    var adapter = createMediaAdapter();
    var result = await adapter.publish({
      title: draft.title || article.title,
      contentFile: article.sourceFile || article.file,
      resourceId: draft.resourceId,
      remark: draft.remark || undefined,
      thirdId: article.filename
    });

    if (result.status === 'submitted') {
      return 'submitted';
    }

    throw new Error(result.error || '投稿失败');
  },

  createMediaAdapter: createMediaAdapter
};
