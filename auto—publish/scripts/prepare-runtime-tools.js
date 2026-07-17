const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const https = require("node:https");
const http = require("node:http");
const { spawnSync } = require("node:child_process");

const DEFAULT_MANIFEST = path.resolve(__dirname, "..", "build", "runtime-tools-manifest.json");
const DEFAULT_OUTPUT = path.resolve(__dirname, "..", "build", "runtime-tools", "node");
const DEFAULT_CACHE = path.resolve(__dirname, "..", "build", "runtime-tools-cache");
const DEFAULT_BUILD_INFO = path.resolve(__dirname, "..", "build", "build-info.json");

function readBuildInfo() {
  const root = path.resolve(__dirname, "..");
  let version = "unknown";
  try { version = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).version || version; } catch (_) {}
  let commit = "unknown";
  let dirty = false;
  try { commit = spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).stdout.trim() || commit; } catch (_) {}
  try { dirty = Boolean(spawnSync("git", ["status", "--porcelain=v1"], { cwd: root, encoding: "utf8" }).stdout.trim()); } catch (_) {}
  return { version: version, commit: commit, dirty: dirty };
}

function toolError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function readManifest(filename) {
  let value;
  try { value = JSON.parse(fs.readFileSync(filename, "utf8")); }
  catch (_) { throw toolError("RUNTIME_TOOL_MANIFEST_INVALID", "Runtime tools manifest cannot be read"); }
  const archive = value && value.archive;
  if (!value || value.version !== 1 || value.tool !== "node" || value.platform !== "win-x64" ||
      !/^v\d+\.\d+\.\d+$/.test(value.nodeVersion || "") || !archive ||
      !archive.fileName || !/^https:\/\//i.test(archive.url || "") ||
      !/^[a-f0-9]{64}$/i.test(archive.sha256 || "") ||
      !archive.rootDirectory || archive.rootDirectory.includes("..") || archive.licenseFile !== "LICENSE") {
    throw toolError("RUNTIME_TOOL_MANIFEST_INVALID", "Runtime tools manifest is invalid");
  }
  return value;
}

function sha256(filename) {
  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(filename));
  return hash.digest("hex");
}

function download(url, destination, redirects) {
  const count = redirects || 0;
  if (count > 5) return Promise.reject(toolError("RUNTIME_TOOL_DOWNLOAD_REDIRECT", "Runtime tool download redirected too many times"));
  const client = url.startsWith("https:") ? https : http;
  return new Promise(function(resolve, reject) {
    const request = client.get(url, function(response) {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume();
        download(new URL(response.headers.location, url).toString(), destination, count + 1).then(resolve, reject);
        return;
      }
      if (response.statusCode !== 200) {
        response.resume();
        reject(toolError("RUNTIME_TOOL_DOWNLOAD_FAILED", "Runtime tool download failed"));
        return;
      }
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      const stream = fs.createWriteStream(destination, { flags: "wx" });
      response.pipe(stream);
      stream.on("finish", function() { stream.close(resolve); });
      stream.on("error", function(error) {
        try { fs.unlinkSync(destination); } catch (_) {}
        reject(error);
      });
      response.on("error", function(error) {
        try { stream.destroy(); } catch (_) {}
        try { fs.unlinkSync(destination); } catch (_) {}
        reject(error);
      });
    });
    request.on("error", reject);
  });
}

function expandZip(archivePath, destination, runner) {
  fs.mkdirSync(destination, { recursive: true });
  const env = Object.assign({}, process.env, {
    AUTOPUBLISH_RUNTIME_ARCHIVE: archivePath,
    AUTOPUBLISH_RUNTIME_EXTRACT: destination
  });
  const result = (runner || spawnSync)("powershell.exe", [
    "-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command",
    "Expand-Archive -LiteralPath $env:AUTOPUBLISH_RUNTIME_ARCHIVE -DestinationPath $env:AUTOPUBLISH_RUNTIME_EXTRACT -Force"
  ], { encoding: "utf8", env: env, stdio: "pipe" });
  if (result.error || result.status !== 0) throw toolError("RUNTIME_TOOL_EXTRACT_FAILED", "Runtime tool archive extraction failed");
}

function assertRegularFile(filename, code) {
  let stat;
  try { stat = fs.lstatSync(filename); } catch (_) { throw toolError(code, "Runtime tool file is missing"); }
  if (!stat.isFile()) throw toolError(code, "Runtime tool file is not a regular file");
}

function parseArguments(argv) {
  const options = { manifest: DEFAULT_MANIFEST, output: DEFAULT_OUTPUT, cache: DEFAULT_CACHE, offline: false };
  const args = Array.from(argv || []);
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (["--manifest", "--output", "--cache"].includes(arg)) {
      if (!args[index + 1] || args[index + 1].startsWith("--")) throw toolError("RUNTIME_TOOL_ARGUMENT_INVALID", arg + " requires a value");
      options[arg.slice(2)] = path.resolve(args[++index]);
    } else if (arg === "--offline") options.offline = true;
    else throw toolError("RUNTIME_TOOL_ARGUMENT_INVALID", "Unknown runtime tool argument");
  }
  return options;
}

async function prepareRuntimeTools(options) {
  const opts = options || {};
  const manifest = readManifest(opts.manifest || DEFAULT_MANIFEST);
  const cacheDirectory = opts.cache || DEFAULT_CACHE;
  const archivePath = path.join(cacheDirectory, manifest.archive.fileName);
  fs.mkdirSync(cacheDirectory, { recursive: true });
  if (fs.existsSync(archivePath) && sha256(archivePath).toLowerCase() !== manifest.archive.sha256.toLowerCase()) fs.rmSync(archivePath, { force: true });
  if (!fs.existsSync(archivePath)) {
    if (opts.offline) throw toolError("RUNTIME_TOOL_ARCHIVE_UNAVAILABLE", "Verified runtime tool archive is not cached");
    const downloadPath = archivePath + ".download-" + process.pid + "-" + Date.now();
    try {
      await (opts.download || download)(manifest.archive.url, downloadPath);
      if (sha256(downloadPath).toLowerCase() !== manifest.archive.sha256.toLowerCase()) throw toolError("RUNTIME_TOOL_CHECKSUM_MISMATCH", "Runtime tool archive checksum does not match the manifest");
      fs.renameSync(downloadPath, archivePath);
    } finally { try { fs.unlinkSync(downloadPath); } catch (_) {} }
  }
  if (sha256(archivePath).toLowerCase() !== manifest.archive.sha256.toLowerCase()) throw toolError("RUNTIME_TOOL_CHECKSUM_MISMATCH", "Runtime tool archive checksum does not match the manifest");

  const extractDirectory = path.join(cacheDirectory, "extract-" + process.pid + "-" + Date.now());
  const output = opts.output || DEFAULT_OUTPUT;
  const stagingDirectory = output + ".staging-" + process.pid + "-" + Date.now();
  try {
    expandZip(archivePath, extractDirectory, opts.runner);
    const root = path.join(extractDirectory, manifest.archive.rootDirectory);
    const nodeExecutable = path.join(root, "node.exe");
    const license = path.join(root, manifest.archive.licenseFile);
    assertRegularFile(nodeExecutable, "RUNTIME_TOOL_NODE_MISSING");
    assertRegularFile(license, "RUNTIME_TOOL_LICENSE_MISSING");
    fs.mkdirSync(stagingDirectory, { recursive: true });
    fs.copyFileSync(nodeExecutable, path.join(stagingDirectory, "node.exe"));
    fs.copyFileSync(license, path.join(stagingDirectory, "LICENSE"));
    fs.copyFileSync(opts.manifest || DEFAULT_MANIFEST, path.join(stagingDirectory, "runtime-tools-manifest.json"));
    assertRegularFile(path.join(stagingDirectory, "node.exe"), "RUNTIME_TOOL_NODE_INVALID");
    assertRegularFile(path.join(stagingDirectory, "LICENSE"), "RUNTIME_TOOL_LICENSE_INVALID");
    assertRegularFile(path.join(stagingDirectory, "runtime-tools-manifest.json"), "RUNTIME_TOOL_MANIFEST_INVALID");
    fs.rmSync(output, { recursive: true, force: true });
    fs.renameSync(stagingDirectory, output);
    if (!opts.output || path.resolve(opts.output) === path.resolve(DEFAULT_OUTPUT)) {
      fs.mkdirSync(path.dirname(DEFAULT_BUILD_INFO), { recursive: true });
      fs.writeFileSync(DEFAULT_BUILD_INFO, JSON.stringify(readBuildInfo()) + "\n", "utf8");
    }
    return { output, archive: archivePath, nodeVersion: manifest.nodeVersion, sha256: manifest.archive.sha256 };
  } catch (error) {
    try { fs.rmSync(stagingDirectory, { recursive: true, force: true }); } catch (_) {}
    throw error;
  } finally { try { fs.rmSync(extractDirectory, { recursive: true, force: true }); } catch (_) {} }
}

if (require.main === module) {
  prepareRuntimeTools(parseArguments(process.argv.slice(2))).then(function(result) {
    process.stdout.write(JSON.stringify(result) + "\n");
  }).catch(function(error) {
    process.stderr.write((error.code || "RUNTIME_TOOL_PREPARE_FAILED") + ":" + (error.message || "Runtime tool preparation failed") + "\n");
    process.exitCode = 1;
  });
}

module.exports = { DEFAULT_MANIFEST, DEFAULT_OUTPUT, DEFAULT_CACHE, readManifest, sha256, parseArguments, prepareRuntimeTools };
