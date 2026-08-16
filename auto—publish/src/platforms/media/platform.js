"use strict";
const definition = require("./definition");
function createPlatform() {
  return {
    settingsContribution: {
      createSettingsAdapter: function (context) {
        return require("../../../desktop/services/platform-settings/media-settings-adapter").createMediaSettingsAdapter(
          context || {},
        );
      },
    },
  };
}
module.exports = Object.freeze({ definition, createPlatform });
