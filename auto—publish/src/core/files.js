const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const { DIRS, PW } = require("../../scripts/config");
const { reportDiagnostic } = require("../diagnostics/diagnostic-producer");
const { createWorkspacePaths } = require("../../desktop/workspace-paths");

var archiveSequence = 0;

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
  PW.browserChannel = paths.browserChannel || process.env.BROWSER_CHANNEL || "msedge";
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
    [".meta.json", ".submission.json"].forEach(function(suffix) {
      var sidecar = sourceFile + suffix;
      if (fs.existsSync(sidecar)) {
        fs.copyFileSync(sidecar, path.join(DIRS.failedDir, filename + suffix));
      }
    });
  } catch (e) {}
}

function archivePublishedArticle(article, suppliedPaths) {
  var source = article && article.sourceFile;
  var filename = article && (article.normalizedFilename || article.filename);
  var archivePaths = suppliedPaths || {};
  var publishedDir = archivePaths.published || DIRS.publishedDir;
  var target = path.join(publishedDir, filename);
  var sidecars = [".meta.json", ".submission.json"].map(function(suffix) {
    return {
      suffix: suffix,
      source: source + suffix,
      target: target + suffix,
      hasSource: false,
      sourceStage: null,
      targetStage: null,
      sourceStaged: false,
      inTargetStage: false,
      targeted: false
    };
  });
  var targetStage;
  var sourceStaged = false;
  var articleInTargetStage = false;
  var articleTargeted = false;

  if (!source || !filename || !fs.existsSync(source)) {
    throw createArchiveError("PUBLISHED_ARCHIVE_FAILED", "Published article archive failed");
  }

  ensureDir(publishedDir);
  sidecars.forEach(function(sidecar) {
    sidecar.hasSource = fs.existsSync(sidecar.source);
  });
  if (fs.existsSync(target) || sidecars.some(function(sidecar) { return fs.existsSync(sidecar.target); })) {
    throw createArchiveError("PUBLISHED_ARCHIVE_CONFLICT", "Published article archive target already exists");
  }

  archiveSequence += 1;
  var token = process.pid + "-" + Date.now() + "-" + archiveSequence;
  sourceStage = source + ".autopublish-archive-" + token + ".stage";
  targetStage = target + ".autopublish-archive-" + token + ".stage";
  sidecars.forEach(function(sidecar) {
    sidecar.sourceStage = sidecar.source + ".autopublish-archive-" + token + ".stage";
    sidecar.targetStage = sidecar.target + ".autopublish-archive-" + token + ".stage";
  });

  try {
    fs.renameSync(source, sourceStage);
    sourceStaged = true;

    sidecars.filter(function(sidecar) { return sidecar.hasSource; }).forEach(function(sidecar) {
      fs.renameSync(sidecar.source, sidecar.sourceStage);
      sidecar.sourceStaged = true;
    });

    fs.renameSync(sourceStage, targetStage);
    articleInTargetStage = true;

    sidecars.filter(function(sidecar) { return sidecar.hasSource; }).forEach(function(sidecar) {
      fs.renameSync(sidecar.sourceStage, sidecar.targetStage);
      sidecar.inTargetStage = true;
    });

    if (fs.existsSync(target) || sidecars.some(function(sidecar) { return fs.existsSync(sidecar.target); })) {
      throw createArchiveError("PUBLISHED_ARCHIVE_CONFLICT", "Published article archive target already exists");
    }

    fs.renameSync(targetStage, target);
    articleTargeted = true;

    sidecars.filter(function(sidecar) { return sidecar.hasSource; }).forEach(function(sidecar) {
      fs.renameSync(sidecar.targetStage, sidecar.target);
      sidecar.targeted = true;
    });
  } catch (error) {
    var rollbackError = null;
    function rollback(from, to, shouldMove) {
      if (!shouldMove || !fs.existsSync(from)) return;
      try {
        fs.renameSync(from, to);
      } catch (rollbackFailure) {
        rollbackError = rollbackError || rollbackFailure;
      }
    }

    sidecars.slice().reverse().forEach(function(sidecar) {
      rollback(sidecar.target, sidecar.targetStage, sidecar.targeted);
    });
    rollback(target, targetStage, articleTargeted);
    sidecars.slice().reverse().forEach(function(sidecar) {
      rollback(sidecar.targetStage, sidecar.sourceStage, sidecar.inTargetStage);
    });
    rollback(targetStage, sourceStage, articleInTargetStage);
    sidecars.slice().reverse().forEach(function(sidecar) {
      rollback(sidecar.sourceStage, sidecar.source, sidecar.sourceStaged);
    });
    rollback(sourceStage, source, sourceStaged);

    if (rollbackError) {
      throw createArchiveError("PUBLISHED_ARCHIVE_FAILED", "Published article archive failed");
    }
    if (error && error.code === "PUBLISHED_ARCHIVE_CONFLICT") {
      throw error;
    }
    if (error && error.code === "EEXIST" && (fs.existsSync(target) || sidecars.some(function(sidecar) { return fs.existsSync(sidecar.target); }))) {
      throw createArchiveError("PUBLISHED_ARCHIVE_CONFLICT", "Published article archive target already exists");
    }
    throw createArchiveError("PUBLISHED_ARCHIVE_FAILED", "Published article archive failed");
  }

  reportDiagnostic({
    code: "PUBLISHED_ARCHIVE_COMPLETED",
    module: "core-files",
    category: "storage",
    operationId: "published-archive",
    metadata: { outcome: "completed" },
  });
  return {
    target: target,
    sidecar: sidecars.filter(function(sidecar) { return sidecar.hasSource; }).map(function(sidecar) { return sidecar.target; })[0] || null,
    sidecars: sidecars.filter(function(sidecar) { return sidecar.hasSource; }).map(function(sidecar) { return sidecar.target; })
  };
}

function createArchiveError(code, message) {
  var error = new Error(message);
  error.code = code;
  return error;
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
