"use strict";
const definition = require("./definition");
const { createPlatformAdapter } = require("./adapter");

function createPlatform(runtimeContext) {
  const adapter = createPlatformAdapter(runtimeContext);
  return {
    regularSubmission: { preparePlatformSubmission: adapter.preparePlatformSubmission },
    loginSession: {
      open: adapter.openLogin,
      check: async function () { await adapter.ensureSession(); return adapter.checkLogin(); },
      save: adapter.saveSession,
      close: adapter.closeSession,
    },
    accountInspection: { prepare: adapter.ensureAccountInspectionReady, inspect: adapter.inspectAccount },
    clientProfileContribution: {
      requirement: Object.freeze({ profileKey: "liejuPublicationProfile", requiredFields: Object.freeze(["city", "contact", "phone"]) }),
      createProfileReader: function (contentProfilePort) {
        if (!contentProfilePort || typeof contentProfilePort.read !== "function") {
          const error = new Error("CONTENT_PROFILE_PORT_REQUIRED"); error.code = "CONTENT_PROFILE_PORT_REQUIRED"; throw error;
        }
        return Object.freeze({ read: function (input) { return contentProfilePort.read(Object.assign({}, input, { profileKey: "liejuPublicationProfile" })); } });
      },
    },
  };
}
module.exports = Object.freeze({ definition, createPlatform });
