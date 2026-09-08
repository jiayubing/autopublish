"use strict";

function createAiExecutionService(options) {
  const value = options || {};
  const scheduler = value.scheduler;
  const provider = value.aiProviderService;
  if (!scheduler || typeof scheduler.schedule !== "function" || !provider || typeof provider.createClient !== "function") {
    throw new Error("AI_EXECUTION_DEPENDENCIES_REQUIRED");
  }

  function complete(groupId, messages, options) {
    const requestOptions = options || {};
    return scheduler.schedule(groupId, function() {
      const client = provider.createClient();
      return client.complete(messages, requestOptions);
    }, { signal: requestOptions.signal });
  }

  function createClient(groupId) {
    if (typeof groupId !== "string" || !groupId.trim()) throw new Error("AI_EXECUTION_GROUP_REQUIRED");
    return {
      complete: function(messages, options) {
        return complete(groupId, messages, options);
      },
    };
  }

  return {
    complete: complete,
    createClient: createClient,
    getState: function() { return scheduler.getState(); },
  };
}

module.exports = { createAiExecutionService };
