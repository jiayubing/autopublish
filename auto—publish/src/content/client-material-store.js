const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const { extractDocxText } = require("../core/docx-text-extractor");
const { createWorkspacePaths } = require("../../desktop/workspace-paths");
const { getClient } = require("./client-knowledge");

const SUPPORTED_EXTENSIONS = new Set([".txt", ".md", ".markdown", ".json", ".docx"]);
const EXCLUDED_NAMES = new Set(["questions.json", "client.json", "search_query.txt"]);
const MATERIAL_ERROR_MESSAGES = {
  MATERIAL_DOCX_INVALID: "DOCX input is invalid",
  MATERIAL_DOCX_EMPTY: "DOCX does not contain readable text",
  MATERIAL_DOCX_ENCRYPTED: "DOCX is encrypted or damaged",
  MATERIAL_DOCX_CONVERSION_FAILED: "DOCX conversion failed",
  MATERIAL_READ_FAILED: "Client material could not be read"
};

function materialError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function pathError() {
  return materialError("CLIENT_PATH_OUT_OF_BOUNDS", "Client material path is outside workspace.clients");
}

function assertClientId(clientId) {
  if (typeof clientId !== "string" || !clientId || clientId === "." || clientId === ".." ||
      clientId.includes("/") || clientId.includes("\\") || path.isAbsolute(clientId) || path.win32.isAbsolute(clientId)) {
    throw pathError();
  }
}

function isWithin(parent, child) {
  const relative = path.relative(parent, child);
  return relative && relative !== ".." && !relative.startsWith(".." + path.sep) && !path.isAbsolute(relative);
}

function isMissing(error) {
  return error && (error.code === "ENOENT" || error.code === "ENOTDIR");
}

function encodeMaterialId(name) {
  return Buffer.from(name, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeMaterialId(id) {
  if (typeof id !== "string" || !/^[A-Za-z0-9_-]+$/.test(id)) return null;
  try {
    const padding = "=".repeat((4 - id.length % 4) % 4);
    return Buffer.from(id.replace(/-/g, "+").replace(/_/g, "/") + padding, "base64").toString("utf8");
  } catch (_) {
    return null;
  }
}

function defaultHash(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function characterCount(content) {
  return Array.from(content).length;
}

function safeErrorCode(error) {
  if (error && MATERIAL_ERROR_MESSAGES[error.code]) return error.code;
  return "MATERIAL_DOCX_CONVERSION_FAILED";
}

function safeErrorDto(error) {
  const code = safeErrorCode(error);
  return { code: code, message: MATERIAL_ERROR_MESSAGES[code] };
}

function createClientMaterialStore(options) {
  const opts = options || {};
  if (typeof opts.workspaceRoot !== "string" || !opts.workspaceRoot) throw pathError();

  const workspaceRoot = path.resolve(opts.workspaceRoot);
  const paths = opts.paths || createWorkspacePaths(workspaceRoot);
  const clientsRoot = paths.clients;
  const cacheBoundary = path.resolve(paths.localState || workspaceRoot);
  const cacheRoot = path.resolve(paths.clientMaterialCache || path.join(paths.work || path.join(workspaceRoot, "work"), "client-material-cache"));
  const clientKnowledge = opts.clientKnowledge || { getClient: function(clientId) { return getClient(workspaceRoot, clientId); } };
  const converter = typeof opts.converter === "function"
    ? opts.converter
    : function(buffer) { return extractDocxText({ buffer: buffer }); };
  const hash = typeof opts.hash === "function" ? opts.hash : defaultHash;
  const cacheVersion = opts.cacheVersion === undefined ? 2 : opts.cacheVersion;

  function getClientDirectory(clientId) {
    assertClientId(clientId);
    let realWorkspaceRoot;
    try { realWorkspaceRoot = fs.realpathSync(workspaceRoot); } catch (_) { throw pathError(); }
    let realClientsRoot;
    try {
      const clientsStats = fs.lstatSync(clientsRoot);
      if (!clientsStats.isDirectory() || clientsStats.isSymbolicLink()) throw pathError();
      realClientsRoot = fs.realpathSync(clientsRoot);
    } catch (error) {
      if (error && error.code === "CLIENT_PATH_OUT_OF_BOUNDS") throw error;
      if (isMissing(error)) throw materialError("CLIENT_NOT_FOUND", "Client directory was not found");
      throw pathError();
    }
    if (!isWithin(realWorkspaceRoot, realClientsRoot)) throw pathError();

    let client;
    try {
      client = clientKnowledge.getClient(clientId);
    } catch (error) {
      if (error && error.code === "CLIENT_PATH_OUT_OF_BOUNDS") throw pathError();
      if (error && error.code === "CLIENT_NOT_FOUND") throw materialError("CLIENT_NOT_FOUND", "Client directory was not found");
      throw pathError();
    }
    const directory = client && typeof client.directory === "string" ? path.resolve(client.directory) : null;
    if (!directory || !isWithin(path.resolve(clientsRoot), directory)) throw pathError();
    let stats;
    try { stats = fs.lstatSync(directory); } catch (error) {
      if (isMissing(error)) throw materialError("CLIENT_NOT_FOUND", "Client directory was not found");
      throw pathError();
    }
    if (!stats.isDirectory() || stats.isSymbolicLink()) throw pathError();
    let realDirectory;
    try { realDirectory = fs.realpathSync(directory); } catch (_) { throw pathError(); }
    if (!isWithin(realClientsRoot, realDirectory)) throw pathError();
    return { directory: directory, realDirectory: realDirectory, realClientsRoot: realClientsRoot };
  }

  function getCacheDirectory(clientId) {
    try {
      fs.mkdirSync(cacheBoundary, { recursive: true });
      const boundaryStats = fs.lstatSync(cacheBoundary);
      if (!boundaryStats.isDirectory() || boundaryStats.isSymbolicLink()) throw pathError();
      const realCacheBoundary = fs.realpathSync(cacheBoundary);
      if (!isWithin(path.resolve(cacheBoundary), cacheRoot)) throw pathError();
      const cacheStats = fs.existsSync(cacheRoot) ? fs.lstatSync(cacheRoot) : null;
      if (cacheStats && (!cacheStats.isDirectory() || cacheStats.isSymbolicLink())) throw pathError();
      fs.mkdirSync(cacheRoot, { recursive: true });
      const realCacheRoot = fs.realpathSync(cacheRoot);
      if (!isWithin(realCacheBoundary, realCacheRoot)) throw pathError();
    } catch (error) {
      if (error && error.code === "CLIENT_PATH_OUT_OF_BOUNDS") throw error;
      throw pathError();
    }
    const directory = path.join(cacheRoot, encodeMaterialId(clientId));
    fs.mkdirSync(directory, { recursive: true });
    const realCacheRoot = fs.realpathSync(cacheRoot);
    const realDirectory = fs.realpathSync(directory);
    if (!isWithin(path.resolve(cacheBoundary), realCacheRoot) || !isWithin(realCacheRoot, realDirectory)) throw pathError();
    return directory;
  }

  function materialErrorDto(name, extension, error) {
    return {
      id: encodeMaterialId(name),
      name: name,
      extension: extension,
      status: "error",
      error: safeErrorDto(error),
      content: "",
      characterCount: 0
    };
  }

  function readMaterialFile(client, name) {
    const filePath = path.join(client.directory, name);
    let stats;
    try { stats = fs.lstatSync(filePath); } catch (error) {
      if (isMissing(error)) throw materialError("MATERIAL_READ_FAILED", "Client material could not be read");
      throw pathError();
    }
    if (!stats.isFile() || stats.isSymbolicLink()) throw pathError();
    const realFile = fs.realpathSync(filePath);
    if (!isWithin(client.realDirectory, realFile)) throw pathError();
    try { return fs.readFileSync(filePath); } catch (error) {
      const failure = materialError("MATERIAL_READ_FAILED", "Client material could not be read");
      failure.cause = error;
      throw failure;
    }
  }

  function cachePath(clientId, name, sourceHash) {
    const cacheDirectory = getCacheDirectory(clientId);
    return path.join(cacheDirectory, encodeMaterialId(name) + "-" + encodeMaterialId(String(sourceHash)) + "-v" + encodeMaterialId(String(cacheVersion)) + ".json");
  }

  function readCache(filename, clientId, name, sourceHash) {
    try {
      const stats = fs.lstatSync(filename);
      if (!stats.isFile() || stats.isSymbolicLink()) return null;
      const document = JSON.parse(fs.readFileSync(filename, "utf8"));
      if (!document || document.version !== cacheVersion || document.clientId !== clientId ||
          document.name !== name || document.sourceHash !== sourceHash || typeof document.content !== "string") return null;
      return document;
    } catch (_) {
      return null;
    }
  }

  function writeAtomic(filename, document) {
    const temporary = filename + ".tmp-" + process.pid + "-" + Date.now() + "-" + Math.random().toString(16).slice(2);
    try {
      fs.writeFileSync(temporary, JSON.stringify(document) + "\n", "utf8");
      try { fs.renameSync(temporary, filename); } catch (error) {
        if (!fs.existsSync(filename)) throw error;
        fs.unlinkSync(temporary);
      }
    } finally {
      try { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); } catch (_) {}
    }
  }

  async function loadEntry(clientId, client, entry, forceConversion) {
    const extension = path.extname(entry.name).toLowerCase();
    const id = encodeMaterialId(entry.name);
    let source;
    try { source = readMaterialFile(client, entry.name); } catch (error) {
      if (error && error.code === "MATERIAL_READ_FAILED") return materialErrorDto(entry.name, extension, error);
      throw error;
    }
    if (extension !== ".docx") {
      const content = source.toString("utf8");
      return { id: id, name: entry.name, extension: extension, status: "ready", content: content, characterCount: characterCount(content), contentHash: await hash(source), source: "text" };
    }

    const sourceHash = await hash(source);
    const filename = cachePath(clientId, entry.name, sourceHash);
    if (!forceConversion) {
      const cached = readCache(filename, clientId, entry.name, sourceHash);
      if (cached) return {
        id: id, name: entry.name, extension: extension, status: "ready", content: cached.content,
        characterCount: cached.characterCount, contentHash: cached.sourceHash, source: "docx", cacheHit: true
      };
    }

    try {
      const content = await converter(source, { clientId: clientId, name: entry.name, version: cacheVersion });
      if (typeof content !== "string") throw materialError("MATERIAL_DOCX_CONVERSION_FAILED", "DOCX conversion failed");
      const result = {
        version: cacheVersion,
        clientId: clientId,
        name: entry.name,
        sourceHash: sourceHash,
        content: content,
        characterCount: characterCount(content),
        convertedAt: new Date().toISOString()
      };
      writeAtomic(filename, result);
      return { id: id, name: entry.name, extension: extension, status: "ready", content: content, characterCount: result.characterCount, contentHash: sourceHash, source: "docx", cacheHit: false };
    } catch (error) {
      return materialErrorDto(entry.name, extension, error);
    }
  }

  async function listMaterials(clientId, internalOptions) {
    const client = getClientDirectory(clientId);
    let entries;
    try { entries = fs.readdirSync(client.directory, { withFileTypes: true }); } catch (error) {
      if (isMissing(error)) throw materialError("CLIENT_NOT_FOUND", "Client directory was not found");
      throw pathError();
    }
    const materialEntries = entries.filter(function(entry) {
      if (!entry.isFile() || entry.name.startsWith(".") || EXCLUDED_NAMES.has(entry.name)) return false;
      return SUPPORTED_EXTENSIONS.has(path.extname(entry.name).toLowerCase());
    }).sort(function(a, b) { return a.name.localeCompare(b.name); });
    const forceName = internalOptions && internalOptions.forceName;
    const results = [];
    for (const entry of materialEntries) results.push(await loadEntry(clientId, client, entry, forceName === entry.name));
    return results;
  }

  async function getSelectedMaterials(clientId, materialIds) {
    if (!Array.isArray(materialIds)) throw materialError("CLIENT_MATERIAL_INVALID", "Client material selection is invalid");
    const materials = await listMaterials(clientId);
    return materialIds.map(function(materialId) {
      if (typeof materialId !== "string" || materialId.includes("/") || materialId.includes("\\")) {
        throw materialError("CLIENT_MATERIAL_INVALID", "Client material selection is invalid");
      }
      const item = materials.find(function(material) { return material.id === materialId || material.name === materialId; });
      if (!item) throw materialError("CLIENT_MATERIAL_NOT_FOUND", "Client material was not found");
      return item;
    });
  }

  async function retryMaterial(clientId, materialId) {
    const decoded = decodeMaterialId(materialId) || (typeof materialId === "string" && !materialId.includes("/") && !materialId.includes("\\") ? materialId : null);
    if (!decoded) throw materialError("CLIENT_MATERIAL_INVALID", "Client material selection is invalid");
    const materials = await listMaterials(clientId, { forceName: decoded });
    const item = materials.find(function(material) { return material.name === decoded; });
    if (!item) throw materialError("CLIENT_MATERIAL_NOT_FOUND", "Client material was not found");
    return item;
  }

  return { listMaterials: listMaterials, getSelectedMaterials: getSelectedMaterials, retryMaterial: retryMaterial };
}

module.exports = { createClientMaterialStore, encodeMaterialId };
