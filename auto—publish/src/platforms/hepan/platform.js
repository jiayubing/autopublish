"use strict";

const definition = require("./definition");
const { createHepanSettingsBackedRuntime } = require("./settings-backed-runtime");

function createPlatform(runtimeContext) {
  const context = runtimeContext || {};
  const settingsRuntime = createHepanSettingsBackedRuntime({
    getPlatformSettingsService: context.getPlatformSettingsService,
  });
  return {
    regularSubmission: settingsRuntime.regularSubmission,
    accountInspection: settingsRuntime.accountInspection,
    settingsContribution: {
      createSettingsAdapter(settingsContext) {
        return require("../../../desktop/services/platform-settings/hepan-settings-adapter").createHepanSettingsAdapter(settingsContext || {});
      },
    },
  };
}
module.exports = Object.freeze({ definition, createPlatform });
