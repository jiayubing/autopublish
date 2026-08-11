const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const https = require("node:https");
const http = require("node:http");
const { spawnSync } = require("node:child_process");

const DEFAULT_MANIFEST = path.resolve(
  __dirname,
  "..",
  "config",
  "runtime-tools-manifest.json",
);
const DEFAULT_OUTPUT = path.resolve(
  __dirname,
  "..",
  "build",
  "runtime-tools",
  "node",
);
const DEFAULT_CACHE = path.resolve(
  __dirname,
  "..",
  "build",
  "runtime-tools-cache",
);
const DEFAULT_BUILD_INFO = path.resolve(
  __dirname,
  "..",
  "config",
  "build-info.json",
); // config/build-info.json is the packaged provenance path.

function readBuildInfo() {
  const root = path.resolve(__dirname, "..");
  let packageValue;
  try {
    packageValue = JSON.parse(
      fs.readFileSync(path.join(root, "package.json"), "utf8"),
    );
  } catch (_) {
    throw toolError(
      "RUNTIME_TOOL_BUILD_PROVENANCE_UNAVAILABLE",
      "Runtime tool build provenance is unavailable",
    );
  }
  if (
    !packageValue ||
    typeof packageValue.version !== "string" ||
    packageValue.version.trim() === ""
  )
    throw toolError(
      "RUNTIME_TOOL_BUILD_PROVENANCE_INVALID",
      "Runtime tool build provenance is invalid",
    );
  let commitResult;
  let statusResult;
  try {
    commitResult = spawnSync("git", ["rev-parse", "HEAD"], {
      cwd: root,
      encoding: "utf8",
      windowsHide: true,
    });
    statusResult = spawnSync("git", ["status", "--porcelain=v1"], {
      cwd: root,
      encoding: "utf8",
      windowsHide: true,
    });
  } catch (_) {
    throw toolError(
      "RUNTIME_TOOL_BUILD_PROVENANCE_UNAVAILABLE",
      "Runtime tool build provenance is unavailable",
    );
  }
  const commit = String((commitResult && commitResult.stdout) || "").trim();
  if (
    commitResult.error ||
    commitResult.status !== 0 ||
    !/^[a-f0-9]{40,64}$/i.test(commit)
  )
    throw toolError(
      "RUNTIME_TOOL_BUILD_PROVENANCE_UNAVAILABLE",
      "Runtime tool build provenance is unavailable",
    );
  if (statusResult.error || statusResult.status !== 0)
    throw toolError(
      "RUNTIME_TOOL_BUILD_PROVENANCE_UNAVAILABLE",
      "Runtime tool source state is unavailable",
    );
  return {
    version: packageValue.version,
    commit: commit.toLowerCase(),
    dirty: String(statusResult.stdout || "").trim() !== "",
  };
}

function toolError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function cleanupPath(filename, code) {
  try {
    fs.rmSync(filename, { recursive: true, force: true });
    return null;
  } catch (error) {
    return toolError(code, "Runtime tool cleanup could not be verified");
  }
}

function attachCleanupFailure(primary, cleanup) {
  if (!cleanup) return primary;
  if (primary) {
    primary.cleanupCode = cleanup.code;
    return primary;
  }
  return cleanup;
}

function readManifest(filename) {
  let value;
  try {
    value = JSON.parse(fs.readFileSync(filename, "utf8"));
  } catch (_) {
    throw toolError(
      "RUNTIME_TOOL_MANIFEST_INVALID",
      "Runtime tools manifest cannot be read",
    );
  }
  const archive = value && value.archive;
  if (
    !value ||
    value.version !== 1 ||
    value.tool !== "node" ||
    value.platform !== "win-x64" ||
    !/^v\d+\.\d+\.\d+$/.test(value.nodeVersion || "") ||
    !archive ||
    !archive.fileName ||
    !/^https:\/\//i.test(archive.url || "") ||
    !/^[a-f0-9]{64}$/i.test(archive.sha256 || "") ||
    !archive.rootDirectory ||
    archive.rootDirectory.includes("..") ||
    archive.licenseFile !== "LICENSE"
  ) {
    throw toolError(
      "RUNTIME_TOOL_MANIFEST_INVALID",
      "Runtime tools manifest is invalid",
    );
  }
  return value;
}

function sha256(filename) {
  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(filename));
  return hash.digest("hex");
}

function cachedArchivePresent(filename) {
  try {
    const stat = fs.lstatSync(filename);
    if (stat.isSymbolicLink() || !stat.isFile())
      throw toolError(
        "RUNTIME_TOOL_ARCHIVE_UNAVAILABLE",
        "Runtime tool archive is not a regular file",
      );
    return true;
  } catch (error) {
    if (error && error.code === "ENOENT") return false;
    if (error && /^RUNTIME_TOOL_/.test(error.code || "")) throw error;
    throw toolError(
      "RUNTIME_TOOL_ARCHIVE_UNAVAILABLE",
      "Runtime tool archive is unavailable",
    );
  }
}

function archiveSha256(filename) {
  try {
    return sha256(filename);
  } catch (_) {
    throw toolError(
      "RUNTIME_TOOL_ARCHIVE_UNAVAILABLE",
      "Runtime tool archive is unavailable",
    );
  }
}

function normalizedToolError(error, fallback) {
  if (error && /^RUNTIME_TOOL_[A-Z0-9_]{1,72}$/.test(error.code || ""))
    return error;
  const normalized = toolError(fallback, "Runtime tool operation failed");
  normalized.causeCode =
    error && /^[A-Z0-9_]{1,80}$/.test(error.code || "")
      ? error.code
      : "UNKNOWN";
  return normalized;
}

function download(url, destination, redirects) {
  const count = redirects || 0;
  if (count > 5)
    return Promise.reject(
      toolError(
        "RUNTIME_TOOL_DOWNLOAD_REDIRECT",
        "Runtime tool download redirected too many times",
      ),
    );
  const client = url.startsWith("https:") ? https : http;
  return new Promise(function (resolve, reject) {
    const request = client.get(url, function (response) {
      if (
        response.statusCode >= 300 &&
        response.statusCode < 400 &&
        response.headers.location
      ) {
        response.resume();
        download(
          new URL(response.headers.location, url).toString(),
          destination,
          count + 1,
        ).then(resolve, reject);
        return;
      }
      if (response.statusCode !== 200) {
        response.resume();
        reject(
          toolError(
            "RUNTIME_TOOL_DOWNLOAD_FAILED",
            "Runtime tool download failed",
          ),
        );
        return;
      }
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      const stream = fs.createWriteStream(destination, { flags: "wx" });
      response.pipe(stream);
      stream.on("finish", function () {
        stream.close(resolve);
      });
      stream.on("error", function (error) {
        const cleanup = cleanupPath(
          destination,
          "RUNTIME_TOOL_DOWNLOAD_CLEANUP_FAILED",
        );
        const failure = toolError(
          "RUNTIME_TOOL_DOWNLOAD_FAILED",
          "Runtime tool download failed",
        );
        if (cleanup) failure.cleanupCode = cleanup.code;
        reject(failure);
      });
      response.on("error", function (error) {
        let cleanup = null;
        try {
          stream.destroy();
        } catch (_) {
          cleanup = toolError(
            "RUNTIME_TOOL_DOWNLOAD_CLEANUP_FAILED",
            "Runtime tool cleanup could not be verified",
          );
        }
        cleanup =
          cleanup ||
          cleanupPath(destination, "RUNTIME_TOOL_DOWNLOAD_CLEANUP_FAILED");
        const failure = toolError(
          "RUNTIME_TOOL_DOWNLOAD_FAILED",
          "Runtime tool download failed",
        );
        if (cleanup) failure.cleanupCode = cleanup.code;
        reject(failure);
      });
    });
    request.on("error", function () {
      reject(
        toolError(
          "RUNTIME_TOOL_DOWNLOAD_FAILED",
          "Runtime tool download failed",
        ),
      );
    });
  });
}

function expandZip(archivePath, destination, runner) {
  fs.mkdirSync(destination, { recursive: true });
  const env = Object.assign({}, process.env, {
    AUTOPUBLISH_RUNTIME_ARCHIVE: archivePath,
    AUTOPUBLISH_RUNTIME_EXTRACT: destination,
  });
  const result = (runner || spawnSync)(
    "powershell.exe",
    [
      "-NoLogo",
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      "Expand-Archive -LiteralPath $env:AUTOPUBLISH_RUNTIME_ARCHIVE -DestinationPath $env:AUTOPUBLISH_RUNTIME_EXTRACT -Force",
    ],
    { encoding: "utf8", env: env, stdio: "pipe" },
  );
  if (result.error || result.status !== 0)
    throw toolError(
      "RUNTIME_TOOL_EXTRACT_FAILED",
      "Runtime tool archive extraction failed",
    );
}

function assertRegularFile(filename, code) {
  let stat;
  try {
    stat = fs.lstatSync(filename);
  } catch (_) {
    throw toolError(code, "Runtime tool file is missing");
  }
  if (!stat.isFile())
    throw toolError(code, "Runtime tool file is not a regular file");
}

function parseArguments(argv) {
  const options = {
    manifest: DEFAULT_MANIFEST,
    output: DEFAULT_OUTPUT,
    cache: DEFAULT_CACHE,
    offline: false,
  };
  const args = Array.from(argv || []);
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (["--manifest", "--output", "--cache"].includes(arg)) {
      if (!args[index + 1] || args[index + 1].startsWith("--"))
        throw toolError(
          "RUNTIME_TOOL_ARGUMENT_INVALID",
          arg + " requires a value",
        );
      options[arg.slice(2)] = path.resolve(args[++index]);
    } else if (arg === "--offline") options.offline = true;
    else
      throw toolError(
        "RUNTIME_TOOL_ARGUMENT_INVALID",
        "Unknown runtime tool argument",
      );
  }
  return options;
}

async function prepareRuntimeTools(options) {
  const opts = options || {};
  const manifest = readManifest(opts.manifest || DEFAULT_MANIFEST);
  const cacheDirectory = opts.cache || DEFAULT_CACHE;
  const archivePath = path.join(cacheDirectory, manifest.archive.fileName);
  try {
    fs.mkdirSync(cacheDirectory, { recursive: true });
  } catch (_) {
    throw toolError(
      "RUNTIME_TOOL_CACHE_UNAVAILABLE",
      "Runtime tool cache is unavailable",
    );
  }
  let archivePresent = cachedArchivePresent(archivePath);
  if (
    archivePresent &&
    archiveSha256(archivePath).toLowerCase() !==
      manifest.archive.sha256.toLowerCase()
  ) {
    const cleanup = cleanupPath(
      archivePath,
      "RUNTIME_TOOL_ARCHIVE_CLEANUP_FAILED",
    );
    if (cleanup) throw cleanup;
    archivePresent = false;
  }
  if (!archivePresent) {
    if (opts.offline)
      throw toolError(
        "RUNTIME_TOOL_ARCHIVE_UNAVAILABLE",
        "Verified runtime tool archive is not cached",
      );
    const downloadPath =
      archivePath + ".download-" + process.pid + "-" + Date.now();
    let primaryError = null;
    try {
      await (opts.download || download)(manifest.archive.url, downloadPath);
      if (
        archiveSha256(downloadPath).toLowerCase() !==
        manifest.archive.sha256.toLowerCase()
      )
        throw toolError(
          "RUNTIME_TOOL_CHECKSUM_MISMATCH",
          "Runtime tool archive checksum does not match the manifest",
        );
      fs.renameSync(downloadPath, archivePath);
    } catch (error) {
      primaryError = normalizedToolError(error, "RUNTIME_TOOL_DOWNLOAD_FAILED");
    }
    const cleanup = cleanupPath(
      downloadPath,
      "RUNTIME_TOOL_DOWNLOAD_CLEANUP_FAILED",
    );
    if (primaryError) throw attachCleanupFailure(primaryError, cleanup);
    if (cleanup) throw cleanup;
    archivePresent = true;
  }
  if (
    !archivePresent ||
    archiveSha256(archivePath).toLowerCase() !==
      manifest.archive.sha256.toLowerCase()
  )
    throw toolError(
      "RUNTIME_TOOL_CHECKSUM_MISMATCH",
      "Runtime tool archive checksum does not match the manifest",
    );

  const extractDirectory = path.join(
    cacheDirectory,
    "extract-" + process.pid + "-" + Date.now(),
  );
  const output = opts.output || DEFAULT_OUTPUT;
  const stagingDirectory =
    output + ".staging-" + process.pid + "-" + Date.now();
  let result = null;
  let primaryError = null;
  let installed = false;
  try {
    const buildInfo = readBuildInfo();
    expandZip(archivePath, extractDirectory, opts.runner);
    const root = path.join(extractDirectory, manifest.archive.rootDirectory);
    const nodeExecutable = path.join(root, "node.exe");
    const license = path.join(root, manifest.archive.licenseFile);
    assertRegularFile(nodeExecutable, "RUNTIME_TOOL_NODE_MISSING");
    assertRegularFile(license, "RUNTIME_TOOL_LICENSE_MISSING");
    fs.mkdirSync(stagingDirectory, { recursive: true });
    fs.copyFileSync(nodeExecutable, path.join(stagingDirectory, "node.exe"));
    fs.copyFileSync(license, path.join(stagingDirectory, "LICENSE"));
    fs.copyFileSync(
      opts.manifest || DEFAULT_MANIFEST,
      path.join(stagingDirectory, "runtime-tools-manifest.json"),
    );
    assertRegularFile(
      path.join(stagingDirectory, "node.exe"),
      "RUNTIME_TOOL_NODE_INVALID",
    );
    assertRegularFile(
      path.join(stagingDirectory, "LICENSE"),
      "RUNTIME_TOOL_LICENSE_INVALID",
    );
    assertRegularFile(
      path.join(stagingDirectory, "runtime-tools-manifest.json"),
      "RUNTIME_TOOL_MANIFEST_INVALID",
    );
    try {
      fs.rmSync(output, { recursive: true, force: true });
    } catch (_) {
      throw toolError(
        "RUNTIME_TOOL_OUTPUT_REPLACE_FAILED",
        "Runtime tool output could not be replaced",
      );
    }
    fs.renameSync(stagingDirectory, output);
    installed = true;
    if (
      !opts.output ||
      path.resolve(opts.output) === path.resolve(DEFAULT_OUTPUT)
    ) {
      fs.mkdirSync(path.dirname(DEFAULT_BUILD_INFO), { recursive: true });
      fs.writeFileSync(
        DEFAULT_BUILD_INFO,
        JSON.stringify(buildInfo) + "\n",
        "utf8",
      );
    }
    result = {
      output,
      archive: archivePath,
      nodeVersion: manifest.nodeVersion,
      sha256: manifest.archive.sha256,
      provenance: buildInfo,
    };
  } catch (error) {
    primaryError = installed
      ? toolError(
          "RUNTIME_TOOL_INSTALL_UNCERTAIN",
          "Runtime tool installation outcome is uncertain",
        )
      : normalizedToolError(error, "RUNTIME_TOOL_INSTALL_FAILED");
    if (installed) {
      primaryError.causeCode =
        error && /^[A-Z0-9_]{1,80}$/.test(error.code || "")
          ? error.code
          : "UNKNOWN";
      primaryError.installationState = "INSTALLED";
      primaryError.operatorAction = "VERIFY_RUNTIME_TOOL_PROVENANCE";
    }
  }
  const stagingCleanup = primaryError
    ? cleanupPath(stagingDirectory, "RUNTIME_TOOL_STAGING_CLEANUP_FAILED")
    : null;
  const extractCleanup = cleanupPath(
    extractDirectory,
    "RUNTIME_TOOL_EXTRACT_CLEANUP_FAILED",
  );
  primaryError = attachCleanupFailure(primaryError, stagingCleanup);
  primaryError = attachCleanupFailure(primaryError, extractCleanup);
  if (primaryError) throw primaryError;
  return result;
}

if (require.main === module) {
  prepareRuntimeTools(parseArguments(process.argv.slice(2)))
    .then(function (result) {
      process.stdout.write(JSON.stringify(result) + "\n");
    })
    .catch(function (error) {
      const code =
        error &&
        typeof error.code === "string" &&
        /^RUNTIME_TOOL_[A-Z0-9_]{1,72}$/.test(error.code)
          ? error.code
          : "RUNTIME_TOOL_PREPARE_FAILED";
      process.stderr.write(code + "\n");
      process.exitCode = 1;
    });
}

module.exports = {
  DEFAULT_MANIFEST,
  DEFAULT_OUTPUT,
  DEFAULT_CACHE,
  readBuildInfo,
  readManifest,
  sha256,
  parseArguments,
  prepareRuntimeTools,
};
