// auto—publish/src/platforms/media/adapter.js
// Media platform adapter for Electron auto-publishing workflow.
// Implements both createMediaAdapter() and the Platform Adapter contract.
// CommonJS port from root src/platforms/media/adapter.js.

const { MediaClient } = require('./media-client');
const { createMediaSupplierAdapter } = require('./media-supplier-adapter');
const { convertArticle } = require('./article-converter');
const { detectDocxImages } = require('./article-converter');
const { MediaDraftStore } = require('./media-draft-store');
const { MEDIA_ERROR_DEFINITIONS } = require('./media-errors');
const { hasExplicitFailure } = require('./media-supplier-response');
const { resolveApiKey } = require('./config');
const { DIRS } = require('../../../scripts/config');
const path = require('path');

const UNCERTAIN_CODES = new Set([
  'MEDIA_CONNECT_TIMEOUT',
  'MEDIA_READ_TIMEOUT',
  'MEDIA_NETWORK_ERROR',
  'MEDIA_SERVER_ERROR',
  'MEDIA_PROTOCOL_ERROR',
  'MEDIA_TRANSPORT_UNAVAILABLE',
  'MEDIA_REDIRECT_REJECTED',
  'MEDIA_TLS_CERTIFICATE_ERROR',
  'MEDIA_TLS_HOSTNAME_MISMATCH',
]);

function safeMediaCode(error, fallback) {
  const code = error && typeof error.code === 'string' ? error.code : '';
  return MEDIA_ERROR_DEFINITIONS[code] ? code : fallback;
}

function mediaFailure(error, remote, fallback) {
  const code = safeMediaCode(error, fallback);
  return {
    platform: 'media',
    status: remote && UNCERTAIN_CODES.has(code) ? 'uncertain' : 'error',
    errorCode: code,
  };
}

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
          errorCode: 'MEDIA_ARTICLE_CONVERSION_FAILED'
        };
      }

      var client;
      try {
        client = getClient();
      } catch (err) {
        return Object.assign({ title: title, resourceId: resourceId }, mediaFailure(err, false, 'MEDIA_CONFIG_INVALID'));
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
        return Object.assign({ title: title, resourceId: resourceId }, mediaFailure(err, true, 'MEDIA_NETWORK_ERROR'));
      }

      if (!response)
        return Object.assign({ title: title, resourceId: resourceId }, mediaFailure({ code: 'MEDIA_PROTOCOL_ERROR' }, true, 'MEDIA_PROTOCOL_ERROR'));
      if (hasExplicitFailure(response))
        return Object.assign({ title: title, resourceId: resourceId }, mediaFailure({ code: 'MEDIA_REMOTE_REJECTED' }, false, 'MEDIA_REMOTE_REJECTED'));
      var data = response && response.data ? response.data : {};
      var nestedData = data && data.data && typeof data.data === 'object' ? data.data : {};
      var orderNid = data.order_nid || data.orderNid || nestedData.order_nid || nestedData.orderNid || response.order_nid || response.orderNid || null;
      if (orderNid === null || orderNid === undefined || String(orderNid).trim() === '') {
        return {
          platform: 'media',
          status: 'uncertain',
          title: title,
          resourceId: resourceId,
          errorCode: 'MEDIA_ORDER_ID_MISSING'
        };
      }
      return {
        platform: 'media',
        status: 'order_created',
        title: title,
        resourceId: resourceId,
        thirdId: thirdId || null,
        orderNid: String(orderNid),
      };
    },

    queryOrder: async function (orderNid) {
      try {
        await getClient().orderInfo(orderNid);
      } catch (err) {
        return Object.assign({ orderNid: orderNid }, mediaFailure(err, true, 'MEDIA_NETWORK_ERROR'));
      }

      return {
        platform: 'media',
        status: 'ok',
        orderNid: orderNid,
      };
    },

    getBalance: async function () {
      try {
        await getClient().getBalance();
      } catch (err) {
        return mediaFailure(err, true, 'MEDIA_NETWORK_ERROR');
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

function createPlatformAdapter(runtimeContext) {
  const context = runtimeContext || {};
  const workspacePaths = context.workspacePaths || {};
  const inputDir = workspacePaths.mediaInput || path.join(DIRS.inputDir, "media");
  return {
    id: 'media',
    publicationTarget: { kind: 'resource', granularity: 'resource' },
    contentQueueImport: true,
    scanDir: 'media',

    ensureSession: function() {},

    ensureLoggedIn: async function() {
      return true;
    },


    scanArticles: function() {
      var fs = require("fs");
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
      return { status: "group_blocked", errorCode: "MEDIA_MAIN_PROCESS_REQUIRED" };
    },

    createMediaAdapter: createMediaAdapter,
    createMediaSupplierAdapter: createMediaSupplierAdapter,
  };
}

module.exports = Object.assign(createPlatformAdapter(), {
  createPlatformAdapter: createPlatformAdapter,
});
