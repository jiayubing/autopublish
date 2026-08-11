import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const repositoryRoot = path.resolve(import.meta.dirname, "../../..");
const applicationRoot = path.join(repositoryRoot, "auto—publish");
const require = createRequire(path.join(applicationRoot, "package.json"));
const ts = require("typescript");

const roots = [
  "src",
  "desktop",
  "media-workbench/src",
  "auth-server/src",
  "scripts",
  "auth-server/scripts",
];
const extensions = new Set([".js", ".cjs", ".mjs", ".ts", ".tsx"]);
const excludedSegments = new Set([
  "node_modules",
  "dist",
  "build",
  "coverage",
  "vendor",
  "vendor-pure",
]);

function collectFiles(relativeRoot) {
  const absoluteRoot = path.join(applicationRoot, relativeRoot);
  if (!fs.existsSync(absoluteRoot)) return [];
  const files = [];
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.isDirectory() && excludedSegments.has(entry.name)) continue;
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(absolutePath);
      else if (extensions.has(path.extname(entry.name)))
        files.push(absolutePath);
    }
  };
  visit(absoluteRoot);
  return files;
}

function location(sourceFile, node) {
  const value = sourceFile.getLineAndCharacterOfPosition(
    node.getStart(sourceFile),
  );
  return { line: value.line + 1, column: value.character + 1 };
}

function summarizeHandler(sourceFile, body) {
  const text = body.getText(sourceFile).replace(/\s+/g, " ").trim();
  let hasThrow = false;
  let hasReturn = false;
  let hasDiagnostic = false;
  let callCount = 0;
  let assignmentCount = 0;
  const visit = (node) => {
    if (ts.isThrowStatement(node)) hasThrow = true;
    if (ts.isReturnStatement(node)) hasReturn = true;
    if (ts.isCallExpression(node)) {
      callCount += 1;
      const expression = node.expression.getText(sourceFile);
      if (
        /diagnostic|logger|console|stderr|stdout|warn|report|record/i.test(
          expression,
        )
      )
        hasDiagnostic = true;
    }
    if (
      ts.isBinaryExpression(node) &&
      ts.isAssignmentOperator(node.operatorToken.kind)
    )
      assignmentCount += 1;
    ts.forEachChild(node, visit);
  };
  visit(body);
  const empty = ts.isBlock(body) && body.statements.length === 0;
  return {
    empty,
    hasThrow,
    hasReturn,
    hasDiagnostic,
    callCount,
    assignmentCount,
    text,
  };
}

function compactContext(sourceFile, node) {
  const container = ts.isCatchClause(node) ? node.parent : node.parent;
  const text = container.getText(sourceFile).replace(/\s+/g, " ").trim();
  return text.length > 600 ? `${text.slice(0, 597)}...` : text;
}

function packageFor(file) {
  if (file.startsWith("scripts/") || file.startsWith("auth-server/scripts/"))
    return "F";
  if (
    file.startsWith("auth-server/src/") ||
    /(^|\/)(auth-service|authenticated-runtime|auth-ipc)\.[jt]s$/.test(file)
  )
    return "E";
  if (
    file.startsWith("media-workbench/src/") ||
    file.startsWith("src/diagnostics/") ||
    file.startsWith("desktop/ipc/") ||
    file.startsWith("desktop/packaging/") ||
    /(^|\/)(preload|main|runtime-diagnostics[^/]*)\.[cm]?[jt]s$/.test(file)
  )
    return "D";
  if (
    file.startsWith("src/infrastructure/operational-store/") ||
    /workspace|runtime-config|config-store|identity-store|application-identity|task-state-store|platform-account-binding-store|submission-(batch-persistence|batch-recovery|cleanup|file-helpers|operation-files|operation-staging|queue-removal)|storage-maintenance/.test(
      file,
    )
  )
    return "A";
  if (
    file.startsWith("src/content/") ||
    file === "src/core/files.js" ||
    /content-generation|ai-content|ai-provider|article-(attention|management|submission|removal)|doubao-collection|generation-submission/.test(
      file,
    )
  )
    return "B";
  return "C";
}

function shapeFor(record) {
  if (record.hasThrow) return "PROPAGATE_OR_RETHROW";
  if (record.hasDiagnostic) return "DIAGNOSTIC";
  if (record.empty) return "EMPTY";
  if (record.hasReturn) return "RETURN_OR_FALLBACK";
  if (record.callCount > 0) return "SIDE_EFFECT_OR_MAPPING";
  if (record.assignmentCount > 0) return "ASSIGNMENT_MAPPING";
  return "OTHER";
}

const records = [];
const scannedFiles = [...new Set(roots.flatMap(collectFiles))].sort();
const parseDiagnostics = [];
for (const absolutePath of scannedFiles) {
  const sourceText = fs.readFileSync(absolutePath, "utf8");
  const relativePath = path
    .relative(applicationRoot, absolutePath)
    .replaceAll("\\", "/");
  const sourceFile = ts.createSourceFile(
    absolutePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    absolutePath.endsWith(".tsx")
      ? ts.ScriptKind.TSX
      : absolutePath.endsWith(".ts")
        ? ts.ScriptKind.TS
        : ts.ScriptKind.JS,
  );
  for (const diagnostic of sourceFile.parseDiagnostics) {
    parseDiagnostics.push({
      file: relativePath,
      code: diagnostic.code,
      start: diagnostic.start,
    });
  }
  const visit = (node) => {
    if (ts.isCatchClause(node)) {
      records.push({
        file: relativePath,
        ...location(sourceFile, node),
        kind: "catch-clause",
        parameter: node.variableDeclaration?.name.getText(sourceFile) ?? null,
        context: compactContext(sourceFile, node),
        ...summarizeHandler(sourceFile, node.block),
      });
    } else if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === "catch"
    ) {
      const handler = node.arguments[0];
      if (
        handler &&
        (ts.isArrowFunction(handler) || ts.isFunctionExpression(handler))
      ) {
        records.push({
          file: relativePath,
          ...location(sourceFile, node.expression.name),
          kind: "promise-catch",
          parameter: handler.parameters[0]?.name.getText(sourceFile) ?? null,
          context: compactContext(sourceFile, node),
          ...summarizeHandler(sourceFile, handler.body),
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
}

for (const record of records) {
  record.package = packageFor(record.file);
  record.shape = shapeFor(record);
}

if (process.argv.includes("--summary")) {
  const summary = new Map();
  for (const record of records) {
    const ownerRoot = roots.find(
      (root) => record.file === root || record.file.startsWith(`${root}/`),
    );
    const key = ownerRoot ?? "other";
    const value = summary.get(key) ?? {
      total: 0,
      empty: 0,
      withoutThrow: 0,
      promiseCatch: 0,
    };
    value.total += 1;
    if (record.empty) value.empty += 1;
    if (!record.hasThrow) value.withoutThrow += 1;
    if (record.kind === "promise-catch") value.promiseCatch += 1;
    summary.set(key, value);
  }
  const byPackage = {};
  for (const record of records) {
    const value = byPackage[record.package] ?? {
      files: new Set(),
      catches: 0,
      shapes: {},
    };
    value.files.add(record.file);
    value.catches += 1;
    value.shapes[record.shape] = (value.shapes[record.shape] ?? 0) + 1;
    byPackage[record.package] = value;
  }
  for (const value of Object.values(byPackage)) value.files = value.files.size;
  process.stdout.write(
    `${JSON.stringify({ scannedFiles: scannedFiles.length, filesWithCatches: [...new Set(records.map((record) => record.file))].length, catches: records.length, parseDiagnostics, byRoot: Object.fromEntries(summary), byPackage }, null, 2)}\n`,
  );
} else {
  for (const record of records)
    process.stdout.write(`${JSON.stringify(record)}\n`);
}
