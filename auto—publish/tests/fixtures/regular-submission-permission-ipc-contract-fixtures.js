"use strict";

const regularSubmissionPermissionIpcContractFixtures = Object.freeze([
  {
    capability: "content.listRegularSubmissionPermissions",
    channel: "content:list-regular-submission-permissions",
    owner: "content",
    request: {
      clientId: "client-1",
      articleIds: ["article-1"],
    },
    result: {
      clientId: "client-1",
      revision: 1,
      items: [
        {
          articleId: "article-1",
          allowed: true,
          reasonCodes: [],
        },
      ],
    },
  },
]);

module.exports = { regularSubmissionPermissionIpcContractFixtures };
