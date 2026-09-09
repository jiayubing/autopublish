function playwrightUnavailable(message) {
  const error = new Error(message);
  error.code = "PLAYWRIGHT_UNAVAILABLE";
  return error;
}

function assertPlaywrightAvailable(runtimeDiagnosticsService) {
  if (!runtimeDiagnosticsService || typeof runtimeDiagnosticsService.diagnose !== "function") return;
  const diagnostics = runtimeDiagnosticsService.diagnose();
  if (!diagnostics.tools.playwrightNode.command) {
    throw playwrightUnavailable("Bundled Playwright Node is unavailable");
  }
  if (!diagnostics.tools.playwrightCli.command) {
    throw playwrightUnavailable("Bundled Playwright CLI is unavailable");
  }
  if (!diagnostics.tools.browserChannel.configured) {
    throw playwrightUnavailable("Browser channel configuration is invalid");
  }
  if (diagnostics.capabilities && diagnostics.capabilities.browserChannel && diagnostics.capabilities.browserChannel.state === "unavailable") {
    throw playwrightUnavailable("Browser channel is unavailable");
  }
}

module.exports = { assertPlaywrightAvailable };
