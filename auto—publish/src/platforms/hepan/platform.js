"use strict";
const definition = require("./definition");
const { createPlatformAdapter } = require("./adapter");

function createPlatform(runtimeContext) {
  const adapter = createPlatformAdapter(
    Object.assign({}, runtimeContext || {}, { scanDir: definition.scanDir }),
  );
  if (runtimeContext && runtimeContext.hepanRuntime) adapter.setRuntimeConfig(runtimeContext.hepanRuntime);
  return {
    regularSubmission: { preparePlatformSubmission: adapter.preparePlatformSubmission },
    legacyQueue: {
      scan: adapter.scanArticles,
      parse: adapter.parseArticleFiles,
      publish: async function (article, options) { await adapter.ensureSession(); await adapter.ensureLoggedIn(options || {}); return adapter.publishArticle(article, options || {}); },
      close: function () { try { return adapter.closeSession(); } finally { adapter.clearRuntimeConfig(); } },
    },
    accountInspection: { prepare: adapter.ensureSession, inspect: adapter.inspectAccount },
    settingsContribution: {
      createSettingsAdapter: function (context) {
        if (!context || typeof context.createSettingsAdapter !== "function") { const error = new Error("PLATFORM_SETTINGS_FACTORY_REQUIRED"); error.code = "PLATFORM_SETTINGS_FACTORY_REQUIRED"; throw error; }
        return context.createSettingsAdapter();
      },
    },
    runtimeArtifactContribution: {
      describe: function () {
        return Object.freeze({ platformId: "hepan", requirements: Object.freeze([
          Object.freeze({ artifactId: "publisher-script", kind: "file", packagedPath: "src/platforms/hepan/hepan_publish.py", required: true, smokeCheck: "hepan-script" }),
          Object.freeze({ artifactId: "vendor-sentinel", kind: "directory-sentinel", packagedPath: "resources/hepan/vendor-pure/requests/__init__.py", required: true, smokeCheck: "hepan-vendor" }),
        ]) });
      },
    },
  };
}
module.exports = Object.freeze({ definition, createPlatform });
