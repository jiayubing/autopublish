"use strict";

const { execFileSync } = require("node:child_process");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..", "..");
const loader = pathToFileURL(
  path.join(
    root,
    "media-workbench",
    "node_modules",
    "tsx",
    "dist",
    "loader.mjs",
  ),
).href;

function runRendererModule(modulePath, source) {
  const moduleSpecifier = `./media-workbench/src/${modulePath}.ts?ipc-contract`;
  const token = "__M05_RENDERER_MODULE__";
  if (!source.includes(token))
    throw new Error(`Renderer module placeholder is missing: ${token}`);
  const expanded = source.replaceAll(
    token,
    `await import(${JSON.stringify(moduleSpecifier)})`,
  );
  return execFileSync(
    process.execPath,
    ["--import", loader, "--input-type=module", "-e", expanded],
    { cwd: root, encoding: "utf8" },
  );
}

module.exports = { runRendererModule };
