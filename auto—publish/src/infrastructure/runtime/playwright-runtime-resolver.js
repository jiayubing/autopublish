"use strict";

const fs = require("node:fs");
const path = require("node:path");
const childProcess = require("node:child_process");
const {
  createPackagedRuntimeResolver,
} = require("./packaged-runtime-resolver");
const { resolvePlaywrightRuntimePaths } = require("./playwright-runtime-paths");

function existing(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readApplicationTools(appRoot, options) {
  const opts = options || {};
  const paths = opts.paths || {};
  const filename =
    opts.applicationToolsPath ||
    (paths.config && path.join(paths.config, "runtime-tools.json")) ||
    path.join(appRoot, "config", "runtime-tools.json");
  try {
    const value = JSON.parse(fs.readFileSync(filename, "utf8"));
    return value && typeof value === "object" && !Array.isArray(value)
      ? value
      : {};
  } catch (_) {
    return {};
  }
}

function regularFile(filename) {
  if (!filename || typeof filename !== "string") return false;
  try {
    const stat = fs.lstatSync(filename);
    return stat.isFile() && !stat.isSymbolicLink();
  } catch (_) {
    return false;
  }
}

function defaultPathLookup(command) {
  try {
    const lookup = process.platform === "win32" ? "where.exe" : "which";
    return (
      childProcess
        .execFileSync(lookup, [command], {
          encoding: "utf8",
          stdio: ["ignore", "pipe", "ignore"],
        })
        .trim()
        .split(/\r?\n/)
        .filter(Boolean)[0] || null
    );
  } catch (_) {
    return null;
  }
}

function configuredValue(config, applicationValues, name, envName) {
  return (
    existing(config[name]) ||
    existing(applicationValues && applicationValues[envName]) ||
    null
  );
}

function resolveExecutable(options) {
  const opts = options || {};
  const configured = configuredValue(
    opts.config || {},
    opts.applicationValues || {},
    opts.configName,
    opts.envName,
  );
  if (configured && regularFile(configured))
    return { command: configured, source: "application-config" };
  const environment = existing((opts.env || process.env)[opts.envName]);
  if (environment && regularFile(environment))
    return { command: environment, source: "environment" };
  const bundled = (opts.bundled || []).find(regularFile);
  if (bundled) return { command: bundled, source: "bundled" };
  if (!opts.packaged && opts.pathCommand) {
    const fromPath = existing(
      (opts.pathLookup || defaultPathLookup)(opts.pathCommand),
    );
    if (fromPath && regularFile(fromPath))
      return { command: fromPath, source: "PATH" };
  }
  return { command: null, source: null };
}

function resolveBrowserChannel(options) {
  const opts = options || {};
  const config = opts.config || {};
  const env = opts.env || process.env;
  const configured = configuredValue(
    config,
    opts.applicationValues || {},
    "browserChannel",
    "BROWSER_CHANNEL",
  );
  const channel = configured || existing(env.BROWSER_CHANNEL) || "msedge";
  if (!/^[A-Za-z0-9._-]+$/.test(channel)) {
    return {
      channel: null,
      source: null,
      configured: false,
      errorCode: "BROWSER_CHANNEL_INVALID",
    };
  }
  return {
    channel: channel,
    source: configured
      ? "application-config"
      : existing(env.BROWSER_CHANNEL)
        ? "environment"
        : "default",
    configured: true,
  };
}

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
      Object.assign({}, opts, {
        appRoot: appRoot,
        packaged: true,
      }),
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
        appRoot: appRoot,
        resourcesPath: opts.resourcesPath,
        packaged: true,
        env: env,
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
      appRoot: appRoot,
      packaged: true,
      playwrightNode: packagedPaths.playwrightNode,
      playwrightCli: packagedPaths.playwrightCli,
      browserChannel: resolveBrowserChannel({
        config: config,
        applicationValues: opts.applicationValues,
        env: env,
      }),
      hepanPython: hepanPython,
    };
  }
  const appRootName = path.basename(appRoot).toLowerCase();
  const inferredResourcesPath =
    packaged &&
    (appRootName === "app.asar" || appRootName === "app.asar.unpacked")
      ? path.dirname(appRoot)
      : appRoot;
  const resourcesPath = path.resolve(
    opts.resourcesPath || inferredResourcesPath,
  );
  const unpackedRoot = packaged
    ? path.join(resourcesPath, "app.asar.unpacked")
    : appRoot;
  const nodeBundled = [
    path.join(resourcesPath, "tools", "node", "node.exe"),
    path.join(appRoot, "tools", "node", "node.exe"),
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
  if (!packaged)
    nodeBundled.push(
      path.join(appRoot, "build", "runtime-tools", "node", "node.exe"),
    );
  const playwrightNode = resolveExecutable({
    config: config,
    applicationValues: opts.applicationValues,
    configName: "nodeExecPath",
    envName: "AUTO_PUBLISH_NODE_EXEC_PATH",
    env: env,
    bundled: nodeBundled,
    pathCommand: "node",
    pathLookup: opts.pathLookup,
    packaged: packaged,
  });
  const playwrightCli = resolveExecutable({
    config: config,
    applicationValues: opts.applicationValues,
    configName: "playwrightCliJs",
    envName: "PLAYWRIGHT_CLI_JS",
    env: env,
    bundled: cliBundled,
    pathCommand: "playwright-cli",
    pathLookup: opts.pathLookup,
    packaged: packaged,
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
      config: config,
      applicationValues: opts.applicationValues,
      configName: "hepanPython",
      envName: "HEPAN_PYTHON",
      env: env,
      bundled: [path.join(appRoot, "tools", "python", "python.exe")],
      pathCommand: "python",
      pathLookup: opts.pathLookup,
      packaged: packaged,
    });
  }
  return {
    appRoot: appRoot,
    packaged: packaged,
    playwrightNode: playwrightNode,
    playwrightCli: playwrightCli,
    browserChannel: resolveBrowserChannel({
      config: config,
      applicationValues: opts.applicationValues,
      env: env,
    }),
    hepanPython: hepanPython,
  };
}

module.exports = { resolvePlaywrightRuntime };
