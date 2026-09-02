"use strict";

const path = require("node:path");
const { resolvePlaywrightRuntimePaths } = require("./playwright-runtime-paths");
const {
  readApplicationTools,
  resolveExecutable,
  resolveBrowserChannel,
} = require("./playwright-tool-resolution");

function resolvePlaywrightRuntime(options) {
  const opts = options || {};
  const appRoot = path.resolve(
    opts.appRoot ||
      process.env.AUTO_PUBLISH_APP_ROOT ||
      path.resolve(__dirname, "..", ".."),
  );
  const config = opts.applicationTools || readApplicationTools(appRoot, opts);
  const env = opts.env || process.env;
  const packaged =
    opts.packaged === undefined
      ? env.AUTO_PUBLISH_PACKAGED === "1"
      : opts.packaged === true;

  if (packaged) {
    const packagedPaths = resolvePlaywrightRuntimePaths(
      Object.assign({}, opts, { appRoot, packaged: true }),
    );
    return {
      appRoot,
      packaged: true,
      playwrightNode: packagedPaths.playwrightNode,
      playwrightCli: packagedPaths.playwrightCli,
      browserChannel: resolveBrowserChannel({
        config,
        applicationValues: opts.applicationValues,
        env,
      }),
    };
  }

  const resourcesPath = path.resolve(opts.resourcesPath || appRoot);
  const nodeBundled = [
    path.join(resourcesPath, "tools", "node", "node.exe"),
    path.join(appRoot, "tools", "node", "node.exe"),
    path.join(appRoot, "build", "runtime-tools", "node", "node.exe"),
  ];
  const cliBundled = [
    path.join(
      appRoot,
      "node_modules",
      "@playwright",
      "cli",
      "playwright-cli.js",
    ),
  ];
  const playwrightNode = resolveExecutable({
    config,
    applicationValues: opts.applicationValues,
    configName: "nodeExecPath",
    envName: "AUTO_PUBLISH_NODE_EXEC_PATH",
    env,
    bundled: nodeBundled,
    pathCommand: "node",
    pathLookup: opts.pathLookup,
    packaged,
  });
  const playwrightCli = resolveExecutable({
    config,
    applicationValues: opts.applicationValues,
    configName: "playwrightCliJs",
    envName: "PLAYWRIGHT_CLI_JS",
    env,
    bundled: cliBundled,
    pathCommand: "playwright-cli",
    pathLookup: opts.pathLookup,
    packaged,
  });
  return {
    appRoot,
    packaged,
    playwrightNode,
    playwrightCli,
    browserChannel: resolveBrowserChannel({
      config,
      applicationValues: opts.applicationValues,
      env,
    }),
  };
}

module.exports = { resolvePlaywrightRuntime };
