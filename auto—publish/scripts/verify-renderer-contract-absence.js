"use strict";

const fs = require("node:fs");
const path = require("node:path");
const asar = require("@electron/asar");
const ts = require("../media-workbench/node_modules/typescript");

const ROOT = path.resolve(__dirname, "..");
const LEGACY_SOURCE_PATHS = Object.freeze([
  path.join("media-workbench", "src", "types.ts"),
  path.join("media-workbench", "src", "types", "index.ts"),
]);
const SOURCE_ROOTS = Object.freeze([
  path.join("media-workbench", "src"),
  path.join("desktop", "preload.js"),
]);
const DIRECT_ARTIFACTS = Object.freeze([
  path.join("build", "preload", "preload.cjs"),
  path.join("media-workbench", "dist"),
]);
const ARCHIVE_ROOTS = Object.freeze([
  "build/preload/preload.cjs",
  "media-workbench/dist/",
]);
const RENDERER_CONTENT_REMOVAL_BRIDGE =
  /(?:^|[\\/])media-workbench[\\/]src[\\/]bridge[\\/]content-removal[.]ts$/;
const RENDERER_CONTENT_BRIDGE =
  /(?:^|[\\/])media-workbench[\\/]src[\\/]bridge[\\/]content(?:[\\/]index)?[.]ts$/;
const RENDERER_PLATFORM_BRIDGE =
  /(?:^|[\\/])media-workbench[\\/]src[\\/]bridge[\\/]platform[.]ts$/;
const RENDERER_WORKSPACE_BRIDGE =
  /(?:^|[\\/])media-workbench[\\/]src[\\/]bridge[\\/]workspace[.]ts$/;
const RENDERER_PUBLICATION_TYPES =
  /(?:^|[\\/])media-workbench[\\/]src[\\/]types[\\/]publication[.]ts$/;
const GENERATED_ARTIFACT_PATH =
  /^(?:build[\\/]preload[\\/]preload[.]cjs|media-workbench[\\/]dist[\\/]|app[.]asar[\\/]build[\\/]preload[\\/]preload[.]cjs|app[.]asar[\\/]media-workbench[\\/]dist[\\/])/;

function anyPattern(...patterns) {
  return new RegExp(
    patterns.map((pattern) => `(?:${pattern.source})`).join("|"),
  );
}

function normalizedModulePath(pattern) {
  return pattern.replaceAll("[.]?/", "(?:[.]{1,2}/|/)");
}

function reExportFrom(modulePath) {
  const target = normalizedModulePath(modulePath);
  return new RegExp(
    `\\bexport(?:\\s+type)?\\s*(?:\\*\\s+as\\s+[A-Za-z_$][\\w$]*|\\*|\\{[\\s\\S]*?\\})\\s*from\\s*[\\"']${target}(?:[.]js)?[\\"']`,
  );
}

function importAndReExport(symbol, modulePath) {
  const target = normalizedModulePath(modulePath);
  return new RegExp(
    `\\bimport\\s+(?:type\\s+)?\\{[\\s\\S]*?\\b${symbol}\\b[\\s\\S]*?\\}\\s*from\\s*[\\"']${target}(?:[.]js)?[\\"'][\\s\\S]*?\\bexport\\s*\\{[\\s\\S]*?\\b(?:${symbol}|[A-Za-z_$][\\w$]*)\\b[\\s\\S]*?\\}`,
  );
}

function namespaceImportAndReExport(modulePath) {
  const target = normalizedModulePath(modulePath);
  return new RegExp(
    `\\bimport\\s+\\*\\s+as\\s+([A-Za-z_$][\\w$]*)\\s+from\\s*[\\"']${target}(?:[.]js)?[\\"'][\\s\\S]*?\\bexport\\s*\\{[\\s\\S]*?\\b\\1\\b[\\s\\S]*?\\}`,
  );
}

function explicitArtifactReExport(symbols, modulePath) {
  const target = normalizedModulePath(modulePath);
  const names = symbols.join("|");
  return new RegExp(
    `\\bexport(?:\\s+type)?\\s*(?:\\{[\\s\\S]*?\\b(?:${names})\\b[\\s\\S]*?\\}|\\*\\s+as\\s+(?:${names}))\\s*from\\s*[\\"']${target}(?:[.]js)?[\\"']`,
  );
}

function explicitArtifactImportAndReExport(symbol, modulePath) {
  return importAndReExport(symbol, modulePath);
}

function explicitArtifactNamespaceImportAndReExport(modulePath) {
  return namespaceImportAndReExport(modulePath);
}

function bundledArtifactExport(symbols) {
  const names = symbols.join("|");
  return new RegExp(`\\bexport\\s*\\{[^}]*\\b(?:${names})\\b[^}]*\\}`);
}

const LEGACY_RULES = Object.freeze([
  {
    name: "dynamic renderer bridge dispatcher",
    pattern: /\brequireBridgeApi\b/,
  },
  {
    name: "retired preload trashArticles alias",
    pattern: /(?:^|[,{;])\s*(?:["']trashArticles["']|trashArticles)\s*:/,
  },
  {
    name: "retired Content to Generation bridge re-export",
    filePattern: RENDERER_CONTENT_BRIDGE,
    sourceAstOnly: true,
    pattern: anyPattern(
      reExportFrom("[.]?/generation"),
      importAndReExport("generateContentArticle", "[.]?/generation"),
      namespaceImportAndReExport("[.]?/generation"),
    ),
  },
  {
    name: "retired Content to Removal bridge re-export",
    filePattern: RENDERER_CONTENT_BRIDGE,
    sourceAstOnly: true,
    pattern: anyPattern(
      reExportFrom("[.]?/content-removal"),
      importAndReExport("trashContentArticles", "[.]?/content-removal"),
      namespaceImportAndReExport("[.]?/content-removal"),
    ),
  },
  {
    name: "retired Platform to Removal bridge re-export",
    filePattern: RENDERER_PLATFORM_BRIDGE,
    sourceAstOnly: true,
    pattern: anyPattern(
      reExportFrom("[.]?/content"),
      importAndReExport("previewTrashedArticleQueueResidue", "[.]?/content"),
      namespaceImportAndReExport("[.]?/content"),
    ),
  },
  {
    name: "retired Workspace to Platform bridge re-export",
    filePattern: RENDERER_WORKSPACE_BRIDGE,
    sourceAstOnly: true,
    pattern: anyPattern(
      reExportFrom("[.]?/platform"),
      importAndReExport("getPlatformQueue", "[.]?/platform"),
      namespaceImportAndReExport("[.]?/platform"),
    ),
  },
  {
    name: "retired generated Content to Generation bridge re-export",
    filePattern: GENERATED_ARTIFACT_PATH,
    pattern: anyPattern(
      explicitArtifactReExport(
        ["generateContentArticle", "generation"],
        "[.]?/generation",
      ),
      explicitArtifactImportAndReExport(
        "generateContentArticle",
        "[.]?/generation",
      ),
      explicitArtifactNamespaceImportAndReExport("[.]?/generation"),
    ),
  },
  {
    name: "retired generated Content to Removal bridge re-export",
    filePattern: GENERATED_ARTIFACT_PATH,
    pattern: anyPattern(
      explicitArtifactReExport(
        ["trashContentArticles", "contentRemoval"],
        "[.]?/content-removal",
      ),
      explicitArtifactImportAndReExport(
        "trashContentArticles",
        "[.]?/content-removal",
      ),
      explicitArtifactNamespaceImportAndReExport("[.]?/content-removal"),
    ),
  },
  {
    name: "retired generated Platform to Removal bridge re-export",
    filePattern: GENERATED_ARTIFACT_PATH,
    pattern: anyPattern(
      explicitArtifactReExport(
        ["previewTrashedArticleQueueResidue", "content"],
        "[.]?/content",
      ),
      explicitArtifactImportAndReExport(
        "previewTrashedArticleQueueResidue",
        "[.]?/content",
      ),
      explicitArtifactNamespaceImportAndReExport("[.]?/content"),
    ),
  },
  {
    name: "retired generated Workspace to Platform bridge re-export",
    filePattern: GENERATED_ARTIFACT_PATH,
    pattern: anyPattern(
      explicitArtifactReExport(
        ["getPlatformQueue", "platform"],
        "[.]?/platform",
      ),
      explicitArtifactImportAndReExport("getPlatformQueue", "[.]?/platform"),
      explicitArtifactNamespaceImportAndReExport("[.]?/platform"),
    ),
  },
  {
    name: "retired generated Renderer compatibility export",
    filePattern: GENERATED_ARTIFACT_PATH,
    pattern: bundledArtifactExport([
      "generateContentArticle",
      "trashContentArticles",
      "previewTrashedArticleQueueResidue",
      "getPlatformQueue",
    ]),
  },
  {
    name: "retired getDoubaoLoginState Renderer alias",
    pattern:
      /\b(?:export\s+)?(?:const\s+getDoubaoLoginState\s*=\s*getDoubaoLoginStatus|const\s+getDoubaoLoginState\s*=\s*(?:async\s+)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>[\s\S]{0,500}?\bgetDoubaoLoginStatus\s*\(|\{\s*getDoubaoLoginStatus\s+as\s+getDoubaoLoginState\b|(?:export\s+)?(?:async\s+)?function\s+getDoubaoLoginState\s*\([^)]*\)\s*\{[\s\S]{0,500}?\breturn\s+getDoubaoLoginStatus\s*\()/,
  },
  {
    name: "retired removal legacy compatibility field",
    filePattern: RENDERER_CONTENT_REMOVAL_BRIDGE,
    sourceAstOnly: true,
    pattern:
      /\b(?:input|request)\.legacy\b|\b(?:const|let|var)\s*\{[^}]*\blegacy\b[^}]*\}\s*=\s*(?:input|request|payload)\b/,
  },
  {
    name: "retired removal articles compatibility field",
    filePattern: RENDERER_CONTENT_REMOVAL_BRIDGE,
    sourceAstOnly: true,
    pattern:
      /\b(?:input|request)\.articles\b|\b(?:const|let|var)\s*\{[^}]*\barticles\b[^}]*\}\s*=\s*(?:input|request|payload)\b|\bArticleTrashCommitInput\s*&\s*\{\s*articles\s*:\s*|\bpreviewArticleRemovalImpact\s*\([\s\S]{0,500}?\barticles\s*:\s*Article\w*Selection\[\]/,
  },
  {
    name: "retired removal DTO compatibility field",
    filePattern: RENDERER_PUBLICATION_TYPES,
    sourceAstOnly: true,
    pattern:
      /\b(?:interface\s+ArticleTrash(?:Preview|CommitInput)\b|type\s+ArticleTrash(?:Preview|CommitInput)\s*=\s*\{)[\s\S]{0,1000}?\b(?:legacy|articles)\s*\??\s*:/,
  },
]);
const TEXT_EXTENSIONS = /\.(?:cjs|css|html|js|mjs|tsx?|jsx?)$/i;

function absenceError(code, message) {
  return Object.assign(new Error(message), { code });
}

function regularFile(filename) {
  try {
    const stat = fs.lstatSync(filename);
    return stat.isFile() && !stat.isSymbolicLink();
  } catch (_) {
    return false;
  }
}

function sourceFilesUnder(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFilesUnder(filename);
    return TEXT_EXTENSIONS.test(entry.name) ? [filename] : [];
  });
}

function normalizedArchiveEntries(archive) {
  try {
    return asar
      .listPackage(archive)
      .map((entry) => entry.replace(/^[/\\]+/, "").replaceAll("\\", "/"));
  } catch (_) {
    throw absenceError(
      "RENDERER_CONTRACT_ARCHIVE_INVALID",
      "production app.asar is unavailable or invalid",
    );
  }
}

function sourceModuleName(moduleSpecifier) {
  return moduleSpecifier
    .replaceAll("\\", "/")
    .replace(/[?#].*$/, "")
    .replace(/[.]m?js$/i, "")
    .split("/")
    .at(-1);
}

function visitSourceNodes(sourceFile, visitor) {
  function visit(node) {
    visitor(node);
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
}

function sourceAstRule(file, sourceFile, sharedTypeDeclarations = new Map()) {
  const result = [];
  const reExportOwners = [];
  if (RENDERER_CONTENT_BRIDGE.test(file))
    reExportOwners.push(
      {
        module: "generation",
        symbol: "generateContentArticle",
        rule: "retired Content to Generation bridge re-export",
      },
      {
        module: "content-removal",
        symbol: "trashContentArticles",
        rule: "retired Content to Removal bridge re-export",
      },
    );
  if (RENDERER_PLATFORM_BRIDGE)
    reExportOwners.push(
      ...(RENDERER_PLATFORM_BRIDGE.test(file)
        ? [
            {
              module: "content",
              symbol: "previewTrashedArticleQueueResidue",
              rule: "retired Platform to Removal bridge re-export",
            },
          ]
        : []),
    );
  if (RENDERER_WORKSPACE_BRIDGE.test(file))
    reExportOwners.push({
      module: "platform",
      symbol: "getPlatformQueue",
      rule: "retired Workspace to Platform bridge re-export",
    });

  const importedLocals = new Map();
  const derivedLocals = new Map();
  visitSourceNodes(sourceFile, (node) => {
    if (
      !ts.isImportDeclaration(node) ||
      !ts.isStringLiteral(node.moduleSpecifier)
    )
      return;
    const module = sourceModuleName(node.moduleSpecifier.text);
    const owner = reExportOwners.find(
      (candidate) => candidate.module === module,
    );
    if (!owner || !node.importClause) return;
    const locals = importedLocals.get(owner.rule) || new Set();
    const bindings = node.importClause.namedBindings;
    if (bindings && ts.isNamespaceImport(bindings))
      locals.add(bindings.name.text);
    if (bindings && ts.isNamedImports(bindings))
      for (const element of bindings.elements) {
        const imported = element.propertyName?.text || element.name.text;
        if (imported === owner.symbol) locals.add(element.name.text);
      }
    importedLocals.set(owner.rule, locals);
  });

  visitSourceNodes(sourceFile, (node) => {
    if (!ts.isExportDeclaration(node)) return;
    if (node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      const module = sourceModuleName(node.moduleSpecifier.text);
      const owner = reExportOwners.find(
        (candidate) => candidate.module === module,
      );
      if (owner) result.push({ file, rule: owner.rule });
      return;
    }
    if (!node.exportClause || !ts.isNamedExports(node.exportClause)) return;
    for (const owner of reExportOwners) {
      const locals = importedLocals.get(owner.rule);
      if (!locals) continue;
      if (
        node.exportClause.elements.some((element) =>
          locals.has(element.propertyName?.text || element.name.text),
        )
      )
        result.push({ file, rule: owner.rule });
    }
  });

  function unwrapReferenceExpression(expression) {
    let current = expression;
    while (
      current &&
      (ts.isParenthesizedExpression(current) ||
        ts.isAsExpression(current) ||
        ts.isTypeAssertionExpression(current) ||
        ts.isSatisfiesExpression(current) ||
        ts.isAwaitExpression(current))
    )
      current = current.expression;
    return current;
  }

  function returnsRetiredReference(callable, owner, visited = new Set()) {
    const body = callable.body;
    if (!body) return false;
    if (!ts.isBlock(body))
      return referencesRetiredBinding(body, owner, visited);
    let found = false;
    visitSourceNodes(body, (node) => {
      if (node !== body && ts.isFunctionLike(node)) return;
      if (
        ts.isReturnStatement(node) &&
        referencesRetiredBinding(node.expression, owner, visited)
      )
        found = true;
    });
    return found;
  }

  function retiredLocals(owner) {
    return new Set([
      ...(importedLocals.get(owner.rule) || []),
      ...(derivedLocals.get(owner.rule) || []),
    ]);
  }

  function referencesRetiredBinding(expression, owner, visited = new Set()) {
    const current = unwrapReferenceExpression(expression);
    if (!current) return false;
    if (visited.has(current)) return false;
    visited.add(current);
    const locals = retiredLocals(owner);
    if (ts.isIdentifier(current)) return locals.has(current.text);
    if (
      ts.isPropertyAccessExpression(current) &&
      ts.isIdentifier(current.expression) &&
      locals.has(current.expression.text) &&
      current.name.text === owner.symbol
    )
      return true;
    if (ts.isCallExpression(current))
      return referencesRetiredBinding(current.expression, owner, visited);
    if (ts.isArrowFunction(current) || ts.isFunctionExpression(current))
      return returnsRetiredReference(current, owner, visited);
    return false;
  }

  for (let pass = 0; pass < sourceFile.statements.length + 1; pass++) {
    let added = false;
    visitSourceNodes(sourceFile, (node) => {
      if (ts.isFunctionDeclaration(node) && node.name) {
        for (const owner of reExportOwners) {
          if (
            node.name.text === owner.symbol &&
            returnsRetiredReference(node, owner)
          )
            result.push({ file, rule: owner.rule });
        }
      }
      if (!ts.isVariableDeclaration(node) || !ts.isIdentifier(node.name))
        return;
      for (const owner of reExportOwners) {
        if (!node.initializer) continue;
        if (!referencesRetiredBinding(node.initializer, owner)) continue;
        const locals = derivedLocals.get(owner.rule) || new Set();
        if (locals.has(node.name.text)) continue;
        locals.add(node.name.text);
        derivedLocals.set(owner.rule, locals);
        added = true;
        if (node.name.text === owner.symbol)
          result.push({ file, rule: owner.rule });
      }
    });
    if (!added) break;
  }

  visitSourceNodes(sourceFile, (node) => {
    if (!ts.isExportDeclaration(node) || node.moduleSpecifier) return;
    if (!node.exportClause || !ts.isNamedExports(node.exportClause)) return;
    for (const owner of reExportOwners) {
      const locals = new Set([
        ...(importedLocals.get(owner.rule) || []),
        ...(derivedLocals.get(owner.rule) || []),
      ]);
      if (
        node.exportClause.elements.some((element) =>
          locals.has(element.propertyName?.text || element.name.text),
        )
      )
        result.push({ file, rule: owner.rule });
    }
  });

  const loginLocals = new Set(["getDoubaoLoginStatus"]);
  visitSourceNodes(sourceFile, (node) => {
    if (!ts.isImportDeclaration(node)) return;
    const bindings = node.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) return;
    for (const element of bindings.elements)
      if (
        (element.propertyName?.text || element.name.text) ===
        "getDoubaoLoginStatus"
      )
        loginLocals.add(element.name.text);
  });

  function unwrapSourceExpression(expression) {
    let current = expression;
    while (
      current &&
      (ts.isParenthesizedExpression(current) ||
        ts.isAsExpression(current) ||
        ts.isTypeAssertionExpression(current) ||
        ts.isSatisfiesExpression(current) ||
        ts.isAwaitExpression(current))
    )
      current = current.expression;
    return current;
  }

  function callsLoginStatus(expression) {
    const current = unwrapSourceExpression(expression);
    return Boolean(
      current &&
      ts.isCallExpression(current) &&
      ts.isIdentifier(current.expression) &&
      loginLocals.has(current.expression.text),
    );
  }

  function callableReturnsLoginStatus(callable) {
    const body = callable.body;
    if (!body) return false;
    if (!ts.isBlock(body)) return callsLoginStatus(body);
    let found = false;
    visitSourceNodes(body, (node) => {
      if (node !== body && ts.isFunctionLike(node)) return;
      if (ts.isReturnStatement(node) && callsLoginStatus(node.expression))
        found = true;
    });
    return found;
  }

  visitSourceNodes(sourceFile, (node) => {
    if (
      ts.isFunctionDeclaration(node) &&
      node.name?.text === "getDoubaoLoginState" &&
      callableReturnsLoginStatus(node)
    )
      result.push({
        file,
        rule: "retired getDoubaoLoginState Renderer alias",
      });
    if (!ts.isVariableDeclaration(node) || !ts.isIdentifier(node.name)) return;
    if (node.name.text !== "getDoubaoLoginState" || !node.initializer) return;
    const initializer = unwrapSourceExpression(node.initializer);
    if (
      (ts.isArrowFunction(initializer) ||
        ts.isFunctionExpression(initializer)) &&
      callableReturnsLoginStatus(initializer)
    )
      result.push({
        file,
        rule: "retired getDoubaoLoginState Renderer alias",
      });
    if (ts.isIdentifier(initializer) && loginLocals.has(initializer.text))
      result.push({
        file,
        rule: "retired getDoubaoLoginState Renderer alias",
      });
  });

  if (RENDERER_CONTENT_REMOVAL_BRIDGE.test(file)) {
    function bindingFields(pattern) {
      if (!ts.isObjectBindingPattern(pattern)) return new Set();
      return new Set(
        pattern.elements.flatMap((element) => {
          if (!ts.isBindingElement(element)) return [];
          const property = element.propertyName || element.name;
          return ts.isIdentifier(property) ? [property.text] : [];
        }),
      );
    }

    function addCompatibilityFields(fields, sourceName) {
      const hasLegacy = fields.has("legacy");
      const hasArticles = fields.has("articles");
      const compatible =
        hasLegacy ||
        (hasArticles && (sourceName === "input" || sourceName === "request"));
      if (!compatible) return;
      if (hasLegacy)
        result.push({
          file,
          rule: "retired removal legacy compatibility field",
        });
      if (hasArticles)
        result.push({
          file,
          rule: "retired removal articles compatibility field",
        });
    }

    visitSourceNodes(sourceFile, (node) => {
      if (ts.isParameter(node) && ts.isObjectBindingPattern(node.name))
        addCompatibilityFields(bindingFields(node.name), null);
      if (
        ts.isVariableDeclaration(node) &&
        ts.isObjectBindingPattern(node.name)
      ) {
        const initializer = unwrapSourceExpression(node.initializer);
        addCompatibilityFields(
          bindingFields(node.name),
          ts.isIdentifier(initializer) ? initializer.text : null,
        );
      }
      if (
        ts.isPropertyAccessExpression(node) &&
        ts.isIdentifier(node.expression) &&
        (node.expression.text === "input" ||
          node.expression.text === "request" ||
          (node.expression.text === "payload" &&
            node.name.text === "legacy")) &&
        (node.name.text === "legacy" || node.name.text === "articles")
      )
        result.push({
          file,
          rule:
            node.name.text === "legacy"
              ? "retired removal legacy compatibility field"
              : "retired removal articles compatibility field",
        });
    });
  }

  if (RENDERER_PUBLICATION_TYPES.test(file)) {
    const declarations = new Map(sharedTypeDeclarations);
    visitSourceNodes(sourceFile, (node) => {
      if (
        (ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) &&
        node.name
      )
        declarations.set(node.name.text, node);
    });

    function memberName(member) {
      const name = member.name;
      return name && (ts.isIdentifier(name) || ts.isStringLiteral(name))
        ? name.text
        : null;
    }

    function typeHasCompatibilityFields(typeNode, visited = new Set()) {
      if (!typeNode) return false;
      if (ts.isParenthesizedTypeNode(typeNode))
        return typeHasCompatibilityFields(typeNode.type, visited);
      if (ts.isTypeLiteralNode(typeNode))
        return typeNode.members.some((member) =>
          ["legacy", "articles"].includes(memberName(member)),
        );
      if (ts.isInterfaceDeclaration(typeNode))
        return declarationHasFields(typeNode, visited);
      if (ts.isTypeReferenceNode(typeNode)) {
        const name = typeNode.typeName.getText().split(".").at(-1);
        const declaration = declarations.get(name);
        return declaration ? declarationHasFields(declaration, visited) : false;
      }
      if (ts.isIntersectionTypeNode(typeNode) || ts.isUnionTypeNode(typeNode))
        return typeNode.types.some((member) =>
          typeHasCompatibilityFields(member, visited),
        );
      return false;
    }

    function declarationHasFields(declaration, visited = new Set()) {
      if (visited.has(declaration)) return false;
      visited.add(declaration);
      if (ts.isInterfaceDeclaration(declaration)) {
        return (
          declaration.members.some((member) =>
            ["legacy", "articles"].includes(memberName(member)),
          ) ||
          declaration.heritageClauses?.some((clause) =>
            clause.types.some((type) =>
              typeHasCompatibilityFields(type, visited),
            ),
          )
        );
      }
      return typeHasCompatibilityFields(declaration.type, visited);
    }

    for (const name of ["ArticleTrashPreview", "ArticleTrashCommitInput"]) {
      const declaration = declarations.get(name);
      if (declaration && declarationHasFields(declaration))
        result.push({
          file,
          rule: "retired removal DTO compatibility field",
        });
    }
  }

  return result;
}

function scanText(filename, source, options = {}) {
  const normalized = filename.replaceAll("\\", "/");
  return LEGACY_RULES.filter(
    (rule) =>
      (!options.sourceFile || !rule.sourceAstOnly) &&
      (!rule.filePattern || rule.filePattern.test(normalized)) &&
      rule.pattern.test(source),
  ).map((rule) => ({
    file: filename,
    rule: rule.name,
  }));
}

function scanSourceTree(root) {
  const matches = LEGACY_SOURCE_PATHS.filter((relative) =>
    fs.existsSync(path.join(root, relative)),
  ).map((relative) => ({
    file: relative.replaceAll("\\", "/"),
    rule: "retired renderer source path",
  }));
  const files = SOURCE_ROOTS.flatMap((relative) => {
    const absolute = path.join(root, relative);
    return fs.existsSync(absolute) && fs.statSync(absolute).isFile()
      ? [absolute]
      : sourceFilesUnder(absolute);
  });
  const sourceRecords = files
    .filter((filename) => /\.tsx?$/i.test(filename))
    .map((filename) => {
      const relative = path.relative(root, filename).replaceAll("\\", "/");
      const source = fs.readFileSync(filename, "utf8");
      const scriptKind = /\.tsx$/i.test(relative)
        ? ts.ScriptKind.TSX
        : ts.ScriptKind.TS;
      return {
        filename,
        relative,
        source,
        sourceFile: ts.createSourceFile(
          relative,
          source,
          ts.ScriptTarget.Latest,
          true,
          scriptKind,
        ),
      };
    });
  const sharedTypeDeclarations = new Map();
  for (const record of sourceRecords)
    visitSourceNodes(record.sourceFile, (node) => {
      if (
        (ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) &&
        node.name &&
        !sharedTypeDeclarations.has(node.name.text)
      )
        sharedTypeDeclarations.set(node.name.text, node);
    });
  for (const filename of files) {
    const relative = path.relative(root, filename).replaceAll("\\", "/");
    const source = fs.readFileSync(filename, "utf8");
    matches.push(...scanText(relative, source, { sourceFile: true }));
    if (/\.tsx?$/i.test(relative)) {
      const record = sourceRecords.find(
        (candidate) => candidate.filename === filename,
      );
      matches.push(
        ...sourceAstRule(relative, record.sourceFile, sharedTypeDeclarations),
      );
    }
  }
  return matches;
}

function scanDirectArtifacts(root) {
  const matches = [];
  for (const relative of DIRECT_ARTIFACTS) {
    const filename = path.join(root, relative);
    if (regularFile(filename)) {
      matches.push(
        ...scanText(
          relative.replaceAll("\\", "/"),
          fs.readFileSync(filename, "utf8"),
        ),
      );
      continue;
    }
    if (fs.existsSync(filename) && fs.statSync(filename).isDirectory()) {
      const files = sourceFilesUnder(filename);
      if (files.length === 0)
        throw absenceError(
          "RENDERER_CONTRACT_ARTIFACT_EMPTY",
          `${relative} contains no generated text artifacts`,
        );
      for (const child of files) {
        matches.push(
          ...scanText(
            path.relative(root, child).replaceAll("\\", "/"),
            fs.readFileSync(child, "utf8"),
          ),
        );
      }
      continue;
    }
    throw absenceError(
      "RENDERER_CONTRACT_ARTIFACT_MISSING",
      `generated renderer artifact is missing: ${relative}`,
    );
  }
  return matches;
}

function archiveEntryIsScannable(entry) {
  return (
    ARCHIVE_ROOTS.some((root) => entry === root || entry.startsWith(root)) &&
    TEXT_EXTENSIONS.test(entry)
  );
}

function scanArchive(resourcesPath) {
  const archive = path.join(path.resolve(resourcesPath), "app.asar");
  if (!regularFile(archive))
    throw absenceError(
      "RENDERER_CONTRACT_ARCHIVE_MISSING",
      "production app.asar is missing",
    );
  const entries = normalizedArchiveEntries(archive);
  const matches = entries
    .filter(archiveEntryIsScannable)
    .flatMap((entry) =>
      scanText(
        `app.asar/${entry}`,
        asar.extractFile(archive, path.normalize(entry)).toString("utf8"),
      ),
    );
  for (const legacyPath of LEGACY_SOURCE_PATHS) {
    const entry = legacyPath.replaceAll("\\", "/");
    if (entries.includes(entry))
      matches.push({
        file: `app.asar/${entry}`,
        rule: "retired renderer source path",
      });
  }
  return { entries: entries.length, matches };
}

function verifyRendererContractAbsence(options) {
  const opts = options || {};
  const root = path.resolve(opts.root || ROOT);
  const sourceMatches = scanSourceTree(root);
  const generatedMatches = scanDirectArtifacts(root);
  const archive = scanArchive(opts.resourcesPath);
  const matches = [...sourceMatches, ...generatedMatches, ...archive.matches];
  const report = {
    status: matches.length === 0 ? "PASSED" : "FAILED",
    operation: "renderer-contract-compatibility-absence",
    sourceMatches: sourceMatches.length,
    generatedMatches: generatedMatches.length,
    archiveMatches: archive.matches.length,
    archiveEntries: archive.entries,
    matches,
  };
  if (report.status !== "PASSED")
    throw Object.assign(
      absenceError(
        "RENDERER_CONTRACT_LEGACY_PRESENT",
        "retired Renderer compatibility surface is present",
      ),
      { report },
    );
  return report;
}

function parseArguments(argv) {
  const args = Array.from(argv || []);
  const options = {};
  while (args.length) {
    const arg = args.shift();
    if (arg === "--resources" || arg === "--root" || arg === "--output") {
      const value = args.shift();
      if (!value || value.startsWith("--"))
        throw absenceError(
          "RENDERER_CONTRACT_ARGUMENT_INVALID",
          `${arg} requires a value`,
        );
      options[
        arg === "--resources"
          ? "resourcesPath"
          : arg === "--root"
            ? "root"
            : "output"
      ] = path.resolve(value);
    } else {
      throw absenceError(
        "RENDERER_CONTRACT_ARGUMENT_INVALID",
        `unknown option: ${arg}`,
      );
    }
  }
  if (!options.resourcesPath)
    throw absenceError(
      "RENDERER_CONTRACT_ARGUMENT_INVALID",
      "--resources is required",
    );
  return options;
}

if (require.main === module) {
  try {
    const options = parseArguments(process.argv.slice(2));
    const report = verifyRendererContractAbsence(options);
    const output =
      options.output ||
      path.join(ROOT, "build", "evidence", "renderer-contract-absence.json");
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, JSON.stringify(report, null, 2) + "\n", {
      encoding: "utf8",
      mode: 0o600,
    });
    process.stdout.write(JSON.stringify(report) + "\n");
  } catch (error) {
    const code =
      error &&
      typeof error.code === "string" &&
      /^RENDERER_CONTRACT_[A-Z0-9_]{1,72}$/.test(error.code)
        ? error.code
        : "RENDERER_CONTRACT_ABSENCE_FAILED";
    process.stderr.write(
      code + ":renderer contract absence verification failed\n",
    );
    process.exitCode = 1;
  }
}

module.exports = {
  ARCHIVE_ROOTS,
  DIRECT_ARTIFACTS,
  LEGACY_SOURCE_PATHS,
  LEGACY_RULES,
  parseArguments,
  scanArchive,
  scanDirectArtifacts,
  scanSourceTree,
  verifyRendererContractAbsence,
};
