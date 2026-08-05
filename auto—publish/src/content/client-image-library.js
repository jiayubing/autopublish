const path = require("node:path");

const { createClientImagePathPolicy } = require("./client-image-path-policy");
const { createClientImageScanner } = require("./client-image-scanner");
const { createClientImageScanCache } = require("./client-image-cache");
const {
  selectImages,
  normalizeImageCount,
} = require("./client-image-selector");
const { relativePathForImageId } = require("./client-image-reference");

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

function createClientImageLibrary(options) {
  const opts = options || {};
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

  function listImages(clientId, optionsValue) {
    return scan(clientId, optionsValue).images;
  }

  function scanMany(clientIds, optionsValue) {
    if (!Array.isArray(clientIds))
      throw libraryError(
        "CLIENT_IMAGE_INPUT_INVALID",
        "Client image scan requires client ids",
      );
    return clientIds.map(function (clientId) {
      return scan(clientId, optionsValue);
    });
  }

  function invalidate(clientId) {
    if (clientId === undefined) return cache.invalidate();
    const client = pathPolicy.resolveClient(clientId);
    return cache.invalidate(client.cacheKey);
  }

  function resolveImage(clientId, imageId) {
    const internal = getInternalSnapshot(clientId, false);
    const relativePath = relativePathForImageId(imageId);
    const image =
      relativePath &&
      internal.snapshot.images.find(function (item) {
        return item.id === imageId;
      });
    if (!image)
      throw libraryError(
        "CLIENT_IMAGE_NOT_FOUND",
        "Client image was not found",
      );
    let checked;
    try {
      checked = pathPolicy.inspectEntry(
        internal.client,
        path.join(internal.client.directory, relativePath),
        "file",
      );
    } catch (error) {
      if (error && error.code === "CLIENT_IMAGE_MISSING")
        throw libraryError(
          "CLIENT_IMAGE_NOT_FOUND",
          "Client image was not found",
        );
      throw error;
    }
    return Object.assign({}, safeImage(image), {
      filePath: checked.path,
      realPath: checked.realPath,
    });
  }

  function selectForClient(clientId, optionsValue) {
    const input = optionsValue || {};
    const internal = getInternalSnapshot(clientId, Boolean(input.refresh));
    const selected = selectImages(internal.snapshot.images, {
      count: normalizeImageCount(input.count),
      random: input.random,
      excludeImageIds: input.excludeImageIds,
    });
    return Object.assign({}, selected, {
      clientId: clientId,
      images: selected.images.map(safeImage),
      diagnostics: internal.snapshot.diagnostics.map(function (item) {
        return Object.assign({}, item);
      }),
    });
  }

  return {
    scan: scan,
    scanMany: scanMany,
    listImages: listImages,
    listAvailableImages: listImages,
    invalidate: invalidate,
    resolveImage: resolveImage,
    selectImages: selectForClient,
    select: function (clientId, optionsValue) {
      return selectForClient(clientId, optionsValue);
    },
  };
}

module.exports = { createClientImageLibrary };
