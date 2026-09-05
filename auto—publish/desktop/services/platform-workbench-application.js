const { assertPlaywrightAvailable } = require("./playwright-capability");
const { createPlatformSessionService } = require("./platform-session-service");
const {
  projectPlatformQueue,
} = require("../application/read-models/platform-read-model");

function createPlatformWorkbenchApplication(options) {
  const values = options || {};
  const directoryEntries = Array.isArray(values.directoryEntries)
    ? values.directoryEntries
    : [];
  const adapters = {};
  (values.loginSessionPorts || []).forEach((platform) => {
    if (platform && platform.port) adapters[platform.id] = platform.port;
  });
  const ensurePlaywright = typeof values.assertPlaywrightAvailable === "function"
    ? values.assertPlaywrightAvailable
    : () => assertPlaywrightAvailable(values.runtimeDiagnosticsService);
  const platformSessionService = values.platformSessionService || createPlatformSessionService({
    adapters,
    assertPlaywrightAvailable: ensurePlaywright,
  });

  async function getQueue() {
    const ordinaryPlatforms = directoryEntries.filter(
      (platform) => platform.publicationTargetKind === "platform",
    );
    // The physical input-directory queue is retired. Keep this IPC projection as
    // a platform catalog for renderer compatibility; live submission items come
    // from the regular queue application instead.
    return projectPlatformQueue({
      platforms: ordinaryPlatforms.map((platform) => ({
        id: platform.id,
        displayName: platform.displayName,
        loginAvailable: platformSessionService.supports(platform.id),
      })),
      queue: [],
    });
  }

  return Object.freeze({
    getQueue,
    openLogin: (input) => platformSessionService.openLogin(input.platformId),
    checkLogin: (input) => platformSessionService.checkLogin(input.platformId),
  });
}

module.exports = { createPlatformWorkbenchApplication };
