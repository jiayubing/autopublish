"use strict";
const definition = require("./definition");
const { createPlatformAdapter } = require("./adapter");
const {
  createHepanSettingsBackedRuntime,
} = require("./settings-backed-runtime");

function createPlatform(runtimeContext) {
  const context = runtimeContext || {};
  const adapter = createPlatformAdapter(
    Object.assign({}, context, { scanDir: definition.scanDir }),
  );
  if (context.hepanRuntime) adapter.setRuntimeConfig(context.hepanRuntime);
  const settingsRuntime = createHepanSettingsBackedRuntime({
    getPlatformSettingsService: context.getPlatformSettingsService,
    paths: context.workspacePaths,
  });
  return {
    regularSubmission: settingsRuntime.regularSubmission,
    legacyQueue: {
      scan: adapter.scanArticles,
      parse: adapter.parseArticleFiles,
      publish: async function (article, options) { await adapter.ensureSession(); await adapter.ensureLoggedIn(options || {}); return adapter.publishArticle(article, options || {}); },
      close: function () { try { return adapter.closeSession(); } finally { adapter.clearRuntimeConfig(); } },
    },
    accountInspection: settingsRuntime.accountInspection,
    settingsContribution: {
      createSettingsAdapter: function (context) {
        return require("../../../desktop/services/platform-settings/hepan-settings-adapter").createHepanSettingsAdapter(
          context || {},
        );
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
