"use strict";
const definition = require("./definition");
function createPlatform() {
  return {
    settingsContribution: {
      createSettingsAdapter: function (context) {
        if (!context || typeof context.createSettingsAdapter !== "function") { const error = new Error("PLATFORM_SETTINGS_FACTORY_REQUIRED"); error.code = "PLATFORM_SETTINGS_FACTORY_REQUIRED"; throw error; }
        return context.createSettingsAdapter();
      },
    },
  };
}
module.exports = Object.freeze({ definition, createPlatform });
