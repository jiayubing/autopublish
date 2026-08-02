const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const sourceRoot = path.join(root, "src");
const SOURCE_EXTENSIONS = new Set([".cjs", ".js", ".mjs", ".ts", ".tsx"]);

function sourceFiles(directory) {
  const result = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...sourceFiles(filename));
    else if (SOURCE_EXTENSIONS.has(path.extname(entry.name)))
      result.push(filename);
  }
  return result;
}

function resolveImportSpecifier(filename, specifier) {
  if (!specifier.startsWith(".")) return specifier;
  return path
    .relative(root, path.resolve(path.dirname(filename), specifier))
    .replace(/\\/g, "/");
}

function findImports(source, filename, isForbidden) {
  const imports = [];
  const patterns = [
    /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
    /\bfrom\s*["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(source))) {
      const specifier = match[1].replace(/\\/g, "/");
      const resolvedSpecifier = resolveImportSpecifier(filename, specifier);
      if (!isForbidden(resolvedSpecifier)) continue;
      imports.push({
        file: path.relative(root, filename).replace(/\\/g, "/"),
        line: source.slice(0, match.index).split(/\r?\n/).length,
        specifier,
      });
    }
  }
  return imports;
}

test("architecture classification resolves relative imports from their importer", () => {
  const filename = path.join(root, "src", "domain", "probe.js");
  const violations = findImports(
    'require("../infrastructure/runtime");',
    filename,
    (resolvedSpecifier) =>
      /^src\/infrastructure(?:\/|$)/.test(resolvedSpecifier),
  );

  assert.deepEqual(violations, [
    {
      file: "src/domain/probe.js",
      line: 1,
      specifier: "../infrastructure/runtime",
    },
  ]);
});

test("production src cannot import desktop implementations", () => {
  const violations = sourceFiles(sourceRoot).flatMap((filename) =>
    findImports(fs.readFileSync(filename, "utf8"), filename, (specifier) =>
      /^desktop(?:\/|$)/.test(specifier),
    ),
  );
  assert.deepEqual(violations, []);
  for (const relative of [
    "desktop/storage-paths.js",
    "desktop/workspace-paths.js",
    "desktop/packaging/packaged-runtime-resolver.js",
    "desktop/packaging/playwright-runtime-paths.js",
  ]) {
    assert.equal(fs.existsSync(path.join(root, relative)), false, relative);
  }
  for (const relative of [
    "src/infrastructure/workspace/storage-paths.js",
    "src/infrastructure/workspace/workspace-paths.js",
    "src/infrastructure/runtime/packaged-runtime-resolver.js",
    "src/infrastructure/runtime/playwright-runtime-paths.js",
    "src/infrastructure/runtime/playwright-runtime-resolver.js",
  ]) {
    assert.equal(fs.existsSync(path.join(root, relative)), true, relative);
  }
});

test("production source roots keep domain, renderer, worker, and adapter boundaries", () => {
  const domainApplicationRoot = [
    path.join(root, "src", "domain"),
    path.join(root, "src", "application"),
  ];
  const domainApplicationViolations = domainApplicationRoot.flatMap(
    (directory) =>
      sourceFiles(directory).flatMap((filename) =>
        findImports(
          fs.readFileSync(filename, "utf8"),
          filename,
          (specifier) =>
            /^(?:desktop|media-workbench|src\/infrastructure|operational-store)(?:\/|$)/.test(
              specifier,
            ) ||
            /^(?:electron|ipc(?:\/|$)|sqlite3?|better-sqlite3)$/.test(
              specifier,
            ),
        ),
      ),
  );
  assert.deepEqual(domainApplicationViolations, []);

  const rendererRoot = path.join(root, "media-workbench", "src");
  const rendererViolations = sourceFiles(rendererRoot).flatMap((filename) =>
    findImports(
      fs.readFileSync(filename, "utf8"),
      filename,
      (specifier) =>
        specifier.startsWith("node:") ||
        /^(?:electron|sqlite3?|better-sqlite3)$/.test(specifier) ||
        /^(?:desktop|src\/infrastructure)(?:\/|$)/.test(specifier),
    ),
  );
  assert.deepEqual(rendererViolations, []);

  const workerAdapterRoots = [
    path.join(root, "desktop", "worker"),
    path.join(root, "src", "platforms"),
  ];
  const writerViolations = workerAdapterRoots.flatMap((directory) =>
    sourceFiles(directory).flatMap((filename) =>
      findImports(fs.readFileSync(filename, "utf8"), filename, (specifier) =>
        /^operational-store(?:\/|$)/.test(specifier),
      ),
    ),
  );
  assert.deepEqual(writerViolations, []);
});
