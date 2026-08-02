"use strict";

const path = require("node:path");
const {
  resolverError,
  isWithin,
  hasAsarVirtualSegment,
  regularFile,
  regularDirectory,
  executableFile,
  validateCandidate,
} = require("./runtime-path-boundary");

function inferResourcesPath(appRoot, pathApi) {
  const root = pathApi.resolve(appRoot || "");
  const name = pathApi.basename(root).toLowerCase();
  return name === "app.asar" || name === "app.asar.unpacked"
    ? pathApi.dirname(root)
    : root;
}

function createPackagedRuntimeResolver(options) {
  const opts = options || {};
  const io = opts.fs || require("node:fs");
  const pathApi = opts.path || path;
  const env = opts.env || process.env;
  const packaged =
    opts.packaged === undefined
      ? env.AUTO_PUBLISH_PACKAGED === "1" || Boolean(env.ELECTRON_IS_PACKAGED)
      : opts.packaged === true;
  const appRoot = pathApi.resolve(
    opts.appRoot ||
      env.AUTO_PUBLISH_APP_ROOT ||
      pathApi.resolve(__dirname, "..", ".."),
  );
  const resourcesPath = pathApi.resolve(
    opts.resourcesPath || inferResourcesPath(appRoot, pathApi),
  );

  function resolve(spec) {
    const definition = spec || {};
    const candidates = packaged
      ? definition.packagedCandidates || []
      : definition.developmentCandidates || [];
    const explicit = definition.explicit;
    const ordered = [];
    if (explicit && (!packaged || definition.allowExplicitPackaged === true))
      ordered.push(explicit);
    ordered.push(...candidates);
    for (const candidate of ordered) {
      if (typeof candidate !== "string" || candidate.trim() === "") continue;
      try {
        return Object.assign(
          { source: packaged ? "packaged" : "development" },
          validateCandidate(candidate, {
            fs: io,
            path: pathApi,
            root: definition.root,
            name: definition.name,
            directory: definition.directory,
            executable: definition.executable,
          }),
        );
      } catch (error) {
        if (error && error.code === "PACKAGED_RUNTIME_PATH_MISSING") continue;
        throw error;
      }
    }
    throw resolverError(
      definition.errorCode || "PACKAGED_RUNTIME_PATH_MISSING",
      definition.message || "Packaged runtime resource is unavailable",
    );
  }

  function tryResolve(spec) {
    try {
      return { ok: true, value: resolve(spec) };
    } catch (error) {
      return {
        ok: false,
        error,
        missing: Boolean(
          error && error.code === "PACKAGED_RUNTIME_PATH_MISSING",
        ),
      };
    }
  }

  return Object.freeze({
    packaged,
    appRoot,
    resourcesPath,
    resolve,
    tryResolve,
  });
}

function resolveRuntimePath(options) {
  const opts = options || {};
  return createPackagedRuntimeResolver(opts).resolve(opts);
}

module.exports = {
  createPackagedRuntimeResolver,
  resolveRuntimePath,
  validateCandidate,
  regularFile,
  regularDirectory,
  executableFile,
  hasAsarVirtualSegment,
  isWithin,
};
