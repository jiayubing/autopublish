const fs = require("fs");
const path = require("path");

const { getContentWorkspace, getClientWorkspace } = require("../core/files");

function contentError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function getClientsRoot(workspaceRootOrClients) {
  const resolved = path.resolve(workspaceRootOrClients);
  if (path.basename(resolved) === "clients") {
    return { workspaceRoot: path.dirname(resolved), clientsRoot: resolved };
  }
  const workspace = getContentWorkspace(resolved);
  return { workspaceRoot: workspace.root, clientsRoot: workspace.clients };
}

function isPathWithin(parent, child) {
  const relative = path.relative(parent, child);
  return relative && relative !== ".." && !relative.startsWith(".." + path.sep) && !path.isAbsolute(relative);
}

function assertClientsRoot(workspaceRootOrClients) {
  const clients = getClientsRoot(workspaceRootOrClients);
  let realWorkspaceRoot;
  let realClientsRoot;
  try {
    realWorkspaceRoot = fs.realpathSync(clients.workspaceRoot);
    realClientsRoot = fs.realpathSync(clients.clientsRoot);
  } catch (error) {
    if (error.code !== "ENOENT" && error.code !== "ENOTDIR") {
      throw contentError("CLIENT_PATH_OUT_OF_BOUNDS", "Client directory is outside workspace.clients");
    }
    return clients;
  }

  if (!isPathWithin(realWorkspaceRoot, realClientsRoot)) {
    throw contentError("CLIENT_PATH_OUT_OF_BOUNDS", "Client directory is outside workspace.clients");
  }
  return clients;
}

function assertClientDirectory(clientDirectory, workspaceRootOrClients) {
  if (typeof clientDirectory !== "string" || !clientDirectory) {
    throw contentError("CLIENT_PATH_OUT_OF_BOUNDS", "Client directory is outside workspace.clients");
  }

  if (!workspaceRootOrClients) {
    throw contentError("CLIENT_PATH_CONTEXT_REQUIRED", "Workspace context is required for client directory access");
  }

  const resolved = path.resolve(clientDirectory);
  const clients = assertClientsRoot(workspaceRootOrClients);
  const clientsRoot = clients.clientsRoot;

  if (!isPathWithin(clientsRoot, resolved)) {
    throw contentError("CLIENT_PATH_OUT_OF_BOUNDS", "Client directory is outside workspace.clients");
  }

  let realWorkspaceRoot;
  let realClientsRoot;
  let realClientDirectory;
  try {
    realWorkspaceRoot = fs.realpathSync(clients.workspaceRoot);
    realClientsRoot = fs.realpathSync(clientsRoot);
    realClientDirectory = fs.realpathSync(resolved);
  } catch (error) {
    if (error.code !== "ENOENT" && error.code !== "ENOTDIR") {
      throw contentError("CLIENT_PATH_OUT_OF_BOUNDS", "Client directory is outside workspace.clients");
    }
    try {
      realClientsRoot = fs.realpathSync(clientsRoot);
    } catch (fallbackError) {
      if (fallbackError.code !== "ENOENT" && fallbackError.code !== "ENOTDIR") {
        throw contentError("CLIENT_PATH_OUT_OF_BOUNDS", "Client directory is outside workspace.clients");
      }
      throw fallbackError;
    }
    realClientDirectory = path.join(realClientsRoot, path.basename(resolved));
  }

  if (!isPathWithin(realWorkspaceRoot, realClientsRoot) || !isPathWithin(realClientsRoot, realClientDirectory)) {
    throw contentError("CLIENT_PATH_OUT_OF_BOUNDS", "Client directory is outside workspace.clients");
  }
  return resolved;
}

function readClientMetadata(directory) {
  const metadataPath = path.join(directory, "client.json");
  const defaults = { id: path.basename(directory), name: path.basename(directory) };
  let metadataStats;
  try {
    metadataStats = fs.lstatSync(metadataPath);
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "ENOTDIR") return defaults;
    throw error;
  }

  if (metadataStats.isSymbolicLink() || !metadataStats.isFile()) {
    throw contentError("CLIENT_PATH_OUT_OF_BOUNDS", "Client metadata is outside the client directory");
  }

  let realDirectory;
  let realMetadataPath;
  try {
    realDirectory = fs.realpathSync(directory);
    realMetadataPath = fs.realpathSync(metadataPath);
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "ENOTDIR") return defaults;
    throw error;
  }

  if (!isPathWithin(realDirectory, realMetadataPath)) {
    throw contentError("CLIENT_PATH_OUT_OF_BOUNDS", "Client metadata is outside the client directory");
  }

  try {
    const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8"));
    return {
      id: typeof metadata.id === "string" && metadata.id ? metadata.id : path.basename(directory),
      name: typeof metadata.name === "string" && metadata.name ? metadata.name : path.basename(directory)
    };
  } catch (error) {
    const invalid = contentError("CLIENT_INVALID_JSON", "Invalid client metadata");
    invalid.cause = error;
    throw invalid;
  }
}

function readSearchQuery(clientDirectory, workspaceRootOrClients) {
  clientDirectory = assertClientDirectory(clientDirectory, workspaceRootOrClients);
  const filename = path.join(clientDirectory, "search_query.txt");

  let fileStats;
  try {
    fileStats = fs.lstatSync(filename);
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "ENOTDIR") {
      throw contentError("SEARCH_QUERY_MISSING", "Search query is missing");
    }
    throw error;
  }
  if (!fileStats.isFile()) {
    throw contentError("CLIENT_PATH_OUT_OF_BOUNDS", "Client directory is outside workspace.clients");
  }

  let realClientDirectory;
  let realFilename;
  try {
    realClientDirectory = fs.realpathSync(clientDirectory);
    realFilename = fs.realpathSync(filename);
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "ENOTDIR") {
      throw contentError("SEARCH_QUERY_MISSING", "Search query is missing");
    }
    throw error;
  }

  const relative = path.relative(realClientDirectory, realFilename);
  if (!relative || relative === ".." || relative.startsWith(".." + path.sep) || path.isAbsolute(relative)) {
    throw contentError("CLIENT_PATH_OUT_OF_BOUNDS", "Client directory is outside workspace.clients");
  }

  const query = fs.readFileSync(filename, "utf8")
    .replace(/^\uFEFF/, "")
    .replace(/\r?\n$/, "");
  if (!query.trim()) {
    throw contentError("SEARCH_QUERY_MISSING", "Search query is empty");
  }
  return query;
}

function loadClientKnowledge(clientDirectory, workspaceRootOrClients) {
  clientDirectory = assertClientDirectory(clientDirectory, workspaceRootOrClients);
  if (!fs.existsSync(clientDirectory) || !fs.statSync(clientDirectory).isDirectory()) {
    throw contentError("CLIENT_NOT_FOUND", "Client directory is missing");
  }

  const allowedExtensions = new Set([".txt", ".md", ".markdown", ".json"]);
  return fs.readdirSync(clientDirectory, { withFileTypes: true })
    .filter(function(entry) {
      if (!entry.isFile() || entry.name.startsWith(".")) return false;
      if (entry.name === "search_query.txt" || entry.name === "client.json" || entry.name === "questions.json") return false;
      return allowedExtensions.has(path.extname(entry.name).toLowerCase());
    })
    .sort(function(a, b) { return a.name.localeCompare(b.name); })
    .map(function(entry) {
      const filePath = path.join(clientDirectory, entry.name);
      return {
        name: entry.name,
        path: filePath,
        content: fs.readFileSync(filePath, "utf8")
      };
    });
}

function getClient(workspaceRoot, clientId) {
  const client = listClients(workspaceRoot).find(function(item) {
    return item.id === clientId;
  });
  if (!client) throw contentError("CLIENT_NOT_FOUND", "Client was not found");
  return client;
}

function listClients(workspaceRoot) {
  const workspace = getContentWorkspace(workspaceRoot);
  assertClientsRoot(workspace.root);
  if (!fs.existsSync(workspace.clients)) return [];

  return fs.readdirSync(workspace.clients, { withFileTypes: true })
    .filter(function(entry) { return entry.isDirectory() && !entry.name.startsWith("."); })
    .sort(function(a, b) { return a.name.localeCompare(b.name); })
    .map(function(entry) {
      const directory = getClientWorkspace(workspace, entry.name);
      const metadata = readClientMetadata(directory);
      return {
        id: metadata.id,
        name: metadata.name,
        directory: directory,
        searchQuery: readSearchQuery(directory, workspace.clients),
        knowledgeFiles: loadClientKnowledge(directory, workspace.clients)
      };
    });
}

module.exports = { listClients, getClient, loadClientKnowledge, readSearchQuery };
