const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const { DIRS, PW } = require("../../scripts/config");
const { log } = require("./logger");
const { createWorkspacePaths } = require("../../desktop/workspace-paths");

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function getContentWorkspace(root, suppliedPaths) {
  var input = root && typeof root === "object" ? root : null;
  var paths = suppliedPaths || (input && input.paths) || (input && input.contentLibrary ? input : null);
  var resolvedRoot = path.resolve(typeof root === "string" ? root : (paths && (paths.contentLibrary || paths.root)));
  if (!paths) {
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
  var workspace = createWorkspacePaths(resolvedRoot, paths && paths.installation ? paths : null);
  return Object.assign({}, workspace, {
    root: resolvedRoot,
    clients: workspace.clients,
    research: workspace.research,
    templates: workspace.templates,
    generated: workspace.generated,
    published: workspace.published,
    logs: workspace.logs || DIRS.logsDir
  });
}

function configureRuntimePaths(paths) {
  if (!paths || typeof paths !== "object") throw new Error("runtime paths are required");
  DIRS.rootDir = paths.contentLibrary || paths.workspaceRoot || paths.root;
  DIRS.inputDir = paths.input;
  DIRS.publishedDir = paths.published;
  DIRS.failedDir = paths.failed;
  DIRS.tmpDir = paths.tmp;
  DIRS.logsDir = paths.logs;
  DIRS.dataDir = paths.data;
  DIRS.stateDir = paths.browser ? path.join(paths.browser, "state") : path.join(paths.work, "playwright-cli", "state");
  PW.home = paths.browser || path.join(paths.work, "playwright-cli");
  PW.profileDir = paths.doubaoBrowser || path.join(PW.home, "profiles", PW.session);
  PW.daemonDir = path.join(PW.home, "sessions", PW.session);
  return paths;
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
  getClientWorkspace,
  configureRuntimePaths
};
