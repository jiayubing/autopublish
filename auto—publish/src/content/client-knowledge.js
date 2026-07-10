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
  return path.basename(resolved) === "clients"
    ? resolved
    : getContentWorkspace(resolved).clients;
}

function assertClientDirectory(clientDirectory, workspaceRootOrClients) {
  if (typeof clientDirectory !== "string" || !clientDirectory) {
    throw contentError("CLIENT_PATH_OUT_OF_BOUNDS", "Client directory is outside workspace.clients");
  }

  if (!workspaceRootOrClients) {
    throw contentError("CLIENT_PATH_CONTEXT_REQUIRED", "Workspace context is required for client directory access");
  }

  const resolved = path.resolve(clientDirectory);
  const clientsRoot = getClientsRoot(workspaceRootOrClients);

  const relative = path.relative(clientsRoot, resolved);
  if (!relative || relative === ".." || relative.startsWith(".." + path.sep) || path.isAbsolute(relative)) {
    throw contentError("CLIENT_PATH_OUT_OF_BOUNDS", "Client directory is outside workspace.clients");
  }

  let realClientsRoot;
  let realClientDirectory;
  try {
    realClientsRoot = fs.realpathSync(clientsRoot);
    realClientDirectory = fs.realpathSync(resolved);
  } catch (error) {
    if (error.code !== "ENOENT" && error.code !== "ENOTDIR") throw error;
    realClientsRoot = fs.realpathSync(clientsRoot);
    realClientDirectory = path.join(realClientsRoot, path.basename(resolved));
  }

  const realRelative = path.relative(realClientsRoot, realClientDirectory);
  if (!realRelative || realRelative === ".." || realRelative.startsWith(".." + path.sep) || path.isAbsolute(realRelative)) {
    throw contentError("CLIENT_PATH_OUT_OF_BOUNDS", "Client directory is outside workspace.clients");
  }
  return resolved;
}

function readClientMetadata(directory) {
  const metadataPath = path.join(directory, "client.json");
  if (!fs.existsSync(metadataPath)) {
    return { id: path.basename(directory), name: path.basename(directory) };
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
  if (!fs.existsSync(filename)) {
    throw contentError("SEARCH_QUERY_MISSING", "Search query is missing");
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
      if (entry.name === "search_query.txt" || entry.name === "client.json") return false;
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
