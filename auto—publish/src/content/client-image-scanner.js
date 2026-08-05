const fs = require("node:fs");
const path = require("node:path");

const {
  supportedImageExtension,
  readImageMetadata,
} = require("./client-image-metadata");
const { imageIdForRelativePath } = require("./client-image-reference");

const POTENTIAL_IMAGE_EXTENSIONS = new Set([
  ".gif",
  ".bmp",
  ".svg",
  ".avif",
  ".heic",
  ".heif",
  ".tif",
  ".tiff",
]);

function isMissing(error) {
  return error && (error.code === "ENOENT" || error.code === "ENOTDIR");
}

function createClientImageScanner(options) {
  const opts = options || {};
  const fsApi = opts.fs || fs;
  const pathPolicy = opts.pathPolicy;
  if (!pathPolicy || typeof pathPolicy.inspectEntry !== "function")
    throw new Error("Client image path policy is required");
  const metadataReader = opts.metadataReader || readImageMetadata;
  const now =
    typeof opts.now === "function"
      ? opts.now
      : function () {
          return new Date();
        };
  let revision = 0;

  function diagnostic(code, relativePath, detail) {
    const value = { code: code, path: relativePath || null };
    if (detail) value.detail = detail;
    return value;
  }

  function scan(client) {
    const diagnostics = [];
    const images = [];
    const summary = {
      directoriesVisited: 0,
      filesExamined: 0,
      supportedCandidates: 0,
      availableImages: 0,
      skippedFiles: 0,
      diagnosticCount: 0,
    };
    const root = pathPolicy.imageRoot(client);
    if (!root) {
      return createSnapshot(client, images, diagnostics, summary);
    }

    const pending = [root.path];
    while (pending.length) {
      const directory = pending.pop();
      summary.directoriesVisited += 1;
      let entries;
      try {
        entries = fsApi
          .readdirSync(directory, { withFileTypes: true })
          .sort(function (left, right) {
            return left.name.localeCompare(right.name);
          });
      } catch (error) {
        if (!isMissing(error))
          addDiagnostic(
            diagnostics,
            summary,
            "IMAGE_DIRECTORY_READ_FAILED",
            safeRelativePath(client, directory),
            error.code,
          );
        continue;
      }
      entries
        .slice()
        .reverse()
        .forEach(function (entry) {
          if (!entry.name || entry.name.startsWith(".")) return;
          const filename = path.join(directory, entry.name);
          const relativePath = safeRelativePath(client, filename);
          let inspected;
          try {
            inspected = pathPolicy.inspectEntry(
              client,
              filename,
              entry.isDirectory() ? "directory" : "file",
            );
          } catch (error) {
            summary.skippedFiles += 1;
            addDiagnostic(
              diagnostics,
              summary,
              error.code === "CLIENT_IMAGE_SYMLINK"
                ? "IMAGE_SYMLINK_SKIPPED"
                : "IMAGE_PATH_SKIPPED",
              relativePath,
              error.code,
            );
            return;
          }
          if (inspected.stats.isDirectory()) {
            pending.push(inspected.path);
            return;
          }
          if (!inspected.stats.isFile()) return;
          summary.filesExamined += 1;
          const extension = path.extname(entry.name).toLowerCase();
          if (!supportedImageExtension(entry.name)) {
            if (POTENTIAL_IMAGE_EXTENSIONS.has(extension)) {
              summary.skippedFiles += 1;
              addDiagnostic(
                diagnostics,
                summary,
                "IMAGE_FORMAT_UNSUPPORTED",
                relativePath,
              );
            }
            return;
          }
          summary.supportedCandidates += 1;
          let metadata;
          try {
            metadata = metadataReader(inspected.path, fsApi);
          } catch (error) {
            summary.skippedFiles += 1;
            const code =
              typeof error.code === "string" && error.code.startsWith("IMAGE_")
                ? error.code
                : "IMAGE_READ_FAILED";
            addDiagnostic(diagnostics, summary, code, relativePath);
            return;
          }
          images.push({
            id: imageIdForRelativePath(relativePath),
            relativePath: relativePath,
            name: entry.name,
            extension: metadata.extension,
            mimeType: metadata.mimeType,
            width: metadata.width,
            height: metadata.height,
            size: metadata.size,
            filePath: inspected.path,
            realPath: inspected.realPath,
          });
        });
    }
    images.sort(function (left, right) {
      return left.relativePath.localeCompare(right.relativePath);
    });
    summary.availableImages = images.length;
    return createSnapshot(client, images, diagnostics, summary);
  }

  function addDiagnostic(diagnostics, summary, code, relativePath, detail) {
    diagnostics.push(diagnostic(code, relativePath, detail));
    summary.diagnosticCount += 1;
  }

  function safeRelativePath(client, filename) {
    try {
      return pathPolicy.relativePath(client, filename);
    } catch (_) {
      return path.basename(filename);
    }
  }

  function createSnapshot(client, images, diagnostics, summary) {
    return {
      clientId: client.clientId,
      revision: "image-scan-" + String(++revision),
      scannedAt: new Date(now()).toISOString(),
      images: images,
      diagnostics: diagnostics,
      summary: summary,
    };
  }

  return { scan };
}

module.exports = { createClientImageScanner, POTENTIAL_IMAGE_EXTENSIONS };
