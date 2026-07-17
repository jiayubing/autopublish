function assertPlaywrightAvailable(runtimeDiagnosticsService) {
  if (!runtimeDiagnosticsService || typeof runtimeDiagnosticsService.diagnose !== "function") return;
  const diagnostics = runtimeDiagnosticsService.diagnose();
  if (!diagnostics.tools.playwrightNode.command) {
    const error = new Error("Bundled Playwright Node is unavailable");
    error.code = "PLAYWRIGHT_NODE_UNAVAILABLE";
    throw error;
  }
  if (!diagnostics.tools.playwrightCli.command) {
    const error = new Error("Bundled Playwright CLI is unavailable");
    error.code = "PLAYWRIGHT_CLI_UNAVAILABLE";
    throw error;
  }
  if (!diagnostics.tools.browserChannel.configured) {
    const error = new Error("Browser channel configuration is invalid");
    error.code = "BROWSER_CHANNEL_INVALID";
    throw error;
  }
  if (diagnostics.capabilities && diagnostics.capabilities.browserChannel && diagnostics.capabilities.browserChannel.state === "unavailable") {
    const error = new Error("Browser channel is unavailable");
    error.code = diagnostics.capabilities.browserChannel.errorCode || "BROWSER_CHANNEL_UNAVAILABLE";
    throw error;
  }
}

module.exports = { assertPlaywrightAvailable };
