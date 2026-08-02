"use strict";

const path = require("node:path");
const {
  createPackagedRuntimeResolver,
} = require("./packaged-runtime-resolver");

function resolvePlaywrightRuntimePaths(options) {
  const opts = options || {};
  const resolver = createPackagedRuntimeResolver(opts);
  const resources = resolver.resourcesPath;
  const appRoot = resolver.appRoot;
  const appRootIsAsarVirtual =
    path.basename(appRoot).toLowerCase() === "app.asar";
  const allowPlainPackagedAppRoot =
    typeof opts.appRoot === "string" && !appRootIsAsarVirtual;
  const packagedCandidates = function (relative) {
    const candidates = [path.join(resources, "app.asar.unpacked", relative)];
    // A plain appRoot is useful for directory fixtures and for an unpacked
    // development package. It is never a source-tree fallback in a packaged
    // Electron context because appRoot is the packaged tree supplied by the
    // caller.
    if (
      allowPlainPackagedAppRoot ||
      path.basename(appRoot).toLowerCase() === "app.asar.unpacked"
    ) {
      candidates.push(path.join(appRoot, relative));
    }
    return candidates;
  };

  function resolve(spec) {
    return resolver.tryResolve(spec);
  }

  const node = resolve({
    name: "Playwright Node",
    packagedCandidates: [
      path.join(resources, "tools", "node", "node.exe"),
      ...(allowPlainPackagedAppRoot ||
      path.basename(appRoot).toLowerCase() === "app.asar.unpacked"
        ? [path.join(appRoot, "tools", "node", "node.exe")]
        : []),
    ],
    developmentCandidates: [
      path.join(appRoot, "tools", "node", "node.exe"),
      path.join(appRoot, "build", "runtime-tools", "node", "node.exe"),
    ],
    root: resolver.packaged ? resources : undefined,
    executable: true,
    errorCode: "PLAYWRIGHT_NODE_UNAVAILABLE",
    message: "Packaged Playwright Node is unavailable",
  });

  const cli = resolve({
    name: "Playwright CLI",
    packagedCandidates: packagedCandidates(
      "node_modules/@playwright/cli/playwright-cli.js",
    ),
    developmentCandidates: [
      path.join(
        appRoot,
        "node_modules",
        "@playwright",
        "cli",
        "playwright-cli.js",
      ),
    ],
    root: resolver.packaged ? resources : undefined,
    errorCode: "PLAYWRIGHT_CLI_UNAVAILABLE",
    message: "Packaged Playwright CLI is unavailable",
  });

  return {
    packaged: resolver.packaged,
    appRoot,
    resourcesPath: resources,
    playwrightNode: node.ok
      ? { command: node.value.path, source: "bundled" }
      : { command: null, source: null, error: node.error },
    playwrightCli: cli.ok
      ? { command: cli.value.path, source: "bundled" }
      : { command: null, source: null, error: cli.error },
  };
}

module.exports = { resolvePlaywrightRuntimePaths };
