"use strict";

const { uncertainError } = require("./errors");

function createPublicationRecovery(options) {
  const value = options || {};
  if (!value.operationalStore || !value.postProcessing)
    throw new Error("Publication recovery dependencies are required");

  async function recover() {
    const recovery = value.operationalStore.listActionableRecovery();
    let recoveryCount = 0;
    for (const item of recovery) {
      if (item.state === "manual_check") continue;
      value.operationalStore.markRecoveryUncertain({
        attemptId: item.attemptId,
        error: uncertainError(),
      });
      recoveryCount += 1;
    }
    const postProcessingCount = await value.postProcessing.drain();
    return Object.freeze({ recoveryCount, postProcessingCount });
  }

  return Object.freeze({ recover });
}

module.exports = { createPublicationRecovery };
