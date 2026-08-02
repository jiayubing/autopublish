const fs = require("node:fs");
const path = require("node:path");

const { getContentWorkspace } = require("../core/files");
const {
  createWorkspacePaths,
} = require("../infrastructure/workspace/workspace-paths");
const { assertContentSegment, isSafeSegment } = require("./content-identity");

function pathError(code, message, cause) {
  const error = new Error(message || code);
  error.code = code;
  if (cause) error.cause = cause;
  return error;
}

function sameOrWithin(parent, child) {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  return (
    relative === "" ||
    (relative !== ".." &&
      !relative.startsWith(".." + path.sep) &&
      !path.isAbsolute(relative))
  );
}

function isMissing(error) {
  return error && (error.code === "ENOENT" || error.code === "ENOTDIR");
}

function createContentPathPolicy(workspaceRoot, options) {
  const opts = options || {};
  const legacyWorkspace = getContentWorkspace(workspaceRoot, opts.paths);
  const workspace = Object.assign(
    {},
    createWorkspacePaths(
      legacyWorkspace.root,
      opts.paths && opts.paths.installation ? opts.paths : null,
    ),
    legacyWorkspace,
    opts.paths || {},
    { root: path.resolve(legacyWorkspace.root) },
  );
  const fsApi = opts.fs || fs;
  const makeError = typeof opts.error === "function" ? opts.error : pathError;

  function fail(code, message, cause) {
    throw makeError(code, message, cause);
  }

  function assertSegment(value, code, label, segmentOptions) {
    try {
      return assertContentSegment(value, label, {
        code: code,
        error: function (errorCode, message) {
          return makeError(errorCode, message);
        },
        ...(segmentOptions || {}),
      });
    } catch (error) {
      if (error && error.code === code) throw error;
      fail(code, "Invalid " + label, error);
    }
  }

  function assertLexicalInside(boundary, target, code, message) {
    if (!sameOrWithin(boundary, target))
      fail(code, message || "Path is outside its boundary");
    return path.resolve(target);
  }

  function inspectDirectory(directory, config) {
    const value = config || {};
    const target = path.resolve(directory);
    const boundary = path.resolve(value.boundary || target);
    assertLexicalInside(
      boundary,
      target,
      value.code,
      value.label + " is outside its boundary",
    );

    let current = boundary;
    const relative = path.relative(boundary, target);
    const parts = relative ? relative.split(path.sep).filter(Boolean) : [];
    const all = [current].concat(
      parts.map(function (part) {
        current = path.join(current, part);
        return current;
      }),
    );

    for (const item of all) {
      let stats;
      try {
        stats = fsApi.lstatSync(item);
      } catch (error) {
        if (!isMissing(error))
          fail(value.code, value.label + " is unsafe", error);
        if (!value.create) return value.returnMissing === false ? null : target;
        try {
          fsApi.mkdirSync(item);
        } catch (createError) {
          if (createError && createError.code !== "EEXIST")
            fail(
              value.code,
              value.label + " could not be created",
              createError,
            );
          try {
            stats = fsApi.lstatSync(item);
          } catch (retryError) {
            fail(value.code, value.label + " is unsafe", retryError);
          }
        }
        if (!stats) stats = fsApi.lstatSync(item);
      }
      if (!stats.isDirectory() || stats.isSymbolicLink())
        fail(value.code, value.label + " is unsafe");
    }

    let realBoundary;
    let realTarget;
    try {
      realBoundary = fsApi.realpathSync(boundary);
      realTarget = fsApi.realpathSync(target);
    } catch (error) {
      fail(value.code, value.label + " is unsafe", error);
    }
    if (!sameOrWithin(realBoundary, realTarget))
      fail(value.code, value.label + " resolves outside its boundary");
    return target;
  }

  function existingDirectory(directory, config) {
    const value = Object.assign({}, config || {}, {
      create: false,
      returnMissing: false,
    });
    try {
      return inspectDirectory(directory, value);
    } catch (error) {
      if (isMissing(error)) return null;
      throw error;
    }
  }

  function assertWorkspaceRoot(config) {
    const value = config || {};
    return inspectDirectory(workspace.root, {
      boundary: workspace.root,
      create: false,
      returnMissing: false,
      code: value.code || "CONTENT_PATH_OUT_OF_BOUNDS",
      label: value.label || "Workspace root",
    });
  }

  function assertRegularFile(filename, config) {
    const value = config || {};
    const target = path.resolve(filename);
    const boundary = path.resolve(value.boundary || path.dirname(target));
    assertLexicalInside(
      boundary,
      target,
      value.code,
      value.label + " is outside its boundary",
    );
    let stats;
    try {
      stats = fsApi.lstatSync(target);
    } catch (error) {
      if (isMissing(error) && value.allowMissing) return false;
      fail(value.code, value.label + " is unsafe", error);
    }
    if (!stats.isFile() || stats.isSymbolicLink())
      fail(value.code, value.label + " is unsafe");
    try {
      const realBoundary = fsApi.realpathSync(boundary);
      const realTarget = fsApi.realpathSync(target);
      if (!sameOrWithin(realBoundary, realTarget))
        fail(value.code, value.label + " resolves outside its boundary");
    } catch (error) {
      fail(value.code, value.label + " is unsafe", error);
    }
    return true;
  }

  function directory(root, segment, config) {
    const value = config || {};
    const code = value.code || "CONTENT_PATH_OUT_OF_BOUNDS";
    const label = value.label || "Content directory";
    const base = inspectDirectory(root, {
      boundary: value.boundary || root,
      create: value.createRoot !== false,
      code: code,
      label: label,
    });
    if (!base) return null;
    assertSegment(segment, code, value.segmentLabel || "directory");
    const target = path.resolve(base, segment);
    assertLexicalInside(base, target, code, label + " is outside its boundary");
    return inspectDirectory(target, {
      boundary: base,
      create: Boolean(value.create),
      returnMissing: value.returnMissing !== false,
      code: code,
      label: label,
    });
  }

  function articlePaths(clientId, articleId, create) {
    const code = "ARTICLE_PATH_OUT_OF_BOUNDS";
    assertSegment(clientId, code, "client id");
    assertSegment(articleId, code, "article id");
    const generated = inspectDirectory(workspace.generated, {
      boundary: workspace.root,
      create: true,
      code: code,
      label: "Generated directory",
    });
    const clientDirectory = inspectDirectory(path.join(generated, clientId), {
      boundary: generated,
      create: Boolean(create),
      returnMissing: true,
      code: code,
      label: "Client directory",
    });
    return {
      directory: clientDirectory,
      json: path.join(clientDirectory, articleId + ".json"),
      markdown: path.join(clientDirectory, articleId + ".md"),
    };
  }

  function articleLock(files) {
    const directory = path.join(
      files.directory,
      path.basename(files.json, ".json") + ".article-lock",
    );
    assertLexicalInside(
      files.directory,
      directory,
      "ARTICLE_PATH_OUT_OF_BOUNDS",
      "Article lock is outside its directory",
    );
    return { directory: directory, owner: path.join(directory, "owner.json") };
  }

  function trashRoot(create) {
    const autopublish = inspectDirectory(
      path.join(workspace.root, ".autopublish"),
      {
        boundary: workspace.root,
        create: Boolean(create),
        returnMissing: true,
        code: "ARTICLE_PATH_OUT_OF_BOUNDS",
        label: "Article state directory",
      },
    );
    if (!autopublish) return null;
    return inspectDirectory(path.join(autopublish, "article-trash"), {
      boundary: autopublish,
      create: Boolean(create),
      returnMissing: true,
      code: "ARTICLE_PATH_OUT_OF_BOUNDS",
      label: "Article trash directory",
    });
  }

  function trashPaths(clientId, articleId, create) {
    const code = "ARTICLE_PATH_OUT_OF_BOUNDS";
    assertSegment(clientId, code, "client id");
    assertSegment(articleId, code, "article id");
    const root = trashRoot(create);
    if (!root) return null;
    const directory = inspectDirectory(path.join(root, clientId), {
      boundary: root,
      create: Boolean(create),
      returnMissing: true,
      code: code,
      label: "Trash client directory",
    });
    return {
      directory: directory,
      json: path.join(directory, articleId + ".json"),
      markdown: path.join(directory, articleId + ".md"),
      tombstone: path.join(directory, articleId + ".tombstone.json"),
      journal: path.join(directory, articleId + ".trash.journal"),
    };
  }

  function generationBatchDirectory(create) {
    return inspectDirectory(workspace.generationBatches, {
      boundary: workspace.root,
      create: Boolean(create),
      returnMissing: true,
      code: "GENERATION_BATCH_PATH_UNSAFE",
      label: "Generation batch directory",
    });
  }

  function generationBatchFile(batchId, create) {
    const directory = generationBatchDirectory(create);
    if (!directory) return null;
    assertSegment(batchId, "GENERATION_INVALID_ID", "batch id", {
      maxLength: 200,
      requireTrimmed: true,
    });
    return path.join(directory, "batch-" + batchId + ".json");
  }

  function listGenerationBatchFiles() {
    const directory = generationBatchDirectory(false);
    if (!directory) return [];
    const names = new Set();
    fsApi.readdirSync(directory, { withFileTypes: true })
      .filter(function (entry) {
        return entry.isFile() && !entry.isSymbolicLink();
      })
      .forEach(function (entry) {
        const match = /^batch-(.+)\.json(?:\.(?:journal|bak|tmp))?$/.exec(entry.name);
        if (!match) return;
        if (!isSafeSegment(match[1], { maxLength: 200, requireTrimmed: true })) return;
        names.add("batch-" + match[1] + ".json");
      });
    return Array.from(names).map(function (name) {
      return path.join(directory, name);
    });
  }

  function templateDirectory(platform, create) {
    const code = "TEMPLATE_INVALID_PLATFORM";
    assertSegment(platform, code, "platform");
    const root = inspectDirectory(workspace.templates, {
      boundary: workspace.root,
      create: Boolean(create),
      returnMissing: true,
      code: code,
      label: "Template directory",
    });
    if (!root) return path.resolve(workspace.templates, platform);
    return inspectDirectory(path.join(root, platform), {
      boundary: root,
      create: Boolean(create),
      returnMissing: true,
      code: code,
      label: "Template platform directory",
    });
  }

  function templateFile(platform, templateId, create) {
    const directory = templateDirectory(platform, create);
    assertSegment(templateId, "TEMPLATE_INVALID_ID", "id");
    assertLexicalInside(
      directory,
      path.join(directory, templateId + ".md"),
      "TEMPLATE_INVALID_ID",
      "Template id is outside workspace",
    );
    return path.join(directory, templateId + ".md");
  }

  function resourceDirectory(root, segment, code, label) {
    assertSegment(segment, code, label);
    const base = path.resolve(root);
    const target = path.resolve(base, segment);
    assertLexicalInside(base, target, code, label + " is outside its root");
    if (!fsApi.existsSync(base) || !fsApi.existsSync(target)) return target;
    try {
      const realBase = fsApi.realpathSync(base);
      const realTarget = fsApi.realpathSync(target);
      if (!sameOrWithin(realBase, realTarget))
        fail(code, label + " resolves outside its root");
    } catch (error) {
      fail(code, label + " is unsafe", error);
    }
    return target;
  }

  function clientDirectory(clientId, physicalDirectory) {
    const code = "CLIENT_PATH_OUT_OF_BOUNDS";
    assertSegment(clientId, code, "client id");
    const clientsRoot = inspectDirectory(workspace.clients, {
      boundary: workspace.root,
      create: false,
      returnMissing: false,
      code: code,
      label: "Clients directory",
    });
    if (!clientsRoot)
      fail("CLIENT_NOT_FOUND", "Client directory was not found");
    const directory = path.resolve(
      physicalDirectory || path.join(clientsRoot, clientId),
    );
    assertLexicalInside(
      clientsRoot,
      directory,
      code,
      "Client directory is outside clients",
    );
    const checked = inspectDirectory(directory, {
      boundary: clientsRoot,
      create: false,
      returnMissing: false,
      code: code,
      label: "Client directory",
    });
    if (!checked) fail("CLIENT_NOT_FOUND", "Client directory was not found");
    return {
      directory: checked,
      realDirectory: fsApi.realpathSync(checked),
      realClientsRoot: fsApi.realpathSync(clientsRoot),
    };
  }

  function materialFile(client, name) {
    if (!client || typeof client.directory !== "string")
      fail("CLIENT_PATH_OUT_OF_BOUNDS", "Client directory is unsafe");
    assertSegment(name, "CLIENT_PATH_OUT_OF_BOUNDS", "material name");
    const target = path.join(client.directory, name);
    assertLexicalInside(
      client.directory,
      target,
      "CLIENT_PATH_OUT_OF_BOUNDS",
      "Material file is outside client directory",
    );
    return target;
  }

  function cacheDirectory(root, clientId, create) {
    const base = inspectDirectory(root, {
      boundary: root,
      create: Boolean(create),
      returnMissing: true,
      code: "CLIENT_PATH_OUT_OF_BOUNDS",
      label: "Material cache directory",
    });
    if (!base) return null;
    assertSegment(clientId, "CLIENT_PATH_OUT_OF_BOUNDS", "client cache id");
    return inspectDirectory(path.join(base, clientId), {
      boundary: base,
      create: Boolean(create),
      returnMissing: true,
      code: "CLIENT_PATH_OUT_OF_BOUNDS",
      label: "Material cache client directory",
    });
  }

  return {
    root: path.resolve(workspace.root),
    workspace: workspace,
    fs: fsApi,
    sameOrWithin,
    assertLexicalInside,
    assertDirectory: inspectDirectory,
    existingDirectory,
    assertWorkspaceRoot,
    assertRegularFile,
    articlePaths,
    articleLock,
    trashPaths,
    generationBatchDirectory,
    generationBatchFile,
    listGenerationBatchFiles,
    templateDirectory,
    templateFile,
    resourceDirectory,
    clientDirectory,
    materialFile,
    cacheDirectory,
    isSafeSegment,
  };
}

module.exports = {
  createContentPathPolicy,
  sameOrWithin,
  isMissing,
  pathError,
};
