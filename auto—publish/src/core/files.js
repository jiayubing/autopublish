const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const { DIRS, PW } = require("../../scripts/config");
const { log } = require("./logger");

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function getContentWorkspace(root) {
  var resolvedRoot = path.resolve(root);
  return {
    root: resolvedRoot,
    clients: path.join(resolvedRoot, "clients"),
    research: path.join(resolvedRoot, "research"),
    templates: path.join(resolvedRoot, "templates"),
    generated: path.join(resolvedRoot, "generated"),
    published: path.join(resolvedRoot, "published"),
    logs: path.join(resolvedRoot, "logs")
  };
}

function isWindowsReservedDeviceName(clientName) {
  var baseName = clientName.split(".")[0].replace(/[ .]+$/g, "").toUpperCase();
  return /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/.test(baseName);
}

function getClientWorkspace(workspace, clientName) {
  if (typeof clientName !== "string" || clientName.trim() === "") {
    throw new Error("Invalid client name");
  }

  if (
    clientName === "." ||
    clientName === ".." ||
    clientName.includes("/") ||
    clientName.includes("\\") ||
    /[<>:"/\\|?*\u0000-\u001F]/.test(clientName) ||
    clientName.endsWith(" ") ||
    clientName.endsWith(".") ||
    isWindowsReservedDeviceName(clientName) ||
    path.isAbsolute(clientName) ||
    path.win32.isAbsolute(clientName)
  ) {
    throw new Error("Invalid client name");
  }

  var clientRoot = path.resolve(workspace.clients, clientName);
  var relativePath = path.relative(path.resolve(workspace.clients), clientRoot);
  if (relativePath === ".." || relativePath.startsWith(".." + path.sep) || path.isAbsolute(relativePath)) {
    throw new Error("Invalid client name");
  }

  return clientRoot;
}

function ensureAllDirs() {
  Object.keys(DIRS).forEach(function(key) {
    ensureDir(DIRS[key]);
  });
  ensureDir(PW.home);
  ensureDir(path.dirname(PW.profileDir));
  ensureDir(path.dirname(PW.daemonDir));
}

function sleep(ms) {
  execSync("ping 127.0.0.1 -n " + (Math.ceil(ms / 1000) + 1) + " > nul", { timeout: ms + 2000 });
}

function quoteArg(value) {
  return "\"" + String(value).replace(/"/g, "\"\"") + "\"";
}

function copyToFailed(sourceFile, filename) {
  try {
    ensureDir(DIRS.failedDir);
    fs.copyFileSync(sourceFile, path.join(DIRS.failedDir, filename));
    var sidecar = sourceFile + ".meta.json";
    if (fs.existsSync(sidecar)) {
      fs.copyFileSync(sidecar, path.join(DIRS.failedDir, filename + ".meta.json"));
    }
  } catch (e) {}
}

function archivePublishedArticle(article) {
  var target = path.join(DIRS.publishedDir, article.normalizedFilename || article.filename);
  if (!fs.existsSync(article.sourceFile)) {
    log("源文件不存在，跳过移动: " + article.filename, "WARN");
    return;
  }

  var sidecar = article.sourceFile + ".meta.json";
  var hasSidecar = fs.existsSync(sidecar);
  var sidecarTarget = path.join(DIRS.publishedDir, path.basename(target) + ".meta.json");

  if (fs.existsSync(target)) {
    fs.unlinkSync(target);
  }
  fs.renameSync(article.sourceFile, target);

  if (hasSidecar) {
    if (fs.existsSync(sidecarTarget)) {
      fs.unlinkSync(sidecarTarget);
    }
    fs.renameSync(sidecar, sidecarTarget);
  }
  log("已移动到 published: " + path.basename(target), "INFO");
}

module.exports = {
  ensureDir,
  ensureAllDirs,
  sleep,
  quoteArg,
  copyToFailed,
  archivePublishedArticle,
  getContentWorkspace,
  getClientWorkspace
};
