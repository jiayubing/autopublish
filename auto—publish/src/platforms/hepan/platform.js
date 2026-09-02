"use strict";

const definition = require("./definition");
const { createHepanAdapter } = require("./adapter");

function createPlatform(runtimeContext) {
  const context = runtimeContext || {};
  const adapter = createHepanAdapter({
    getPlatformSettingsService: context.getPlatformSettingsService,
  });
  return {
    regularSubmission: adapter.regularSubmission,
    accountInspection: adapter.accountInspection,
    remoteReviewContribution: adapter.remoteReview,
    settingsContribution: {
      createSettingsAdapter(settingsContext) {
        return require("../../../desktop/services/platform-settings/hepan-settings-adapter").createHepanSettingsAdapter(settingsContext || {});
      },
    },
  };
}
module.exports = Object.freeze({ definition, createPlatform });
