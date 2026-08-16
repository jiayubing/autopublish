"use strict";

const path = require("node:path");

const domain = require("../../domain");
const {
  reportDiagnostic,
} = require("../../diagnostics/diagnostic-producer");
const {
  cleanupExpiredHepanPayloads,
  createHepanAdapter,
} = require("./adapter");

function fail(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function requireSettingsService(provider) {
  const service = typeof provider === "function" ? provider() : null;
  if (!service) throw fail("HEPAN_CONFIG_NOT_SET");
  return service;
}

function reportTemporaryCredentialCleanupFailure() {
  reportDiagnostic({
    code: "HEPAN_TEMPORARY_CLEANUP_FAILED",
    module: "hepan-settings-backed-runtime",
    category: "storage",
    operationId: "temporary-credential-cleanup",
    metadata: { action: "cleanup" },
  });
}

function createHepanSettingsBackedRuntime(options) {
  const value = options || {};
  const getSettingsService = value.getPlatformSettingsService;
  const createPublicationAdapter = value.createHepanAdapter || createHepanAdapter;
  const cleanupPayloads =
    value.cleanupExpiredHepanPayloads || cleanupExpiredHepanPayloads;
  const tempRoot = value.paths && value.paths.tmp;
  const payloadRoot =
    typeof tempRoot === "string" ? path.join(tempRoot, "hepan") : null;

  return Object.freeze({
    regularSubmission: Object.freeze({
      async preparePlatformSubmission(claim, imagePlan) {
        if (typeof getSettingsService !== "function" || !payloadRoot)
          throw fail("HEPAN_SETTINGS_RUNTIME_DEPENDENCIES_REQUIRED");
        const settingsService = requireSettingsService(getSettingsService);
        if (typeof settingsService.getAdapterForRuntime !== "function")
          throw fail("HEPAN_CONFIG_NOT_SET");
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
          getRuntime: function () {
            return preparedRuntime;
          },
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
              try {
                temporaryCookie.cleanup();
              } catch (_) {
                reportTemporaryCredentialCleanupFailure();
              }
            }
          },
        });
      },
    }),
    accountInspection: Object.freeze({
      prepare: async function () {},
      inspect: async function () {
        try {
          const settingsService = requireSettingsService(getSettingsService);
          if (typeof settingsService.test !== "function")
            return Object.freeze({ verified: false });
          const result = await settingsService.test("hepan", {});
          const account = result && result.account;
          if (
            !result ||
            result.ok !== true ||
            !account ||
            typeof account.uid !== "string" ||
            !/^\d{1,20}$/.test(account.uid) ||
            typeof account.displayName !== "string" ||
            !account.displayName.trim()
          )
            return Object.freeze({ verified: false });
          return Object.freeze({
            verified: true,
            remoteAccountId: account.uid,
            displayName: account.displayName,
          });
        } catch (_) {
          return Object.freeze({ verified: false });
        }
      },
    }),
  });
}

module.exports = { createHepanSettingsBackedRuntime };
