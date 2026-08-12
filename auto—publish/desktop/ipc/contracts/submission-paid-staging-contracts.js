const {
  arrayField,
  exactObject,
  nullableField,
  optionalField,
} = require("./registry");
const {
  articleRef,
  clientIdentity,
  code,
  count,
  directArgs,
  directInput,
  id,
  include,
  projectArticleRef,
  safeText,
  submissionContract,
} = require("./submission-contract-shared");

const stagingRefsRequest = exactObject({
  articleRefs: arrayField(articleRef, { min: 1, max: 1000 }),
});
const stagingMediaRequest = exactObject({
  articleRefs: arrayField(articleRef, { min: 1, max: 1000 }),
  mediaResourceId: nullableField(id),
});
const stagingListRequest = exactObject({ clientId: clientIdentity });
const stagingMutationItem = exactObject({
  articleRef,
  status: safeText(64, 1),
  idempotent: "boolean",
  reasonCode: optionalField(code),
});
const stagingAddResult = exactObject({
  items: arrayField(stagingMutationItem, { max: 1000 }),
  addedCount: count,
  idempotentCount: count,
});
const stagingRemoveResult = exactObject({
  items: arrayField(stagingMutationItem, { max: 1000 }),
  removedCount: count,
  idempotentCount: count,
});
const stagingMediaResult = exactObject({
  items: arrayField(stagingMutationItem, { max: 1000 }),
  updatedCount: count,
  idempotentCount: count,
  selectedMediaResourceId: nullableField(id),
});
const stagingItem = exactObject({
  articleRef,
  selectedMediaResourceId: nullableField(id),
  createdAt: safeText(64, 1),
  updatedAt: safeText(64, 1),
});
const stagingListResult = exactObject({
  clientId: clientIdentity,
  items: arrayField(stagingItem, { max: 1000 }),
});

const submissionPaidStagingContracts = Object.freeze([
  submissionContract({
    capability: "content.addPaidSubmissionStaging",
    channel: "content:add-paid-submission-staging",
    kind: "command",
    request: stagingRefsRequest,
    success: stagingAddResult,
    fromArgs: directArgs,
    toArgs: directInput,
  }),
  submissionContract({
    capability: "content.removePaidSubmissionStaging",
    channel: "content:remove-paid-submission-staging",
    kind: "command",
    request: stagingRefsRequest,
    success: stagingRemoveResult,
    fromArgs: directArgs,
    toArgs: directInput,
  }),
  submissionContract({
    capability: "content.setPaidSubmissionStagingMedia",
    channel: "content:set-paid-submission-staging-media",
    kind: "command",
    request: stagingMediaRequest,
    success: stagingMediaResult,
    fromArgs: directArgs,
    toArgs: directInput,
  }),
  submissionContract({
    capability: "content.getPaidSubmissionStaging",
    channel: "content:get-paid-submission-staging",
    kind: "query",
    request: stagingListRequest,
    success: stagingListResult,
    fromArgs: directArgs,
    toArgs: directInput,
  }),
]);

function projectStagingMutationItem(value) {
  const input = value || {};
  const output = {
    articleRef: projectArticleRef(input.articleRef || input),
    status: input.status,
    idempotent: input.idempotent === true,
  };
  include(output, input, "reasonCode");
  return output;
}

function projectPaidStagingAddResult(value) {
  const input = value || {};
  return {
    items: (input.items || []).map(projectStagingMutationItem),
    addedCount: input.addedCount,
    idempotentCount: input.idempotentCount,
  };
}

function projectPaidStagingRemoveResult(value) {
  const input = value || {};
  return {
    items: (input.items || []).map(projectStagingMutationItem),
    removedCount: input.removedCount,
    idempotentCount: input.idempotentCount,
  };
}

function projectPaidStagingMediaResult(value) {
  const input = value || {};
  return {
    items: (input.items || []).map(projectStagingMutationItem),
    updatedCount: input.updatedCount,
    idempotentCount: input.idempotentCount,
    selectedMediaResourceId:
      input.selectedMediaResourceId === undefined
        ? null
        : input.selectedMediaResourceId,
  };
}

function projectPaidStagingList(value) {
  const input = value || {};
  return {
    clientId: input.clientId,
    items: (input.items || []).map((item) => ({
      articleRef: projectArticleRef(item.articleRef || item),
      selectedMediaResourceId:
        item.selectedMediaResourceId === undefined
          ? null
          : item.selectedMediaResourceId,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    })),
  };
}

const submissionPaidStagingContractFixtures = Object.freeze([
  {
    channel: "content:add-paid-submission-staging",
    owner: "content",
    productionCaller: "desktopConsole.content.addPaidSubmissionStaging",
    request: {
      articleRefs: [{ clientId: "client-1", articleId: "article-1" }],
    },
    result: {
      items: [
        {
          articleRef: { clientId: "client-1", articleId: "article-1" },
          status: "staged",
          idempotent: false,
        },
      ],
      addedCount: 1,
      idempotentCount: 0,
    },
  },
  {
    channel: "content:remove-paid-submission-staging",
    owner: "content",
    productionCaller: "desktopConsole.content.removePaidSubmissionStaging",
    request: {
      articleRefs: [{ clientId: "client-1", articleId: "article-1" }],
    },
    result: {
      items: [
        {
          articleRef: { clientId: "client-1", articleId: "article-1" },
          status: "removed",
          idempotent: false,
        },
      ],
      removedCount: 1,
      idempotentCount: 0,
    },
  },
  {
    channel: "content:set-paid-submission-staging-media",
    owner: "content",
    productionCaller: "desktopConsole.content.setPaidSubmissionStagingMedia",
    request: {
      articleRefs: [{ clientId: "client-1", articleId: "article-1" }],
      mediaResourceId: "media-1",
    },
    result: {
      items: [
        {
          articleRef: { clientId: "client-1", articleId: "article-1" },
          status: "media-updated",
          idempotent: false,
        },
      ],
      updatedCount: 1,
      idempotentCount: 0,
      selectedMediaResourceId: "media-1",
    },
  },
  {
    channel: "content:get-paid-submission-staging",
    owner: "content",
    productionCaller: "desktopConsole.content.getPaidSubmissionStaging",
    request: { clientId: "client-1" },
    result: { clientId: "client-1", items: [] },
  },
]);

module.exports = {
  submissionPaidStagingContracts,
  submissionPaidStagingContractFixtures,
  projectPaidStagingAddResult,
  projectPaidStagingRemoveResult,
  projectPaidStagingMediaResult,
  projectPaidStagingList,
};
