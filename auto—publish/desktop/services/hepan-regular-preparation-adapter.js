"use strict";

const path = require("node:path");

const domain = require("../../src/domain");
const {
  cleanupExpiredHepanPayloads,
  createHepanAdapter,
} = require("../../src/platforms/hepan/adapter");

function fail(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function createHepanRegularPreparationAdapter(options) {
  const value = options || {};
  const settingsService = value.platformSettingsService;
  const createPublicationAdapter =
    value.createHepanAdapter || createHepanAdapter;
  const cleanupPayloads =
    value.cleanupExpiredHepanPayloads || cleanupExpiredHepanPayloads;
  const tempRoot = value.paths && value.paths.tmp;
  if (
    !settingsService ||
    typeof settingsService.getAdapterForRuntime !== "function" ||
    typeof tempRoot !== "string"
  )
    throw fail("HEPAN_REGULAR_PREPARATION_DEPENDENCIES_REQUIRED");
  const payloadRoot = path.join(tempRoot, "hepan");

  return Object.freeze({
    id: "hepan",
    async preparePlatformSubmission(claim, imagePlan) {
      const runtime = settingsService.getAdapterForRuntime("hepan");
      if (
        !runtime.adapter ||
        typeof runtime.adapter.createTemporaryCookie !== "function"
      )
        throw fail("HEPAN_CONFIG_NOT_SET");
      if (typeof runtime.adapter.cleanupExpiredTemporaryFiles === "function")
        runtime.adapter.cleanupExpiredTemporaryFiles();
      cleanupPayloads({ tempDir: payloadRoot });
      const preparedRuntime = {
        pythonPath: runtime.config.pythonPath,
        cookiePath: "",
        categoryId: runtime.config.categoryId,
        vendorDir: runtime.config.vendorDir || "",
      };
      const adapter = createPublicationAdapter({
        tempDir: payloadRoot,
        runtime: preparedRuntime,
      });
      const prepared = await adapter.preparePlatformSubmission(
        claim,
        imagePlan,
      );
      let consumed = false;
      return domain.createPreparedSubmission({
        preparedSubmissionEvidenceV1: prepared.preparedSubmissionEvidenceV1,
        submitPreparedPublication: async function () {
          if (consumed)
            return Object.freeze({
              status: "uncertain",
              errorCode: "REMOTE_RESULT_UNKNOWN",
            });
          consumed = true;
          const temporaryCookie = runtime.adapter.createTemporaryCookie(
            runtime.config,
          );
          preparedRuntime.cookiePath = temporaryCookie.cookiePath;
          try {
            return await prepared.submitPreparedPublication();
          } finally {
            preparedRuntime.cookiePath = "";
            temporaryCookie.cleanup();
          }
        },
      });
    },
  });
}

module.exports = { createHepanRegularPreparationAdapter };
