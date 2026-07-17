function assertPlaywrightAvailable(runtimeDiagnosticsService) {
  if (!runtimeDiagnosticsService || typeof runtimeDiagnosticsService.diagnose !== "function") return;
  const diagnostics = runtimeDiagnosticsService.diagnose();
  if (!diagnostics.tools.playwrightNode.command) {
    const error = new Error("内置 Playwright Node 不可用，请重新安装应用。");
    error.code = "PLAYWRIGHT_NODE_UNAVAILABLE";
    throw error;
  }
  if (!diagnostics.tools.playwrightCli.command) {
    const error = new Error("内置 Playwright CLI 不可用，请重新安装应用。");
    error.code = "PLAYWRIGHT_CLI_UNAVAILABLE";
    throw error;
  }
  if (!diagnostics.tools.browserChannel.available) {
    const error = new Error("浏览器通道不可用，请安装 Edge 或在应用级设置中选择可用的 Chrome 通道。");
    error.code = "BROWSER_CHANNEL_UNAVAILABLE";
    throw error;
  }
}

module.exports = { assertPlaywrightAvailable };
