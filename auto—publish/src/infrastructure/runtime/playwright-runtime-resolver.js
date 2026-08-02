"use strict";

const path = require("node:path");
const {
  createPackagedRuntimeResolver,
} = require("./packaged-runtime-resolver");
const { resolvePlaywrightRuntimePaths } = require("./playwright-runtime-paths");
const {
  readApplicationTools,
  configuredValue,
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
    let hepanPython = { command: null, source: "optional" };
    let providerConfig = null;
    if (typeof opts.hepanProvider === "function") {
      try {
        providerConfig = opts.hepanProvider();
      } catch (_) {
        providerConfig = null;
      }
    }
    const configuredPython =
      providerConfig && providerConfig.pythonPath
        ? providerConfig.pythonPath
        : configuredValue(
            config,
            opts.applicationValues || {},
            "hepanPython",
            "HEPAN_PYTHON",
          );
    if (configuredPython) {
      const resolver = createPackagedRuntimeResolver({
        appRoot,
        resourcesPath: opts.resourcesPath,
        packaged: true,
        env,
      });
      const checked = resolver.tryResolve({
        name: "Hepan Python",
        explicit: configuredPython,
        allowExplicitPackaged: true,
        executable: true,
        errorCode: "HEPAN_PYTHON_UNAVAILABLE",
        message: "Hepan Python is unavailable",
      });
      if (checked.ok)
        hepanPython = {
          command: checked.value.path,
          source: "application-config",
        };
    }
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
      hepanPython,
    };
  }

  const resourcesPath = path.resolve(opts.resourcesPath || appRoot);
  const unpackedRoot = appRoot;
  const nodeBundled = [
    path.join(resourcesPath, "tools", "node", "node.exe"),
    path.join(appRoot, "tools", "node", "node.exe"),
    path.join(appRoot, "build", "runtime-tools", "node", "node.exe"),
  ];
  const cliBundled = [
    path.join(
      unpackedRoot,
      "node_modules",
      "@playwright",
      "cli",
      "playwright-cli.js",
    ),
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
  let hepanPython;
  if (typeof opts.hepanProvider === "function") {
    let providerConfig = null;
    try {
      providerConfig = opts.hepanProvider();
    } catch (_) {
      providerConfig = null;
    }
    hepanPython =
      providerConfig && providerConfig.pythonPath
        ? resolveExecutable({
            config: { hepanPython: providerConfig.pythonPath },
            env: {},
            configName: "hepanPython",
            envName: "HEPAN_PYTHON",
            bundled: [],
            packaged: true,
          })
        : { command: null, source: "provider" };
  } else {
    hepanPython = resolveExecutable({
      config,
      applicationValues: opts.applicationValues,
      configName: "hepanPython",
      envName: "HEPAN_PYTHON",
      env,
      bundled: [path.join(appRoot, "tools", "python", "python.exe")],
      pathCommand: "python",
      pathLookup: opts.pathLookup,
      packaged,
    });
  }
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
    hepanPython,
  };
}

module.exports = { resolvePlaywrightRuntime };
