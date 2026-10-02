const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const rendererRoot = path.join(root, "media-workbench", "src");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

const generationBridgeExports = [
  "generateContentArticle",
  "saveContentArticle",
  "previewGenerationBatch",
  "createAndStartGenerationBatchV2",
  "checkUncertainGenerationBatchV2",
  "pauseGenerationBatch",
  "abandonGenerationBatch",
  "resumeGenerationBatch",
  "retryFailedGenerationBatch",
  "subscribeGenerationBatchState",
  "getGenerationRuntimeSnapshot",
  "previewCancelPendingGenerationBatch",
  "cancelPendingGenerationBatch",
];

test("renderer shared types have one domain owner and no legacy barrel", () => {
  assert.equal(fs.existsSync(path.join(rendererRoot, "types.ts")), false);
  assert.equal(
    fs.existsSync(path.join(rendererRoot, "types", "index.ts")),
    false,
  );
  assert.doesNotMatch(
    read("tests/renderer-history-editor-flow.test.js"),
    /(?:^|[,{])\s*(?:["']trashArticles["']|trashArticles)\s*:/m,
    "Renderer fixtures must not expose the retired preload alias",
  );

  const ts = require("typescript");
  const owners = new Map();
  for (const entry of fs
    .readdirSync(path.join(rendererRoot, "types"))
    .filter((name) => name.endsWith(".ts"))) {
    const source = ts.createSourceFile(
      entry,
      read(`media-workbench/src/types/${entry}`),
      ts.ScriptTarget.Latest,
      true,
    );
    for (const declaration of source.statements) {
      if (
        !ts.isInterfaceDeclaration(declaration) &&
        !ts.isTypeAliasDeclaration(declaration)
      )
        continue;
      if (
        !declaration.modifiers?.some(
          (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
        )
      )
        continue;
      const symbol = declaration.name.text;
      assert.equal(
        owners.has(symbol),
        false,
        `duplicate domain owner for ${symbol}`,
      );
      owners.set(symbol, entry);
    }
  }
  assert.ok(owners.size > 0);
  const typeSources = fs
    .readdirSync(path.join(rendererRoot, "types"))
    .filter((entry) => entry.endsWith(".ts"))
    .map((entry) => read(`media-workbench/src/types/${entry}`))
    .join("\n");
  assert.doesNotMatch(
    typeSources,
    /desktop[\\/]|infrastructure[\\/]|ipcRenderer/,
  );
});

test("renderer bridges expose named domain entries without method dispatch", () => {
  const bridgeDirectory = path.join(rendererRoot, "bridge");
  for (const entry of fs
    .readdirSync(bridgeDirectory)
    .filter((name) => name.endsWith(".ts"))) {
    const source = fs.readFileSync(path.join(bridgeDirectory, entry), "utf8");
    assert.doesNotMatch(
      source,
      /(?:api|namespace|bridge)\s*\[\s*[^\]]+\s*\]/,
      entry,
    );
    assert.doesNotMatch(source, /Reflect\.get\([^\n]+method/, entry);
  }

  const generation = read("media-workbench/src/bridge/generation.ts");
  for (const symbol of generationBridgeExports) {
    assert.match(generation, new RegExp(`\\b${symbol}\\b`), symbol);
  }
  assert.doesNotMatch(generation, /requireBridgeApi|new Proxy|Reflect\.get/);
});

test("renderer bridge/type boundaries do not import desktop or infrastructure code", () => {
  const files = fs
    .readdirSync(rendererRoot, { recursive: true, withFileTypes: true })
    .filter(
      (entry) =>
        entry.isFile() &&
        /\.(?:ts|tsx|js|jsx)$/.test(entry.name) &&
        entry.parentPath.includes(`${path.sep}bridge`),
    )
    .map((entry) =>
      path.relative(rendererRoot, path.join(entry.parentPath, entry.name)),
    );
  const readRendererSource = (relative) =>
    fs.readFileSync(path.join(rendererRoot, relative), "utf8");
  const sources = files.map(readRendererSource);
  for (const source of sources) {
    assert.doesNotMatch(
      source,
      /(?:desktop|infrastructure)[\\/]/i,
      "renderer bridge architecture dependency boundary must not import desktop or infrastructure code",
    );
    assert.doesNotMatch(
      source,
      /ipcRenderer/,
      "renderer bridge architecture dependency boundary must not access Electron transport",
    );
  }
});
