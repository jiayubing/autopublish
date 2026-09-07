"use strict";

async function createPlatformRuntimeComposition(options) {
  const value = options || {};
  const workspaceRoot = value.workspaceRoot;
  const paths = value.paths;
  if (typeof workspaceRoot !== "string" || !workspaceRoot.trim())
    throw new Error("PLATFORM_RUNTIME_WORKSPACE_REQUIRED");
  if (!paths || typeof paths !== "object")
    throw new Error("PLATFORM_RUNTIME_PATHS_REQUIRED");
  if (!value.operationalStore)
    throw new Error("PLATFORM_RUNTIME_OPERATIONAL_STORE_REQUIRED");
  if (!value.clientImageLibrary)
    throw new Error("PLATFORM_RUNTIME_IMAGE_LIBRARY_REQUIRED");

  let platformSettingsService = null;
  let disposed = false;

  try {
    const { loadPlatforms } = require("../../src/core/platforms");
    const platformRuntimeContext = Object.freeze({
      ...require("../../src/platforms/platform-runtime-context").createPlatformRuntimeContextFromWorkspacePaths(
        paths,
      ),
      imageAssetReader: value.clientImageLibrary.imageAssetReader,
      getPlatformSettingsService: function () {
        return platformSettingsService;
      },
    });
    const loadedPlatforms = loadPlatforms({ runtimeContext: platformRuntimeContext });
    const directoryEntries = Object.freeze(
      loadedPlatforms.map(function (platform) {
        return platform.submissionDirectoryEntry;
      }),
    );
    const regularDirectoryEntries = Object.freeze(
      loadedPlatforms
        .filter(function (platform) {
          return Boolean(platform.regularSubmission);
        })
        .map(function (platform) {
          return platform.submissionDirectoryEntry;
        }),
    );
    const regularSubmissionPorts = Object.freeze(
      loadedPlatforms
        .filter(function (platform) {
          return Boolean(platform.regularSubmission);
        })
        .map(function (platform) {
          return Object.freeze({
            id: platform.definition.id,
            preparePlatformSubmission:
              platform.regularSubmission.preparePlatformSubmission,
          });
        }),
    );
    const accountInspectionPorts = Object.freeze(
      loadedPlatforms
        .filter(function (platform) {
          return Boolean(platform.accountInspection);
        })
        .map(function (platform) {
          return Object.freeze({
            id: platform.definition.id,
            port: platform.accountInspection,
          });
        }),
    );
    const remoteReviewPorts = Object.freeze(
      loadedPlatforms
        .filter(function (platform) {
          return Boolean(platform.remoteReviewContribution);
        })
        .map(function (platform) {
          return Object.freeze({
            id: platform.definition.id,
            port: platform.remoteReviewContribution,
          });
        }),
    );
    const loginSessionPorts = Object.freeze(
      loadedPlatforms
        .filter(function (platform) {
          return Boolean(platform.loginSession);
        })
        .map(function (platform) {
          return Object.freeze({
            id: platform.definition.id,
            port: platform.loginSession,
          });
        }),
    );
    const legacyQueuePorts = Object.freeze(
      loadedPlatforms
        .filter(function (platform) {
          return Boolean(platform.legacyQueue);
        })
        .map(function (platform) {
          return Object.freeze({
            id: platform.definition.id,
            port: platform.legacyQueue,
          });
        }),
    );
    const settingsAdapters = Object.freeze(
      loadedPlatforms
        .filter(function (platform) {
          return Boolean(platform.settingsContribution);
        })
        .map(function (platform) {
          return platform.settingsContribution.createSettingsAdapter({
            localStateRoot: paths.localState,
          });
        }),
    );
    platformSettingsService =
      require("../services/platform-settings-service").createPlatformSettingsService(
        {
          userDataPath: value.userDataPath,
          safeStorage: value.safeStorage,
          env: process.env,
          localStateRoot: paths.localState,
          adapters: settingsAdapters,
          getTaskState: value.getTaskState,
        },
      );
    const contentProfilePort = Object.freeze({
      read: function (input) {
        const profile = input || {};
        return require("../../src/content/client-knowledge").getClientPublicationProfile(
          workspaceRoot,
          profile.clientId,
          profile.profileKey,
        );
      },
    });
    const clientProfileReaders = Object.freeze(
      loadedPlatforms
        .filter(function (platform) {
          return Boolean(platform.clientProfileContribution);
        })
        .map(function (platform) {
          return Object.freeze({
            id: platform.definition.id,
            requirement: platform.clientProfileContribution.requirement,
            reader:
              platform.clientProfileContribution.createProfileReader(
                contentProfilePort,
              ),
          });
        }),
    );
    const submissionPlatformDirectory =
      require("../services/submission-target-catalog").createSubmissionTargetCatalog(
        { directoryEntries: regularDirectoryEntries },
      );
    const platformAccountBindingStore =
      require("../services/platform-account-binding-store").createPlatformAccountBindingStore(
        { localStateRoot: paths.localState },
      );
    const platformAccountIdentityService =
      require("../services/platform-account-identity-service").createPlatformAccountIdentityService(
        {
          adapters: Object.fromEntries(
            accountInspectionPorts.map(function (platform) {
              return [platform.id, platform.port];
            }),
          ),
        },
      );
    const platformAccountProfileService =
      require("../services/platform-account-profile-service").createPlatformAccountProfileService(
        {
          operationalStore: value.operationalStore,
          bindingStore: platformAccountBindingStore,
          identityService: platformAccountIdentityService,
        },
      );
    const accountInspector =
      require("../services/platform-account-inspector").createPlatformAccountInspector(
        {
          operationalStore: value.operationalStore,
          bindingStore: platformAccountBindingStore,
          identityService: platformAccountIdentityService,
        },
      );
    const assertPlaywrightAvailable = function () {
      return require("../services/playwright-capability").assertPlaywrightAvailable(
        value.diagnosticsService,
      );
    };
    const platformSessionService =
      require("../services/platform-session-service").createPlatformSessionService(
        {
          adapters: Object.fromEntries(
            loginSessionPorts.map(function (platform) {
              return [platform.id, platform.port];
            }),
          ),
          assertPlaywrightAvailable,
        },
      );

    return Object.freeze({
      directoryEntries,
      regularDirectoryEntries,
      regularSubmissionPorts,
      accountInspectionPorts,
      remoteReviewPorts,
      loginSessionPorts,
      legacyQueuePorts,
      clientProfileReaders,
      submissionPlatformDirectory,
      platformSettingsService,
      platformAccountBindingStore,
      platformAccountIdentityService,
      platformAccountProfileService,
      accountInspector,
      platformSessionService,
      assertPlaywrightAvailable,
      dispose: async function () {
        if (disposed) return;
        disposed = true;
        if (
          platformSettingsService &&
          typeof platformSettingsService.dispose === "function"
        )
          await platformSettingsService.dispose();
      },
    });
  } catch (error) {
    if (
      platformSettingsService &&
      typeof platformSettingsService.dispose === "function"
    ) {
      try {
        await platformSettingsService.dispose();
      } catch (_) {}
    }
    throw error;
  }
}

module.exports = { createPlatformRuntimeComposition };
