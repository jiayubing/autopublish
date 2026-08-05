// auto—publish/src/platforms/media/adapter.js
// Media platform adapter for Electron auto-publishing workflow.
// Implements both createMediaAdapter() and the Platform Adapter contract.
// CommonJS port from root src/platforms/media/adapter.js.

const { MediaClient } = require('./media-client');
const { createMediaSupplierAdapter } = require('./media-supplier-adapter');
const { convertArticle } = require('./article-converter');
const { detectDocxImages } = require('./article-converter');
const { MediaDraftStore } = require('./media-draft-store');
const { resolveApiKey } = require('./config');
const { DIRS } = require('../../../scripts/config');
const path = require('path');

// ---------------------------------------------------------------------------
// createMediaAdapter — standalone API adapter
// ---------------------------------------------------------------------------

function createMediaAdapter(opts) {
  opts = opts || {};
  if (opts.mainProcess !== true) {
    return Object.freeze({
      scanArticles: function() { return []; },
      publish: async function() { return { platform: "media", status: "error", errorCode: "MEDIA_MAIN_PROCESS_REQUIRED" }; },
      queryOrder: async function() { return { platform: "media", status: "error", errorCode: "MEDIA_MAIN_PROCESS_REQUIRED" }; },
      getBalance: async function() { return { platform: "media", status: "error", errorCode: "MEDIA_MAIN_PROCESS_REQUIRED" }; },
    });
  }
  let client = null;
  function getClient() {
    if (!client) {
      client = new MediaClient({
        apiKey: resolveApiKey(opts.apiKey || null),
        baseUrl: opts.baseUrl,
        allowInsecure: opts.allowInsecure
      });
    }
    return client;
  }
  const inputDir = opts.paths && opts.paths.mediaInput || path.join(DIRS.inputDir, "media");

  return {
    scanArticles: function() {
      var fs = require("fs");
      if (!fs.existsSync(inputDir)) return [];
      return fs.readdirSync(inputDir).filter(function(name) {
        return name.indexOf("~$") !== 0 && name !== ".gitkeep" && /\.(docx|txt|md)$/i.test(name);
      }).map(function(name) { return { file: path.join(inputDir, name), filename: name, title: path.basename(name, path.extname(name)) }; });
    },
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
        response = await getClient().sendArticle({
          resourceId: resourceId,
          title: title,
          content: article.html,
          remark: remark,
          thirdId: thirdId
        });
      } catch (err) {
        return {
          platform: 'media',
          status: 'error',
          title: title,
          resourceId: resourceId,
          error: err.message
        };
      }

      var data = response && response.data ? response.data : {};
      return {
        platform: 'media',
        status: 'submitted',
        title: title,
        resourceId: resourceId,
        thirdId: thirdId || null,
        orderNid: data.order_nid || null,
      };
    },

    queryOrder: async function (orderNid) {
      var response;
      try {
        response = await getClient().orderInfo(orderNid);
      } catch (err) {
        return {
          platform: 'media',
          status: 'error',
          orderNid: orderNid,
          error: err.message
        };
      }

      return {
        platform: 'media',
        status: 'ok',
        orderNid: orderNid,
      };
    },

    getBalance: async function () {
      var response;
      try {
        response = await getClient().getBalance();
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
  publicationTarget: { kind: 'resource', granularity: 'resource' },
  contentQueueImport: true,
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

  publishArticle: async function() {
    // Media submission is main-process only: its configured client is built
    // from platform settings and must never be reconstructed in a worker.
    return { status: "failed", errorCode: "MEDIA_MAIN_PROCESS_REQUIRED" };
  },

  createMediaAdapter: createMediaAdapter,
  createMediaSupplierAdapter: createMediaSupplierAdapter,
};
