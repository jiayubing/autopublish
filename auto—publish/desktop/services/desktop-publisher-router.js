"use strict";

function createDesktopPublisherRouter(options) {
  const value = options || {};
  if (!value.workerPublisher || !value.mediaPublisher) throw new Error("Desktop publishers are required");
  return Object.freeze({
    inspectAccount: value.workerPublisher.inspectAccount,
    publish: function(input, signal) {
      return input && input.target && input.target.kind === "media"
        ? value.mediaPublisher.publish(input, signal)
        : value.workerPublisher.publish(input, signal);
    },
  });
}
module.exports = { createDesktopPublisherRouter };
