const fs = require("node:fs");
const path = require("node:path");

const { createContentPathPolicy } = require("./content-path-policy");
const { resolveClientIdentity } = require("./client-knowledge");
const { normalizeRelativePath } = require("./client-image-reference");

function imagePathError(code, message, cause) {
  const error = new Error(message || code);
  error.code = code;
  if (cause) error.cause = cause;
  return error;
}

function assertClientId(clientId) {
  if (
    typeof clientId !== "string" ||
    clientId.trim() === "" ||
    clientId === "." ||
    clientId === ".." ||
    clientId.includes("/") ||
    clientId.includes("\\") ||
    clientId.includes("\0") ||
    path.isAbsolute(clientId) ||
    path.win32.isAbsolute(clientId)
  ) {
    throw imagePathError(
      "CLIENT_IMAGE_CLIENT_INVALID",
      "Client image identity is invalid",
    );
  }
  return clientId;
}

function isMissing(error) {
  return error && (error.code === "ENOENT" || error.code === "ENOTDIR");
}

function createClientImagePathPolicy(options) {
  const opts = options || {};
  if (typeof opts.workspaceRoot !== "string" || !opts.workspaceRoot)
    throw imagePathError(
      "CLIENT_IMAGE_PATH_OUT_OF_BOUNDS",
      "Workspace root is required",
    );
  const fsApi = opts.fs || fs;
  const workspaceRoot = path.resolve(opts.workspaceRoot);
  const contentPolicy =
    opts.pathPolicy ||
    createContentPathPolicy(workspaceRoot, { paths: opts.paths, fs: fsApi });
  const resolveIdentity = opts.resolveClientIdentity
    ? function (clientId) {
        return opts.resolveClientIdentity.length >= 2
          ? opts.resolveClientIdentity(workspaceRoot, clientId)
          : opts.resolveClientIdentity(clientId);
      }
    : function (clientId) {
        return resolveClientIdentity(workspaceRoot, clientId);
      };
  const imageDirectoryName = opts.imageDirectoryName;

  function resolveClient(clientId) {
    assertClientId(clientId);
    let identity;
    try {
      identity = resolveIdentity(clientId);
    } catch (error) {
      if (error && error.code) throw error;
      throw imagePathError(
        "CLIENT_IMAGE_PATH_OUT_OF_BOUNDS",
        "Client image path is unsafe",
        error,
      );
    }
    if (!identity || typeof identity.directory !== "string")
      throw imagePathError(
        "CLIENT_NOT_FOUND",
        "Client directory was not found",
      );
    let location;
    try {
      location = contentPolicy.clientDirectory(clientId, identity.directory);
    } catch (error) {
      if (error && error.code === "CLIENT_NOT_FOUND") throw error;
      throw imagePathError(
        "CLIENT_IMAGE_PATH_OUT_OF_BOUNDS",
        "Client image path is unsafe",
        error,
      );
    }
    return {
      clientId: clientId,
      directory: location.directory,
      realDirectory: location.realDirectory,
      realClientsRoot: location.realClientsRoot,
      cacheKey: location.realClientsRoot + "\0" + clientId,
    };
  }

  function imageRoot(client) {
    if (!client || typeof client.directory !== "string")
      throw imagePathError(
        "CLIENT_IMAGE_PATH_OUT_OF_BOUNDS",
        "Client image context is invalid",
      );
    const root = imageDirectoryName
      ? path.resolve(client.directory, imageDirectoryName)
      : client.directory;
    if (!contentPolicy.sameOrWithin(client.directory, root))
      throw imagePathError(
        "CLIENT_IMAGE_PATH_OUT_OF_BOUNDS",
        "Image directory is outside the client",
      );
    if (!fsApi.existsSync(root)) return null;
    try {
      const stats = fsApi.lstatSync(root);
      if (stats.isSymbolicLink() || !stats.isDirectory())
        throw imagePathError(
          "CLIENT_IMAGE_PATH_OUT_OF_BOUNDS",
          "Image directory is unsafe",
        );
      const realRoot = fsApi.realpathSync(root);
      if (!contentPolicy.sameOrWithin(client.realDirectory, realRoot))
        throw imagePathError(
          "CLIENT_IMAGE_PATH_OUT_OF_BOUNDS",
          "Image directory resolves outside the client",
        );
      return { path: root, realPath: realRoot };
    } catch (error) {
      if (isMissing(error)) return null;
      if (error && error.code === "CLIENT_IMAGE_PATH_OUT_OF_BOUNDS")
        throw error;
      throw imagePathError(
        "CLIENT_IMAGE_PATH_OUT_OF_BOUNDS",
        "Image directory is unsafe",
        error,
      );
    }
  }

  function inspectEntry(client, filename, kind) {
    const target = path.resolve(filename);
    if (!contentPolicy.sameOrWithin(client.directory, target))
      throw imagePathError(
        "CLIENT_IMAGE_PATH_OUT_OF_BOUNDS",
        "Image file is outside the client",
      );
    let stats;
    try {
      stats = fsApi.lstatSync(target);
    } catch (error) {
      if (isMissing(error))
        throw imagePathError(
          "CLIENT_IMAGE_MISSING",
          "Image file is missing",
          error,
        );
      throw imagePathError(
        "CLIENT_IMAGE_PATH_OUT_OF_BOUNDS",
        "Image file is unsafe",
        error,
      );
    }
    if (stats.isSymbolicLink())
      throw imagePathError(
        "CLIENT_IMAGE_SYMLINK",
        "Symbolic links are not image assets",
      );
    if (
      (kind === "directory" && !stats.isDirectory()) ||
      (kind === "file" && !stats.isFile())
    )
      throw imagePathError(
        "CLIENT_IMAGE_PATH_OUT_OF_BOUNDS",
        "Image entry has an invalid type",
      );
    let realPath;
    try {
      realPath = fsApi.realpathSync(target);
    } catch (error) {
      throw imagePathError(
        "CLIENT_IMAGE_PATH_OUT_OF_BOUNDS",
        "Image entry cannot be resolved",
        error,
      );
    }
    if (!contentPolicy.sameOrWithin(client.realDirectory, realPath))
      throw imagePathError(
        "CLIENT_IMAGE_PATH_OUT_OF_BOUNDS",
        "Image entry resolves outside the client",
      );
    return { path: target, realPath: realPath, stats: stats };
  }

  function relativePath(client, filename) {
    const relative = path.relative(client.directory, path.resolve(filename));
    if (
      !relative ||
      relative === ".." ||
      relative.startsWith(".." + path.sep) ||
      path.isAbsolute(relative)
    )
      throw imagePathError(
        "CLIENT_IMAGE_PATH_OUT_OF_BOUNDS",
        "Image path is outside the client",
      );
    return normalizeRelativePath(relative);
  }

  return {
    workspaceRoot: workspaceRoot,
    contentPolicy: contentPolicy,
    resolveClient,
    imageRoot,
    inspectEntry,
    relativePath,
    assertClientId,
    imagePathError,
  };
}

module.exports = {
  createClientImagePathPolicy,
  imagePathError,
  assertClientId,
};
