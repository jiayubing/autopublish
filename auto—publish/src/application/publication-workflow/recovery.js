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
        const recovery = {
          attemptId: item.attemptId,
          articleId: item.articleId,
          error: uncertainError(),
          ...(item.articleRef
            ? { articleRef: item.articleRef }
            : item.detail && item.detail.articleRef
              ? { articleRef: item.detail.articleRef }
              : {}),
        };
        if (value.articleMutationCoordinator) {
          value.articleMutationCoordinator.markRecoveryUncertain(recovery);
        } else {
          value.operationalStore.markRecoveryUncertain(recovery);
        }
        recoveryCount += 1;
      }
    } while (recoveryPage.hasMore === true);
    const postProcessingCount = await value.postProcessing.drain();
    return Object.freeze({ recoveryCount, postProcessingCount });
  }

  return Object.freeze({ recover });
}

module.exports = { createPublicationRecovery };
