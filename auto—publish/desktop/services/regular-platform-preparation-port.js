"use strict";

const domain = require("../../src/domain");

function fail(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function createRegularPlatformPreparationPort(options) {
  const value = options || {};
  const inspector = value.accountInspector;
  if (!inspector || typeof inspector.inspect !== "function")
    throw fail("REGULAR_ACCOUNT_INSPECTOR_REQUIRED");
  const adapters = new Map();
  for (const adapter of value.adapters || [])
    if (adapter && typeof adapter.id === "string")
      adapters.set(adapter.id, adapter);

  return Object.freeze({
    async preparePlatformSubmission(claim) {
      const input = claim || {};
      const adapter = adapters.get(input.platformId);
      if (!adapter || typeof adapter.preparePlatformSubmission !== "function")
        throw fail("REGULAR_PLATFORM_PREPARATION_UNAVAILABLE");
      const inspectionTask = Object.freeze({
        targetPlatformId: input.platformId,
        accountProfileId: input.accountProfileId,
        preserveCurrentPage: false,
      });
      const inspection = await inspector.inspect(inspectionTask);
      if (
        !inspection ||
        inspection.verified !== true ||
        inspection.accountProfileId !== input.accountProfileId ||
        typeof inspection.remoteFingerprint !== "string" ||
        !inspection.remoteFingerprint
      )
        throw fail("REGULAR_ACCOUNT_PROFILE_UNVERIFIED");
      const prepared = domain.createPreparedSubmission(
        await adapter.preparePlatformSubmission(input),
      );
      return domain.createPreparedSubmission({
        preparedSubmissionEvidenceV1: prepared.preparedSubmissionEvidenceV1,
        submitPreparedPublication: async function () {
          let finalInspection;
          try {
            finalInspection = await inspector.inspect(
              Object.assign({}, inspectionTask, {
                preserveCurrentPage: true,
              }),
            );
          } catch (_) {
            finalInspection = null;
          }
          if (
            !finalInspection ||
            finalInspection.verified !== true ||
            finalInspection.accountProfileId !== input.accountProfileId ||
            finalInspection.remoteFingerprint !== inspection.remoteFingerprint
          )
            return Object.freeze({
              status: "uncertain",
              errorCode: "REGULAR_ACCOUNT_PROFILE_DRIFT",
            });
          return prepared.submitPreparedPublication();
        },
      });
    },
  });
}

module.exports = { createRegularPlatformPreparationPort };
