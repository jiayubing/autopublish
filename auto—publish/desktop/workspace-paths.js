const fs = require("node:fs");
const path = require("node:path");

function createWorkspacePaths(root) {
  const workspaceRoot = path.resolve(root);
  const input = path.join(workspaceRoot, "input");
  return {
    root: workspaceRoot,
    input: input,
    mediaInput: path.join(input, "media"),
    liejuInput: path.join(input, "lieju"),
    toutiaoInput: path.join(input, "toutiao"),
    hepanInput: path.join(input, "hepan"),
    data: path.join(workspaceRoot, "data"),
    logs: path.join(workspaceRoot, "logs"),
    published: path.join(workspaceRoot, "published"),
    failed: path.join(workspaceRoot, "failed"),
    tmp: path.join(workspaceRoot, "tmp"),
    work: path.join(workspaceRoot, "work"),
    config: path.join(workspaceRoot, "config"),
    clients: path.join(workspaceRoot, "clients"),
    research: path.join(workspaceRoot, "research"),
    templates: path.join(workspaceRoot, "templates"),
    generated: path.join(workspaceRoot, "generated")
  };
}

function ensureWorkspaceDirectories(paths) {
  Object.keys(paths).forEach(function(key) {
    if (key !== "root") fs.mkdirSync(paths[key], { recursive: true });
  });
  return paths;
}

module.exports = { createWorkspacePaths, ensureWorkspaceDirectories };
