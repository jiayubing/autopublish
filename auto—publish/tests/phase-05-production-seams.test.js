const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { it } = require("node:test");

const root = path.resolve(__dirname, "..");
function read(relative) {
  return fs.readFileSync(path.join(root, relative), "utf8");
}

function moduleSpecifiers(source) {
  return [
    ...source.matchAll(/\brequire\s*\(\s*["']([^"']+)["']\s*\)/g),
    ...source.matchAll(/\bfrom\s*["']([^"']+)["']/g),
    ...source.matchAll(/\bimport\s*["']([^"']+)["']/g),
  ].map((match) => match[1]);
}

it("has exactly one desktop production ArticleStore composition owner", () => {
  const files = fs
    .readdirSync(path.join(root, "desktop"), { recursive: true })
    .filter((file) => String(file).endsWith(".js"));
  const references = files.filter((file) =>
    moduleSpecifiers(read(path.join("desktop", file))).includes(
      "../../src/content/article-store",
    ),
  );
  assert.deepEqual(references, [
    path.join("composition", "content-lifecycle-composition.js"),
  ]);
});

it("does not let IPC assemble content stores or expose physical store APIs", () => {
  const ipcRoot = path.join(root, "desktop", "ipc");
  const files = fs.readdirSync(ipcRoot).filter((file) => file.endsWith(".js"));
  files.forEach((file) => {
    const source = fs.readFileSync(path.join(ipcRoot, file), "utf8");
    assert.doesNotMatch(source, /article-store|content-store/);
  });
});

it("keeps the ContentStore caller seam free of legacy ArticleStore injection", () => {
  const callers = [
    "desktop/services/ai-content-service.js",
    "desktop/services/content-generation-batch-service.js",
    "desktop/services/submission-maintenance-service.js",
    "desktop/services/platform-workbench-service.js",
    "src/content/article-removal-service.js",
    "src/content/article-trash-service.js",
  ];
  for (const file of callers) {
    const source = read(file);
    assert.doesNotMatch(
      source,
      /\b(?:opts|options|settings|value|deps)\.articleStore\b/,
      "production ContentStore callers must not inject the legacy ArticleStore seam",
    );
    assert.doesNotMatch(
      source,
      /\barticleStore\s*:/,
      "production ContentStore callers must not inject the legacy ArticleStore seam",
    );
  }
});

it("excludes one-shot content metadata and existing migration tools from installed resources", () => {
  const config = read("electron-builder.alpha.yml");
  for (const script of [
    "migrate-content-library-v2.js",
    "migrate-content-metadata-v1.js",
    "migrate-operational-store-v1.js",
  ])
    assert.match(
      config,
      new RegExp("!scripts/" + script.replaceAll(".", "\\.")),
    );
});
