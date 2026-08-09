const { arrayField, exactObject } = require("./registry");
const {
  emptyRequest,
  id,
  noArgs,
  noLegacyInput,
  safeText,
  submissionContract,
} = require("./submission-contract-shared");

const platform = exactObject({
  id,
  displayName: safeText(200, 1),
  contentQueueImport: "boolean",
});

const submissionPlatformContracts = Object.freeze([
  submissionContract({
    capability: "content.listSubmissionPlatforms",
    channel: "content:list-submission-platforms",
    kind: "query",
    request: emptyRequest,
    success: exactObject({ platforms: arrayField(platform, { max: 32 }) }),
    fromArgs: noArgs,
    toArgs: noLegacyInput,
  }),
]);

function projectSubmissionPlatforms(value) {
  return {
    platforms: (Array.isArray(value) ? value : []).map((item) => ({
      id: item.id,
      displayName: item.displayName,
      contentQueueImport: item.contentQueueImport === true,
    })),
  };
}

const submissionPlatformContractFixtures = Object.freeze([
  {
    channel: "content:list-submission-platforms",
    owner: "content",
    productionCaller: "desktopConsole.content.listSubmissionPlatforms",
    request: {},
    result: {
      platforms: [
        { id: "toutiao", displayName: "头条", contentQueueImport: true },
      ],
    },
  },
]);

module.exports = {
  submissionPlatformContracts,
  submissionPlatformContractFixtures,
  projectSubmissionPlatforms,
};
