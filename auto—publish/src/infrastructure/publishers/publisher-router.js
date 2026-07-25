"use strict";
const domain = require("../../domain");
const { createLegacyAdapterPublisher } = require("./legacy-adapter-publisher");

function createPublisherRouter(options) {
  const value = options || {},
    adapters = value.adapters || {};
  return domain.validatePublisher({
    inspectAccount: async function () {
      return Object.freeze({
        accountProfileId: "router",
        displayName: "Publisher router",
      });
    },
    publish: async function (input, signal) {
      const target = domain.parsePublicationTarget(input.target);
      const adapterId = target.kind === "media" ? "media" : target.platformId;
      const adapter = adapters[adapterId];
      if (!adapter)
        return {
          status: "failed",
          error: {
            code: "PUBLISHER_NOT_REGISTERED",
            category: "validation",
            retryability: "never",
            userMessage: "未配置目标投稿平台",
          },
        };
      return createLegacyAdapterPublisher({
        adapter,
        accountProfileId: target.accountProfileId,
      }).publish(input, signal);
    },
  });
}
module.exports = { createPublisherRouter };
