"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const util = require("node:util");

const { createClientImagePathPolicy } = require("./client-image-path-policy");
const { createClientImageScanner } = require("./client-image-scanner");
const { createClientImageScanCache } = require("./client-image-cache");
const {
  selectImages,
  normalizeImageCount,
} = require("./client-image-selector");
const { relativePathForImageId } = require("./client-image-reference");
const {
  MAX_IMAGE_FILE_BYTES,
  parseImageMetadata,
} = require("./client-image-metadata");

const INSPECT = util.inspect.custom;

function libraryError(code, message) {
  const error = new Error(message || code);
  error.code = code;
  return error;
}

function safeImage(image) {
  return {
    id: image.id,
    relativePath: image.relativePath,
    name: image.name,
    extension: image.extension,
    mimeType: image.mimeType,
    width: image.width,
    height: image.height,
    size: image.size,
  };
}

function exactInput(value, keys) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw libraryError(
      "CLIENT_IMAGE_INPUT_INVALID",
      "Client image input is invalid",
    );
  const actual = Object.keys(value).sort();
  const expected = keys.slice().sort();
  if (
    actual.length !== expected.length ||
    actual.some(function (key, index) {
      return key !== expected[index];
    })
  )
    throw libraryError(
      "CLIENT_IMAGE_INPUT_INVALID",
      "Client image input is invalid",
    );
  return value;
}

function safeSelectionImage(image) {
  return Object.freeze({
    imageId: image.id,
    name: image.name,
    extension: image.extension,
    mimeType: image.mimeType,
    width: image.width,
    height: image.height,
    size: image.size,
  });
}

function unreadableAsset(code) {
  return libraryError(
    code || "CLIENT_IMAGE_NOT_FOUND",
    "Client image asset is unavailable",
  );
}

function privateAsset(value) {
  const privateBytes = value.bytes;
  delete value.bytes;
  Object.defineProperties(value, {
    bytes: {
      enumerable: true,
      get: function () {
        return Buffer.from(privateBytes);
      },
    },
    toJSON: {
      enumerable: false,
      value: function () {
        throw libraryError(
          "CLIENT_IMAGE_ASSET_SERIALIZATION_FORBIDDEN",
          "Client image assets cannot be serialized",
        );
      },
    },
    [INSPECT]: {
      enumerable: false,
      value: function () {
        return "[ClientImageAsset]";
      },
    },
  });
  Object.freeze(value);
  return new Proxy(value, Object.freeze({}));
}

function readCheckedBytes(fsApi, filename) {
  let descriptor;
  let primaryError;
  try {
    const noFollow = fs.constants.O_NOFOLLOW || 0;
    descriptor = fsApi.openSync(filename, fs.constants.O_RDONLY | noFollow);
    const stats = fsApi.fstatSync(descriptor);
    if (!stats.isFile())
      throw unreadableAsset("CLIENT_IMAGE_PATH_OUT_OF_BOUNDS");
    if (stats.size > MAX_IMAGE_FILE_BYTES)
      throw unreadableAsset("IMAGE_FILE_TOO_LARGE");
    const bytes = Buffer.allocUnsafe(stats.size);
    let offset = 0;
    while (offset < bytes.length) {
      const count = fsApi.readSync(
        descriptor,
        bytes,
        offset,
        bytes.length - offset,
        offset,
      );
      if (count === 0) throw unreadableAsset("IMAGE_READ_FAILED");
      offset += count;
    }
    return bytes;
  } catch (error) {
    primaryError = error;
    if (error && (error.code === "ENOENT" || error.code === "ENOTDIR"))
      throw unreadableAsset();
    if (error && /^(?:CLIENT_IMAGE_|IMAGE_)/.test(error.code || ""))
      throw error;
    throw unreadableAsset("IMAGE_READ_FAILED");
  } finally {
    if (descriptor !== undefined) {
      try {
        fsApi.closeSync(descriptor);
      } catch (error) {
        if (!primaryError) throw unreadableAsset("IMAGE_READ_FAILED");
      }
    }
  }
}

function createClientImageLibrary(options) {
  const opts = options || {};
  const fsApi = opts.fs || fs;
  const pathPolicy = opts.pathPolicy || createClientImagePathPolicy(opts);
  const scanner =
    opts.scanner ||
    createClientImageScanner({
      pathPolicy: pathPolicy,
      fs: opts.fs,
      metadataReader: opts.metadataReader,
      now: opts.now,
    });
  const cache =
    opts.cache ||
    createClientImageScanCache({ scope: pathPolicy.workspaceRoot });

  function getInternalSnapshot(clientId, force) {
    const client = pathPolicy.resolveClient(clientId);
    const cached = !force && cache.get(client.cacheKey);
    if (cached) return { client: client, snapshot: cached };
    const snapshot = scanner.scan(client);
    cache.set(client.cacheKey, snapshot);
    return { client: client, snapshot: snapshot };
  }

  function publicSnapshot(snapshot) {
    return {
      clientId: snapshot.clientId,
      revision: snapshot.revision,
      scannedAt: snapshot.scannedAt,
      images: snapshot.images.map(safeImage),
      diagnostics: snapshot.diagnostics.map(function (item) {
        return Object.assign({}, item);
      }),
      summary: Object.assign({}, snapshot.summary),
    };
  }

  function scan(clientId, optionsValue) {
    return publicSnapshot(
      getInternalSnapshot(
        clientId,
        Boolean(optionsValue && optionsValue.refresh),
      ).snapshot,
    );
  }

  function invalidate(clientId) {
    if (clientId === undefined) return cache.invalidate();
    const client = pathPolicy.resolveClient(clientId);
    return cache.invalidate(client.cacheKey);
  }

  function readAsset(input) {
    exactInput(input, ["clientId", "imageId"]);
    const client = pathPolicy.resolveClient(input.clientId);
    const imageRoot = pathPolicy.imageRoot(client);
    const relativePath = relativePathForImageId(input.imageId);
    if (!imageRoot || !relativePath) throw unreadableAsset();
    const filename = path.resolve(client.directory, relativePath);
    if (!pathPolicy.contentPolicy.sameOrWithin(imageRoot.path, filename))
      throw unreadableAsset("CLIENT_IMAGE_PATH_OUT_OF_BOUNDS");
    let checked;
    try {
      checked = pathPolicy.inspectEntry(client, filename, "file");
    } catch (error) {
      if (error && error.code === "CLIENT_IMAGE_MISSING")
        throw unreadableAsset();
      throw error;
    }
    if (
      !pathPolicy.contentPolicy.sameOrWithin(
        imageRoot.realPath,
        checked.realPath,
      )
    )
      throw unreadableAsset("CLIENT_IMAGE_PATH_OUT_OF_BOUNDS");
    const bytes = readCheckedBytes(fsApi, checked.realPath);
    const rechecked = pathPolicy.inspectEntry(client, filename, "file");
    if (
      rechecked.realPath !== checked.realPath ||
      rechecked.stats.size !== bytes.length ||
      !pathPolicy.contentPolicy.sameOrWithin(
        imageRoot.realPath,
        rechecked.realPath,
      )
    )
      throw unreadableAsset("CLIENT_IMAGE_PATH_OUT_OF_BOUNDS");
    const metadata = parseImageMetadata(relativePath, bytes);
    return privateAsset({
      name: path.basename(relativePath),
      extension: metadata.extension,
      mimeType: metadata.mimeType,
      width: metadata.width,
      height: metadata.height,
      size: metadata.size,
      bytes: Buffer.from(bytes),
      assetFingerprint: crypto.createHash("sha256").update(bytes).digest("hex"),
    });
  }

  function selectForClient(input) {
    const keys =
      input && Object.hasOwn(input, "random")
        ? ["clientId", "count", "random"]
        : ["clientId", "count"];
    exactInput(input, keys);
    if (input.random !== undefined && typeof input.random !== "function")
      throw libraryError(
        "CLIENT_IMAGE_INPUT_INVALID",
        "Image random source is invalid",
      );
    pathPolicy.assertClientId(input.clientId);
    const count = normalizeImageCount(input.count);
    if (count === 0)
      return Object.freeze({
        version: 1,
        clientId: input.clientId,
        requestedCount: 0,
        images: Object.freeze([]),
        warnings: Object.freeze([]),
      });
    const internal = getInternalSnapshot(input.clientId, false);
    const selected = selectImages(internal.snapshot.images, {
      count,
      random: input.random,
    });
    const warnings = internal.snapshot.diagnostics.length
      ? [
          Object.freeze({
            code: "CLIENT_IMAGE_SELECTION_SCAN_DEGRADED",
            stage: "scan",
          }),
        ]
      : [];
    return Object.freeze({
      version: 1,
      clientId: input.clientId,
      requestedCount: selected.requestedCount,
      images: Object.freeze(selected.images.map(safeSelectionImage)),
      warnings: Object.freeze(warnings),
    });
  }

  return Object.freeze({
    scan: scan,
    invalidate: invalidate,
    imageSelectionPort: Object.freeze({ select: selectForClient }),
    imageAssetReader: Object.freeze({ read: readAsset }),
  });
}

module.exports = { createClientImageLibrary };
