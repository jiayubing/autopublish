"use strict";

const { uncertainError } = require("./errors");

function createPublicationRecovery(options) {
  const value = options || {};
  if (!value.operationalStore || !value.postProcessing)
    throw new Error("Publication recovery dependencies are required");

  async function recover() {
    let recoveryCount = 0;
    let recoveryPage;
    do {
      recoveryPage = value.operationalStore.listActionableRecovery({ includeManualCheck: false });
      for (const item of recoveryPage) {
        if (item.state === "manual_check") continue;
        value.operationalStore.markRecoveryUncertain({
          attemptId: item.attemptId,
          error: uncertainError(),
        });
        recoveryCount += 1;
      }
    } while (recoveryPage.hasMore === true);
    const postProcessingCount = await value.postProcessing.drain();
    return Object.freeze({ recoveryCount, postProcessingCount });
  }

  return Object.freeze({ recover });
}

module.exports = { createPublicationRecovery };
