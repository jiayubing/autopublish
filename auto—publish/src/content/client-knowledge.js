const fs = require("fs");
const path = require("path");

const { getContentWorkspace, getClientWorkspace } = require("../core/files");

// Legacy knowledge loading remains synchronous and text-only. DOCX is handled
// by client-material-store so it can be converted, cached, and retried safely.
const TEXT_KNOWLEDGE_EXTENSIONS = new Set([".txt", ".md", ".markdown", ".json"]);
const RESERVED_KNOWLEDGE_FILES = new Set(["search_query.txt", "client.json", "questions.json"]);

function contentError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function pathOutOfBounds() {
  return contentError("CLIENT_PATH_OUT_OF_BOUNDS", "Client path is outside workspace.clients");
}

function isMissingPathError(error) {
  return error && (error.code === "ENOENT" || error.code === "ENOTDIR");
}

function getClientsRoot(workspaceRoot) {
  if (typeof workspaceRoot !== "string" || !workspaceRoot) throw pathOutOfBounds();
  const workspace = getContentWorkspace(workspaceRoot);
  return { workspaceRoot: workspace.root, clientsRoot: workspace.clients };
}

function isPathWithin(parent, child) {
  const relative = path.relative(parent, child);
  return relative && relative !== ".." && !relative.startsWith(".." + path.sep) && !path.isAbsolute(relative);
}

function resolveRealPath(filename, allowMissing) {
  try {
    return fs.realpathSync(filename);
  } catch (error) {
    if (allowMissing && isMissingPathError(error)) return null;
    throw pathOutOfBounds();
  }
}

function assertRegularDirectory(directory, allowMissing) {
  let stats;
  try {
    stats = fs.lstatSync(directory);
  } catch (error) {
    if (allowMissing && isMissingPathError(error)) return null;
    throw pathOutOfBounds();
  }

  const isLink = stats.isSymbolicLink();
  if (!stats.isDirectory() && !isLink) throw pathOutOfBounds();

  const realDirectory = resolveRealPath(directory, allowMissing && !isLink);
  if (!realDirectory) return null;
  let realStats;
  try {
    realStats = fs.statSync(realDirectory);
  } catch (error) {
    if (allowMissing && !isLink && isMissingPathError(error)) return null;
    throw pathOutOfBounds();
  }
  if (!realStats.isDirectory()) throw pathOutOfBounds();
  return realDirectory;
}

function assertRegularFile(filename, realDirectory, allowMissing) {
  let stats;
  try {
    stats = fs.lstatSync(filename);
  } catch (error) {
    if (allowMissing && isMissingPathError(error)) return null;
    throw pathOutOfBounds();
  }
  if (stats.isSymbolicLink() || !stats.isFile()) throw pathOutOfBounds();

  const realFilename = resolveRealPath(filename, allowMissing);
  if (!realFilename) return null;
  if (!realDirectory || !isPathWithin(realDirectory, realFilename)) throw pathOutOfBounds();
  return realFilename;
}

function assertClientsRoot(workspaceRootOrBoundary) {
  const clients = workspaceRootOrBoundary && workspaceRootOrBoundary.clientsRoot
    ? workspaceRootOrBoundary
    : getClientsRoot(workspaceRootOrBoundary);
  if (typeof clients.workspaceRoot !== "string" || !clients.workspaceRoot ||
      typeof clients.clientsRoot !== "string" || !clients.clientsRoot ||
      path.resolve(clients.clientsRoot) !== path.resolve(clients.workspaceRoot, "clients")) {
    throw pathOutOfBounds();
  }
  const realWorkspaceRoot = assertRegularDirectory(clients.workspaceRoot, true);
  const realClientsRoot = assertRegularDirectory(clients.clientsRoot, true);
  if (realWorkspaceRoot && realClientsRoot && !isPathWithin(realWorkspaceRoot, realClientsRoot)) {
    throw pathOutOfBounds();
  }
  return {
    workspaceRoot: clients.workspaceRoot,
    clientsRoot: clients.clientsRoot,
    realWorkspaceRoot: realWorkspaceRoot,
    realClientsRoot: realClientsRoot
  };
}

function resolveClientContext(workspaceRoot) {
  if (typeof workspaceRoot !== "string" || !workspaceRoot) throw pathOutOfBounds();
  return assertClientsRoot(getClientsRoot(workspaceRoot));
}

function assertClientDirectory(clientDirectory, workspaceRootOrBoundary) {
  if (typeof clientDirectory !== "string" || !clientDirectory) throw pathOutOfBounds();
  if (!workspaceRootOrBoundary) {
    throw contentError("CLIENT_PATH_CONTEXT_REQUIRED", "Workspace context is required for client directory access");
  }

  const clients = workspaceRootOrBoundary && workspaceRootOrBoundary.clientsRoot
    ? assertClientsRoot(workspaceRootOrBoundary)
    : resolveClientContext(workspaceRootOrBoundary);
  const resolved = path.resolve(clientDirectory);
  if (!isPathWithin(clients.clientsRoot, resolved)) throw pathOutOfBounds();

  const realClientDirectory = assertRegularDirectory(resolved, true);
  if (!realClientDirectory) {
    return {
      workspaceRoot: clients.workspaceRoot,
      clientsRoot: clients.clientsRoot,
      realWorkspaceRoot: clients.realWorkspaceRoot,
      realClientsRoot: clients.realClientsRoot,
      resolved: resolved,
      realClientDirectory: null
    };
  }
  if (!clients.realWorkspaceRoot || !clients.realClientsRoot ||
      !isPathWithin(clients.realWorkspaceRoot, clients.realClientsRoot) ||
      !isPathWithin(clients.realClientsRoot, realClientDirectory)) {
    throw pathOutOfBounds();
  }
  return {
    workspaceRoot: clients.workspaceRoot,
    clientsRoot: clients.clientsRoot,
    realWorkspaceRoot: clients.realWorkspaceRoot,
    realClientsRoot: clients.realClientsRoot,
    resolved: resolved,
    realClientDirectory: realClientDirectory
  };
}

function readClientMetadata(clientBoundary) {
  const directory = clientBoundary.resolved;
  const defaults = { id: path.basename(directory), name: path.basename(directory) };
  const metadataPath = path.join(directory, "client.json");
  const realMetadataPath = assertRegularFile(metadataPath, clientBoundary.realClientDirectory, true);
  if (!realMetadataPath) return defaults;

  let source;
  try {
    source = fs.readFileSync(metadataPath, "utf8");
  } catch (error) {
    if (isMissingPathError(error)) return defaults;
    throw pathOutOfBounds();
  }

  let metadata;
  try {
    metadata = JSON.parse(source);
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) throw new Error("Client metadata must be an object");
  } catch (error) {
    const invalid = contentError("CLIENT_INVALID_JSON", "Invalid client metadata");
    invalid.cause = error;
    throw invalid;
  }
  return {
    id: typeof metadata.id === "string" && metadata.id ? metadata.id : path.basename(directory),
    name: typeof metadata.name === "string" && metadata.name ? metadata.name : path.basename(directory)
  };
}

function readSearchQueryWithinBoundary(clientBoundary) {
  if (!clientBoundary.realClientDirectory) throw contentError("CLIENT_NOT_FOUND", "Client directory is missing");

  const filename = path.join(clientBoundary.resolved, "search_query.txt");
  const realFilename = assertRegularFile(filename, clientBoundary.realClientDirectory, true);
  if (!realFilename) throw contentError("SEARCH_QUERY_MISSING", "Search query is missing");

  let query;
  try {
    query = fs.readFileSync(filename, "utf8");
  } catch (error) {
    if (isMissingPathError(error)) throw contentError("SEARCH_QUERY_MISSING", "Search query is missing");
    throw pathOutOfBounds();
  }
  query = query.replace(/^\uFEFF/, "").replace(/\r?\n$/, "");
  if (!query.trim()) throw contentError("SEARCH_QUERY_MISSING", "Search query is empty");
  return query;
}

function loadClientKnowledgeWithinBoundary(clientBoundary) {
  if (!clientBoundary.realClientDirectory) throw contentError("CLIENT_NOT_FOUND", "Client directory is missing");

  let entries;
  try {
    entries = fs.readdirSync(clientBoundary.resolved, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") throw contentError("CLIENT_NOT_FOUND", "Client directory is missing");
    throw pathOutOfBounds();
  }

  return entries
    .filter(function(entry) {
      if (!entry.isFile() || entry.name.startsWith(".")) return false;
      if (RESERVED_KNOWLEDGE_FILES.has(entry.name)) return false;
      return TEXT_KNOWLEDGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase());
    })
    .sort(function(a, b) { return a.name.localeCompare(b.name); })
    .map(function(entry) {
      const filePath = path.join(clientBoundary.resolved, entry.name);
      assertRegularFile(filePath, clientBoundary.realClientDirectory, false);
      let content;
      try {
        content = fs.readFileSync(filePath, "utf8");
      } catch (error) {
        throw pathOutOfBounds();
      }
      return { name: entry.name, path: filePath, content: content };
    });
}

function readSearchQuery(clientDirectory, workspaceRootOrBoundary) {
  return readSearchQueryWithinBoundary(assertClientDirectory(clientDirectory, workspaceRootOrBoundary));
}

function readOptionalSearchQueryWithinBoundary(clientBoundary) {
  try {
    return readSearchQueryWithinBoundary(clientBoundary);
  } catch (error) {
    if (error && error.code === "SEARCH_QUERY_MISSING") return undefined;
    throw error;
  }
}

function loadClientKnowledge(clientDirectory, workspaceRootOrBoundary) {
  return loadClientKnowledgeWithinBoundary(assertClientDirectory(clientDirectory, workspaceRootOrBoundary));
}

function getClient(workspaceRoot, clientId) {
  const client = listClients(workspaceRoot).find(function(item) {
    return item.id === clientId;
  });
  if (!client) throw contentError("CLIENT_NOT_FOUND", "Client was not found");
  return client;
}

// Identity lookup intentionally reads only directory and client.json metadata.
// Callers which merely need a physical location must not load knowledge files.
function resolveClientIdentity(workspaceRoot, clientId) {
  const clients = resolveClientContext(workspaceRoot);
  if (!clients.realClientsRoot) throw contentError("CLIENT_NOT_FOUND", "Client was not found");
  let entries;
  try { entries = fs.readdirSync(clients.clientsRoot, { withFileTypes: true }); }
  catch (_) { throw pathOutOfBounds(); }
  const matches = [];
  entries.filter(function(entry) { return entry.isDirectory() && !entry.name.startsWith("."); }).forEach(function(entry) {
    const directory = getClientWorkspace({ root: clients.workspaceRoot, clients: clients.clientsRoot }, entry.name);
    const boundary = assertClientDirectory(directory, clients);
    const metadata = readClientMetadata(boundary);
    if (metadata.id === clientId) matches.push({ id: metadata.id, name: metadata.name, directory: directory });
  });
  if (!matches.length) throw contentError("CLIENT_NOT_FOUND", "Client was not found");
  if (matches.length > 1) throw contentError("CLIENT_IDENTITY_CONFLICT", "Client identity is duplicated");
  return matches[0];
}

function listClientIdentities(workspaceRoot) {
  const clients = resolveClientContext(workspaceRoot);
  if (!clients.realClientsRoot) return [];
  let entries;
  try { entries = fs.readdirSync(clients.clientsRoot, { withFileTypes: true }); } catch (_) { throw pathOutOfBounds(); }
  return entries.filter(function(entry) { return entry.isDirectory() && !entry.name.startsWith("."); }).map(function(entry) {
    const directory = getClientWorkspace({ root: clients.workspaceRoot, clients: clients.clientsRoot }, entry.name);
    const metadata = readClientMetadata(assertClientDirectory(directory, clients));
    return { id: metadata.id, name: metadata.name, directory: directory };
  });
}

function listClients(workspaceRoot) {
  const clients = resolveClientContext(workspaceRoot);
  const workspace = { root: clients.workspaceRoot, clients: clients.clientsRoot };
  if (!clients.realClientsRoot) return [];

  let entries;
  try {
    entries = fs.readdirSync(clients.clientsRoot, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw pathOutOfBounds();
  }

  return entries
    .filter(function(entry) { return entry.isDirectory() && !entry.name.startsWith("."); })
    .sort(function(a, b) { return a.name.localeCompare(b.name); })
    .map(function(entry) {
      let directory;
      try {
        directory = getClientWorkspace(workspace, entry.name);
      } catch (error) {
        throw pathOutOfBounds();
      }
      const clientBoundary = assertClientDirectory(directory, clients);
      const metadata = readClientMetadata(clientBoundary);
      const client = {
        id: metadata.id,
        name: metadata.name,
        directory: directory,
        knowledgeFiles: loadClientKnowledgeWithinBoundary(clientBoundary)
      };
      const searchQuery = readOptionalSearchQueryWithinBoundary(clientBoundary);
      if (searchQuery !== undefined) client.searchQuery = searchQuery;
      return client;
    });
}

module.exports = { listClients, getClient, resolveClientIdentity, listClientIdentities, loadClientKnowledge, readSearchQuery };
