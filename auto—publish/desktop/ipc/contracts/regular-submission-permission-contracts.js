"use strict";

const { arrayField, exactObject, integerField } = require("./registry");
const {
  contentContract,
  directArgs,
  directInput,
  id,
  text,
} = require("./content-core-contract-shared");

const permissionItem = exactObject({
  articleId: id,
  allowed: "boolean",
  reasonCodes: arrayField(text(128), { max: 32 }),
});

const regularSubmissionPermissionContracts = Object.freeze([
  contentContract({
    capability: "content.listRegularSubmissionPermissions",
    channel: "content:list-regular-submission-permissions",
    feature: "content",
    kind: "query",
    request: exactObject({
      clientId: id,
      articleIds: arrayField(id, { min: 1, max: 1000 }),
    }),
    success: exactObject({
      clientId: id,
      revision: integerField({ min: 0 }),
      items: arrayField(permissionItem, { max: 1000 }),
    }),
    fromArgs: directArgs,
    toArgs: directInput,
  }),
]);

function projectRegularSubmissionPermissions(value) {
  const snapshot =
    value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return {
    clientId: snapshot.clientId,
    revision: snapshot.revision,
    items: Array.isArray(snapshot.items)
      ? snapshot.items.map(function (item) {
          return {
            articleId: item && item.articleId,
            allowed: Boolean(item && item.allowed === true),
            reasonCodes: Array.isArray(item && item.reasonCodes)
              ? item.reasonCodes.map(function (reasonCode) {
                  return String(reasonCode);
                })
              : [],
          };
        })
      : [],
  };
}

module.exports = {
  projectRegularSubmissionPermissions,
  regularSubmissionPermissionContracts,
};
