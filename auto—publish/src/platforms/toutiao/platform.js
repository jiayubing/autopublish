"use strict";
const definition = require("./definition");

function createPlatform(runtimeContext) {
  const adapterPath = require.resolve("./adapter");
  delete require.cache[adapterPath];
  const adapter = require("./adapter").createPlatformAdapter(runtimeContext);
  return {
    legacyQueue: {
      scan: function () { return adapter.scanArticles(definition.scanDir); },
      parse: adapter.parseArticleFiles,
      publish: async function (article, options) { await adapter.ensureSession(); await adapter.ensureLoggedIn(options || {}); return adapter.publishArticle(article, options || {}); },
      close: adapter.closeSession,
    },
    loginSession: {
      open: adapter.openLogin,
      check: async function () { await adapter.ensureSession(); return adapter.checkLogin(); },
      save: adapter.saveSession,
      close: adapter.closeSession,
    },
    accountInspection: { prepare: adapter.ensureAccountInspectionReady, inspect: adapter.inspectAccount },
  };
}
module.exports = Object.freeze({ definition, createPlatform });
