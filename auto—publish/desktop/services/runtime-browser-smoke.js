"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  execFileAsync,
  safeProbeError,
} = require("./runtime-diagnostics-probes");
const {
  reportDiagnostic,
} = require("../../src/diagnostics/diagnostic-producer");

function diagnose(code, action) {
  reportDiagnostic({
    code,
    module: "runtime-browser-smoke",
    category: "transport",
    operationId: "runtime-browser-smoke",
    metadata: { action },
  });
}

async function probeBrowserRuntime(options) {
  const opts = options || {};
  const diagnostics = opts.diagnose();
  const node = diagnostics.tools.playwrightNode.command;
  const cli = diagnostics.tools.playwrightCli.command;
  const browser = diagnostics.tools.browserChannel.channel;
  if (!node) throw safeProbeError("PLAYWRIGHT_NODE_UNAVAILABLE");
  if (!cli) throw safeProbeError("PLAYWRIGHT_CLI_UNAVAILABLE");
  if (!browser) throw safeProbeError("BROWSER_CHANNEL_UNAVAILABLE");

  const temporaryRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "autopublish-runtime-self-check-"),
  );
  const daemonDirectory = path.join(temporaryRoot, "daemon");
  const profileDirectory = path.join(temporaryRoot, "profile");
  const baseEnvironment = opts.env || process.env;
  const environment = Object.assign({}, baseEnvironment, {
    PATH: baseEnvironment.PATH || "",
    PLAYWRIGHT_DAEMON_SESSION_DIR: daemonDirectory,
    AUTO_PUBLISH_NODE_EXEC_PATH: node,
    PLAYWRIGHT_CLI_JS: cli,
    BROWSER_CHANNEL: browser,
  });
  let opened = false;

  async function invoke(args, timeout) {
    try {
      return await execFileAsync(opts.execFile, node, [cli].concat(args), {
        encoding: "utf8",
        timeout: timeout || 30000,
        windowsHide: true,
        env: environment,
      });
    } catch (failure) {
      const error = failure && failure.error ? failure.error : failure;
      const output =
        String((failure && failure.stdout) || "") +
        "\n" +
        String((failure && failure.stderr) || "");
      if (error && (error.code === "ETIMEDOUT" || error.killed))
        throw safeProbeError("PLAYWRIGHT_TIMEOUT");
      if (
        /browser|channel|executable|msedge|chrome/i.test(output) &&
        /not found|does not exist|unable|launch|executable/i.test(output)
      )
        throw safeProbeError("BROWSER_CHANNEL_UNAVAILABLE");
      throw safeProbeError("PLAYWRIGHT_EXEC_FAILED");
    }
  }

  try {
    await invoke(
      [
        "-s=runtime-self-check",
        "open",
        "about:blank",
        "--browser=" + browser,
        "--headed",
        "--persistent",
        "--profile=" + profileDirectory,
      ],
      60000,
    );
    opened = true;
    await invoke(["-s=runtime-self-check", "list"], 30000);
    await invoke(["-s=runtime-self-check", "close"], 30000);
    opened = false;
    if (typeof opts.onState === "function")
      opts.onState({
        channel: browser,
        state: "ready",
        lastCheckedAt: new Date().toISOString(),
        errorCode: null,
      });
    return {
      ok: true,
      browserChannel: browser,
      session: "runtime-self-check",
      capability: opts.readSafeDiagnostics().browserChannel,
    };
  } catch (error) {
    const safe =
      error && error.code ? error : safeProbeError("PLAYWRIGHT_EXEC_FAILED");
    if (typeof opts.onState === "function")
      opts.onState({
        channel: browser,
        state: "unavailable",
        lastCheckedAt: new Date().toISOString(),
        errorCode: safe.code,
      });
    throw safe;
  } finally {
    if (opened) {
      try {
        await invoke(["-s=runtime-self-check", "close"], 10000);
      } catch (_) {
        diagnose("PLAYWRIGHT_SMOKE_CLOSE_FAILED", "close");
      }
    }
    try {
      fs.rmSync(temporaryRoot, { recursive: true, force: true });
    } catch (_) {
      diagnose("PLAYWRIGHT_SMOKE_TEMPORARY_CLEANUP_FAILED", "cleanup");
    }
  }
}

module.exports = { probeBrowserRuntime };
