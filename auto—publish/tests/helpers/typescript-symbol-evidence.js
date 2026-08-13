const path = require("node:path");
const fs = require("node:fs");
const ts = require("../../media-workbench/node_modules/typescript");
const wiringReachabilityByProgram = new WeakMap();
const callbackInvocationByChecker = new WeakMap();
const callbackPropertyInvocationByChecker = new WeakMap();
const jsxCallbackByChecker = new WeakMap();
const callSitesByProgram = new WeakMap();
const abruptCallableByChecker = new WeakMap();
const abruptCallByChecker = new WeakMap();

function normalize(file) {
  return path.posix.normalize(file.replaceAll("\\", "/"));
}

function createMemoryProgram(files) {
  const normalized = new Map(
    Object.entries(files).map(([file, source]) => [normalize(file), source]),
  );
  const options = {
    allowJs: true,
    checkJs: true,
    jsx: ts.JsxEmit.ReactJSX,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    noEmit: true,
    noLib: true,
    skipLibCheck: true,
    target: ts.ScriptTarget.ES2022,
  };
  const host = ts.createCompilerHost(options, true);
  host.fileExists = (file) => normalized.has(normalize(file));
  host.readFile = (file) => normalized.get(normalize(file));
  host.getSourceFile = (file, languageVersion) => {
    const name = normalize(file);
    const source = normalized.get(name);
    if (source === undefined) return undefined;
    return ts.createSourceFile(
      name,
      source,
      languageVersion,
      true,
      name.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
  };
  host.writeFile = () => {};
  host.getCurrentDirectory = () => "/";
  host.getCanonicalFileName = normalize;
  host.getNewLine = () => "\n";
  host.useCaseSensitiveFileNames = () => true;
  host.resolveModuleNames = (moduleNames, containingFile) =>
    moduleNames.map((specifier) => {
      if (!specifier.startsWith(".")) return undefined;
      const base = normalize(
        path.posix.resolve(
          path.posix.dirname(normalize(containingFile)),
          specifier,
        ),
      );
      const resolved = [base, `${base}.ts`, `${base}.tsx`, `${base}.js`].find(
        (candidate) => normalized.has(candidate),
      );
      return resolved
        ? { resolvedFileName: resolved, extension: ts.Extension.Ts }
        : undefined;
    });
  const program = ts.createProgram({
    rootNames: [...normalized.keys()],
    options,
    host,
  });
  return { program, checker: program.getTypeChecker() };
}

function filesUnder(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return filesUnder(target);
    return /\.(?:js|ts|tsx)$/.test(entry.name) ? [path.resolve(target)] : [];
  });
}

function createProductionProgram(applicationRoot) {
  const rendererRoot = path.resolve(applicationRoot, "media-workbench/src");
  const rootNames = [
    ...filesUnder(rendererRoot),
    ...filesUnder(path.resolve(applicationRoot, "desktop")),
    path.resolve(applicationRoot, "tests/fixtures/react-symbol-evidence.d.ts"),
  ];
  const configPath = path.resolve(
    applicationRoot,
    "media-workbench/tsconfig.json",
  );
  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(
    config.config,
    ts.sys,
    path.dirname(configPath),
  );
  const options = { ...parsed.options, checkJs: true, noEmit: true };
  const program = ts.createProgram({ rootNames, options });
  return { program, checker: program.getTypeChecker(), rendererRoot };
}

function absoluteSource(program, applicationRoot, relativeFile) {
  return program.getSourceFile(path.resolve(applicationRoot, relativeFile));
}

function evidenceSource(context, relativeFile) {
  if (typeof context.resolveSource === "function")
    return context.resolveSource(relativeFile);
  return absoluteSource(context.program, context.applicationRoot, relativeFile);
}

function importedSourceFiles(program, checker, sourceFile) {
  const targets = new Set();
  for (const declaration of walk(
    sourceFile,
    (node) => ts.isImportDeclaration(node) || ts.isExportDeclaration(node),
  )) {
    const specifier = declaration.moduleSpecifier;
    const symbol = specifier && canonicalSymbol(checker, specifier);
    for (const target of symbol?.declarations || []) {
      if (ts.isSourceFile(target)) targets.add(target);
    }
  }
  for (const call of walk(
    sourceFile,
    (node) =>
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      ts.isStringLiteral(node.arguments[0]),
  )) {
    const specifier = call.arguments[0];
    const symbol = canonicalSymbol(checker, specifier);
    for (const target of symbol?.declarations || []) {
      if (ts.isSourceFile(target)) targets.add(target);
    }
    if (specifier.text.startsWith(".")) {
      const base = path.resolve(
        path.dirname(sourceFile.fileName),
        specifier.text,
      );
      for (const candidate of [
        base,
        `${base}.ts`,
        `${base}.tsx`,
        `${base}.js`,
      ]) {
        const target = program.getSourceFile(candidate);
        if (target) targets.add(target);
      }
    }
  }
  return targets;
}

function sourceReachableFromEntry(program, checker, entry, target) {
  if (!entry || !target) return false;
  const pending = [entry];
  const visited = new Set();
  while (pending.length) {
    const current = pending.shift();
    if (current === target) return true;
    if (visited.has(current.fileName)) continue;
    visited.add(current.fileName);
    pending.push(...importedSourceFiles(program, checker, current));
  }
  return false;
}

function jsxElementIsRendered(checker, element, visited = new Set()) {
  let current = element;
  while (current.parent) {
    const parent = current.parent;
    if (
      ts.isJsxAttribute(parent) ||
      (ts.isJsxExpression(parent) && ts.isJsxAttribute(parent.parent))
    )
      return false;
    if (ts.isReturnStatement(parent)) return true;
    if (
      ts.isCallExpression(parent) &&
      parent.arguments.includes(current) &&
      ts.isPropertyAccessExpression(parent.expression) &&
      parent.expression.name.text === "render"
    )
      return true;
    if (
      ts.isVariableDeclaration(parent) &&
      parent.initializer === current &&
      ts.isIdentifier(parent.name)
    ) {
      const symbol = canonicalSymbol(checker, parent.name);
      if (!symbol || visited.has(symbol)) return false;
      const scope = containingFunction(parent) || parent.getSourceFile();
      const nextVisited = new Set(visited).add(symbol);
      return walk(scope, (node) => ts.isIdentifier(node)).some(
        (reference) =>
          reference !== parent.name &&
          canonicalSymbol(checker, reference) === symbol &&
          jsxElementIsRendered(checker, reference, nextVisited),
      );
    }
    current = parent;
  }
  return false;
}

function staticArrayLiteralHasElement(expression) {
  let current = expression;
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isTypeAssertionExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isNonNullExpression(current)
  )
    current = current.expression;
  if (!ts.isArrayLiteralExpression(current)) return false;
  return current.elements.some((element) => {
    if (ts.isOmittedExpression(element)) return false;
    if (!ts.isSpreadElement(element)) return true;
    let spread = element.expression;
    while (
      ts.isParenthesizedExpression(spread) ||
      ts.isAsExpression(spread) ||
      ts.isTypeAssertionExpression(spread) ||
      ts.isSatisfiesExpression(spread) ||
      ts.isNonNullExpression(spread)
    )
      spread = spread.expression;
    if (ts.isArrayLiteralExpression(spread))
      return staticArrayLiteralHasElement(spread);
    return ts.isStringLiteral(spread) && spread.text.length > 0;
  });
}

function runtimeInvokesKnownCallback(checker, call, argumentIndex) {
  const callee = canonicalSymbol(checker, call.expression);
  const declarationFiles = (callee?.declarations || []).map((declaration) =>
    normalize(declaration.getSourceFile().fileName),
  );
  const method = ts.isPropertyAccessExpression(call.expression)
    ? call.expression.name.text
    : ts.isIdentifier(call.expression)
      ? call.expression.text
      : "";
  const isReactDeclaration = declarationFiles.some(
    (file) =>
      file.includes("/node_modules/@types/react/") ||
      file.endsWith("/tests/fixtures/react-symbol-evidence.d.ts"),
  );
  if (
    argumentIndex === 0 &&
    ["lazy", "useEffect", "useLayoutEffect", "useInsertionEffect"].includes(
      method,
    ) &&
    isReactDeclaration
  )
    return true;
  if (
    argumentIndex === 1 &&
    method === "useWorkspaceScope" &&
    declarationFiles.some((file) =>
      file.endsWith(
        "/media-workbench/src/features/workspace/workspace-coordinator-context.tsx",
      ),
    )
  )
    return true;
  if (
    argumentIndex === 0 &&
    method === "forEach" &&
    ts.isPropertyAccessExpression(call.expression) &&
    ts.isArrayLiteralExpression(call.expression.expression) &&
    staticArrayLiteralHasElement(call.expression.expression)
  )
    return true;
  const standardCallbackIndexes = {
    map: [0],
    flatMap: [0],
    filter: [0],
    forEach: [0],
    every: [0],
    some: [0],
    reduce: [0],
    reduceRight: [0],
    then: [0, 1],
    catch: [0],
    finally: [0],
  };
  const callbackIndexes = Object.prototype.hasOwnProperty.call(
    standardCallbackIndexes,
    method,
  )
    ? standardCallbackIndexes[method]
    : null;
  return Boolean(
    callbackIndexes?.includes(argumentIndex) &&
    declarationFiles.some(
      (file) =>
        file.includes("/typescript/lib/lib.") ||
        file.includes("/typescript/lib/lib.es"),
    ),
  );
}

function callInvokesCallbackArgument(
  checker,
  call,
  argumentIndex,
  visited = [],
) {
  if (runtimeInvokesKnownCallback(checker, call, argumentIndex)) return true;
  const callee = canonicalSymbol(checker, call.expression);
  if (!callee) return false;
  let checkerCache = callbackInvocationByChecker.get(checker);
  if (!checkerCache) {
    checkerCache = new WeakMap();
    callbackInvocationByChecker.set(checker, checkerCache);
  }
  let calleeCache = checkerCache.get(callee);
  if (!calleeCache) {
    calleeCache = new Map();
    checkerCache.set(callee, calleeCache);
  }
  if (calleeCache.has(call)) return calleeCache.get(call);
  if (
    visited.some(
      ([visitedCallee, visitedIndex]) =>
        visitedCallee === callee && visitedIndex === argumentIndex,
    )
  )
    return false;
  const nextVisited = [...visited, [callee, argumentIndex]];
  function parameterIndexFor(condition, callable) {
    let current = condition;
    let negate = false;
    while (ts.isParenthesizedExpression(current)) current = current.expression;
    if (ts.isPrefixUnaryExpression(current)) {
      if (current.operator !== ts.SyntaxKind.ExclamationToken) return null;
      negate = true;
      current = current.operand;
    }
    if (!ts.isIdentifier(current)) return null;
    const index = callable.parameters.findIndex(
      (parameter) =>
        canonicalSymbol(checker, parameter.name) ===
        canonicalSymbol(checker, current),
    );
    return index < 0 ? null : { index, negate };
  }
  function invocationIsGuaranteed(callbackCall, callable) {
    let current = callbackCall;
    while (current && current !== callable) {
      const parent = current.parent;
      if (ts.isIfStatement(parent)) {
        const branch =
          parent.thenStatement === current
            ? true
            : parent.elseStatement === current
              ? false
              : null;
        if (branch !== null) {
          const guard = parameterIndexFor(parent.expression, callable);
          const value = guard
            ? staticPrimitiveValue(checker, call.arguments[guard.index])
            : staticBranchValue(checker, parent.expression);
          if (value === STATIC_UNKNOWN || value === null) return false;
          const condition = guard
            ? guard.negate
              ? !Boolean(value)
              : Boolean(value)
            : Boolean(value);
          if (branch !== condition) return false;
        }
      }
      if (
        ts.isConditionalExpression(parent) &&
        (parent.whenTrue === current || parent.whenFalse === current)
      ) {
        const value = staticBranchValue(checker, parent.condition);
        if (value === null || (parent.whenTrue === current) !== value)
          return false;
      }
      if (ts.isIterationStatement(parent) && parent.statement === current)
        return false;
      if (ts.isCaseClause(parent) || ts.isDefaultClause(parent)) return false;
      current = parent;
    }
    return true;
  }
  for (const declaration of callee?.declarations || []) {
    const callable = ts.isVariableDeclaration(declaration)
      ? declaration.initializer
      : ts.isPropertyAssignment(declaration)
        ? declaration.initializer
        : declaration;
    if (!callable || !ts.isFunctionLike(callable)) continue;
    const parameter = callable.parameters[argumentIndex];
    const parameterIdentity = parameter
      ? canonicalSymbol(checker, parameter.name)
      : null;
    if (!parameterIdentity) continue;
    if (
      walk(
        callableBody(callable),
        (node) =>
          ts.isCallExpression(node) &&
          canonicalSymbol(checker, node.expression) === parameterIdentity,
        (node) =>
          (node !== callable && ts.isFunctionLike(node)) ||
          isStaticallyUnreachableBranch(checker, node),
        checker,
      ).some((node) => invocationIsGuaranteed(node, callable))
    )
      return calleeCache.set(call, true).get(call);
    for (const nestedCall of walk(
      callableBody(callable),
      ts.isCallExpression,
      (node) =>
        (node !== callable && ts.isFunctionLike(node)) ||
        isStaticallyUnreachableBranch(checker, node),
      checker,
    )) {
      for (let index = 0; index < nestedCall.arguments.length; index += 1) {
        if (
          canonicalSymbol(checker, nestedCall.arguments[index]) !==
          parameterIdentity
        )
          continue;
        if (!invocationIsGuaranteed(nestedCall, callable)) continue;
        if (
          runtimeInvokesKnownCallback(checker, nestedCall, index) ||
          callInvokesCallbackArgument(checker, nestedCall, index, nextVisited)
        )
          return calleeCache.set(call, true).get(call);
      }
    }
  }
  calleeCache.set(call, false);
  return false;
}

function expressionAccessPath(checker, expression) {
  let current = expression;
  const properties = [];
  while (ts.isPropertyAccessExpression(current)) {
    properties.unshift(current.name.text);
    current = current.expression;
  }
  if (!ts.isIdentifier(current)) return null;
  const root = canonicalSymbol(checker, current);
  return root ? { root, properties } : null;
}

function sameAccessPath(left, right) {
  return Boolean(
    left &&
    right &&
    left.root === right.root &&
    left.properties.length === right.properties.length &&
    left.properties.every(
      (property, index) => property === right.properties[index],
    ),
  );
}

function callInvokesCallbackProperty(
  checker,
  call,
  argumentIndex,
  propertyName,
  consumerNodes,
) {
  const callee = canonicalSymbol(checker, call.expression);
  if (!callee) return false;
  let checkerCache = callbackPropertyInvocationByChecker.get(checker);
  if (!checkerCache) {
    checkerCache = new WeakMap();
    callbackPropertyInvocationByChecker.set(checker, checkerCache);
  }
  let calleeCache = checkerCache.get(callee);
  if (!calleeCache) {
    calleeCache = new Map();
    checkerCache.set(callee, calleeCache);
  }
  const cacheKey = `${argumentIndex}:${propertyName}`;
  let contract = calleeCache.get(cacheKey);

  if (contract === undefined) {
    contract = { direct: false, members: new Set() };
    for (const declaration of callee.declarations || []) {
      const callable = ts.isVariableDeclaration(declaration)
        ? declaration.initializer
        : ts.isPropertyAssignment(declaration)
          ? declaration.initializer
          : declaration;
      if (!callable || !ts.isFunctionLike(callable)) continue;
      const parameter = callable.parameters[argumentIndex];
      if (!parameter) continue;
      const reachable = reachableNodesFromCallable(checker, callable, true);
      let callbackCalls = [];
      if (ts.isObjectBindingPattern(parameter.name)) {
        const binding = parameter.name.elements.find((element) => {
          const name = element.propertyName || element.name;
          return (
            (ts.isIdentifier(name) || ts.isStringLiteral(name)) &&
            name.text === propertyName
          );
        });
        const bindingSymbol = binding
          ? canonicalSymbol(checker, binding.name)
          : null;
        if (bindingSymbol)
          callbackCalls = reachable.filter(
            (node) =>
              ts.isCallExpression(node) &&
              canonicalSymbol(checker, node.expression) === bindingSymbol,
          );
      } else if (ts.isIdentifier(parameter.name)) {
        const parameterSymbol = canonicalSymbol(checker, parameter.name);
        if (!parameterSymbol) continue;
        const tainted = new Set([parameterSymbol]);
        let changed = true;
        while (changed) {
          changed = false;
          for (const node of reachable) {
            let target = null;
            let value = null;
            if (ts.isVariableDeclaration(node) && node.initializer) {
              target = rootIdentifierSymbol(checker, node.name);
              value = node.initializer;
            } else if (
              ts.isBinaryExpression(node) &&
              node.operatorToken.kind === ts.SyntaxKind.EqualsToken
            ) {
              target = rootIdentifierSymbol(checker, node.left);
              value = node.right;
            }
            if (!target || !value || tainted.has(target)) continue;
            const carriesParameter = walk(
              value,
              (candidate) =>
                ts.isIdentifier(candidate) &&
                tainted.has(canonicalSymbol(checker, candidate)),
              (candidate) => ts.isFunctionLike(candidate),
            ).length;
            if (carriesParameter) {
              tainted.add(target);
              changed = true;
            }
          }
        }
        callbackCalls = reachable.filter(
          (node) =>
            ts.isCallExpression(node) &&
            ts.isPropertyAccessExpression(node.expression) &&
            node.expression.name.text === propertyName &&
            tainted.has(
              rootIdentifierSymbol(checker, node.expression.expression),
            ),
        );
      }
      const signature = checker.getSignatureFromDeclaration(callable);
      const returnType =
        signature && checker.getReturnTypeOfSignature(signature);
      const returnedMembers = returnType
        ? checker.getPropertiesOfType(returnType)
        : [];
      for (const callbackCall of callbackCalls) {
        const owners = returnedMembers.filter((member) =>
          memberReachableNodes(checker, callable, member).includes(
            callbackCall,
          ),
        );
        if (!owners.length) contract.direct = true;
        for (const owner of owners) contract.members.add(owner.name);
      }
    }
    calleeCache.set(cacheKey, contract);
  }
  if (contract.direct) return true;
  let resultExpression = call;
  while (
    resultExpression.parent &&
    (ts.isParenthesizedExpression(resultExpression.parent) ||
      ts.isAsExpression(resultExpression.parent) ||
      ts.isNonNullExpression(resultExpression.parent) ||
      ts.isAwaitExpression(resultExpression.parent))
  )
    resultExpression = resultExpression.parent;
  const assignment = resultExpression.parent;
  const resultPath =
    ts.isVariableDeclaration(assignment) &&
    assignment.initializer === resultExpression
      ? expressionAccessPath(checker, assignment.name)
      : ts.isBinaryExpression(assignment) &&
          assignment.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
          assignment.right === resultExpression
        ? expressionAccessPath(checker, assignment.left)
        : null;
  return Boolean(
    resultPath &&
    consumerNodes.some(
      (node) =>
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        contract.members.has(node.expression.name.text) &&
        sameAccessPath(
          resultPath,
          expressionAccessPath(checker, node.expression.expression),
        ),
    ),
  );
}

function jsxAttributeIsRuntimeCallback(
  checker,
  attribute,
  visited = new Set(),
) {
  if (!attribute || !ts.isJsxAttribute(attribute)) return false;
  const element = attribute.parent?.parent;
  if (
    !element ||
    (!ts.isJsxOpeningElement(element) &&
      !ts.isJsxSelfClosingElement(element)) ||
    !ts.isIdentifier(element.tagName)
  )
    return false;
  if (!jsxElementIsRendered(checker, element)) return false;
  if (
    /^[a-z]/.test(element.tagName.text) &&
    /^on[A-Z]/.test(attribute.name.text)
  )
    return true;

  const component = canonicalSymbol(checker, element.tagName);
  const propName = attribute.name.text;
  let checkerCache = jsxCallbackByChecker.get(checker);
  if (!checkerCache) {
    checkerCache = new WeakMap();
    jsxCallbackByChecker.set(checker, checkerCache);
  }
  let componentCache = component && checkerCache.get(component);
  if (!componentCache && component) {
    componentCache = new Map();
    checkerCache.set(component, componentCache);
  }
  if (componentCache?.has(propName)) return componentCache.get(propName);
  const componentDeclarations = [...(component?.declarations || [])];
  for (const declaration of component?.declarations || []) {
    if (!ts.isVariableDeclaration(declaration) || !declaration.initializer)
      continue;
    for (const importCall of walk(
      declaration.initializer,
      (node) =>
        ts.isCallExpression(node) &&
        node.expression.kind === ts.SyntaxKind.ImportKeyword,
    )) {
      const specifier = importCall.arguments[0];
      if (!specifier || !ts.isStringLiteral(specifier)) continue;
      const moduleSymbol = canonicalSymbol(checker, specifier);
      for (const source of moduleSymbol?.declarations || []) {
        if (!ts.isSourceFile(source)) continue;
        const target = exportedSymbol(checker, source, "default");
        componentDeclarations.push(...(target?.declarations || []));
      }
    }
  }
  for (const declaration of componentDeclarations) {
    const callable = ts.isVariableDeclaration(declaration)
      ? declaration.initializer
      : declaration;
    if (!callable || !ts.isFunctionLike(callable)) continue;
    const key = `${normalize(callable.getSourceFile().fileName)}:${callable.pos}:${propName}`;
    if (visited.has(key)) continue;
    const nextVisited = new Set(visited).add(key);
    const parameter = callable.parameters[0];
    if (!parameter) continue;
    let propSymbol = null;
    let propsRoot = null;
    if (ts.isObjectBindingPattern(parameter.name)) {
      const binding = parameter.name.elements.find((element) => {
        const name = element.propertyName || element.name;
        return (
          (ts.isIdentifier(name) || ts.isStringLiteral(name)) &&
          name.text === propName
        );
      });
      propSymbol = binding ? canonicalSymbol(checker, binding.name) : null;
    } else if (ts.isIdentifier(parameter.name)) {
      propsRoot = canonicalSymbol(checker, parameter.name);
    }
    if (!propSymbol && !propsRoot) continue;

    const propAliases = [];
    function expressionIsProp(expression) {
      if (!expression) return false;
      if (propSymbol && canonicalSymbol(checker, expression) === propSymbol)
        return true;
      if (
        propsRoot &&
        ts.isPropertyAccessExpression(expression) &&
        expression.name.text === propName &&
        receiverSymbol(checker, expression.expression) === propsRoot
      )
        return true;
      const path = expressionAccessPath(checker, expression);
      return propAliases.some((alias) => sameAccessPath(alias, path));
    }

    const body = callableBody(callable);
    if (!body) continue;
    const runtimeNodes = reachableNodesFromCallable(
      checker,
      callable,
      true,
      null,
      nextVisited,
    );
    let aliasesChanged = true;
    while (aliasesChanged) {
      aliasesChanged = false;
      for (const node of runtimeNodes) {
        let target = null;
        let value = null;
        if (ts.isVariableDeclaration(node) && node.initializer) {
          target = expressionAccessPath(checker, node.name);
          value = node.initializer;
        } else if (
          ts.isBinaryExpression(node) &&
          node.operatorToken.kind === ts.SyntaxKind.EqualsToken
        ) {
          target = expressionAccessPath(checker, node.left);
          value = node.right;
        }
        if (
          !target ||
          !value ||
          propAliases.some((alias) => sameAccessPath(alias, target)) ||
          !walk(
            value,
            (candidate) => expressionIsProp(candidate),
            (candidate) => ts.isFunctionLike(candidate),
          ).length
        )
          continue;
        propAliases.push(target);
        aliasesChanged = true;
      }
    }
    if (
      runtimeNodes.some(
        (node) =>
          ts.isCallExpression(node) && expressionIsProp(node.expression),
      )
    )
      return componentCache
        ? componentCache.set(propName, true).get(propName)
        : true;
    for (const call of runtimeNodes.filter(ts.isCallExpression)) {
      for (let index = 0; index < call.arguments.length; index += 1) {
        const argument = call.arguments[index];
        if (!ts.isObjectLiteralExpression(argument)) continue;
        for (const property of argument.properties) {
          if (!ts.isPropertyAssignment(property)) continue;
          const name = property.name;
          const propertyName =
            ts.isIdentifier(name) || ts.isStringLiteral(name)
              ? name.text
              : null;
          const callback = property.initializer;
          if (
            !propertyName ||
            !ts.isFunctionLike(callback) ||
            !callInvokesCallbackProperty(
              checker,
              call,
              index,
              propertyName,
              runtimeNodes,
            )
          )
            continue;
          if (
            walk(
              callableBody(callback),
              (node) =>
                ts.isCallExpression(node) && expressionIsProp(node.expression),
              (node) =>
                (node !== callback && ts.isFunctionLike(node)) ||
                isStaticallyUnreachableBranch(checker, node),
              checker,
            ).length
          )
            return componentCache
              ? componentCache.set(propName, true).get(propName)
              : true;
        }
      }
    }
    for (const nestedAttribute of runtimeNodes.filter(ts.isJsxAttribute)) {
      const nestedExpression =
        nestedAttribute.initializer &&
        ts.isJsxExpression(nestedAttribute.initializer)
          ? nestedAttribute.initializer.expression
          : null;
      if (
        jsxAttributeIsRuntimeCallback(checker, nestedAttribute, nextVisited) &&
        (expressionIsProp(nestedExpression) ||
          (nestedExpression &&
            ts.isFunctionLike(nestedExpression) &&
            walk(
              callableBody(nestedExpression),
              (node) =>
                ts.isCallExpression(node) && expressionIsProp(node.expression),
              (node) =>
                (node !== nestedExpression && ts.isFunctionLike(node)) ||
                isStaticallyUnreachableBranch(checker, node),
              checker,
            ).length > 0))
      )
        return componentCache
          ? componentCache.set(propName, true).get(propName)
          : true;
    }
  }
  if (componentCache) componentCache.set(propName, false);
  return false;
}

function callableReachableFromEntry(
  program,
  checker,
  entry,
  target,
  requireCallbackInvocation = false,
) {
  if (!entry || !target) return false;
  const targetSymbol = canonicalSymbol(checker, target.name || target);
  if (!targetSymbol) return false;
  const pending = [entry];
  const visited = new Set();
  const reachableCalls = new Set();

  function returnedMemberIsCalled(owner, property) {
    const ownerSymbol = canonicalSymbol(checker, owner.name || owner);
    const memberName =
      ts.isMethodDeclaration(property) ||
      ts.isPropertyAssignment(property) ||
      ts.isShorthandPropertyAssignment(property)
        ? property.name.text
        : null;
    if (!ownerSymbol || !memberName) return false;
    let callsBySymbol = callSitesByProgram.get(program);
    if (!callsBySymbol) {
      callsBySymbol = new Map();
      for (const sourceFile of program.getSourceFiles()) {
        if (sourceFile.isDeclarationFile) continue;
        for (const call of walk(sourceFile, ts.isCallExpression)) {
          const callee = canonicalSymbol(checker, call.expression);
          if (!callee) continue;
          const calls = callsBySymbol.get(callee) || [];
          calls.push(call);
          callsBySymbol.set(callee, calls);
        }
      }
      callSitesByProgram.set(program, callsBySymbol);
    }
    const entrySource = entry.getSourceFile();
    return (callsBySymbol.get(ownerSymbol) || []).some((call) => {
      if (isStaticallyUnreachableBranch(checker, call)) return false;
      const sourceFile = call.getSourceFile();
      let expression = call;
      while (
        expression.parent &&
        (ts.isParenthesizedExpression(expression.parent) ||
          ts.isAsExpression(expression.parent) ||
          ts.isNonNullExpression(expression.parent))
      )
        expression = expression.parent;
      if (
        ts.isPropertyAccessExpression(expression.parent) &&
        expression.parent.expression === expression &&
        expression.parent.name.text === memberName &&
        ts.isCallExpression(expression.parent.parent) &&
        expression.parent.parent.expression === expression.parent
      )
        return (
          reachableCalls.has(call) &&
          reachableCalls.has(expression.parent.parent)
        );
      const declaration = ts.isVariableDeclaration(expression.parent)
        ? expression.parent
        : null;
      if (!declaration || declaration.initializer !== expression) return false;
      const receiver = canonicalSymbol(checker, declaration.name);
      return Boolean(
        receiver &&
        walk(
          sourceFile,
          (candidate) =>
            ts.isCallExpression(candidate) &&
            ts.isPropertyAccessExpression(candidate.expression) &&
            candidate.expression.name.text === memberName &&
            canonicalSymbol(checker, candidate.expression.expression) ===
              receiver &&
            reachableCalls.has(call) &&
            reachableCalls.has(candidate),
          (candidate) => isStaticallyUnreachableBranch(checker, candidate),
          checker,
        ).some((candidate) => ts.isCallExpression(candidate)),
      );
    });
  }

  function enqueueSymbol(symbol) {
    const current = canonicalSymbol(checker, symbol);
    for (const declaration of current?.declarations || []) {
      if (
        ts.isFunctionLike(declaration) ||
        (ts.isVariableDeclaration(declaration) &&
          Boolean(callableBody(declaration)))
      )
        pending.push(declaration);
    }
  }

  function enqueueImportedDefault(call) {
    const specifier = call.arguments[0];
    if (!specifier || !ts.isStringLiteral(specifier)) return;
    const sources = new Set();
    const moduleSymbol = canonicalSymbol(checker, specifier);
    for (const declaration of moduleSymbol?.declarations || []) {
      if (ts.isSourceFile(declaration)) sources.add(declaration);
    }
    if (specifier.text.startsWith(".")) {
      const base = path.resolve(
        path.dirname(call.getSourceFile().fileName),
        specifier.text,
      );
      for (const candidate of [
        base,
        `${base}.ts`,
        `${base}.tsx`,
        `${base}.js`,
      ]) {
        const source = program.getSourceFile(candidate);
        if (source) sources.add(source);
      }
    }
    for (const source of sources)
      enqueueSymbol(exportedSymbol(checker, source, "default"));
  }

  function requiredExport(callExpression) {
    if (!ts.isIdentifier(callExpression)) return null;
    const local = canonicalSymbol(checker, callExpression);
    const declaration = declarationOf(local, ts.isVariableDeclaration);
    const initializer = declaration?.initializer;
    if (
      !initializer ||
      !ts.isPropertyAccessExpression(initializer) ||
      !ts.isCallExpression(initializer.expression) ||
      !ts.isIdentifier(initializer.expression.expression) ||
      initializer.expression.expression.text !== "require" ||
      !ts.isStringLiteral(initializer.expression.arguments[0])
    )
      return null;
    const base = path.resolve(
      path.dirname(declaration.getSourceFile().fileName),
      initializer.expression.arguments[0].text,
    );
    const source = [base, `${base}.js`, `${base}.ts`, `${base}.tsx`]
      .map((candidate) => program.getSourceFile(candidate))
      .find(Boolean);
    if (!source) return null;
    const exported = exportedSymbol(checker, source, initializer.name.text);
    if (exported) return exported;
    const targetDeclaration = callableDeclarationByName(
      checker,
      source,
      initializer.name.text,
    );
    return targetDeclaration
      ? canonicalSymbol(checker, targetDeclaration.name || targetDeclaration)
      : null;
  }

  while (pending.length) {
    const current = pending.shift();
    if (
      !ts.isSourceFile(current) &&
      canonicalSymbol(checker, current.name || current) === targetSymbol
    )
      return true;
    const body = ts.isSourceFile(current) ? current : callableBody(current);
    if (!body) continue;
    const key = `${normalize(body.getSourceFile().fileName)}:${body.pos}:${body.end}`;
    if (visited.has(key)) continue;
    visited.add(key);
    const nodes = walk(
      body,
      () => true,
      (node) =>
        ts.isFunctionLike(node) || isStaticallyUnreachableBranch(checker, node),
      checker,
    );
    for (const node of nodes) {
      if (ts.isCallExpression(node)) {
        reachableCalls.add(node);
        if (node.expression.kind === ts.SyntaxKind.ImportKeyword)
          enqueueImportedDefault(node);
        const callee = canonicalSymbol(checker, node.expression);
        const required = requiredExport(node.expression);
        if (callee === targetSymbol || required === targetSymbol) return true;
        enqueueSymbol(callee);
        enqueueSymbol(required);
        for (let index = 0; index < node.arguments.length; index += 1) {
          if (
            requireCallbackInvocation &&
            !callInvokesCallbackArgument(checker, node, index)
          )
            continue;
          const argument = node.arguments[index];
          for (const callback of walk(argument, ts.isFunctionLike))
            pending.push(
              ts.isPropertyAssignment(callback.parent) &&
                callback.parent.initializer === callback
                ? callback.parent
                : callback,
            );
        }
      }
      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
        if (!jsxElementIsRendered(checker, node)) continue;
        const component = canonicalSymbol(checker, node.tagName);
        if (component === targetSymbol) return true;
        enqueueSymbol(component);
      }
      if (
        ts.isJsxAttribute(node) &&
        node.initializer &&
        ts.isJsxExpression(node.initializer) &&
        node.initializer.expression &&
        (!requireCallbackInvocation ||
          jsxAttributeIsRuntimeCallback(checker, node))
      ) {
        const handler = canonicalSymbol(checker, node.initializer.expression);
        if (handler === targetSymbol) return true;
        enqueueSymbol(handler);
        if (ts.isFunctionLike(node.initializer.expression))
          pending.push(node.initializer.expression);
      }
    }
    for (const returned of nodes.filter(ts.isReturnStatement)) {
      const value = returned.expression;
      if (!value || !ts.isObjectLiteralExpression(value)) continue;
      for (const property of value.properties) {
        if (!returnedMemberIsCalled(current, property)) continue;
        if (ts.isMethodDeclaration(property)) pending.push(property);
        else if (ts.isShorthandPropertyAssignment(property))
          enqueueSymbol(
            checker.getShorthandAssignmentValueSymbol(property) ||
              property.name,
          );
        else if (ts.isPropertyAssignment(property)) {
          if (ts.isFunctionLike(property.initializer))
            pending.push(property.initializer);
          else enqueueSymbol(canonicalSymbol(checker, property.initializer));
        }
      }
    }
  }
  return false;
}

function importTarget(checker, sourceFile, exportedName) {
  for (const specifier of walk(sourceFile, ts.isImportSpecifier)) {
    const imported = specifier.propertyName?.text || specifier.name.text;
    if (imported !== exportedName && specifier.name.text !== exportedName)
      continue;
    const target = canonicalSymbol(checker, specifier.name);
    if (target) return target;
  }
  return null;
}

function propertyValueSymbol(checker, property) {
  if (ts.isShorthandPropertyAssignment(property))
    return canonicalSymbol(
      checker,
      checker.getShorthandAssignmentValueSymbol(property) || property.name,
    );
  if (ts.isPropertyAssignment(property))
    return canonicalSymbol(checker, property.initializer);
  return null;
}

function effectiveValueSymbol(checker, expression, visited = new Set()) {
  let current = expression;
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isTypeAssertionExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isNonNullExpression(current)
  )
    current = current.expression;
  if (
    ts.isBinaryExpression(current) &&
    current.operatorToken.kind === ts.SyntaxKind.CommaToken
  )
    return effectiveValueSymbol(checker, current.right, visited);
  if (ts.isConditionalExpression(current)) {
    const whenTrue = effectiveValueSymbol(
      checker,
      current.whenTrue,
      new Set(visited),
    );
    const whenFalse = effectiveValueSymbol(
      checker,
      current.whenFalse,
      new Set(visited),
    );
    return whenTrue && whenTrue === whenFalse ? whenTrue : null;
  }
  const symbol = canonicalSymbol(checker, current);
  if (!symbol || visited.has(symbol)) return symbol || null;
  visited.add(symbol);
  const declaration = declarationOf(
    symbol,
    (candidate) =>
      (ts.isVariableDeclaration(candidate) ||
        ts.isPropertyAssignment(candidate)) &&
      Boolean(candidate.initializer),
  );
  return declaration?.initializer
    ? effectiveValueSymbol(checker, declaration.initializer, visited)
    : symbol;
}

function effectiveBindingUsesSymbol(
  checker,
  expression,
  target,
  visited = new Set(),
) {
  if (!expression || !target) return false;
  let current = expression;
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isTypeAssertionExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isNonNullExpression(current)
  )
    current = current.expression;
  if (
    ts.isBinaryExpression(current) &&
    current.operatorToken.kind === ts.SyntaxKind.CommaToken
  )
    return effectiveBindingUsesSymbol(checker, current.right, target, visited);
  if (ts.isConditionalExpression(current))
    return (
      effectiveBindingUsesSymbol(
        checker,
        current.whenTrue,
        target,
        new Set(visited),
      ) &&
      effectiveBindingUsesSymbol(
        checker,
        current.whenFalse,
        target,
        new Set(visited),
      )
    );
  if (effectiveValueSymbol(checker, current) === target) return true;
  const symbol = canonicalSymbol(checker, current);
  if (symbol && visited.has(symbol)) return false;
  if (symbol) visited.add(symbol);
  const callable = ts.isFunctionLike(current)
    ? current
    : declarationOf(
        symbol,
        (candidate) =>
          ts.isFunctionLike(candidate) ||
          (ts.isVariableDeclaration(candidate) &&
            ts.isFunctionLike(candidate.initializer)),
      );
  const functionLike =
    callable && ts.isVariableDeclaration(callable)
      ? callable.initializer
      : callable;
  if (!functionLike || !ts.isFunctionLike(functionLike) || !functionLike.body)
    return false;
  function returnedExpressionTargetsBridge(expression) {
    let value = expression;
    while (
      ts.isParenthesizedExpression(value) ||
      ts.isAsExpression(value) ||
      ts.isTypeAssertionExpression(value) ||
      ts.isSatisfiesExpression(value) ||
      ts.isNonNullExpression(value) ||
      ts.isAwaitExpression(value)
    )
      value = value.expression;
    if (ts.isConditionalExpression(value))
      return (
        returnedExpressionTargetsBridge(value.whenTrue) &&
        returnedExpressionTargetsBridge(value.whenFalse)
      );
    return (
      ts.isCallExpression(value) &&
      canonicalSymbol(checker, value.expression) === target
    );
  }
  if (!ts.isBlock(functionLike.body))
    return returnedExpressionTargetsBridge(functionLike.body);
  const last = functionLike.body.statements.at(-1);
  return Boolean(
    last &&
    ts.isReturnStatement(last) &&
    last.expression &&
    returnedExpressionTargetsBridge(last.expression),
  );
}

function namedProperty(node, name) {
  if (
    !ts.isPropertyAssignment(node) &&
    !ts.isShorthandPropertyAssignment(node) &&
    !ts.isMethodDeclaration(node)
  )
    return false;
  const property = node.name;
  return Boolean(
    property &&
    (ts.isIdentifier(property) || ts.isStringLiteral(property)) &&
    property.text === name,
  );
}

function featureMemberEvidence(checker, sourceFile, member, container) {
  for (const declaration of walk(sourceFile, ts.isFunctionDeclaration)) {
    if (!declaration.name) continue;
    const symbol = canonicalSymbol(checker, declaration.name);
    if (
      !symbol ||
      exportedSymbol(checker, sourceFile, declaration.name.text) !== symbol
    )
      continue;
    const signature = checker.getSignatureFromDeclaration(declaration);
    const returnType = signature && checker.getReturnTypeOfSignature(signature);
    if (!returnType) continue;
    let memberSymbol = checker.getPropertyOfType(returnType, member);
    if (container) {
      const containerSymbol = checker.getPropertyOfType(returnType, container);
      const containerType = containerSymbol
        ? checker.getTypeOfSymbolAtLocation(containerSymbol, declaration)
        : null;
      memberSymbol = containerType
        ? checker.getPropertyOfType(containerType, member)
        : null;
    }
    if (memberSymbol)
      return { factory: declaration, factorySymbol: symbol, memberSymbol };
  }
  for (const declaration of walk(sourceFile, ts.isFunctionDeclaration)) {
    if (!declaration.name) continue;
    const factorySymbol = canonicalSymbol(checker, declaration.name);
    if (
      !factorySymbol ||
      exportedSymbol(checker, sourceFile, declaration.name.text) !==
        factorySymbol
    )
      continue;
    const properties = walk(declaration, (node) => namedProperty(node, member));
    for (const property of properties) {
      if (container) {
        let current = property.parent;
        let insideContainer = false;
        while (current && current !== declaration) {
          if (namedProperty(current, container)) {
            insideContainer = true;
            break;
          }
          current = current.parent;
        }
        if (!insideContainer) continue;
      }
      const memberSymbol = canonicalSymbol(checker, property.name);
      if (memberSymbol)
        return { factory: declaration, factorySymbol, memberSymbol };
    }
  }
  return null;
}

function factoryParameterReachesBinding(
  checker,
  factory,
  memberSymbol,
  binding,
) {
  for (const parameter of factory.parameters || []) {
    if (!ts.isIdentifier(parameter.name)) continue;
    if (
      memberReachesParameterBinding(
        checker,
        factory,
        memberSymbol,
        parameter.name.text,
        binding,
      )
    )
      return canonicalSymbol(checker, parameter.name);
  }
  return null;
}

function compositionBindsBridge(
  checker,
  sourceFile,
  factorySymbol,
  factoryParameter,
  binding,
  bridgeSymbol,
) {
  const factory = declarationOf(factorySymbol, ts.isFunctionLike);
  const parameterIndex = factory?.parameters.findIndex(
    (parameter) =>
      canonicalSymbol(checker, parameter.name) === factoryParameter,
  );
  if (parameterIndex === undefined || parameterIndex < 0) return null;
  return walk(sourceFile, (node) => {
    if (!ts.isCallExpression(node)) return false;
    if (canonicalSymbol(checker, node.expression) !== factorySymbol)
      return false;
    const argument = node.arguments[parameterIndex];
    return (
      ts.isObjectLiteralExpression(argument) &&
      argument.properties.some((property) => {
        if (!namedProperty(property, binding)) return false;
        if (propertyValueSymbol(checker, property) === bridgeSymbol)
          return true;
        const initializer = ts.isShorthandPropertyAssignment(property)
          ? property.name
          : ts.isPropertyAssignment(property)
            ? property.initializer
            : null;
        return effectiveBindingUsesSymbol(checker, initializer, bridgeSymbol);
      })
    );
  })[0];
}

function receiverReachesCompositionCall(
  checker,
  program,
  call,
  compositionCall,
  method,
  entrySource,
) {
  if (!compositionCall || !ts.isPropertyAccessExpression(call.expression))
    return false;
  const receiver = call.expression.expression;
  const pending = [
    {
      expression: receiver,
      property: ts.isIdentifier(receiver) ? method : undefined,
    },
  ];
  const visited = new Set();
  let reachabilityByEntry = wiringReachabilityByProgram.get(program);
  if (!reachabilityByEntry) {
    reachabilityByEntry = new WeakMap();
    wiringReachabilityByProgram.set(program, reachabilityByEntry);
  }
  let reachabilityCache = entrySource
    ? reachabilityByEntry.get(entrySource)
    : null;
  if (entrySource && !reachabilityCache) {
    reachabilityCache = {
      nodesByScope: new WeakMap(),
      sources: new WeakMap(),
    };
    reachabilityByEntry.set(entrySource, reachabilityCache);
  }
  const reachableNodesByScope = reachabilityCache?.nodesByScope;
  const reachableSources = reachabilityCache?.sources;

  function wiringNodeIsReachable(node) {
    if (!entrySource) return false;
    let scope = containingFunction(node);
    while (scope && !canonicalSymbol(checker, scope.name || scope))
      scope = containingFunction(scope);
    if (!scope) {
      const source = node.getSourceFile();
      if (!reachableSources.has(source))
        reachableSources.set(
          source,
          sourceReachableFromEntry(program, checker, entrySource, source)
            ? new Set(
                walk(
                  source,
                  () => true,
                  (candidate) =>
                    ts.isFunctionLike(candidate) ||
                    isStaticallyUnreachableBranch(checker, candidate),
                  checker,
                ),
              )
            : null,
        );
      return reachableSources.get(source)?.has(node) === true;
    }
    if (!reachableNodesByScope.has(scope)) {
      const scopeIsReachable = callableReachableFromEntry(
        program,
        checker,
        entrySource,
        scope,
        true,
      );
      reachableNodesByScope.set(
        scope,
        scopeIsReachable
          ? new Set(
              reachableNodesFromCallable(
                checker,
                scope,
                true,
                (call, argumentIndex) =>
                  runtimeInvokesKnownCallback(checker, call, argumentIndex),
              ),
            )
          : null,
      );
    }
    return reachableNodesByScope.get(scope)?.has(node) === true;
  }

  function propertyValue(object, name) {
    if (!ts.isObjectLiteralExpression(object)) return [];
    return object.properties.flatMap((property) => {
      if (!namedProperty(property, name)) return [];
      if (ts.isPropertyAssignment(property)) return [property.initializer];
      if (ts.isShorthandPropertyAssignment(property)) return [property.name];
      if (ts.isMethodDeclaration(property)) return [property];
      return [];
    });
  }

  function returnedValues(declaration, name) {
    const body = callableBody(declaration);
    if (!body) return [];
    const values = [];
    for (const statement of walk(body, ts.isReturnStatement, (node) =>
      ts.isFunctionLike(node),
    )) {
      const expression = statement.expression;
      if (!expression) continue;
      if (!name) values.push({ expression });
      else if (ts.isObjectLiteralExpression(expression))
        values.push(
          ...propertyValue(expression, name).map((value) => ({
            expression: value,
          })),
        );
      else if (ts.isIdentifier(expression)) {
        const symbol = canonicalSymbol(checker, expression);
        let selected = false;
        for (const candidate of symbol?.declarations || []) {
          if (ts.isVariableDeclaration(candidate) && candidate.initializer) {
            const properties = propertyValue(candidate.initializer, name);
            if (properties.length) selected = true;
            values.push(...properties.map((value) => ({ expression: value })));
          }
        }
        if (!selected) values.push({ expression, property: name });
      } else values.push({ expression, property: name });
    }
    return values;
  }

  function enqueueSymbol(symbol, property) {
    const current = canonicalSymbol(checker, symbol);
    if (!current) return;
    for (const declaration of current.declarations || []) {
      if (ts.isVariableDeclaration(declaration) && declaration.initializer)
        pending.push({ expression: declaration.initializer, property });
      else if (ts.isBindingElement(declaration)) {
        const pattern = declaration.parent;
        const variable = pattern?.parent;
        const name = declaration.propertyName?.text || declaration.name.text;
        if (ts.isVariableDeclaration(variable) && variable.initializer) {
          pending.push({ expression: variable.initializer, property: name });
          continue;
        }
        if (ts.isParameter(variable)) {
          const owner = variable.parent;
          const ownerSymbol = canonicalSymbol(checker, owner.name);
          const parameterIndex = owner.parameters.indexOf(variable);
          if (!ownerSymbol || parameterIndex < 0) continue;
          for (const source of program.getSourceFiles()) {
            if (source.isDeclarationFile) continue;
            for (const callsite of walk(
              source,
              (node) =>
                ts.isCallExpression(node) &&
                canonicalSymbol(checker, node.expression) === ownerSymbol &&
                wiringNodeIsReachable(node),
            )) {
              const argument = callsite.arguments[parameterIndex];
              if (!argument) continue;
              if (ts.isObjectLiteralExpression(argument)) {
                for (const value of propertyValue(argument, name))
                  pending.push({ expression: value });
              }
            }
            for (const element of walk(
              source,
              (node) =>
                (ts.isJsxOpeningElement(node) ||
                  ts.isJsxSelfClosingElement(node)) &&
                canonicalSymbol(checker, node.tagName) === ownerSymbol &&
                wiringNodeIsReachable(node),
            )) {
              const attribute = element.attributes.properties.find(
                (candidate) =>
                  ts.isJsxAttribute(candidate) && candidate.name.text === name,
              );
              if (
                attribute?.initializer &&
                ts.isJsxExpression(attribute.initializer) &&
                attribute.initializer.expression
              )
                pending.push({ expression: attribute.initializer.expression });
            }
          }
        }
      } else if (ts.isPropertyAssignment(declaration))
        pending.push({ expression: declaration.initializer, property });
      else if (ts.isShorthandPropertyAssignment(declaration))
        pending.push({
          symbol:
            checker.getShorthandAssignmentValueSymbol(declaration) ||
            declaration.name,
          property,
        });
    }
  }

  while (pending.length) {
    const entry = pending.shift();
    if (entry.symbol) {
      enqueueSymbol(entry.symbol, entry.property);
      continue;
    }
    const expression = entry.expression;
    if (!expression) continue;
    const key = `${normalize(expression.getSourceFile().fileName)}:${expression.pos}:${expression.end}:${entry.property || ""}`;
    if (visited.has(key)) continue;
    visited.add(key);
    if (expression === compositionCall) return true;
    if (
      ts.isParenthesizedExpression(expression) ||
      ts.isNonNullExpression(expression) ||
      ts.isAsExpression(expression) ||
      ts.isTypeAssertionExpression(expression) ||
      ts.isSatisfiesExpression(expression)
    ) {
      pending.push({
        expression: expression.expression,
        property: entry.property,
      });
      continue;
    }
    if (ts.isIdentifier(expression)) {
      enqueueSymbol(canonicalSymbol(checker, expression), entry.property);
      continue;
    }
    if (ts.isPropertyAccessExpression(expression)) {
      const base = canonicalSymbol(checker, expression.expression);
      const source = expression.getSourceFile();
      for (const assignment of walk(
        source,
        (node) =>
          ts.isBinaryExpression(node) &&
          node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
          ts.isPropertyAccessExpression(node.left) &&
          node.left.name.text === expression.name.text &&
          canonicalSymbol(checker, node.left.expression) === base,
      ))
        pending.push({
          expression: assignment.right,
          property: entry.property,
        });
      pending.push({
        expression: expression.expression,
        property: entry.property || expression.name.text,
      });
      continue;
    }
    if (ts.isCallExpression(expression)) {
      const callee = canonicalSymbol(checker, expression.expression);
      const declarations = (callee?.declarations || []).filter(
        (declaration) =>
          ts.isFunctionLike(declaration) ||
          (ts.isVariableDeclaration(declaration) &&
            Boolean(callableBody(declaration))),
      );
      for (const declaration of declarations) {
        for (const value of returnedValues(declaration, entry.property))
          pending.push(value);
      }
      if (
        ts.isIdentifier(expression.expression) &&
        expression.expression.text === "useContext" &&
        expression.arguments[0]
      ) {
        const context = canonicalSymbol(checker, expression.arguments[0]);
        for (const source of program.getSourceFiles()) {
          if (source.isDeclarationFile) continue;
          for (const element of walk(
            source,
            (node) =>
              ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node),
          )) {
            const tag = element.tagName;
            if (
              !ts.isPropertyAccessExpression(tag) ||
              tag.name.text !== "Provider" ||
              canonicalSymbol(checker, tag.expression) !== context
            )
              continue;
            if (!wiringNodeIsReachable(element)) continue;
            const value = element.attributes.properties.find(
              (attribute) =>
                ts.isJsxAttribute(attribute) && attribute.name.text === "value",
            );
            if (
              value?.initializer &&
              ts.isJsxExpression(value.initializer) &&
              value.initializer.expression
            )
              pending.push({ expression: value.initializer.expression });
          }
        }
      }
      continue;
    }
    if (ts.isObjectLiteralExpression(expression) && entry.property) {
      for (const value of propertyValue(expression, entry.property))
        pending.push({ expression: value });
      continue;
    }
    if (ts.isConditionalExpression(expression)) {
      return false;
    }
  }
  return false;
}

function featureMemberDirectlyBindsSymbol(
  checker,
  factory,
  memberSymbol,
  target,
) {
  return (memberSymbol?.declarations || []).some((declaration) => {
    if (declaration.pos < factory.pos || declaration.end > factory.end)
      return false;
    if (ts.isPropertyAssignment(declaration))
      return canonicalSymbol(checker, declaration.initializer) === target;
    if (ts.isShorthandPropertyAssignment(declaration))
      return (
        canonicalSymbol(
          checker,
          checker.getShorthandAssignmentValueSymbol(declaration) ||
            declaration.name,
        ) === target
      );
    return false;
  });
}

function callableDeclarationByName(checker, sourceFile, name) {
  if (!name) return null;
  const exported = exportedSymbol(checker, sourceFile, name);
  const exportedDeclaration = declarationOf(
    exported,
    (node) =>
      ts.isFunctionLike(node) ||
      (ts.isVariableDeclaration(node) && Boolean(callableBody(node))),
  );
  if (exportedDeclaration) return exportedDeclaration;
  return (
    walk(
      sourceFile,
      (node) =>
        (ts.isFunctionDeclaration(node) && node.name?.text === name) ||
        (ts.isVariableDeclaration(node) &&
          ts.isIdentifier(node.name) &&
          node.name.text === name &&
          Boolean(callableBody(node))) ||
        ((ts.isMethodDeclaration(node) || ts.isPropertyAssignment(node)) &&
          namedProperty(node, name) &&
          (ts.isMethodDeclaration(node) ||
            ts.isFunctionLike(node.initializer))),
    )[0] || null
  );
}

function reachableNodesFromCallable(
  checker,
  declaration,
  requireCallbackInvocation = false,
  recordedCallback = null,
  jsxVisited = new Set(),
  includeReturnedMembers = true,
) {
  if (!declaration) return [];
  const sourceFile = declaration.getSourceFile();
  const pending = [declaration];
  const visited = new Set();
  const nodes = [];
  function enqueueLocalSymbol(symbol) {
    const target = declarationOf(
      canonicalSymbol(checker, symbol),
      (candidate) =>
        candidate.getSourceFile() === sourceFile &&
        (ts.isFunctionLike(candidate) ||
          (ts.isVariableDeclaration(candidate) &&
            Boolean(callableBody(candidate)))),
    );
    if (target) pending.push(target);
  }
  while (pending.length) {
    const current = pending.shift();
    const body = callableBody(current);
    if (!body) continue;
    const key = `${body.pos}:${body.end}`;
    if (visited.has(key)) continue;
    visited.add(key);
    const direct = walk(
      body,
      () => true,
      (node) =>
        ts.isFunctionLike(node) || isStaticallyUnreachableBranch(checker, node),
      checker,
    );
    nodes.push(...direct);
    for (const nested of direct.filter(ts.isFunctionLike)) {
      let expression = nested;
      while (
        expression.parent &&
        (ts.isParenthesizedExpression(expression.parent) ||
          ts.isAsExpression(expression.parent) ||
          ts.isNonNullExpression(expression.parent))
      )
        expression = expression.parent;
      if (
        expression.parent &&
        ts.isCallExpression(expression.parent) &&
        expression.parent.expression === expression
      ) {
        pending.push(nested);
        continue;
      }
      let parent = nested.parent;
      while (parent && parent !== body && !ts.isFunctionLike(parent)) {
        if (ts.isJsxExpression(parent)) {
          const attribute = ts.isJsxAttribute(parent.parent)
            ? parent.parent
            : null;
          if (
            !requireCallbackInvocation ||
            jsxAttributeIsRuntimeCallback(checker, attribute, jsxVisited)
          )
            pending.push(nested);
          break;
        }
        parent = parent.parent;
      }
    }
    for (const call of direct.filter(ts.isCallExpression)) {
      for (let index = 0; index < call.arguments.length; index += 1) {
        if (
          requireCallbackInvocation &&
          !callInvokesCallbackArgument(checker, call, index) &&
          !recordedCallback?.(call, index)
        )
          continue;
        const argument = call.arguments[index];
        for (const callback of walk(argument, ts.isFunctionLike))
          pending.push(
            ts.isPropertyAssignment(callback.parent) &&
              callback.parent.initializer === callback
              ? callback.parent
              : callback,
          );
        enqueueLocalSymbol(canonicalSymbol(checker, argument));
      }
      const target = canonicalSymbol(checker, call.expression);
      const local = declarationOf(
        target,
        (candidate) =>
          candidate.getSourceFile() === sourceFile &&
          (ts.isFunctionLike(candidate) ||
            (ts.isVariableDeclaration(candidate) &&
              Boolean(callableBody(candidate)))),
      );
      if (local) pending.push(local);
    }
    for (const attribute of direct.filter(ts.isJsxAttribute)) {
      if (
        requireCallbackInvocation &&
        !jsxAttributeIsRuntimeCallback(checker, attribute, jsxVisited)
      )
        continue;
      const expression =
        attribute.initializer && ts.isJsxExpression(attribute.initializer)
          ? attribute.initializer.expression
          : null;
      const target = canonicalSymbol(checker, expression);
      const local = declarationOf(
        target,
        (candidate) =>
          candidate.getSourceFile() === sourceFile &&
          (ts.isFunctionLike(candidate) ||
            (ts.isVariableDeclaration(candidate) &&
              Boolean(callableBody(candidate)))),
      );
      if (local) pending.push(local);
    }
    if (!includeReturnedMembers) continue;
    for (const returned of direct.filter(ts.isReturnStatement)) {
      const value = returned.expression;
      if (!value || !ts.isObjectLiteralExpression(value)) continue;
      for (const property of value.properties) {
        if (
          typeof includeReturnedMembers === "function" &&
          !includeReturnedMembers(current, property, nodes)
        )
          continue;
        if (ts.isMethodDeclaration(property)) pending.push(property);
        else if (ts.isShorthandPropertyAssignment(property))
          enqueueLocalSymbol(
            checker.getShorthandAssignmentValueSymbol(property) ||
              property.name,
          );
        else if (ts.isPropertyAssignment(property)) {
          if (ts.isFunctionLike(property.initializer))
            pending.push(property.initializer);
          else
            enqueueLocalSymbol(canonicalSymbol(checker, property.initializer));
        }
      }
    }
  }
  return nodes;
}

function jsxReceiverWiresFeature(
  checker,
  program,
  call,
  receiver,
  method,
  featureMember,
) {
  if (!ts.isIdentifier(receiver)) return false;

  function unwrap(expression) {
    let current = expression;
    while (
      current &&
      (ts.isParenthesizedExpression(current) ||
        ts.isAsExpression(current) ||
        ts.isTypeAssertionExpression(current) ||
        ts.isSatisfiesExpression(current) ||
        ts.isNonNullExpression(current))
    )
      current = current.expression;
    return current;
  }

  function typePathTargets(expression, propertyPath) {
    if (!expression || !propertyPath.length) return false;
    let type = checker.getTypeAtLocation(expression);
    for (let index = 0; index < propertyPath.length; index += 1) {
      const member = checker.getPropertyOfType(type, propertyPath[index]);
      if (!member) return false;
      if (
        index === propertyPath.length - 1 &&
        canonicalSymbol(checker, member) === featureMember
      )
        return true;
      type = checker.getTypeOfSymbolAtLocation(member, expression);
    }
    return false;
  }

  function parameterCallsites(
    ownerSymbol,
    parameterIndex,
    parameterName,
    visit,
  ) {
    for (const candidateSource of program.getSourceFiles()) {
      if (candidateSource.isDeclarationFile) continue;
      for (const candidate of walk(
        candidateSource,
        (node) =>
          ts.isCallExpression(node) &&
          canonicalSymbol(checker, node.expression) === ownerSymbol,
      )) {
        const argument = candidate.arguments[parameterIndex];
        if (argument && visit(argument)) return true;
      }
      for (const element of walk(
        candidateSource,
        (node) =>
          (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
          canonicalSymbol(checker, node.tagName) === ownerSymbol,
      )) {
        const attribute = element.attributes.properties.find(
          (entry) =>
            ts.isJsxAttribute(entry) && entry.name.text === parameterName,
        );
        const expression =
          attribute?.initializer && ts.isJsxExpression(attribute.initializer)
            ? attribute.initializer.expression
            : null;
        if (expression && visit(expression)) return true;
      }
    }
    return false;
  }

  function expressionTargetsFeature(
    expression,
    propertyPath,
    visited = new Set(),
  ) {
    const current = unwrap(expression);
    if (!current) return false;
    if (typePathTargets(current, propertyPath)) return true;
    if (
      !propertyPath.length &&
      (canonicalSymbol(checker, current) === featureMember ||
        effectiveValueSymbol(checker, current) === featureMember)
    )
      return true;

    const symbol = canonicalSymbol(checker, current);
    const key = `${symbol ? symbol.id : "expression"}:${propertyPath.join(".")}:${
      current.getSourceFile().fileName
    }:${current.pos}`;
    if (visited.has(key)) return false;
    visited.add(key);

    if (ts.isObjectLiteralExpression(current) && propertyPath.length) {
      const property = current.properties.find((entry) =>
        namedProperty(entry, propertyPath[0]),
      );
      if (property) {
        const value = ts.isShorthandPropertyAssignment(property)
          ? property.name
          : ts.isPropertyAssignment(property)
            ? property.initializer
            : null;
        if (
          value &&
          expressionTargetsFeature(value, propertyPath.slice(1), visited)
        )
          return true;
      }
    }

    if (ts.isPropertyAccessExpression(current))
      return expressionTargetsFeature(
        current.expression,
        [current.name.text, ...propertyPath],
        visited,
      );
    if (ts.isElementAccessExpression(current)) {
      const name =
        ts.isStringLiteral(current.argumentExpression) ||
        ts.isNumericLiteral(current.argumentExpression)
          ? current.argumentExpression.text
          : null;
      if (name)
        return expressionTargetsFeature(
          current.expression,
          [name, ...propertyPath],
          visited,
        );
    }

    if (!symbol) return false;
    for (const declaration of symbol.declarations || []) {
      if (
        (ts.isVariableDeclaration(declaration) ||
          ts.isPropertyAssignment(declaration)) &&
        declaration.initializer &&
        expressionTargetsFeature(declaration.initializer, propertyPath, visited)
      )
        return true;
      if (ts.isParameter(declaration)) {
        const owner = declaration.parent;
        const ownerSymbol = canonicalSymbol(checker, owner.name || owner);
        const parameterIndex = owner.parameters.indexOf(declaration);
        const parameterName = ts.isIdentifier(declaration.name)
          ? declaration.name.text
          : null;
        if (
          ownerSymbol &&
          parameterIndex >= 0 &&
          parameterName &&
          parameterCallsites(
            ownerSymbol,
            parameterIndex,
            parameterName,
            (argument) =>
              expressionTargetsFeature(argument, propertyPath, visited),
          )
        )
          return true;
        continue;
      }
      if (!ts.isBindingElement(declaration)) continue;

      const property = declaration.propertyName || declaration.name;
      const propertyName =
        ts.isIdentifier(property) || ts.isStringLiteral(property)
          ? property.text
          : null;
      if (!propertyName) continue;
      const pattern = declaration.parent;
      const bindingOwner = pattern && pattern.parent;
      if (ts.isVariableDeclaration(bindingOwner) && bindingOwner.initializer) {
        if (
          expressionTargetsFeature(
            bindingOwner.initializer,
            [propertyName, ...propertyPath],
            visited,
          )
        )
          return true;
        continue;
      }
      if (!ts.isParameter(bindingOwner)) continue;
      const owner = bindingOwner.parent;
      const ownerSymbol = canonicalSymbol(checker, owner.name || owner);
      const parameterIndex = owner.parameters.indexOf(bindingOwner);
      if (
        ownerSymbol &&
        parameterIndex >= 0 &&
        parameterCallsites(
          ownerSymbol,
          parameterIndex,
          propertyName,
          (argument) =>
            expressionTargetsFeature(argument, propertyPath, visited),
        )
      )
        return true;
    }
    return false;
  }

  let owner = containingFunction(call);
  while (owner) {
    const ownerSymbol = canonicalSymbol(checker, owner.name);
    if (ownerSymbol) {
      for (const candidateSource of program.getSourceFiles()) {
        if (candidateSource.isDeclarationFile) continue;
        for (const element of walk(
          candidateSource,
          (node) =>
            ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node),
        )) {
          if (canonicalSymbol(checker, element.tagName) !== ownerSymbol)
            continue;
          const attribute = element.attributes.properties.find(
            (entry) =>
              ts.isJsxAttribute(entry) && entry.name.text === receiver.text,
          );
          const value =
            attribute?.initializer && ts.isJsxExpression(attribute.initializer)
              ? attribute.initializer.expression
              : null;
          if (value && expressionTargetsFeature(value, [method])) return true;
        }
      }
    }
    owner = containingFunction(owner);
  }
  return false;
}

function consumerCalls(checker, program, sourceFile, consumer, featureMember) {
  function runtimeInvokesCallback(call, argumentIndex) {
    return runtimeInvokesKnownCallback(checker, call, argumentIndex);
  }

  function closesTarget(symbol, target, visited = new Set()) {
    const current = canonicalSymbol(checker, symbol);
    if (!current || visited.has(current)) return false;
    if (current === target) return true;
    visited.add(current);
    for (const declaration of current.declarations || []) {
      let value = null;
      if (
        ts.isPropertyAssignment(declaration) ||
        ts.isVariableDeclaration(declaration)
      )
        value = declaration.initializer;
      else if (ts.isShorthandPropertyAssignment(declaration))
        value =
          checker.getShorthandAssignmentValueSymbol(declaration) ||
          declaration.name;
      if (!value) continue;
      if (closesTarget(canonicalSymbol(checker, value), target, visited))
        return true;
      if (
        ts.isPropertyAccessExpression(value) &&
        closesTarget(canonicalSymbol(checker, value.name), target, visited)
      )
        return true;
    }
    return false;
  }
  const owner = callableDeclarationByName(checker, sourceFile, consumer.owner);
  const nodes = owner
    ? reachableNodesFromCallable(checker, owner, true, runtimeInvokesCallback)
    : walk(sourceFile, () => true);
  return nodes.filter((node) => {
    if (!ts.isCallExpression(node)) return false;
    const expression = node.expression;
    if (consumer.receiver === "")
      return (
        ts.isIdentifier(expression) &&
        expression.text === consumer.method &&
        Boolean(canonicalSymbol(checker, expression))
      );
    if (
      !ts.isPropertyAccessExpression(expression) ||
      expression.name.text !== consumer.method
    )
      return false;
    if (closesTarget(canonicalSymbol(checker, expression.name), featureMember))
      return true;
    const receiverType = checker.getTypeAtLocation(expression.expression);
    if (
      canonicalSymbol(
        checker,
        checker.getPropertyOfType(receiverType, consumer.method),
      ) === featureMember
    )
      return true;
    if (
      jsxReceiverWiresFeature(
        checker,
        program,
        node,
        expression.expression,
        consumer.method,
        featureMember,
      )
    )
      return true;
    const ownerDeclaration = containingFunction(node);
    const ownerName = ownerDeclaration && ownerDeclaration.name;
    const ownerSymbol = canonicalSymbol(checker, ownerName);
    if (!ownerSymbol || !ts.isIdentifier(expression.expression)) return false;
    const receiver = canonicalSymbol(checker, expression.expression);
    for (const callsite of walk(
      sourceFile,
      (candidate) =>
        ts.isCallExpression(candidate) &&
        canonicalSymbol(checker, candidate.expression) === ownerSymbol,
    )) {
      for (const argument of callsite.arguments) {
        if (!ts.isObjectLiteralExpression(argument)) continue;
        for (const property of argument.properties) {
          if (!namedProperty(property, expression.expression.text)) continue;
          const value = ts.isShorthandPropertyAssignment(property)
            ? property.name
            : ts.isPropertyAssignment(property)
              ? property.initializer
              : null;
          if (!value || propertyValueSymbol(checker, property) === receiver)
            continue;
          const valueType = checker.getTypeAtLocation(value);
          if (
            canonicalSymbol(
              checker,
              checker.getPropertyOfType(valueType, consumer.method),
            ) === featureMember
          )
            return true;
        }
      }
    }
    return false;
  });
}

function jsxWiringUsesMember(
  checker,
  program,
  wiringSource,
  prop,
  featureMember,
) {
  if (!wiringSource) return true;
  return (
    walk(wiringSource, (node) => {
      if (
        !ts.isJsxAttribute(node) ||
        node.name.text !== prop ||
        !node.initializer ||
        !ts.isJsxExpression(node.initializer) ||
        !node.initializer.expression
      )
        return false;
      const expression = node.initializer.expression;
      if (canonicalSymbol(checker, expression) === featureMember) return true;
      if (ts.isPropertyAccessExpression(expression)) {
        const wiredMember = canonicalSymbol(checker, expression.name);
        if (wiredMember === featureMember) return true;
        return (wiredMember?.declarations || []).some((declaration) => {
          if (!ts.isPropertyAssignment(declaration)) return false;
          const initializer = declaration.initializer;
          return (
            canonicalSymbol(checker, initializer) === featureMember ||
            (ts.isPropertyAccessExpression(initializer) &&
              canonicalSymbol(checker, initializer.name) === featureMember)
          );
        });
      }
      return false;
    }).length > 0
  );
}

function callableReturnsArgument(checker, call, argumentIndex) {
  const callee = canonicalSymbol(checker, call.expression);
  if (!callee) return false;

  function callableCandidates(declaration, visited = new Set()) {
    if (!declaration || visited.has(declaration)) return [];
    visited.add(declaration);
    if (ts.isFunctionLike(declaration)) return [declaration];
    if (
      !ts.isVariableDeclaration(declaration) &&
      !ts.isPropertyAssignment(declaration) &&
      !ts.isShorthandPropertyAssignment(declaration)
    )
      return [];
    const value = ts.isShorthandPropertyAssignment(declaration)
      ? checker.getShorthandAssignmentValueSymbol(declaration) ||
        declaration.name
      : declaration.initializer;
    if (!value) return [];
    if (ts.isFunctionLike(value)) return [value];
    const target = canonicalSymbol(checker, value);
    return (target?.declarations || []).flatMap((candidate) =>
      callableCandidates(candidate, visited),
    );
  }

  function callableMutatesArgument(call, argumentIndex) {
    const target = canonicalSymbol(checker, call.expression);
    if (!target) return false;
    for (const declaration of target.declarations || []) {
      for (const callable of callableCandidates(declaration)) {
        const parameter = callable.parameters[argumentIndex];
        const parameterSymbol = parameter
          ? canonicalSymbol(checker, parameter.name)
          : null;
        if (!parameterSymbol) continue;
        const mutations = walk(
          callableBody(callable),
          (node) =>
            ts.isBinaryExpression(node) &&
            node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
            (ts.isPropertyAccessExpression(node.left) ||
              ts.isElementAccessExpression(node.left)) &&
            rootIdentifierSymbol(checker, node.left) === parameterSymbol,
          (node) => node !== callable && ts.isFunctionLike(node),
          checker,
        );
        if (mutations.length) return true;
      }
    }
    return false;
  }

  function isNeutralReturn(expression) {
    let current = expression;
    while (
      ts.isParenthesizedExpression(current) ||
      ts.isAsExpression(current) ||
      ts.isTypeAssertionExpression(current) ||
      ts.isSatisfiesExpression(current) ||
      ts.isNonNullExpression(current)
    )
      current = current.expression;
    return (
      current.kind === ts.SyntaxKind.NullKeyword ||
      ts.isVoidExpression(current) ||
      (ts.isIdentifier(current) && current.text === "undefined")
    );
  }

  const constantBindings = new Map();
  for (const declaration of callee.declarations || []) {
    const callable = callableCandidates(declaration)[0];
    if (!callable) continue;
    for (let index = 0; index < callable.parameters.length; index += 1) {
      const argument = call.arguments[index];
      if (!argument) continue;
      let value = argument;
      while (
        ts.isParenthesizedExpression(value) ||
        ts.isAsExpression(value) ||
        ts.isTypeAssertionExpression(value) ||
        ts.isSatisfiesExpression(value) ||
        ts.isNonNullExpression(value)
      )
        value = value.expression;
      let primitive = null;
      if (ts.isStringLiteral(value)) primitive = value.text;
      else if (ts.isNumericLiteral(value)) primitive = Number(value.text);
      else if (value.kind === ts.SyntaxKind.TrueKeyword) primitive = true;
      else if (value.kind === ts.SyntaxKind.FalseKeyword) primitive = false;
      else if (value.kind === ts.SyntaxKind.NullKeyword) primitive = null;
      else continue;
      const symbol = canonicalSymbol(checker, callable.parameters[index].name);
      if (symbol) constantBindings.set(symbol, primitive);
    }
  }

  function knownPrimitive(expression) {
    let current = expression;
    while (
      ts.isParenthesizedExpression(current) ||
      ts.isAsExpression(current) ||
      ts.isTypeAssertionExpression(current) ||
      ts.isSatisfiesExpression(current) ||
      ts.isNonNullExpression(current)
    )
      current = current.expression;
    if (ts.isIdentifier(current)) {
      const symbol = canonicalSymbol(checker, current);
      if (constantBindings.has(symbol)) return constantBindings.get(symbol);
    }
    if (ts.isStringLiteral(current)) return current.text;
    if (ts.isNumericLiteral(current)) return Number(current.text);
    if (current.kind === ts.SyntaxKind.TrueKeyword) return true;
    if (current.kind === ts.SyntaxKind.FalseKeyword) return false;
    if (current.kind === ts.SyntaxKind.NullKeyword) return null;
    if (ts.isBinaryExpression(current)) {
      const left = knownPrimitive(current.left);
      const right = knownPrimitive(current.right);
      if (left === undefined || right === undefined) return undefined;
      switch (current.operatorToken.kind) {
        case ts.SyntaxKind.EqualsEqualsToken:
          return left == right;
        case ts.SyntaxKind.EqualsEqualsEqualsToken:
          return left === right;
        case ts.SyntaxKind.ExclamationEqualsToken:
          return left != right;
        case ts.SyntaxKind.ExclamationEqualsEqualsToken:
          return left !== right;
      }
    }
    return undefined;
  }

  function statementAlwaysAbruptWithBindings(statement) {
    if (!statement) return false;
    if (
      ts.isReturnStatement(statement) ||
      ts.isThrowStatement(statement) ||
      ts.isBreakStatement(statement) ||
      ts.isContinueStatement(statement)
    )
      return true;
    if (ts.isBlock(statement))
      return statement.statements.some(statementAlwaysAbruptWithBindings);
    if (ts.isIfStatement(statement)) {
      const value = knownPrimitive(statement.expression);
      if (value === true)
        return statementAlwaysAbruptWithBindings(statement.thenStatement);
      if (value === false)
        return Boolean(
          statement.elseStatement &&
          statementAlwaysAbruptWithBindings(statement.elseStatement),
        );
      return Boolean(
        statement.elseStatement &&
        statementAlwaysAbruptWithBindings(statement.thenStatement) &&
        statementAlwaysAbruptWithBindings(statement.elseStatement),
      );
    }
    return false;
  }

  function returnIsUnreachable(statement) {
    let current = statement;
    while (current.parent) {
      const parent = current.parent;
      if (
        ts.isIfStatement(parent) &&
        (parent.thenStatement === current || parent.elseStatement === current)
      ) {
        const value = knownPrimitive(parent.expression);
        if (
          (value === false && parent.thenStatement === current) ||
          (value === true && parent.elseStatement === current)
        )
          return true;
      }
      if (ts.isBlock(parent) || ts.isSourceFile(parent)) {
        const index = parent.statements.indexOf(current);
        if (
          index > 0 &&
          parent.statements
            .slice(0, index)
            .some(statementAlwaysAbruptWithBindings)
        )
          return true;
      }
      current = parent;
    }
    return false;
  }

  function returnsTaintedValue(expression, tainted) {
    let current = expression;
    while (
      ts.isParenthesizedExpression(current) ||
      ts.isAsExpression(current) ||
      ts.isTypeAssertionExpression(current) ||
      ts.isSatisfiesExpression(current) ||
      ts.isNonNullExpression(current) ||
      ts.isAwaitExpression(current)
    )
      current = current.expression;
    const currentSymbol = canonicalSymbol(checker, current);
    if (
      currentSymbol === tainted ||
      (tainted instanceof Set && tainted.has(currentSymbol))
    )
      return true;
    if (ts.isBinaryExpression(current)) {
      if (current.operatorToken.kind === ts.SyntaxKind.CommaToken)
        return returnsTaintedValue(current.right, tainted);
      return (
        returnsTaintedValue(current.left, tainted) ||
        returnsTaintedValue(current.right, tainted)
      );
    }
    if (ts.isConditionalExpression(current))
      return (
        returnsTaintedValue(current.whenTrue, tainted) ||
        returnsTaintedValue(current.whenFalse, tainted)
      );
    if (ts.isCallExpression(current)) {
      if (
        ts.isPropertyAccessExpression(current.expression) &&
        returnsTaintedValue(current.expression.expression, tainted) &&
        ["map", "filter", "flatMap", "slice", "concat"].includes(
          current.expression.name.text,
        )
      ) {
        const method = canonicalSymbol(checker, current.expression.name);
        if (
          (method?.declarations || []).some((declaration) =>
            normalize(declaration.getSourceFile().fileName).includes(
              "/typescript/lib/lib.",
            ),
          )
        )
          return true;
      }
      const argumentIndex = current.arguments.findIndex((argument) =>
        returnsTaintedValue(argument, tainted),
      );
      return (
        argumentIndex >= 0 &&
        callPreservesArgument(checker, current, argumentIndex)
      );
    }
    if (ts.isNewExpression(current)) return false;
    if (
      ts.isPropertyAccessExpression(current) ||
      ts.isElementAccessExpression(current)
    )
      return returnsTaintedValue(current.expression, tainted);
    if (ts.isArrayLiteralExpression(current))
      return current.elements.some((element) =>
        returnsTaintedValue(element, tainted),
      );
    if (ts.isObjectLiteralExpression(current))
      return current.properties.some(
        (property) =>
          ts.isPropertyAssignment(property) &&
          returnsTaintedValue(property.initializer, tainted),
      );
    return false;
  }

  for (const declaration of callee.declarations || []) {
    for (const callable of callableCandidates(declaration)) {
      const parameter = callable.parameters[argumentIndex];
      const parameterSymbol = parameter
        ? canonicalSymbol(checker, parameter.name)
        : null;
      if (!parameterSymbol) continue;
      const body = callableBody(callable);
      if (!body) continue;
      const tainted = new Set([parameterSymbol]);
      if (!ts.isBlock(body) && returnsTaintedValue(body, parameterSymbol))
        return true;
      if (!ts.isBlock(body)) continue;
      let changed = true;
      while (changed) {
        changed = false;
        for (const node of walk(
          body,
          (candidate) =>
            ts.isVariableDeclaration(candidate) ||
            (ts.isBinaryExpression(candidate) &&
              candidate.operatorToken.kind === ts.SyntaxKind.EqualsToken),
          (node) => node !== callable && ts.isFunctionLike(node),
          checker,
        )) {
          const target = ts.isVariableDeclaration(node) ? node.name : node.left;
          const value = ts.isVariableDeclaration(node)
            ? node.initializer
            : node.right;
          if (value && returnsTaintedValue(value, tainted)) {
            const targetSymbol = ts.isIdentifier(target)
              ? canonicalSymbol(checker, target)
              : rootIdentifierSymbol(checker, target);
            if (targetSymbol && !tainted.has(targetSymbol)) {
              tainted.add(targetSymbol);
              changed = true;
            }
          }
        }
        for (const node of walk(
          body,
          ts.isCallExpression,
          (candidate) => candidate !== callable && ts.isFunctionLike(candidate),
          checker,
        )) {
          const taintedArgument = node.arguments.findIndex((argument) =>
            returnsTaintedValue(argument, tainted),
          );
          if (
            taintedArgument < 0 ||
            callPreservesArgument(checker, node, taintedArgument)
          )
            continue;
          for (let index = 0; index < node.arguments.length; index += 1) {
            if (
              index === taintedArgument ||
              !callableMutatesArgument(node, index)
            )
              continue;
            const target = rootIdentifierSymbol(checker, node.arguments[index]);
            if (target && !tainted.has(target)) {
              tainted.add(target);
              changed = true;
            }
          }
        }
      }
      const returns = walk(
        body,
        ts.isReturnStatement,
        (node) => node !== callable && ts.isFunctionLike(node),
        checker,
      ).filter((statement) => !returnIsUnreachable(statement));
      if (returns.length > 0) {
        let carriesArgument = false;
        let valid = true;
        for (const statement of returns) {
          if (
            statement.expression &&
            returnsTaintedValue(statement.expression, tainted)
          ) {
            carriesArgument = true;
            continue;
          }
          if (!isNeutralReturn(statement.expression)) {
            valid = false;
            break;
          }
        }
        if (valid && carriesArgument) return true;
      }
    }
  }
  return false;
}

function callPreservesArgument(checker, call, argumentIndex) {
  if (callableReturnsArgument(checker, call, argumentIndex)) return true;
  if (
    argumentIndex === 0 &&
    ts.isPropertyAccessExpression(call.expression) &&
    ts.isIdentifier(call.expression.expression) &&
    call.expression.expression.text === "Promise"
  ) {
    const promise = canonicalSymbol(checker, call.expression.expression);
    const isBuiltinPromise = (promise?.declarations || []).some((declaration) =>
      normalize(declaration.getSourceFile().fileName).includes(
        "/typescript/lib/lib.es2015.promise.",
      ),
    );
    if (
      isBuiltinPromise &&
      (call.expression.name.text === "resolve" ||
        (call.expression.name.text === "all" &&
          ts.isArrayLiteralExpression(call.arguments[0])))
    )
      return true;
  }
  if (
    argumentIndex === 0 &&
    ts.isPropertyAccessExpression(call.expression) &&
    ["map", "filter", "flatMap", "slice", "concat"].includes(
      call.expression.name.text,
    )
  ) {
    const method = canonicalSymbol(checker, call.expression.name);
    if (
      (method?.declarations || []).some((declaration) =>
        normalize(declaration.getSourceFile().fileName).includes(
          "/typescript/lib/lib.",
        ),
      )
    )
      return true;
  }
  if (
    argumentIndex !== 0 ||
    !ts.isPropertyAccessExpression(call.expression) ||
    !ts.isIdentifier(call.expression.expression) ||
    call.expression.expression.text !== "Object" ||
    call.expression.name.text !== "freeze"
  )
    return false;
  const isTypeScriptLibDeclaration = (declaration) => {
    const file = normalize(declaration.getSourceFile().fileName);
    return file.includes("/typescript/lib/lib.") && file.endsWith(".d.ts");
  };
  const objectSymbol = canonicalSymbol(checker, call.expression.expression);
  const freezeSymbol = canonicalSymbol(checker, call.expression.name);
  return Boolean(
    objectSymbol &&
    freezeSymbol &&
    (objectSymbol.declarations || []).some(isTypeScriptLibDeclaration) &&
    (freezeSymbol.declarations || []).some(isTypeScriptLibDeclaration),
  );
}

function resultIsDiscarded(checker, expression) {
  let current = expression;
  while (
    current.parent &&
    (ts.isParenthesizedExpression(current.parent) ||
      ts.isNonNullExpression(current.parent) ||
      ts.isAsExpression(current.parent) ||
      ts.isTypeAssertionExpression(current.parent) ||
      ts.isSatisfiesExpression(current.parent) ||
      ts.isAwaitExpression(current.parent)) &&
    current.parent.expression === current
  )
    current = current.parent;
  if (
    current.parent &&
    ts.isExpressionStatement(current.parent) &&
    current.parent.expression === current
  )
    return true;
  if (
    current.parent &&
    (ts.isCallExpression(current.parent) || ts.isNewExpression(current.parent))
  ) {
    const argumentIndex = current.parent.arguments.indexOf(current);
    if (argumentIndex >= 0)
      return !callPreservesArgument(checker, current.parent, argumentIndex);
  }
  return false;
}

function bridgeCallsPreloadMember(
  checker,
  sourceFile,
  exportName,
  preloadNamespace,
  preloadMember,
  requireResult = false,
) {
  const bridgeSymbol = exportedSymbol(checker, sourceFile, exportName);
  const declaration = declarationOf(bridgeSymbol, ts.isFunctionLike);
  if (!declaration) return null;
  const staticNamespaceAccessors = new Map([
    ["requireAuthApi", "auth"],
    ["requireContentApi", "content"],
    ["requirePlatformsApi", "platforms"],
    ["requireMediaApi", "media"],
    ["requireOrdersApi", "orders"],
    ["requirePublicationApi", "publication"],
    ["requireWorkspaceApi", "workspace"],
    ["requireWorkspaceDataApi", "workspaceData"],
    ["requireRuntimeDiagnosticsApi", "runtimeDiagnostics"],
    ["requireAiProviderApi", "aiProvider"],
    ["requirePlatformSettingsApi", "platformSettings"],
    ["requireStorageMaintenanceApi", "storageMaintenance"],
  ]);
  function isTransportHelper(symbol) {
    return (symbol?.declarations || []).some(
      (candidate) =>
        candidate
          .getSourceFile()
          .fileName.replaceAll("\\", "/")
          .endsWith("/media-workbench/src/bridge/transport.ts") &&
        ts.isFunctionDeclaration(candidate),
    );
  }

  function transportFunction(symbol, name) {
    return (
      (symbol?.declarations || []).find(
        (candidate) =>
          candidate
            .getSourceFile()
            .fileName.replaceAll("\\", "/")
            .endsWith("/media-workbench/src/bridge/transport.ts") &&
          ts.isFunctionDeclaration(candidate) &&
          candidate.name?.text === name,
      ) || null
    );
  }

  function unwrapExpression(expression) {
    let current = expression;
    while (
      ts.isParenthesizedExpression(current) ||
      ts.isNonNullExpression(current) ||
      ts.isAsExpression(current) ||
      ts.isTypeAssertionExpression(current) ||
      ts.isSatisfiesExpression(current) ||
      ts.isAwaitExpression(current)
    )
      current = current.expression;
    return current;
  }

  function returnStatements(callable) {
    if (!callable?.body) return [];
    if (!ts.isBlock(callable.body))
      return [{ expression: callable.body, statement: null }];
    return walk(
      callable,
      ts.isReturnStatement,
      (node) => ts.isFunctionLike(node),
      checker,
    ).map((statement) => ({
      expression: statement.expression || null,
      statement,
    }));
  }

  function returnExpressions(callable) {
    return returnStatements(callable).map((entry) => entry.expression);
  }

  function assignmentTargetNodes(expression) {
    let current = expression;
    while (
      ts.isParenthesizedExpression(current) ||
      ts.isAsExpression(current) ||
      ts.isTypeAssertionExpression(current) ||
      ts.isSatisfiesExpression(current)
    )
      current = current.expression;
    if (ts.isIdentifier(current)) return [current];
    if (ts.isObjectLiteralExpression(current))
      return current.properties.flatMap((property) => {
        if (ts.isShorthandPropertyAssignment(property))
          return [
            checker.getShorthandAssignmentValueSymbol(property) ||
              property.name,
          ];
        if (ts.isPropertyAssignment(property))
          return assignmentTargetNodes(property.initializer);
        if (ts.isSpreadAssignment(property))
          return assignmentTargetNodes(property.expression);
        return [];
      });
    if (ts.isArrayLiteralExpression(current))
      return current.elements.flatMap((element) =>
        ts.isOmittedExpression(element) ? [] : assignmentTargetNodes(element),
      );
    return [];
  }

  function assignmentTarget(node) {
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
      node.operatorToken.kind <= ts.SyntaxKind.LastAssignment
    )
      return node.left;
    if (
      (ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) &&
      (node.operator === ts.SyntaxKind.PlusPlusToken ||
        node.operator === ts.SyntaxKind.MinusMinusToken)
    )
      return node.operand;
    return null;
  }

  function functionIsImmediatelyInvoked(callableNode) {
    let current = callableNode;
    let parent = current.parent;
    while (parent) {
      if (
        ts.isParenthesizedExpression(parent) ||
        ts.isAsExpression(parent) ||
        ts.isTypeAssertionExpression(parent) ||
        ts.isSatisfiesExpression(parent) ||
        ts.isNonNullExpression(parent)
      ) {
        current = parent;
        parent = current.parent;
        continue;
      }
      if (
        ts.isBinaryExpression(parent) &&
        parent.operatorToken.kind === ts.SyntaxKind.CommaToken &&
        parent.right === current
      ) {
        current = parent;
        parent = current.parent;
        continue;
      }
      if (ts.isCallExpression(parent) && parent.expression === current)
        return true;
      if (
        ts.isPropertyAccessExpression(parent) &&
        (parent.name.text === "call" || parent.name.text === "apply") &&
        parent.expression === current &&
        ts.isCallExpression(parent.parent) &&
        parent.parent.expression === parent
      )
        return true;
      return false;
    }
    return false;
  }

  function symbolHasWrites(callable, target, afterPosition = -1) {
    if (!callable || !target) return false;
    return (
      walk(
        callable,
        (node) => {
          const left = assignmentTarget(node);
          return Boolean(
            left &&
            node.pos > afterPosition &&
            assignmentTargetNodes(left).some(
              (candidate) => canonicalSymbol(checker, candidate) === target,
            ),
          );
        },
        (node) =>
          ts.isFunctionLike(node) &&
          node !== callable &&
          !functionIsImmediatelyInvoked(node),
        checker,
      ).length > 0
    );
  }

  function returnsParameter(callable, parameterIndex) {
    const parameter = callable?.parameters?.[parameterIndex];
    const target = parameter ? canonicalSymbol(checker, parameter.name) : null;
    const returns = returnExpressions(callable);
    return Boolean(
      target &&
      !symbolHasWrites(callable, target, parameter?.end ?? -1) &&
      returns.length > 0 &&
      returns.every(
        (expression) =>
          expression && effectiveValueSymbol(checker, expression) === target,
      ),
    );
  }

  function isUndefinedExpression(expression) {
    const current = unwrapExpression(expression);
    return (
      (ts.isIdentifier(current) && current.text === "undefined") ||
      ts.isVoidExpression(current)
    );
  }

  function terminatesWithThrow(statement) {
    let current = statement;
    while (current && ts.isBlock(current)) {
      const last = current.statements[current.statements.length - 1];
      current = last || null;
    }
    return Boolean(current && ts.isThrowStatement(current));
  }

  function isNullishExpression(expression) {
    const current = unwrapExpression(expression);
    return (
      (ts.isIdentifier(current) && current.text === "undefined") ||
      current.kind === ts.SyntaxKind.NullKeyword
    );
  }

  function isFalsyGuardFor(condition, target) {
    const current = unwrapExpression(condition);
    if (
      ts.isPrefixUnaryExpression(current) &&
      current.operator === ts.SyntaxKind.ExclamationToken
    )
      return canonicalSymbol(checker, current.operand) === target;
    if (!ts.isBinaryExpression(current)) return false;
    if (
      current.operatorToken.kind !== ts.SyntaxKind.EqualsEqualsToken &&
      current.operatorToken.kind !== ts.SyntaxKind.EqualsEqualsEqualsToken
    )
      return false;
    return (
      (canonicalSymbol(checker, current.left) === target &&
        isNullishExpression(current.right)) ||
      (canonicalSymbol(checker, current.right) === target &&
        isNullishExpression(current.left))
    );
  }

  function typeofWindowUndefinedRelation(condition) {
    const current = unwrapExpression(condition);
    if (!ts.isBinaryExpression(current)) return null;
    const isEquality =
      current.operatorToken.kind === ts.SyntaxKind.EqualsEqualsToken ||
      current.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken;
    const isInequality =
      current.operatorToken.kind === ts.SyntaxKind.ExclamationEqualsToken ||
      current.operatorToken.kind === ts.SyntaxKind.ExclamationEqualsEqualsToken;
    if (!isEquality && !isInequality) return null;
    const isWindowTypeof = (expression) =>
      ts.isTypeOfExpression(expression) &&
      ts.isIdentifier(expression.expression) &&
      expression.expression.text === "window";
    const isUndefinedLiteral = (expression) =>
      ts.isStringLiteral(expression) && expression.text === "undefined";
    const leftMatches =
      isWindowTypeof(current.left) && isUndefinedLiteral(current.right);
    const rightMatches =
      isUndefinedLiteral(current.left) && isWindowTypeof(current.right);
    if (!leftMatches && !rightMatches) return null;
    return isEquality ? "undefined-when-true" : "desktop-when-true";
  }

  function variableIsGuardedBeforeThrow(variable, callable) {
    if (!variable || !callable?.body || !ts.isBlock(callable.body))
      return false;
    const declarationStatement = variable.parent?.parent;
    if (!ts.isVariableStatement(declarationStatement)) return false;
    const block = declarationStatement.parent;
    if (!ts.isBlock(block)) return false;
    const declarationIndex = block.statements.indexOf(declarationStatement);
    const target = canonicalSymbol(checker, variable.name);
    if (declarationIndex < 0 || !target) return false;
    const returns = returnStatements(callable).filter(
      (entry) => entry.statement,
    );
    return block.statements.slice(declarationIndex + 1).some((statement) => {
      if (
        !ts.isIfStatement(statement) ||
        !isFalsyGuardFor(statement.expression, target) ||
        !terminatesWithThrow(statement.thenStatement)
      )
        return false;
      return (
        returns.length > 0 &&
        returns.every((entry) => entry.statement.pos >= statement.end)
      );
    });
  }

  function reachesDesktopConsole(
    expression,
    visited = new Set(),
    callable = null,
    allowUndefined = false,
  ) {
    const current = unwrapExpression(expression);
    if (!current) return false;
    const key = `${current.pos}:${current.end}:${allowUndefined}`;
    if (visited.has(key)) return false;
    visited.add(key);
    if (allowUndefined && isUndefinedExpression(current)) return true;
    if (
      ts.isPropertyAccessExpression(current) &&
      current.name.text === "desktopConsole" &&
      ts.isIdentifier(current.expression) &&
      current.expression.text === "window"
    )
      return true;
    if (ts.isConditionalExpression(current)) {
      const relation = typeofWindowUndefinedRelation(current.condition);
      if (relation) {
        const desktopWhenTrue = relation === "desktop-when-true";
        return (
          (desktopWhenTrue
            ? reachesDesktopConsole(
                current.whenTrue,
                new Set(visited),
                callable,
                false,
              )
            : allowUndefined && isUndefinedExpression(current.whenTrue)) &&
          (desktopWhenTrue
            ? allowUndefined && isUndefinedExpression(current.whenFalse)
            : reachesDesktopConsole(
                current.whenFalse,
                new Set(visited),
                callable,
                false,
              ))
        );
      }
      return (
        reachesDesktopConsole(
          current.whenTrue,
          new Set(visited),
          callable,
          allowUndefined,
        ) &&
        reachesDesktopConsole(
          current.whenFalse,
          new Set(visited),
          callable,
          allowUndefined,
        )
      );
    }
    if (!ts.isIdentifier(current)) return false;
    const symbol = canonicalSymbol(checker, current);
    return (symbol?.declarations || []).some(
      (candidate) =>
        ts.isVariableDeclaration(candidate) &&
        candidate.initializer &&
        !symbolHasWrites(callable, symbol, candidate.end) &&
        reachesDesktopConsole(
          candidate.initializer,
          new Set(visited),
          callable,
          allowUndefined || variableIsGuardedBeforeThrow(candidate, callable),
        ),
    );
  }

  function transportAccessorReturnsNamespace(
    symbol,
    name,
    namespace,
    visited = new Set(),
  ) {
    const accessor = transportFunction(symbol, name);
    if (!accessor) return false;
    const key = `${accessor.pos}:${accessor.end}:${namespace}`;
    if (visited.has(key)) return false;
    visited.add(key);
    const returns = returnExpressions(accessor);
    return (
      returns.length > 0 &&
      returns.every((expression) =>
        transportExpressionReturnsNamespace(
          expression,
          namespace,
          new Set(visited),
        ),
      )
    );
  }

  function transportExpressionReturnsNamespace(
    expression,
    namespace,
    visited = new Set(),
  ) {
    const current = unwrapExpression(expression);
    if (!current) return false;
    const key = `${current.pos}:${current.end}:${namespace}`;
    if (visited.has(key)) return false;
    visited.add(key);
    if (
      ts.isPropertyAccessExpression(current) &&
      current.name.text === namespace &&
      ts.isCallExpression(current.expression) &&
      ts.isIdentifier(current.expression.expression) &&
      current.expression.expression.text === "requireDesktopConsole"
    ) {
      const desktopConsole = transportFunction(
        canonicalSymbol(checker, current.expression.expression),
        "requireDesktopConsole",
      );
      const returns = desktopConsole ? returnStatements(desktopConsole) : [];
      return Boolean(
        desktopConsole &&
        returns.length > 0 &&
        returns.every(({ expression }) =>
          reachesDesktopConsole(expression, new Set(visited), desktopConsole),
        ),
      );
    }
    if (
      ts.isCallExpression(current) &&
      ts.isIdentifier(current.expression) &&
      current.expression.text === "requireBridgeCapability"
    ) {
      const capability = transportFunction(
        canonicalSymbol(checker, current.expression),
        "requireBridgeCapability",
      );
      return Boolean(
        capability &&
        returnsParameter(capability, 0) &&
        current.arguments[0] &&
        transportExpressionReturnsNamespace(
          current.arguments[0],
          namespace,
          new Set(visited),
        ),
      );
    }
    return false;
  }

  function receiverReachesNamespace(expression, visited = new Set()) {
    if (!expression) return false;
    const key = `${expression.pos}:${expression.end}`;
    if (visited.has(key)) return false;
    visited.add(key);
    if (ts.isIdentifier(expression)) {
      const symbol = canonicalSymbol(checker, expression);
      for (const candidate of symbol?.declarations || []) {
        if (
          ts.isVariableDeclaration(candidate) &&
          candidate.initializer &&
          receiverReachesNamespace(candidate.initializer, visited)
        )
          return true;
        if (ts.isParameter(candidate)) {
          const owner = candidate.parent;
          const parameterIndex = owner.parameters.indexOf(candidate);
          if (parameterIndex < 0) continue;
          if (
            ts.isFunctionLike(owner) &&
            ts.isCallExpression(owner.parent) &&
            owner.parent.arguments.includes(owner)
          ) {
            const outerCall = owner.parent;
            const callbackIndex = outerCall.arguments.indexOf(owner);
            const helper = canonicalSymbol(checker, outerCall.expression);
            for (const helperDeclaration of helper?.declarations || []) {
              const helperCallable = ts.isVariableDeclaration(helperDeclaration)
                ? helperDeclaration.initializer
                : helperDeclaration;
              if (!helperCallable || !ts.isFunctionLike(helperCallable))
                continue;
              const callbackParameter =
                helperCallable.parameters[callbackIndex];
              const callbackSymbol = callbackParameter
                ? canonicalSymbol(checker, callbackParameter.name)
                : null;
              if (!callbackSymbol) continue;
              for (const invocation of walk(
                helperCallable,
                (node) =>
                  ts.isCallExpression(node) &&
                  canonicalSymbol(checker, node.expression) === callbackSymbol,
                (node) => ts.isFunctionLike(node),
              )) {
                const argument = invocation.arguments[parameterIndex];
                if (argument && receiverReachesNamespace(argument, visited))
                  return true;
              }
            }
          }
          const ownerSymbol = canonicalSymbol(checker, owner.name);
          if (!ownerSymbol) continue;
          for (const callsite of walk(
            sourceFile,
            (node) =>
              ts.isCallExpression(node) &&
              canonicalSymbol(checker, node.expression) === ownerSymbol,
          )) {
            const argument = callsite.arguments[parameterIndex];
            if (argument && receiverReachesNamespace(argument, visited))
              return true;
          }
        }
      }
      return false;
    }
    if (ts.isPropertyAccessExpression(expression)) {
      if (expression.name.text !== preloadNamespace) return false;
      return Boolean(canonicalSymbol(checker, expression.expression));
    }
    if (!ts.isCallExpression(expression)) return false;
    if (ts.isIdentifier(expression.expression)) {
      const helper = canonicalSymbol(checker, expression.expression);
      if (
        staticNamespaceAccessors.get(expression.expression.text) ===
        preloadNamespace
      )
        return (
          isTransportHelper(helper) &&
          transportAccessorReturnsNamespace(
            helper,
            expression.expression.text,
            preloadNamespace,
          )
        );
    }
    const local = canonicalSymbol(checker, expression.expression);
    for (const candidate of local?.declarations || []) {
      if (
        normalize(candidate.getSourceFile().fileName) !==
        normalize(sourceFile.fileName)
      )
        continue;
      const callable = ts.isVariableDeclaration(candidate)
        ? candidate.initializer
        : candidate;
      if (!callable || !ts.isFunctionLike(callable)) continue;
      if (callable.body && !ts.isBlock(callable.body)) {
        if (receiverReachesNamespace(callable.body, visited)) return true;
        continue;
      }
      for (const statement of walk(callable, ts.isReturnStatement, (node) =>
        ts.isFunctionLike(node),
      )) {
        if (
          statement.expression &&
          receiverReachesNamespace(statement.expression, visited)
        )
          return true;
      }
    }
    return false;
  }

  const pending = [{ body: declaration, constants: new Map() }];
  const visited = new Set();
  while (pending.length) {
    const entry = pending.shift();
    const key = `${entry.body.pos}:${entry.body.end}:${[...entry.constants.values()].join(",")}`;
    if (visited.has(key)) continue;
    visited.add(key);
    for (const access of walk(
      entry.body,
      (node) =>
        ts.isPropertyAccessExpression(node) &&
        node.name.text === preloadMember &&
        receiverReachesNamespace(node.expression),
      (node) => ts.isFunctionLike(node),
    )) {
      if (
        ts.isCallExpression(access.parent) &&
        ts.isIdentifier(access.parent.expression) &&
        access.parent.expression.text === "requireBridgeMethod" &&
        ts.isCallExpression(access.parent.parent) &&
        access.parent.parent.expression === access.parent &&
        (!requireResult || !resultIsDiscarded(checker, access.parent.parent))
      )
        return canonicalSymbol(checker, access.name);
      let current = access.parent;
      while (current && current !== entry.body) {
        if (
          ts.isVariableDeclaration(current) &&
          ts.isIdentifier(current.name)
        ) {
          const alias = canonicalSymbol(checker, current.name);
          if (
            walk(
              entry.body,
              (node) =>
                ts.isCallExpression(node) &&
                canonicalSymbol(checker, node.expression) === alias &&
                (!requireResult || !resultIsDiscarded(checker, node)),
              (node) => ts.isFunctionLike(node),
            ).length
          )
            return canonicalSymbol(checker, access.name);
          break;
        }
        current = current.parent;
      }
    }
    for (const call of walk(entry.body, ts.isCallExpression, (node) =>
      ts.isFunctionLike(node),
    )) {
      let expression = call.expression;
      while (
        ts.isParenthesizedExpression(expression) ||
        ts.isNonNullExpression(expression) ||
        ts.isAsExpression(expression) ||
        ts.isTypeAssertionExpression(expression) ||
        ts.isSatisfiesExpression(expression)
      )
        expression = expression.expression;
      if (
        ts.isPropertyAccessExpression(expression) &&
        expression.name.text === preloadMember &&
        canonicalSymbol(checker, expression.name) &&
        receiverReachesNamespace(expression.expression) &&
        (!requireResult || !resultIsDiscarded(checker, call))
      )
        return canonicalSymbol(checker, expression.name);
      if (
        ts.isElementAccessExpression(expression) &&
        ((ts.isStringLiteral(expression.argumentExpression) &&
          expression.argumentExpression.text === preloadMember) ||
          (ts.isIdentifier(expression.argumentExpression) &&
            entry.constants.get(
              canonicalSymbol(checker, expression.argumentExpression),
            ) === preloadMember)) &&
        (!requireResult || !resultIsDiscarded(checker, call))
      )
        return canonicalSymbol(checker, expression.expression) || bridgeSymbol;
      if (
        ts.isIdentifier(expression) &&
        (expression.text === "requireBridgeMethod" ||
          staticNamespaceAccessors.has(expression.text))
      )
        continue;
      const local = ts.isIdentifier(expression)
        ? canonicalSymbol(checker, expression)
        : null;
      const localDeclaration = declarationOf(
        local,
        (candidate) =>
          ts.isFunctionDeclaration(candidate) ||
          ts.isVariableDeclaration(candidate),
      );
      const body = callableBody(localDeclaration);
      if (!body) continue;
      const constants = new Map();
      const parameters =
        ts.isVariableDeclaration(localDeclaration) &&
        ts.isFunctionLike(localDeclaration.initializer)
          ? localDeclaration.initializer.parameters
          : localDeclaration.parameters || [];
      for (let index = 0; index < parameters.length; index += 1) {
        const argument = call.arguments[index];
        const target = canonicalSymbol(checker, parameters[index].name);
        if (argument && ts.isStringLiteral(argument))
          constants.set(target, argument.text);
        else if (argument && ts.isIdentifier(argument)) {
          const value = entry.constants.get(canonicalSymbol(checker, argument));
          if (value !== undefined) constants.set(target, value);
        }
      }
      pending.push({ body, constants });
      for (const argument of call.arguments) {
        if (argument && ts.isFunctionLike(argument))
          pending.push({ body: argument, constants: entry.constants });
      }
    }
  }
  return null;
}

function recordedPreloadTransportReceiver(context, sourceFile, caller) {
  if (caller.preloadReceiverSource && caller.preloadReceiverExport) {
    const receiverSource = evidenceSource(
      context,
      caller.preloadReceiverSource,
    );
    return receiverSource
      ? exportedSymbol(
          context.checker,
          receiverSource,
          caller.preloadReceiverExport,
        )
      : null;
  }
  if (!caller.preloadReceiver) return null;
  const checker = context.checker;
  for (const identifier of walk(
    sourceFile,
    (node) => ts.isIdentifier(node) && node.text === caller.preloadReceiver,
  )) {
    const binding = identifier.parent;
    if (
      !ts.isBindingElement(binding) ||
      binding.name !== identifier ||
      !binding.propertyName ||
      !ts.isIdentifier(binding.propertyName) ||
      binding.propertyName.text !== "ipcRenderer"
    )
      continue;
    const pattern = binding.parent;
    const declaration = pattern?.parent;
    const initializer = ts.isVariableDeclaration(declaration)
      ? declaration.initializer
      : null;
    if (
      !initializer ||
      !ts.isCallExpression(initializer) ||
      !ts.isIdentifier(initializer.expression) ||
      initializer.expression.text !== "require" ||
      !ts.isStringLiteral(initializer.arguments[0]) ||
      initializer.arguments[0].text !== "electron"
    )
      continue;
    return canonicalSymbol(checker, identifier);
  }
  return null;
}

function callUsesTransportReceiver(checker, call, method, transportReceiver) {
  if (
    !ts.isPropertyAccessExpression(call.expression) ||
    call.expression.name.text !== method
  )
    return false;
  const transportMember = (transportReceiver?.declarations || [])
    .map((declaration) =>
      checker.getPropertyOfType(
        checker.getTypeOfSymbolAtLocation(transportReceiver, declaration),
        method,
      ),
    )
    .map((member) => canonicalSymbol(checker, member))
    .find(Boolean);
  if (!transportMember) return false;
  if (
    canonicalSymbol(checker, call.expression.expression) ===
      transportReceiver &&
    canonicalSymbol(checker, call.expression.name) === transportMember
  )
    return true;
  const wrapperMember = canonicalSymbol(checker, call.expression.name);
  for (const declaration of wrapperMember?.declarations || []) {
    const callable = ts.isPropertyAssignment(declaration)
      ? declaration.initializer
      : declaration;
    if (!ts.isFunctionLike(callable)) continue;
    const channelParameter = callable.parameters[0]
      ? canonicalSymbol(checker, callable.parameters[0].name)
      : null;
    if (!channelParameter) continue;
    for (const transportCall of walk(
      callableBody(callable),
      ts.isCallExpression,
      (node) =>
        (node !== callable && ts.isFunctionLike(node)) ||
        isStaticallyUnreachableBranch(checker, node),
      checker,
    )) {
      if (
        ts.isPropertyAccessExpression(transportCall.expression) &&
        transportCall.expression.name.text === method &&
        canonicalSymbol(checker, transportCall.expression.expression) ===
          transportReceiver &&
        canonicalSymbol(checker, transportCall.expression.name) ===
          transportMember &&
        canonicalSymbol(checker, transportCall.arguments[0]) ===
          channelParameter
      )
        return true;
    }
  }
  return false;
}

function preloadMemberEvidence(
  checker,
  sourceFile,
  method,
  channel,
  kind,
  transportReceiver,
  requireResult = false,
) {
  const transportMethod = kind === "event" ? "on" : "invoke";
  function eventCallbackInvokesListener(body, registration) {
    if (kind !== "event") return true;
    const listenerParameter = body.parameters?.find(
      (parameter) =>
        ts.isIdentifier(parameter.name) && parameter.name.text === "listener",
    );
    const listenerSymbol = listenerParameter
      ? canonicalSymbol(checker, listenerParameter.name)
      : null;
    if (!listenerSymbol) return false;
    const callback = registration.arguments[1];
    const callbackDeclaration = ts.isFunctionLike(callback)
      ? callback
      : callableBody(
          declarationOf(
            canonicalSymbol(checker, callback),
            (declaration) =>
              ts.isFunctionLike(declaration) ||
              (ts.isVariableDeclaration(declaration) &&
                Boolean(callableBody(declaration))),
          ),
        ) || null;
    if (!callbackDeclaration) return false;
    return reachableNodesFromCallable(checker, callbackDeclaration, true).some(
      (node) =>
        ts.isCallExpression(node) &&
        canonicalSymbol(checker, node.expression) === listenerSymbol,
    );
  }
  function namespaceOf(property) {
    const object = property.parent;
    const owner =
      object && ts.isObjectLiteralExpression(object) ? object.parent : null;
    return owner &&
      (ts.isPropertyAssignment(owner) || ts.isMethodDeclaration(owner)) &&
      (ts.isIdentifier(owner.name) || ts.isStringLiteral(owner.name))
      ? owner.name.text
      : null;
  }
  for (const declaration of walk(
    sourceFile,
    ts.isFunctionDeclaration,
    (node) => isStaticallyUnreachableBranch(checker, node),
    checker,
  )) {
    if (
      declaration.name?.text === method &&
      walk(
        declaration,
        (node) =>
          ts.isCallExpression(node) &&
          node.arguments.length > 0 &&
          ts.isStringLiteral(node.arguments[0]) &&
          node.arguments[0].text === channel &&
          callUsesTransportReceiver(
            checker,
            node,
            transportMethod,
            transportReceiver,
          ) &&
          (!requireResult || !resultIsDiscarded(checker, node)),
        (node) =>
          (node !== declaration && ts.isFunctionLike(node)) ||
          isStaticallyUnreachableBranch(checker, node),
        checker,
      ).some((registration) =>
        eventCallbackInvokesListener(declaration, registration),
      )
    )
      return {
        symbol: canonicalSymbol(checker, declaration.name),
        namespace: null,
      };
  }
  const properties = walk(
    sourceFile,
    (node) => namedProperty(node, method),
    (node) => isStaticallyUnreachableBranch(checker, node),
    checker,
  );
  for (const property of properties) {
    const body = ts.isPropertyAssignment(property)
      ? property.initializer
      : ts.isMethodDeclaration(property)
        ? property
        : null;
    if (!body) continue;
    const direct = walk(
      body,
      (node) =>
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        node.arguments.length > 0 &&
        ts.isStringLiteral(node.arguments[0]) &&
        node.arguments[0].text === channel &&
        callUsesTransportReceiver(
          checker,
          node,
          transportMethod,
          transportReceiver,
        ) &&
        (!requireResult || !resultIsDiscarded(checker, node)),
      (node) =>
        ts.isFunctionLike(node) || isStaticallyUnreachableBranch(checker, node),
      checker,
    );
    if (
      direct.some((registration) =>
        eventCallbackInvokesListener(body, registration),
      )
    ) {
      return {
        symbol: canonicalSymbol(checker, property.name),
        namespace: namespaceOf(property),
      };
    }
    if (
      ts.isPropertyAssignment(property) &&
      ts.isIdentifier(property.initializer)
    ) {
      const helper = canonicalSymbol(checker, property.initializer);
      const declaration = declarationOf(helper, ts.isFunctionLike);
      if (
        declaration &&
        reachableNodesFromCallable(checker, declaration, true).some(
          (node) =>
            ts.isCallExpression(node) &&
            node.arguments.length > 0 &&
            ts.isStringLiteral(node.arguments[0]) &&
            node.arguments[0].text === channel &&
            callUsesTransportReceiver(
              checker,
              node,
              transportMethod,
              transportReceiver,
            ),
        )
      )
        return {
          symbol: canonicalSymbol(checker, property.name),
          namespace: namespaceOf(property),
        };
    }
  }
  return null;
}

function registrarEvidence(
  program,
  checker,
  sourceFile,
  entrySource,
  entryOwnerName,
  entryReceiverPath,
  entryApplicationPath,
  entryApplicationProjectsRegistrar,
  registrarOwnerName,
  receiverName,
  channel,
  applicationPath,
  evidenceTrace,
  requireResult = false,
) {
  const parts = applicationPath.split(".");
  const applicationRootName = parts[0];
  const registrarOwner = callableDeclarationByName(
    checker,
    sourceFile,
    registrarOwnerName,
  );
  const entryOwner = callableDeclarationByName(
    checker,
    entrySource,
    entryOwnerName,
  );
  const ownerReachable = Boolean(
    registrarOwner &&
    entryOwner &&
    recordedOwnerReachable(program, checker, entryOwner, registrarOwner),
  );
  if (evidenceTrace) {
    evidenceTrace.owner = symbolId(
      checker,
      registrarOwner &&
        canonicalSymbol(checker, registrarOwner.name || registrarOwner),
    );
    evidenceTrace.ownerReachable = ownerReachable;
    evidenceTrace.helpers = [];
  }
  if (!registrarOwner || !entryOwner || !ownerReachable) return null;

  function enclosingFunction(node) {
    let current = node.parent;
    while (current && current !== sourceFile) {
      if (ts.isFunctionLike(current)) return current;
      current = current.parent;
    }
    return null;
  }

  function callableDeclarations() {
    return walk(
      sourceFile,
      (node) =>
        ts.isFunctionDeclaration(node) ||
        (ts.isVariableDeclaration(node) && Boolean(callableBody(node))),
    );
  }

  function scopedRootSymbol(scope, name) {
    const callable =
      ts.isVariableDeclaration(scope) && ts.isFunctionLike(scope.initializer)
        ? scope.initializer
        : scope;
    for (const parameter of callable.parameters || []) {
      if (ts.isIdentifier(parameter.name) && parameter.name.text === name)
        return canonicalSymbol(checker, parameter.name);
    }
    const declaration = walk(
      callable,
      (node) =>
        ts.isVariableDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        node.name.text === name,
      (node) => ts.isFunctionLike(node),
    )[0];
    return declaration ? canonicalSymbol(checker, declaration.name) : null;
  }

  function visibleRootSymbol(scope, name) {
    const scoped = scopedRootSymbol(scope, name);
    if (scoped) return scoped;
    const body = callableBody(scope);
    const identifier =
      body &&
      walk(
        body,
        (node) =>
          ts.isIdentifier(node) &&
          node.text === name &&
          !(
            (ts.isPropertyAssignment(node.parent) ||
              ts.isMethodDeclaration(node.parent) ||
              ts.isPropertyDeclaration(node.parent)) &&
            node.parent.name === node
          ),
        (node) => ts.isFunctionLike(node),
      ).find((node) => canonicalSymbol(checker, node));
    return identifier ? canonicalSymbol(checker, identifier) : null;
  }

  function parameterDependency(symbol, suffix = [], visited = new Set()) {
    const current = canonicalSymbol(checker, symbol);
    if (!current || visited.has(current)) return null;
    visited.add(current);
    const callable =
      ts.isVariableDeclaration(registrarOwner) &&
      ts.isFunctionLike(registrarOwner.initializer)
        ? registrarOwner.initializer
        : registrarOwner;
    const parameters = callable.parameters || [];
    const parameterIndex = parameters.findIndex(
      (parameter) => canonicalSymbol(checker, parameter.name) === current,
    );
    if (parameterIndex >= 0) return { parameterIndex, projection: suffix };
    for (const declaration of current.declarations || []) {
      if (!ts.isVariableDeclaration(declaration) || !declaration.initializer)
        continue;
      const dependency = dependencyFromExpression(
        declaration.initializer,
        suffix,
        new Set(visited),
      );
      if (dependency) return dependency;
    }
    return null;
  }

  function dependencyFromExpression(
    expression,
    suffix = [],
    visited = new Set(),
  ) {
    let current = expression;
    while (
      ts.isParenthesizedExpression(current) ||
      ts.isAsExpression(current) ||
      ts.isTypeAssertionExpression(current) ||
      ts.isSatisfiesExpression(current) ||
      ts.isNonNullExpression(current)
    )
      current = current.expression;
    if (ts.isPropertyAccessExpression(current))
      return dependencyFromExpression(
        current.expression,
        [current.name.text, ...suffix],
        visited,
      );
    if (
      ts.isBinaryExpression(current) &&
      [ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken].includes(
        current.operatorToken.kind,
      )
    ) {
      const left = dependencyFromExpression(
        current.left,
        suffix,
        new Set(visited),
      );
      if (!left) return null;
      const right = dependencyFromExpression(
        current.right,
        suffix,
        new Set(visited),
      );
      if (
        right &&
        right.parameterIndex === left.parameterIndex &&
        right.projection.length === left.projection.length &&
        right.projection.every((part, index) => part === left.projection[index])
      )
        return left;
      if (
        suffix.length &&
        ts.isObjectLiteralExpression(current.right) &&
        current.right.properties.every(
          (property) =>
            !ts.isSpreadAssignment(property) &&
            property.name &&
            !ts.isComputedPropertyName(property.name) &&
            !namedProperty(property, suffix[0]),
        )
      )
        return left;
      return null;
    }
    if (ts.isCallExpression(current) && suffix.length === 0) {
      const calleeName = ts.isIdentifier(current.expression)
        ? current.expression.text
        : null;
      if (
        (calleeName === "createTypedIpcMain" ||
          calleeName === "createAuthenticatedIpcMain") &&
        current.arguments.length > 0
      )
        return dependencyFromExpression(current.arguments[0], suffix, visited);
    }
    if (!ts.isIdentifier(current)) return null;
    return parameterDependency(
      canonicalSymbol(checker, current),
      suffix,
      visited,
    );
  }

  function entryBindsRegistrarArgument(
    registrarPath,
    recordedEntryPath,
    projectsRegistrarDependency = false,
    allowLocalRegistrarBinding = false,
  ) {
    const registrarParts = String(registrarPath || "")
      .split(".")
      .filter(Boolean);
    const registrarRoot = registrarParts.length
      ? scopedRootSymbol(registrarOwner, registrarParts[0])
      : null;
    const dependency = registrarRoot
      ? parameterDependency(registrarRoot, registrarParts.slice(1))
      : null;
    const recordedBase = String(recordedEntryPath || "")
      .split(".")
      .filter(Boolean);
    const recorded =
      projectsRegistrarDependency && dependency
        ? [...recordedBase, ...dependency.projection]
        : recordedBase;
    const expectedRoot = recorded.length
      ? visibleRootSymbol(entryOwner, recorded[0])
      : null;
    if (!dependency) return allowLocalRegistrarBinding;
    if (!expectedRoot) return false;

    function accessParts(expression) {
      const parts = [];
      let current = expression;
      while (ts.isPropertyAccessExpression(current)) {
        parts.unshift(current.name.text);
        current = current.expression;
      }
      return ts.isIdentifier(current)
        ? { root: canonicalSymbol(checker, current), parts }
        : null;
    }

    function returnedValueUsesParameter(call, argumentIndex) {
      const callee = canonicalSymbol(checker, call.expression);
      for (const declaration of callee?.declarations || []) {
        const callable = ts.isVariableDeclaration(declaration)
          ? declaration.initializer
          : declaration;
        if (!callable || !ts.isFunctionLike(callable)) continue;
        const parameter = callable.parameters[argumentIndex];
        const parameterSymbol = parameter
          ? canonicalSymbol(checker, parameter.name)
          : null;
        if (!parameterSymbol) continue;
        for (const returned of walk(
          callableBody(callable),
          ts.isReturnStatement,
          (node) => node !== callable && ts.isFunctionLike(node),
        )) {
          const value = returned.expression;
          if (!value) continue;
          const pending = [value];
          const seen = new Set();
          while (pending.length) {
            const candidate = pending.shift();
            const key = `${candidate.pos}:${candidate.end}`;
            if (seen.has(key)) continue;
            seen.add(key);
            if (
              walk(
                candidate,
                (node) => canonicalSymbol(checker, node) === parameterSymbol,
              ).length
            )
              return true;
            if (!ts.isIdentifier(candidate)) continue;
            const symbol = canonicalSymbol(checker, candidate);
            for (const origin of symbol?.declarations || []) {
              if (ts.isVariableDeclaration(origin) && origin.initializer)
                pending.push(origin.initializer);
            }
          }
        }
      }
      return false;
    }

    function resolvesRecordedBinding(
      expression,
      projection = [],
      visited = new Set(),
    ) {
      if (!expression) return false;
      let current = expression;
      while (
        ts.isParenthesizedExpression(current) ||
        ts.isAsExpression(current) ||
        ts.isTypeAssertionExpression(current) ||
        ts.isSatisfiesExpression(current) ||
        ts.isNonNullExpression(current)
      )
        current = current.expression;
      const key = `${current.getSourceFile().fileName}:${current.pos}:${current.end}:${projection.join(".")}`;
      if (visited.has(key)) return false;
      visited.add(key);
      const access = accessParts(current);
      if (
        access &&
        access.root === expectedRoot &&
        [...access.parts, ...projection].length === recorded.length - 1 &&
        [...access.parts, ...projection].every(
          (part, index) => part === recorded[index + 1],
        )
      )
        return true;
      if (ts.isIdentifier(current)) {
        const symbol = canonicalSymbol(checker, current);
        for (const declaration of symbol?.declarations || []) {
          if (
            ts.isVariableDeclaration(declaration) &&
            declaration.initializer &&
            resolvesRecordedBinding(
              declaration.initializer,
              projection,
              new Set(visited),
            )
          )
            return true;
        }
      }
      if (projection.length && ts.isObjectLiteralExpression(current)) {
        const [propertyName, ...rest] = projection;
        const property = [...current.properties]
          .reverse()
          .find((candidate) => namedProperty(candidate, propertyName));
        if (!property) return false;
        const value = ts.isPropertyAssignment(property)
          ? property.initializer
          : ts.isShorthandPropertyAssignment(property)
            ? property.name
            : null;
        return resolvesRecordedBinding(value, rest, new Set(visited));
      }
      if (
        ts.isBinaryExpression(current) &&
        [
          ts.SyntaxKind.BarBarToken,
          ts.SyntaxKind.QuestionQuestionToken,
        ].includes(current.operatorToken.kind)
      ) {
        if (
          !resolvesRecordedBinding(current.left, projection, new Set(visited))
        )
          return false;
        if (
          resolvesRecordedBinding(current.right, projection, new Set(visited))
        )
          return true;
        if (allowLocalRegistrarBinding) return true;
        let fallback = current.right;
        while (
          ts.isParenthesizedExpression(fallback) ||
          ts.isAsExpression(fallback) ||
          ts.isTypeAssertionExpression(fallback) ||
          ts.isSatisfiesExpression(fallback) ||
          ts.isNonNullExpression(fallback)
        )
          fallback = fallback.expression;
        if (!projection.length) return false;
        if (!ts.isObjectLiteralExpression(fallback)) return false;
        return !fallback.properties.some((property) =>
          namedProperty(property, projection[0]),
        );
      }
      // Object.assign may copy ipcMain but a later argument can still replace
      // its registration members.  Reject that direct-receiver shape while
      // preserving the existing projected dependency-object analysis.
      if (
        ts.isCallExpression(current) &&
        ts.isPropertyAccessExpression(current.expression) &&
        ts.isIdentifier(current.expression.expression) &&
        current.expression.expression.text === "Object" &&
        current.expression.name.text === "assign"
      ) {
        function overridesRegistrationMember(expression, seen = new Set()) {
          let value = expression;
          while (
            ts.isParenthesizedExpression(value) ||
            ts.isAsExpression(value) ||
            ts.isTypeAssertionExpression(value) ||
            ts.isSatisfiesExpression(value) ||
            ts.isNonNullExpression(value)
          )
            value = value.expression;
          if (ts.isObjectLiteralExpression(value))
            return value.properties.some(
              (property) =>
                namedProperty(property, "handle") ||
                namedProperty(property, "on"),
            );
          if (!ts.isIdentifier(value)) return false;
          const symbol = canonicalSymbol(checker, value);
          if (!symbol || seen.has(symbol)) return false;
          seen.add(symbol);
          return (symbol.declarations || []).some(
            (declaration) =>
              ts.isVariableDeclaration(declaration) &&
              declaration.initializer &&
              overridesRegistrationMember(declaration.initializer, seen),
          );
        }
        if (!projection.length) {
          const recordedIndex = current.arguments.findIndex((argument) =>
            resolvesRecordedBinding(argument, [], new Set(visited)),
          );
          if (recordedIndex < 0) return false;
          if (
            current.arguments
              .slice(recordedIndex + 1)
              .some((argument) => overridesRegistrationMember(argument))
          )
            return false;
        }
        return [...current.arguments]
          .reverse()
          .some((argument) =>
            resolvesRecordedBinding(argument, projection, new Set(visited)),
          );
      }
      if (ts.isCallExpression(current) && projection.length === 0) {
        return current.arguments.some(
          (argument, index) =>
            resolvesRecordedBinding(argument, [], new Set(visited)) &&
            returnedValueUsesParameter(current, index),
        );
      }
      return false;
    }

    const registrarSymbol = canonicalSymbol(
      checker,
      registrarOwner.name || registrarOwner,
    );
    return reachableNodesFromCallable(checker, entryOwner, true).some(
      (node) =>
        ts.isCallExpression(node) &&
        callExpressionTargetsSymbol(
          program,
          checker,
          node.expression,
          registrarSymbol,
        ) &&
        resolvesRecordedBinding(
          node.arguments[dependency.parameterIndex],
          dependency.projection,
        ),
    );
  }

  const entryReceiverBound = entryBindsRegistrarArgument(
    receiverName,
    entryReceiverPath,
  );
  const entryApplicationBound = entryBindsRegistrarArgument(
    applicationRootName,
    entryApplicationPath,
    entryApplicationProjectsRegistrar,
    true,
  );
  if (evidenceTrace) evidenceTrace.entryReceiverBound = entryReceiverBound;
  if (evidenceTrace)
    evidenceTrace.entryApplicationBound = entryApplicationBound;
  if (!entryReceiverBound || !entryApplicationBound) return null;

  function receiverMatches(scope, expression, expectedPath) {
    const expected = String(expectedPath || "")
      .split(".")
      .filter(Boolean);
    if (!expected.length) return false;
    const actual = [];
    let current = expression;
    while (ts.isPropertyAccessExpression(current)) {
      actual.unshift(current.name.text);
      current = current.expression;
    }
    if (!ts.isIdentifier(current) || actual.length !== expected.length - 1)
      return false;
    if (actual.some((part, index) => part !== expected[index + 1]))
      return false;
    const registrarRoot = scopedRootSymbol(registrarOwner, expected[0]);
    return Boolean(
      registrarRoot &&
      expressionReachesCallableSymbol(
        program,
        checker,
        current,
        registrarRoot,
        [],
        new Set(),
        registrarOwner,
      ),
    );
  }

  function rootedApplicationInvocation(body, scope) {
    const rootSymbol = scopedRootSymbol(scope, applicationRootName);
    if (!rootSymbol) return null;
    return (
      reachableNodesFromCallable(checker, body, true).find((node) => {
        if (
          !ts.isCallExpression(node) ||
          !ts.isPropertyAccessExpression(node.expression)
        )
          return false;
        const chain = [];
        let current = node.expression;
        while (ts.isPropertyAccessExpression(current)) {
          chain.unshift(current.name.text);
          current = current.expression;
        }
        if (
          !ts.isIdentifier(current) ||
          canonicalSymbol(checker, current) !== rootSymbol
        )
          return false;
        if (parts.length !== chain.length + 1) return false;
        for (let index = 0; index < chain.length; index += 1) {
          if (chain[index] !== parts[index + 1]) return false;
        }
        return true;
      }) || null
    );
  }

  for (const helper of callableDeclarations()) {
    if (!recordedOwnerReachable(program, checker, registrarOwner, helper))
      continue;
    const helperBody = callableBody(helper);
    const helperFunction = ts.isVariableDeclaration(helper)
      ? helper.initializer
      : helper;
    if (!helperBody || !helperFunction) continue;
    const registrations = reachableNodesFromCallable(
      checker,
      helper,
      true,
    ).filter(
      (node) =>
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        receiverMatches(
          helperFunction,
          node.expression.expression,
          receiverName,
        ) &&
        ["handle", "on"].includes(node.expression.name.text),
    );
    if (evidenceTrace && registrations.length)
      evidenceTrace.helpers.push({
        owner: String(
          helper.name?.text || helper.name?.getText?.() || "anonymous",
        ),
        registrations: registrations.length,
      });
    for (const registration of registrations) {
      const channelArgument = registration.arguments[0];
      const handler = registration.arguments[1];
      if (!handler || !ts.isFunctionLike(handler)) continue;
      if (
        ts.isStringLiteral(channelArgument) &&
        channelArgument.text === channel
      ) {
        const invocation = rootedApplicationInvocation(handler, helperFunction);
        if (
          invocation &&
          (!requireResult || !resultIsDiscarded(checker, invocation))
        )
          return invocation;
      }
      if (!ts.isIdentifier(channelArgument)) continue;
      const channelParameter = canonicalSymbol(checker, channelArgument);
      const operationCalls = reachableNodesFromCallable(
        checker,
        handler,
        true,
      ).filter(
        (node) => ts.isCallExpression(node) && ts.isIdentifier(node.expression),
      );
      const operationSymbols = new Set(
        operationCalls.map((call) => canonicalSymbol(checker, call.expression)),
      );
      const helperName = ts.isVariableDeclaration(helper)
        ? helper.name
        : helper.name;
      const helperSymbol = canonicalSymbol(checker, helperName);
      for (const callsite of reachableNodesFromCallable(
        checker,
        registrarOwner,
        true,
      ).filter(
        (node) =>
          ts.isCallExpression(node) &&
          canonicalSymbol(checker, node.expression) === helperSymbol,
      )) {
        const parameters = helperFunction.parameters || [];
        const channelIndex = parameters.findIndex(
          (entry) => canonicalSymbol(checker, entry.name) === channelParameter,
        );
        if (
          channelIndex < 0 ||
          !ts.isStringLiteral(callsite.arguments[channelIndex]) ||
          callsite.arguments[channelIndex].text !== channel
        )
          continue;
        for (let index = 0; index < parameters.length; index += 1) {
          const parameter = canonicalSymbol(checker, parameters[index].name);
          if (!operationSymbols.has(parameter)) continue;
          const callback = callsite.arguments[index];
          if (!callback || !ts.isFunctionLike(callback)) continue;
          const callsiteScope = enclosingFunction(callsite);
          const invocation = callsiteScope
            ? rootedApplicationInvocation(callback, callsiteScope)
            : null;
          if (
            invocation &&
            (!requireResult || !resultIsDiscarded(checker, invocation))
          )
            return invocation;
        }
      }
    }
  }
  return null;
}

function rootIdentifierSymbol(checker, expression) {
  let current = expression;
  while (
    ts.isPropertyAccessExpression(current) ||
    ts.isElementAccessExpression(current)
  )
    current = current.expression;
  return ts.isIdentifier(current) ? canonicalSymbol(checker, current) : null;
}

function channelArgumentValue(checker, expression, fixture) {
  if (ts.isStringLiteral(expression)) return expression.text;
  if (
    !ts.isPropertyAccessExpression(expression) ||
    expression.name.text !== "channel"
  )
    return null;
  const root = canonicalSymbol(checker, expression.expression);
  const declaration = declarationOf(root, ts.isVariableDeclaration);
  const initializer = declaration?.initializer;
  if (!initializer || !ts.isCallExpression(initializer)) return null;
  const argument = initializer.arguments[0];
  if (!argument || !ts.isStringLiteral(argument)) return null;
  if (
    ts.isPropertyAccessExpression(initializer.expression) &&
    initializer.expression.name.text === "byCapability" &&
    argument.text === fixture.capability
  )
    return fixture.channel;
  if (
    ts.isPropertyAccessExpression(initializer.expression) &&
    initializer.expression.name.text === "byChannel"
  )
    return argument.text;
  return null;
}

function producerSendEvidence(checker, owner, fixture) {
  const expectedPath = String(
    fixture.productionCaller.producerApplication || "",
  )
    .split(".")
    .filter(Boolean);
  if (!expectedPath.length || !owner) return null;
  const recordedCallbackPath = String(
    fixture.productionCaller.producerCallback || "",
  )
    .split(".")
    .filter(Boolean);
  const recordedCallback = recordedCallbackPath.length
    ? (call, argumentIndex) => {
        if (!ts.isFunctionLike(call.arguments[argumentIndex])) return false;
        const actual = [];
        let root = call.expression;
        while (ts.isPropertyAccessExpression(root)) {
          actual.unshift(root.name.text);
          root = root.expression;
        }
        if (
          !ts.isIdentifier(root) ||
          actual.length + 1 !== recordedCallbackPath.length ||
          root.text !== recordedCallbackPath[0] ||
          actual.some((part, index) => part !== recordedCallbackPath[index + 1])
        )
          return false;
        const rootIdentity = canonicalSymbol(checker, root);
        if (!rootIdentity) return false;
        return (rootIdentity.declarations || []).some(
          (declaration) =>
            declaration.getSourceFile() === owner.getSourceFile() &&
            declaration.pos >= owner.pos &&
            declaration.end <= owner.end,
        );
      }
    : null;
  const reachable = reachableNodesFromCallable(
    checker,
    owner,
    true,
    recordedCallback,
  );
  return (
    reachable.find((node) => {
      if (!ts.isCallExpression(node) || node.arguments.length === 0)
        return false;
      const actualPath = [];
      let current = node.expression;
      while (ts.isPropertyAccessExpression(current)) {
        actualPath.unshift(current.name.text);
        current = current.expression;
      }
      if (ts.isIdentifier(current)) actualPath.unshift(current.text);
      if (
        actualPath.length !== expectedPath.length ||
        actualPath.some((part, index) => part !== expectedPath[index]) ||
        !rootIdentifierSymbol(checker, node.expression)
      )
        return false;
      return (
        channelArgumentValue(checker, node.arguments[0], fixture) ===
        fixture.channel
      );
    }) || null
  );
}

function recordedOwnerReachable(program, checker, entryOwner, target) {
  if (!entryOwner || !target) return false;
  const targetSymbol = canonicalSymbol(checker, target.name || target);
  if (!targetSymbol) return false;
  if (canonicalSymbol(checker, entryOwner.name || entryOwner) === targetSymbol)
    return true;
  function returnedMemberIsCalled(owner, property, reachableNodes) {
    const ownerSymbol = canonicalSymbol(checker, owner.name || owner);
    const memberName =
      ts.isMethodDeclaration(property) ||
      ts.isPropertyAssignment(property) ||
      ts.isShorthandPropertyAssignment(property)
        ? property.name.text
        : null;
    if (!ownerSymbol || !memberName) return false;
    let callsBySymbol = callSitesByProgram.get(program);
    if (!callsBySymbol) {
      callsBySymbol = new Map();
      for (const sourceFile of program.getSourceFiles()) {
        if (sourceFile.isDeclarationFile) continue;
        for (const call of walk(sourceFile, ts.isCallExpression)) {
          const callee = canonicalSymbol(checker, call.expression);
          if (!callee) continue;
          const calls = callsBySymbol.get(callee) || [];
          calls.push(call);
          callsBySymbol.set(callee, calls);
        }
      }
      callSitesByProgram.set(program, callsBySymbol);
    }
    const entrySource = entryOwner.getSourceFile();
    function nodeIsReachable(node) {
      const sourceFile = node.getSourceFile();
      if (sourceFile === entrySource) return reachableNodes.includes(node);
      const scope = containingFunction(node);
      if (!scope) return !isStaticallyUnreachableBranch(checker, node);
      if (callableReachableFromEntry(program, checker, sourceFile, scope, true))
        return true;
      const property = ts.isPropertyAssignment(scope.parent)
        ? scope.parent
        : null;
      const object = property?.parent;
      const call =
        object && ts.isObjectLiteralExpression(object) ? object.parent : null;
      const argumentIndex =
        call && ts.isCallExpression(call) ? call.arguments.indexOf(object) : -1;
      const propertyName =
        property &&
        (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name))
          ? property.name.text
          : null;
      return Boolean(
        propertyName &&
        argumentIndex >= 0 &&
        !isStaticallyUnreachableBranch(checker, call) &&
        callInvokesCallbackProperty(
          checker,
          call,
          argumentIndex,
          propertyName,
          walk(sourceFile, () => true),
        ),
      );
    }
    for (const call of callsBySymbol.get(ownerSymbol) || []) {
      if (isStaticallyUnreachableBranch(checker, call)) continue;
      const sourceFile = call.getSourceFile();
      if (canonicalSymbol(checker, call.expression) !== ownerSymbol) continue;
      let expression = call;
      while (
        expression.parent &&
        (ts.isParenthesizedExpression(expression.parent) ||
          ts.isAsExpression(expression.parent) ||
          ts.isNonNullExpression(expression.parent))
      )
        expression = expression.parent;
      if (
        ts.isPropertyAccessExpression(expression.parent) &&
        expression.parent.expression === expression &&
        expression.parent.name.text === memberName &&
        ts.isCallExpression(expression.parent.parent) &&
        expression.parent.parent.expression === expression.parent
      ) {
        if (nodeIsReachable(call) && nodeIsReachable(expression.parent.parent))
          return true;
        continue;
      }
      const declaration = ts.isVariableDeclaration(expression.parent)
        ? expression.parent
        : null;
      if (!declaration || declaration.initializer !== expression) continue;
      const receiver = canonicalSymbol(checker, declaration.name);
      if (!receiver) continue;
      if (
        walk(
          sourceFile,
          (node) =>
            ts.isCallExpression(node) &&
            ts.isPropertyAccessExpression(node.expression) &&
            node.expression.name.text === memberName &&
            canonicalSymbol(checker, node.expression.expression) === receiver &&
            nodeIsReachable(call) &&
            nodeIsReachable(node),
          (node) => isStaticallyUnreachableBranch(checker, node),
          checker,
        ).length
      )
        return true;
    }
    return false;
  }
  const targetBody = callableBody(target);
  for (const node of reachableNodesFromCallable(
    checker,
    entryOwner,
    true,
    null,
    new Set(),
    returnedMemberIsCalled,
  )) {
    if (
      targetBody &&
      node.getSourceFile() === targetBody.getSourceFile() &&
      node.pos >= targetBody.pos &&
      node.end <= targetBody.end
    )
      return true;
    if (!ts.isCallExpression(node)) continue;
    if (canonicalSymbol(checker, node.expression) === targetSymbol) return true;
    if (
      ts.isPropertyAccessExpression(node.expression) &&
      ts.isCallExpression(node.expression.expression) &&
      ts.isIdentifier(node.expression.expression.expression) &&
      node.expression.expression.expression.text === "require" &&
      ts.isStringLiteral(node.expression.expression.arguments[0])
    ) {
      const base = path.resolve(
        path.dirname(node.getSourceFile().fileName),
        node.expression.expression.arguments[0].text,
      );
      if (
        [base, `${base}.js`, `${base}.ts`, `${base}.tsx`]
          .map(normalize)
          .includes(normalize(target.getSourceFile().fileName)) &&
        node.expression.name.text === String(target.name?.text || "")
      )
        return true;
    }
    if (!ts.isIdentifier(node.expression)) continue;
    const local = canonicalSymbol(checker, node.expression);
    const declaration = declarationOf(local, ts.isVariableDeclaration);
    const initializer = declaration?.initializer;
    if (
      !initializer ||
      !ts.isPropertyAccessExpression(initializer) ||
      !ts.isCallExpression(initializer.expression) ||
      !ts.isIdentifier(initializer.expression.expression) ||
      initializer.expression.expression.text !== "require" ||
      !ts.isStringLiteral(initializer.expression.arguments[0])
    )
      continue;
    const base = path.resolve(
      path.dirname(declaration.getSourceFile().fileName),
      initializer.expression.arguments[0].text,
    );
    const targetFile = normalize(target.getSourceFile().fileName);
    const resolved = [base, `${base}.js`, `${base}.ts`, `${base}.tsx`]
      .map(normalize)
      .includes(targetFile);
    if (!resolved || initializer.name.text !== String(target.name?.text || ""))
      continue;
    const resolvedDeclaration = callableDeclarationByName(
      checker,
      target.getSourceFile(),
      initializer.name.text,
    );
    if (
      resolvedDeclaration &&
      canonicalSymbol(
        checker,
        resolvedDeclaration.name || resolvedDeclaration,
      ) === targetSymbol
    )
      return true;
  }
  return false;
}

function recordedApplicationEvidence(
  context,
  caller,
  producerSend,
  producerEntryRoot,
) {
  const { checker, program } = context;
  if (!caller.applicationSource || !caller.applicationOwner) return null;
  const source = evidenceSource(context, caller.applicationSource);
  const owner = source
    ? callableDeclarationByName(checker, source, caller.applicationOwner)
    : null;
  if (!owner) return null;
  const expectedReceiverPath = String(caller.applicationReceiver || "")
    .split(".")
    .filter(Boolean);
  if (!expectedReceiverPath.length) return null;
  const expectedReceiverRoot = (() => {
    const rootName = expectedReceiverPath[0];
    for (const parameter of owner.parameters || []) {
      if (ts.isIdentifier(parameter.name) && parameter.name.text === rootName)
        return canonicalSymbol(checker, parameter.name);
    }
    const declaration = walk(
      source,
      (node) =>
        ts.isVariableDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        node.name.text === rootName,
    )[0];
    return declaration ? canonicalSymbol(checker, declaration.name) : null;
  })();
  if (!expectedReceiverRoot) return null;
  const ownerSymbol = canonicalSymbol(checker, owner.name || owner);
  const producerCallee = producerSend?.expression;
  if (
    !ownerSymbol ||
    !producerCallee ||
    !expressionReachesCallableSymbol(
      program,
      checker,
      producerCallee,
      ownerSymbol,
      [],
      new Set(),
      producerEntryRoot,
    )
  )
    return null;
  const channelParameters = new Set(
    (owner.parameters || [])
      .map((parameter) => canonicalSymbol(checker, parameter.name))
      .filter(Boolean),
  );
  const expected = String(caller.application || "")
    .split(".")
    .filter(Boolean);
  for (const call of reachableNodesFromCallable(
    checker,
    owner,
    true,
    null,
    new Set(),
    false,
  ).filter(ts.isCallExpression)) {
    const actual = [];
    let current = call.expression;
    while (ts.isPropertyAccessExpression(current)) {
      actual.unshift(current.name.text);
      current = current.expression;
    }
    if (ts.isIdentifier(current)) actual.unshift(current.text);
    const receiverParts = [];
    let receiverRoot = call.expression.expression;
    while (ts.isPropertyAccessExpression(receiverRoot)) {
      receiverParts.unshift(receiverRoot.name.text);
      receiverRoot = receiverRoot.expression;
    }
    if (
      actual.length < expected.length ||
      !actual
        .slice(-expected.length)
        .every((part, index) => part === expected[index]) ||
      !ts.isPropertyAccessExpression(call.expression) ||
      !channelParameters.has(canonicalSymbol(checker, call.arguments[0])) ||
      !ts.isIdentifier(receiverRoot) ||
      canonicalSymbol(checker, receiverRoot) !== expectedReceiverRoot ||
      receiverParts.length + 1 !== expectedReceiverPath.length ||
      receiverRoot.text !== expectedReceiverPath[0] ||
      receiverParts.some(
        (part, index) => part !== expectedReceiverPath[index + 1],
      )
    )
      continue;
    const receiver = canonicalSymbol(checker, call.expression.expression);
    const member = canonicalSymbol(checker, call.expression.name);
    if (receiver && member) return { call, owner, receiver, member };
  }
  return null;
}

function expressionReachesCallableSymbol(
  program,
  checker,
  expression,
  target,
  propertyPath = [],
  visited = new Set(),
  callsiteRoot = null,
) {
  if (!expression) return false;
  let current = expression;
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isTypeAssertionExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isNonNullExpression(current)
  )
    current = current.expression;
  const key = `${normalize(current.getSourceFile().fileName)}:${current.pos}:${current.end}:${propertyPath.join(".")}`;
  if (visited.has(key)) return false;
  visited.add(key);
  if (!propertyPath.length && canonicalSymbol(checker, current) === target)
    return true;
  if (ts.isPropertyAccessExpression(current))
    return expressionReachesCallableSymbol(
      program,
      checker,
      current.expression,
      target,
      [current.name.text, ...propertyPath],
      visited,
      callsiteRoot,
    );
  if (ts.isObjectLiteralExpression(current) && propertyPath.length) {
    const [property, ...rest] = propertyPath;
    return current.properties
      .filter((candidate) => namedProperty(candidate, property))
      .some((candidate) => {
        const value = ts.isPropertyAssignment(candidate)
          ? candidate.initializer
          : ts.isShorthandPropertyAssignment(candidate)
            ? candidate.name
            : null;
        return expressionReachesCallableSymbol(
          program,
          checker,
          value,
          target,
          rest,
          new Set(visited),
          callsiteRoot,
        );
      });
  }
  if (
    ts.isBinaryExpression(current) &&
    [ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken].includes(
      current.operatorToken.kind,
    )
  )
    return expressionReachesCallableSymbol(
      program,
      checker,
      current.left,
      target,
      propertyPath,
      visited,
      callsiteRoot,
    );
  if (ts.isConditionalExpression(current)) {
    const condition = current.condition;
    const guarded =
      ts.isBinaryExpression(condition) &&
      [
        ts.SyntaxKind.EqualsEqualsToken,
        ts.SyntaxKind.EqualsEqualsEqualsToken,
      ].includes(condition.operatorToken.kind) &&
      ts.isTypeOfExpression(condition.left) &&
      ts.isStringLiteral(condition.right) &&
      condition.right.text === "function"
        ? condition.left.expression
        : null;
    if (!guarded || guarded.getText() !== current.whenTrue.getText())
      return false;
    return expressionReachesCallableSymbol(
      program,
      checker,
      current.whenTrue,
      target,
      propertyPath,
      visited,
      callsiteRoot,
    );
  }
  if (
    ts.isCallExpression(current) &&
    ts.isPropertyAccessExpression(current.expression) &&
    ts.isIdentifier(current.expression.expression) &&
    current.expression.expression.text === "Object" &&
    current.expression.name.text === "assign"
  )
    return current.arguments.some((argument) =>
      expressionReachesCallableSymbol(
        program,
        checker,
        argument,
        target,
        propertyPath,
        new Set(visited),
        callsiteRoot,
      ),
    );
  if (!ts.isIdentifier(current)) return false;
  const symbol = canonicalSymbol(checker, current);
  for (const assignment of walk(
    current.getSourceFile(),
    (node) =>
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      canonicalSymbol(checker, node.left) === symbol,
  )) {
    if (
      expressionReachesCallableSymbol(
        program,
        checker,
        assignment.right,
        target,
        propertyPath,
        new Set(visited),
        callsiteRoot,
      )
    )
      return true;
  }
  for (const declaration of symbol?.declarations || []) {
    if (ts.isVariableDeclaration(declaration) && declaration.initializer) {
      if (
        expressionReachesCallableSymbol(
          program,
          checker,
          declaration.initializer,
          target,
          propertyPath,
          new Set(visited),
          callsiteRoot,
        )
      )
        return true;
    }
    if (!ts.isParameter(declaration)) continue;
    const owner = declaration.parent;
    const ownerSymbol = canonicalSymbol(checker, owner.name || owner);
    const parameterIndex = owner.parameters.indexOf(declaration);
    if (!ownerSymbol || parameterIndex < 0) continue;
    const rootSymbol = callsiteRoot
      ? canonicalSymbol(checker, callsiteRoot.name || callsiteRoot)
      : null;
    const allowedCalls =
      callsiteRoot && ownerSymbol !== rootSymbol
        ? new Set(
            reachableNodesFromCallable(checker, callsiteRoot, true).filter(
              ts.isCallExpression,
            ),
          )
        : null;
    const nextCallsiteRoot = ownerSymbol === rootSymbol ? null : callsiteRoot;
    for (const sourceFile of program.getSourceFiles()) {
      if (sourceFile.isDeclarationFile) continue;
      for (const call of walk(
        sourceFile,
        (node) =>
          ts.isCallExpression(node) &&
          callExpressionTargetsSymbol(
            program,
            checker,
            node.expression,
            ownerSymbol,
          ),
      )) {
        if (allowedCalls && !allowedCalls.has(call)) continue;
        if (
          expressionReachesCallableSymbol(
            program,
            checker,
            call.arguments[parameterIndex],
            target,
            propertyPath,
            new Set(visited),
            nextCallsiteRoot,
          )
        )
          return true;
      }
    }
  }
  return false;
}

function callExpressionTargetsSymbol(program, checker, expression, target) {
  if (canonicalSymbol(checker, expression) === target) return true;
  const declaration = ts.isIdentifier(expression)
    ? declarationOf(
        canonicalSymbol(checker, expression),
        (candidate) =>
          ts.isVariableDeclaration(candidate) || ts.isBindingElement(candidate),
      )
    : null;
  if (
    declaration &&
    ts.isVariableDeclaration(declaration) &&
    declaration.initializer &&
    ts.isBinaryExpression(declaration.initializer) &&
    [ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken].includes(
      declaration.initializer.operatorToken.kind,
    )
  )
    return (
      callExpressionTargetsSymbol(
        program,
        checker,
        declaration.initializer.left,
        target,
      ) ||
      callExpressionTargetsSymbol(
        program,
        checker,
        declaration.initializer.right,
        target,
      )
    );
  let exportName = null;
  let requireCall = null;
  if (ts.isPropertyAccessExpression(expression)) {
    exportName = expression.name.text;
    requireCall = ts.isCallExpression(expression.expression)
      ? expression.expression
      : null;
  } else if (declaration && ts.isVariableDeclaration(declaration)) {
    const initializer = declaration.initializer;
    if (initializer && ts.isPropertyAccessExpression(initializer)) {
      exportName = initializer.name.text;
      requireCall = ts.isCallExpression(initializer.expression)
        ? initializer.expression
        : null;
    }
  } else if (declaration && ts.isBindingElement(declaration)) {
    exportName = declaration.propertyName?.text || declaration.name.text;
    const variable = declaration.parent?.parent;
    requireCall =
      ts.isVariableDeclaration(variable) &&
      ts.isCallExpression(variable.initializer)
        ? variable.initializer
        : null;
  }
  if (
    !exportName ||
    !requireCall ||
    !ts.isIdentifier(requireCall.expression) ||
    requireCall.expression.text !== "require" ||
    !ts.isStringLiteral(requireCall.arguments[0])
  )
    return false;
  const base = path.resolve(
    path.dirname(expression.getSourceFile().fileName),
    requireCall.arguments[0].text,
  );
  const source = [base, `${base}.js`, `${base}.ts`, `${base}.tsx`]
    .map((candidate) => program.getSourceFile(candidate))
    .find(Boolean);
  if (!source) return false;
  const exported = exportedSymbol(checker, source, exportName);
  if (exported === target) return true;
  const resolvedDeclaration = callableDeclarationByName(
    checker,
    source,
    exportName,
  );
  return Boolean(
    resolvedDeclaration &&
    canonicalSymbol(
      checker,
      resolvedDeclaration.name || resolvedDeclaration,
    ) === target,
  );
}

function preloadEventDisposes(
  checker,
  sourceFile,
  method,
  channel,
  transportReceiver,
) {
  const members = walk(sourceFile, (node) => namedProperty(node, method));
  for (const member of members) {
    const body = ts.isPropertyAssignment(member)
      ? member.initializer
      : ts.isMethodDeclaration(member)
        ? member
        : null;
    if (!body) continue;
    const registrations = walk(
      body,
      (node) =>
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === "on" &&
        ts.isStringLiteral(node.arguments[0]) &&
        node.arguments[0].text === channel &&
        callUsesTransportReceiver(checker, node, "on", transportReceiver),
      (node) => ts.isFunctionLike(node),
    );
    for (const registration of registrations) {
      const callback = canonicalSymbol(checker, registration.arguments[1]);
      if (!callback) continue;
      const returned = walk(body, ts.isReturnStatement, (node) =>
        ts.isFunctionLike(node),
      );
      const disposerExpressions = returned
        .map((statement) => statement.expression)
        .filter(Boolean);
      if (ts.isFunctionLike(body) && body.body && !ts.isBlock(body.body))
        disposerExpressions.push(body.body);
      for (const expression of disposerExpressions) {
        const disposer = ts.isFunctionLike(expression)
          ? expression
          : declarationOf(
              canonicalSymbol(checker, expression),
              (declaration) =>
                ts.isFunctionLike(declaration) ||
                (ts.isVariableDeclaration(declaration) &&
                  Boolean(callableBody(declaration))),
            );
        if (!disposer) continue;
        const removals = reachableNodesFromCallable(
          checker,
          disposer,
          true,
        ).filter(
          (node) =>
            ts.isCallExpression(node) &&
            ts.isPropertyAccessExpression(node.expression) &&
            node.expression.name.text === "removeListener" &&
            ts.isStringLiteral(node.arguments[0]) &&
            node.arguments[0].text === channel &&
            canonicalSymbol(checker, node.arguments[1]) === callback &&
            callUsesTransportReceiver(
              checker,
              node,
              "removeListener",
              transportReceiver,
            ),
        );
        if (
          removals.some(
            (removal) =>
              !callHasConditionalPath(checker, removal) &&
              !callableHasOnlyConditionalEntry(
                checker,
                containingFunction(removal),
              ),
          )
        )
          return true;
      }
    }
  }
  return false;
}

function uniqueBridgeConsumer(checker, program, bridgeSource, bridgeExport) {
  let consumers = 0;
  for (const sourceFile of program.getSourceFiles()) {
    if (sourceFile === bridgeSource || sourceFile.isDeclarationFile) continue;
    for (const specifier of walk(sourceFile, ts.isImportSpecifier)) {
      if (canonicalSymbol(checker, specifier.name) !== bridgeExport) continue;
      const local = checker.getSymbolAtLocation(specifier.name);
      for (const identifier of walk(sourceFile, ts.isIdentifier)) {
        if (identifier === specifier.name) continue;
        if (
          ts.isShorthandPropertyAssignment(identifier.parent) &&
          identifier.parent.name === identifier
        ) {
          const value = checker.getShorthandAssignmentValueSymbol(
            identifier.parent,
          );
          if (value === local) consumers += 1;
          continue;
        }
        if (checker.getSymbolAtLocation(identifier) === local) consumers += 1;
      }
    }
  }
  return consumers === 1;
}

function eventFeatureDisposes(
  checker,
  factory,
  binding,
  featureMember,
  cleanupMethod = "dispose",
) {
  if (!factory) return false;
  const assignedDisposers = new Set();
  const rejectedDisposers = new Set();
  const dependencyRoots = new Set();
  const directBindings = new Set();
  const parameter = factory.parameters[0];
  if (parameter) {
    if (ts.isIdentifier(parameter.name))
      dependencyRoots.add(canonicalSymbol(checker, parameter.name));
    else if (ts.isObjectBindingPattern(parameter.name)) {
      const element = parameter.name.elements.find((candidate) => {
        const name = candidate.propertyName || candidate.name;
        return (
          (ts.isIdentifier(name) || ts.isStringLiteral(name)) &&
          name.text === binding
        );
      });
      if (element && ts.isIdentifier(element.name))
        directBindings.add(canonicalSymbol(checker, element.name));
    }
  }
  if (!dependencyRoots.size && !directBindings.size) return false;

  // A feature may take a dependency member into a local variable before it
  // subscribes.  Preserve its identity only for a direct alias of the
  // recorded dependency member; accepting arbitrary function aliases here
  // would make the disposer check name-based again.
  for (const declaration of walk(
    factory,
    (node) => ts.isVariableDeclaration(node) && ts.isIdentifier(node.name),
  )) {
    const initializer = declaration.initializer;
    if (!initializer) continue;
    const isRecordedMember =
      ts.isPropertyAccessExpression(initializer) &&
      initializer.name.text === binding &&
      dependencyRoots.has(canonicalSymbol(checker, initializer.expression));
    const isRecordedElement =
      ts.isElementAccessExpression(initializer) &&
      ts.isStringLiteral(initializer.argumentExpression) &&
      initializer.argumentExpression.text === binding &&
      dependencyRoots.has(canonicalSymbol(checker, initializer.expression));
    if (isRecordedMember || isRecordedElement)
      directBindings.add(canonicalSymbol(checker, declaration.name));
  }

  function isRecordedDependencyCall(call) {
    if (directBindings.has(canonicalSymbol(checker, call.expression)))
      return true;
    if (
      ts.isPropertyAccessExpression(call.expression) &&
      call.expression.name.text === binding
    )
      return dependencyRoots.has(
        canonicalSymbol(checker, call.expression.expression),
      );
    if (
      ts.isElementAccessExpression(call.expression) &&
      ts.isStringLiteral(call.expression.argumentExpression) &&
      call.expression.argumentExpression.text === binding
    )
      return dependencyRoots.has(
        canonicalSymbol(checker, call.expression.expression),
      );
    return false;
  }

  const recordedCalls = new Set(
    memberReachableNodes(checker, factory, featureMember, true).filter(
      (node) => ts.isCallExpression(node) && isRecordedDependencyCall(node),
    ),
  );
  for (const call of recordedCalls) {
    let current = call.parent;
    while (current && current !== factory) {
      if (ts.isVariableDeclaration(current) && ts.isIdentifier(current.name)) {
        assignedDisposers.add(canonicalSymbol(checker, current.name));
        break;
      }
      if (
        ts.isBinaryExpression(current) &&
        current.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
        ts.isIdentifier(current.left)
      ) {
        assignedDisposers.add(canonicalSymbol(checker, current.left));
        break;
      }
      current = current.parent;
    }
  }
  if (!assignedDisposers.size) return false;

  function isSafeSubscriptionTransfer(value) {
    if (ts.isIdentifier(value))
      return assignedDisposers.has(canonicalSymbol(checker, value));
    if (!ts.isConditionalExpression(value)) return false;
    if (!ts.isIdentifier(value.whenTrue)) return false;
    const subscription = canonicalSymbol(checker, value.whenTrue);
    if (!assignedDisposers.has(subscription)) return false;
    const condition = value.condition;
    return (
      ts.isBinaryExpression(condition) &&
      condition.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken &&
      ts.isTypeOfExpression(condition.left) &&
      canonicalSymbol(checker, condition.left.expression) === subscription &&
      ts.isStringLiteral(condition.right) &&
      condition.right.text === "function"
    );
  }

  // Follow only an explicit identity transfer or the common
  // `typeof unsubscribe === "function" ? unsubscribe : noop` guard.  This
  // retains the real disposer while rejecting replacement by a lookalike.
  let expanded = true;
  while (expanded) {
    expanded = false;
    for (const assignment of walk(
      factory,
      (node) =>
        ts.isVariableDeclaration(node) ||
        (ts.isBinaryExpression(node) &&
          node.operatorToken.kind === ts.SyntaxKind.EqualsToken),
    )) {
      const target = ts.isVariableDeclaration(assignment)
        ? assignment.name
        : assignment.left;
      const value = ts.isVariableDeclaration(assignment)
        ? assignment.initializer
        : assignment.right;
      if (
        !ts.isIdentifier(target) ||
        !value ||
        !isSafeSubscriptionTransfer(value)
      )
        continue;
      const targetSymbol = canonicalSymbol(checker, target);
      if (!assignedDisposers.has(targetSymbol)) {
        assignedDisposers.add(targetSymbol);
        expanded = true;
      }
    }
  }
  for (const assignment of walk(
    factory,
    (node) =>
      ts.isVariableDeclaration(node) ||
      (ts.isBinaryExpression(node) &&
        node.operatorToken.kind === ts.SyntaxKind.EqualsToken),
  )) {
    const target = ts.isVariableDeclaration(assignment)
      ? assignment.name
      : assignment.left;
    const value = ts.isVariableDeclaration(assignment)
      ? assignment.initializer
      : assignment.right;
    if (!ts.isIdentifier(target) || !value) continue;
    const targetSymbol = canonicalSymbol(checker, target);
    if (!assignedDisposers.has(targetSymbol)) continue;
    const benignInitialValue =
      value.kind === ts.SyntaxKind.NullKeyword ||
      (ts.isIdentifier(value) && value.text === "undefined");
    if (benignInitialValue) continue;
    if (
      !walk(value, (node) => recordedCalls.has(node)).length &&
      !isSafeSubscriptionTransfer(value)
    )
      rejectedDisposers.add(targetSymbol);
  }
  rejectedDisposers.forEach((symbol) => assignedDisposers.delete(symbol));
  if (!assignedDisposers.size) return false;
  const disposeMember = returnedMemberSymbol(checker, factory, cleanupMethod);
  if (
    memberReachableNodes(checker, factory, disposeMember, true).some(
      (node) =>
        ts.isCallExpression(node) &&
        assignedDisposers.has(canonicalSymbol(checker, node.expression)) &&
        !callHasConditionalPath(checker, node) &&
        !callableHasOnlyConditionalEntry(checker, containingFunction(node)),
    )
  )
    return true;
  const disposeProperties = walk(factory, (node) =>
    namedProperty(node, cleanupMethod),
  );
  for (const property of disposeProperties) {
    const target = ts.isPropertyAssignment(property)
      ? property.initializer
      : ts.isShorthandPropertyAssignment(property)
        ? checker.getShorthandAssignmentValueSymbol(property) || property.name
        : property;
    const symbol = canonicalSymbol(checker, target);
    const declaration =
      declarationOf(symbol, ts.isFunctionLike) ||
      (ts.isFunctionLike(target) ? target : null);
    const body = callableBody(declaration);
    if (
      body &&
      reachableNodesFromCallable(checker, declaration, true).some(
        (node) =>
          ts.isCallExpression(node) &&
          assignedDisposers.has(canonicalSymbol(checker, node.expression)) &&
          !callHasConditionalPath(checker, node) &&
          !callableHasOnlyConditionalEntry(checker, containingFunction(node)),
      )
    )
      return true;
  }
  return false;
}

function eventConsumerDisposes(checker, subscription) {
  if (!subscription || !ts.isCallExpression(subscription)) return false;
  const resultType = checker.getTypeAtLocation(subscription);
  if (!checker.getSignaturesOfType(resultType, ts.SignatureKind.Call).length)
    return false;
  let assignment = subscription.parent;
  const sourceFile = subscription.getSourceFile();
  while (assignment && assignment !== sourceFile) {
    if (
      ts.isVariableDeclaration(assignment) &&
      ts.isIdentifier(assignment.name)
    )
      break;
    assignment = assignment.parent;
  }
  if (!assignment || !ts.isVariableDeclaration(assignment)) return false;
  const disposer = canonicalSymbol(checker, assignment.name);
  const scope = containingFunction(assignment);
  if (!scope || !disposer) return false;
  for (const call of walk(
    scope,
    (node) =>
      ts.isCallExpression(node) &&
      canonicalSymbol(checker, node.expression) === disposer &&
      !isStaticallyUnreachableBranch(checker, node),
  )) {
    let current = call.parent;
    while (current && current !== scope) {
      if (ts.isReturnStatement(current)) return true;
      current = current.parent;
    }
  }
  return false;
}

function branchContexts(node) {
  const contexts = [];
  let current = node;
  while (current?.parent) {
    const parent = current.parent;
    if (
      ts.isIfStatement(parent) &&
      (parent.thenStatement === current || parent.elseStatement === current)
    )
      contexts.push({ control: parent, branch: current });
    if (ts.isCaseClause(parent) || ts.isDefaultClause(parent))
      contexts.push({ control: parent.parent, branch: parent });
    current = parent;
  }
  return contexts;
}

function callsCanSharePath(left, right) {
  const leftContexts = branchContexts(left);
  const rightContexts = branchContexts(right);
  return !leftContexts.some((leftContext) =>
    rightContexts.some(
      (rightContext) =>
        leftContext.control === rightContext.control &&
        leftContext.branch !== rightContext.branch,
    ),
  );
}

function conditionGuardsCall(checker, condition, call, thenBranch) {
  let current = condition;
  let negated = false;
  while (
    ts.isParenthesizedExpression(current) ||
    (ts.isPrefixUnaryExpression(current) &&
      current.operator === ts.SyntaxKind.ExclamationToken)
  ) {
    if (ts.isPrefixUnaryExpression(current)) negated = !negated;
    current = current.expression;
  }
  const target = canonicalSymbol(checker, call.expression);
  if (!target) return false;
  if (
    ts.isIdentifier(current) ||
    ts.isPropertyAccessExpression(current) ||
    ts.isElementAccessExpression(current)
  )
    return (
      canonicalSymbol(checker, current) === target && thenBranch !== negated
    );
  if (!ts.isBinaryExpression(current)) return false;
  const equality =
    current.operatorToken.kind === ts.SyntaxKind.EqualsEqualsToken ||
    current.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken;
  const inequality =
    current.operatorToken.kind === ts.SyntaxKind.ExclamationEqualsToken ||
    current.operatorToken.kind === ts.SyntaxKind.ExclamationEqualsEqualsToken;
  if (!equality && !inequality) return false;
  const operands = [
    [current.left, current.right],
    [current.right, current.left],
  ];
  for (const [typeOfExpression, literal] of operands) {
    if (
      !ts.isTypeOfExpression(typeOfExpression) ||
      !ts.isStringLiteral(literal) ||
      literal.text !== "function" ||
      canonicalSymbol(checker, typeOfExpression.expression) !== target
    )
      continue;
    const functionBranch = equality;
    return thenBranch === (negated ? !functionBranch : functionBranch);
  }
  return false;
}

function callHasConditionalPath(checker, call) {
  let current = call;
  while (current?.parent) {
    const parent = current.parent;
    if (
      ts.isIfStatement(parent) &&
      (parent.thenStatement === current || parent.elseStatement === current)
    ) {
      if (
        staticBranchValue(checker, parent.expression) === null &&
        !conditionGuardsCall(
          checker,
          parent.expression,
          call,
          parent.thenStatement === current,
        )
      )
        return true;
    }
    if (
      ts.isBinaryExpression(parent) &&
      parent.right === current &&
      (parent.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken ||
        parent.operatorToken.kind === ts.SyntaxKind.BarBarToken ||
        parent.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken)
    ) {
      const value = staticBranchValue(checker, parent.left);
      const executesRight =
        parent.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken;
      if (
        value === null &&
        !(
          executesRight && conditionGuardsCall(checker, parent.left, call, true)
        )
      )
        return true;
    }
    if (
      ts.isConditionalExpression(parent) &&
      (parent.whenTrue === current || parent.whenFalse === current) &&
      staticBranchValue(checker, parent.condition) === null
    )
      return true;
    if (ts.isCaseClause(parent) || ts.isDefaultClause(parent)) {
      const switchStatement = parent.parent?.parent;
      if (!ts.isSwitchStatement(switchStatement)) return true;
      const selector = staticPrimitiveValue(
        checker,
        switchStatement.expression,
      );
      if (selector === STATIC_UNKNOWN) return true;
      const clauses = switchStatement.caseBlock.clauses;
      const activeIndex = clauses.findIndex(
        (clause) =>
          ts.isCaseClause(clause) &&
          staticPrimitiveValue(checker, clause.expression) === selector,
      );
      const defaultIndex = clauses.findIndex(ts.isDefaultClause);
      const clauseIndex = clauses.indexOf(parent);
      const selectedIndex = activeIndex >= 0 ? activeIndex : defaultIndex;
      if (selectedIndex < 0 || clauseIndex !== selectedIndex) return true;
    }
    if (ts.isIterationStatement(parent) && parent.statement === current)
      return true;
    current = parent;
  }
  return false;
}

function callableHasOnlyConditionalEntry(
  checker,
  callable,
  visited = new Set(),
) {
  if (!callable) return false;
  const symbol = canonicalSymbol(checker, callable.name || callable);
  if (!symbol || visited.has(symbol)) return false;
  const nextVisited = new Set(visited).add(symbol);
  const source = callable.getSourceFile();
  const calls = walk(source, ts.isCallExpression).filter(
    (candidate) =>
      canonicalSymbol(checker, candidate.expression) === symbol &&
      !isStaticallyUnreachableBranch(checker, candidate),
  );
  if (!calls.length) return false;
  let conditional = false;
  let unconditional = false;
  for (const candidate of calls) {
    if (callHasConditionalPath(checker, candidate)) {
      conditional = true;
      continue;
    }
    const parent = containingFunction(candidate);
    if (
      parent &&
      parent !== callable &&
      callableHasOnlyConditionalEntry(checker, parent, nextVisited)
    ) {
      conditional = true;
      continue;
    }
    unconditional = true;
  }
  return conditional && !unconditional;
}

function eventCleanupFollowsStart(
  checker,
  program,
  startCalls,
  cleanupCalls,
  allowCrossSource = false,
) {
  const invocationSiteCache = new Map();
  let callsBySymbol = callSitesByProgram.get(program);
  if (!callsBySymbol) {
    callsBySymbol = new Map();
    for (const sourceFile of program.getSourceFiles()) {
      if (sourceFile.isDeclarationFile) continue;
      for (const candidate of walk(sourceFile, ts.isCallExpression)) {
        const symbol = canonicalSymbol(checker, candidate.expression);
        if (!symbol) continue;
        const calls = callsBySymbol.get(symbol) || [];
        calls.push(candidate);
        callsBySymbol.set(symbol, calls);
      }
    }
    callSitesByProgram.set(program, callsBySymbol);
  }

  function callableSymbol(callable) {
    if (!callable) return null;
    if (ts.isVariableDeclaration(callable))
      return canonicalSymbol(checker, callable.name);
    if (callable.name) return canonicalSymbol(checker, callable.name);
    if (
      ts.isPropertyAssignment(callable) ||
      ts.isShorthandPropertyAssignment(callable)
    )
      return canonicalSymbol(checker, callable.name);
    return null;
  }

  function callbackRegistration(callable) {
    let current = callable;
    while (current) {
      const parent = current.parent;
      if (!parent) break;
      if (ts.isReturnStatement(parent) && parent.expression === current) {
        current = containingFunction(parent);
        continue;
      }
      if (ts.isCallExpression(parent)) {
        const index = parent.arguments.indexOf(current);
        if (index >= 0 && callInvokesCallbackArgument(checker, parent, index))
          return parent;
      }
      current = parent;
    }
    const symbol = callableSymbol(callable);
    if (symbol) {
      for (const calls of callsBySymbol.values()) {
        for (const call of calls) {
          const argumentIndex = call.arguments.findIndex(
            (argument) => canonicalSymbol(checker, argument) === symbol,
          );
          if (
            argumentIndex >= 0 &&
            !isStaticallyUnreachableBranch(checker, call) &&
            callInvokesCallbackArgument(checker, call, argumentIndex)
          )
            return call;
        }
      }
    }
    return null;
  }

  function isReactEffectRegistration(call) {
    if (!call || !ts.isCallExpression(call)) return false;
    const expression = call.expression;
    const name = ts.isIdentifier(expression)
      ? expression.text
      : ts.isPropertyAccessExpression(expression)
        ? expression.name.text
        : "";
    return ["useEffect", "useLayoutEffect", "useInsertionEffect"].includes(
      name,
    );
  }

  function invocationSites(call) {
    const callable = containingFunction(call);
    if (invocationSiteCache.has(callable))
      return invocationSiteCache.get(callable);
    const registered = callbackRegistration(callable);
    if (registered) {
      const sites = [registered];
      invocationSiteCache.set(callable, sites);
      return sites;
    }
    const symbol = callableSymbol(callable);
    if (!symbol) {
      invocationSiteCache.set(callable, []);
      return [];
    }
    const sites = (callsBySymbol.get(symbol) || []).filter(
      (candidate) => !isStaticallyUnreachableBranch(checker, candidate),
    );
    invocationSiteCache.set(callable, sites);
    return sites;
  }

  function cleanupHasConditionalPath(cleanup) {
    let current = cleanup;
    while (current?.parent) {
      const parent = current.parent;
      if (
        (ts.isIfStatement(parent) &&
          (parent.thenStatement === current ||
            parent.elseStatement === current)) ||
        ts.isCaseClause(parent) ||
        ts.isDefaultClause(parent) ||
        (ts.isIterationStatement(parent) && parent.statement === current)
      )
        return true;
      current = parent;
    }
    return false;
  }

  function cleanupHasReachableExitBetween(start, cleanup) {
    const scope = containingFunction(cleanup);
    if (!scope || containingFunction(start) !== scope) return false;
    return (
      walk(
        scope,
        (node) =>
          (ts.isReturnStatement(node) || ts.isThrowStatement(node)) &&
          node.pos > start.end &&
          node.pos < cleanup.pos &&
          !isStaticallyUnreachableBranch(checker, node),
        (node) => node !== scope && ts.isFunctionLike(node),
        checker,
      ).length > 0
    );
  }

  function startMayRepeat(start) {
    let current = start.parent;
    while (current) {
      if (ts.isFunctionLike(current)) return false;
      if (ts.isIterationStatement(current)) return true;
      current = current.parent;
    }
    return false;
  }

  function hasRecursiveInvocationBetween(start, cleanup) {
    const scope = containingFunction(start);
    if (!scope || containingFunction(cleanup) !== scope) return false;
    const scopeSymbol = canonicalSymbol(checker, scope.name || scope);
    if (!scopeSymbol) return false;
    return (
      walk(
        scope,
        (node) =>
          ts.isCallExpression(node) &&
          node.pos > start.end &&
          node.pos < cleanup.pos &&
          canonicalSymbol(checker, node.expression) === scopeSymbol,
        (node) => node !== scope && ts.isFunctionLike(node),
        checker,
      ).length > 0
    );
  }

  function resolveCallableAlias(callable, visited = new Set()) {
    let current = callable;
    while (
      current &&
      (ts.isVariableDeclaration(current) || ts.isPropertyAssignment(current))
    ) {
      if (visited.has(current)) return current;
      visited.add(current);
      const value = callableBody(current);
      if (!value || ts.isFunctionLike(value)) return current;
      const target = declarationOf(
        canonicalSymbol(checker, value),
        (candidate) =>
          candidate.getSourceFile() === current.getSourceFile() &&
          (ts.isFunctionLike(candidate) ||
            (ts.isVariableDeclaration(candidate) &&
              Boolean(callableBody(candidate))) ||
            (ts.isPropertyAssignment(candidate) &&
              Boolean(callableBody(candidate)))),
      );
      if (!target || target === current) return current;
      current = target;
    }
    return current;
  }

  function callableCanReachScope(callable, scopeSymbol, visited = new Set()) {
    callable = resolveCallableAlias(callable);
    if (!callable) return false;
    const body = callableBody(callable);
    if (!body) return false;
    const source = callable.getSourceFile();
    const key = `${source.fileName}:${callable.pos}:${callable.end}`;
    if (visited.has(key)) return false;
    const nextVisited = new Set(visited).add(key);
    for (const call of walk(
      body,
      ts.isCallExpression,
      (node) =>
        (node !== body && ts.isFunctionLike(node)) ||
        isStaticallyUnreachableBranch(checker, node),
      checker,
    )) {
      const callee = canonicalSymbol(checker, call.expression);
      if (callee === scopeSymbol) return true;
      const declaration = declarationOf(
        callee,
        (candidate) =>
          candidate.getSourceFile() === source &&
          (ts.isFunctionLike(candidate) ||
            (ts.isVariableDeclaration(candidate) &&
              Boolean(callableBody(candidate))) ||
            (ts.isPropertyAssignment(candidate) &&
              Boolean(callableBody(candidate)))),
      );
      if (
        declaration &&
        callableCanReachScope(declaration, scopeSymbol, nextVisited)
      )
        return true;
      for (let index = 0; index < call.arguments.length; index += 1) {
        const callback = call.arguments[index];
        const callbackSymbol = canonicalSymbol(checker, callback);
        const callbackDeclaration = ts.isFunctionLike(callback)
          ? callback
          : declarationOf(
              callbackSymbol,
              (candidate) =>
                candidate.getSourceFile() === scope.getSourceFile() &&
                (ts.isFunctionLike(candidate) ||
                  (ts.isVariableDeclaration(candidate) &&
                    Boolean(callableBody(candidate))) ||
                  (ts.isPropertyAssignment(candidate) &&
                    Boolean(callableBody(candidate)))),
            );
        if (
          callbackDeclaration &&
          (ts.isFunctionLike(callback) ||
            callInvokesCallbackArgument(checker, call, index)) &&
          callableCanReachScope(callbackDeclaration, scopeSymbol, nextVisited)
        )
          return true;
      }
    }
    return false;
  }

  function hasIndirectRecursiveInvocationBetween(start, cleanup) {
    const scope = containingFunction(start);
    if (!scope || containingFunction(cleanup) !== scope) return false;
    const scopeSymbol = canonicalSymbol(checker, scope.name || scope);
    if (!scopeSymbol) return false;
    const body = callableBody(scope);
    if (!body) return false;
    function callbackCanReachScope(call, index) {
      const argument = call.arguments[index];
      const callbackSymbol = canonicalSymbol(checker, argument);
      const callbackDeclaration = ts.isFunctionLike(argument)
        ? argument
        : declarationOf(
            callbackSymbol,
            (candidate) =>
              candidate.getSourceFile() === scope.getSourceFile() &&
              (ts.isFunctionLike(candidate) ||
                (ts.isVariableDeclaration(candidate) &&
                  Boolean(callableBody(candidate))) ||
                (ts.isPropertyAssignment(candidate) &&
                  Boolean(callableBody(candidate)))),
          );
      return Boolean(
        callbackDeclaration &&
        (ts.isFunctionLike(argument) ||
          callInvokesCallbackArgument(checker, call, index)) &&
        callableCanReachScope(callbackDeclaration, scopeSymbol),
      );
    }
    function callCanReachScope(call) {
      const callee = canonicalSymbol(checker, call.expression);
      if (callee === scopeSymbol) return true;
      const declaration = declarationOf(
        callee,
        (candidate) =>
          candidate.getSourceFile() === scope.getSourceFile() &&
          (ts.isFunctionLike(candidate) ||
            (ts.isVariableDeclaration(candidate) &&
              Boolean(callableBody(candidate))) ||
            (ts.isPropertyAssignment(candidate) &&
              Boolean(callableBody(candidate)))),
      );
      return Boolean(
        declaration && callableCanReachScope(declaration, scopeSymbol),
      );
    }
    return (
      walk(
        body,
        (node) =>
          ts.isCallExpression(node) &&
          node.pos > start.end &&
          node.pos < cleanup.pos &&
          (callCanReachScope(node) ||
            node.arguments.some((_argument, index) =>
              callbackCanReachScope(node, index),
            )),
        (node) => node !== body && ts.isFunctionLike(node),
        checker,
      ).length > 0
    );
  }

  function hasUncleanedStartBetween(start, cleanup) {
    return startCalls.some((nextStart) => {
      if (
        nextStart === start ||
        nextStart.getSourceFile() !== start.getSourceFile() ||
        nextStart.pos <= start.pos ||
        nextStart.pos >= cleanup.pos ||
        !callsCanSharePath(start, nextStart)
      )
        return false;
      return !cleanupCalls.some(
        (intermediateCleanup) =>
          intermediateCleanup.getSourceFile() === start.getSourceFile() &&
          intermediateCleanup.pos > start.pos &&
          intermediateCleanup.pos < nextStart.pos &&
          callsCanSharePath(start, intermediateCleanup) &&
          !cleanupHasConditionalPath(intermediateCleanup) &&
          !cleanupHasReachableExitBetween(start, intermediateCleanup),
      );
    });
  }

  return startCalls.every((start) =>
    cleanupCalls.some((cleanup) => {
      const cleanupRegistration = callbackRegistration(
        containingFunction(cleanup),
      );
      const sharedScope = containingFunction(start);
      const registeredAfterStart =
        cleanupRegistration &&
        sharedScope &&
        containingFunction(cleanupRegistration) === sharedScope &&
        cleanupRegistration.pos > start.pos &&
        callsCanSharePath(start, cleanupRegistration);
      const crossSource =
        allowCrossSource && cleanup.getSourceFile() !== start.getSourceFile();
      if (
        (!allowCrossSource &&
          cleanup.getSourceFile() !== start.getSourceFile()) ||
        (!crossSource && cleanup.pos <= start.pos && !registeredAfterStart) ||
        !callsCanSharePath(start, cleanup) ||
        startMayRepeat(start) ||
        hasRecursiveInvocationBetween(start, cleanup) ||
        hasIndirectRecursiveInvocationBetween(start, cleanup)
      )
        return false;
      const effectCleanup = Boolean(
        cleanupRegistration && isReactEffectRegistration(cleanupRegistration),
      );
      if (
        cleanupHasConditionalPath(cleanup) ||
        cleanupHasReachableExitBetween(start, cleanup) ||
        (hasUncleanedStartBetween(start, cleanup) &&
          !(allowCrossSource && effectCleanup))
      )
        return false;
      if (
        allowCrossSource &&
        cleanup.getSourceFile() !== start.getSourceFile()
      ) {
        return effectCleanup;
      }
      const startSites = invocationSites(start);
      const cleanupSites = invocationSites(cleanup);
      if (!startSites.length || !cleanupSites.length) return false;
      if (registeredAfterStart) return true;
      return startSites.some((startSite) =>
        cleanupSites.some((cleanupSite) => {
          if (startSite === cleanupSite) return true;
          return (
            cleanupSite.getSourceFile() === startSite.getSourceFile() &&
            cleanupSite.pos > startSite.pos &&
            callsCanSharePath(startSite, cleanupSite)
          );
        }),
      );
    }),
  );
}

function memberReachableNodes(
  checker,
  factory,
  memberSymbol,
  requireCallbackInvocation = false,
) {
  const pending = [];
  for (const declaration of memberSymbol?.declarations || []) {
    if (ts.isMethodDeclaration(declaration)) {
      pending.push(declaration);
    } else if (ts.isPropertyAssignment(declaration)) {
      const target = canonicalSymbol(checker, declaration.initializer);
      const callable = localCallableDeclaration(target, factory);
      pending.push(callable || declaration.initializer);
    } else if (ts.isShorthandPropertyAssignment(declaration)) {
      const target = canonicalSymbol(
        checker,
        checker.getShorthandAssignmentValueSymbol(declaration) ||
          declaration.name,
      );
      const callable = localCallableDeclaration(target, factory);
      if (callable) pending.push(callable);
    }
  }
  return pending.flatMap((entry) =>
    reachableNodesFromCallable(checker, entry, requireCallbackInvocation),
  );
}

function lifecycleUpdatesField(checker, factory, memberSymbol, field) {
  const snapshotMember = returnedMemberSymbol(checker, factory, "getSnapshot");
  const snapshotSymbols = new Set(
    memberReachableNodes(checker, factory, snapshotMember)
      .filter(ts.isIdentifier)
      .map((node) => canonicalSymbol(checker, node))
      .filter(Boolean),
  );

  function rootIsSnapshot(expression) {
    return snapshotSymbols.has(rootIdentifierSymbol(checker, expression));
  }

  function belongsToSnapshot(candidate) {
    if (
      ts.isBinaryExpression(candidate) &&
      candidate.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isPropertyAccessExpression(candidate.left) &&
      candidate.left.name.text === field &&
      rootIsSnapshot(candidate.left.expression)
    )
      return true;
    let current = candidate;
    while (current && current !== factory) {
      const parent = current.parent;
      if (!parent) break;
      if (
        ts.isBinaryExpression(parent) &&
        parent.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
        parent.right === current &&
        rootIsSnapshot(parent.left)
      )
        return true;
      if (
        ts.isVariableDeclaration(parent) &&
        parent.initializer === current &&
        rootIsSnapshot(parent.name)
      )
        return true;
      if (ts.isCallExpression(parent)) {
        const index = parent.arguments.indexOf(current);
        if (
          index > 0 &&
          parent.arguments.some(
            (argument, argumentIndex) =>
              argumentIndex < index && rootIsSnapshot(argument),
          )
        )
          return true;
      }
      current = parent;
    }
    return false;
  }

  return memberReachableNodes(checker, factory, memberSymbol).some((node) => {
    if (
      (ts.isPropertyAssignment(node) ||
        ts.isShorthandPropertyAssignment(node)) &&
      node.name &&
      (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name)) &&
      node.name.text === field &&
      belongsToSnapshot(node)
    )
      return true;
    return (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isPropertyAccessExpression(node.left) &&
      node.left.name.text === field &&
      belongsToSnapshot(node)
    );
  });
}

function lifecycleQueryResultReachesField(
  checker,
  factory,
  memberSymbol,
  parameterIdentity,
  binding,
  field,
) {
  if (!parameterIdentity || !binding) return false;
  const reachable = memberReachableNodes(checker, factory, memberSymbol);
  const sourceAccesses = reachable.filter(
    (node) =>
      (ts.isPropertyAccessExpression(node) &&
        node.name.text === binding &&
        receiverSymbol(checker, node.expression) === parameterIdentity) ||
      (ts.isElementAccessExpression(node) &&
        ts.isStringLiteral(node.argumentExpression) &&
        node.argumentExpression.text === binding &&
        receiverSymbol(checker, node.expression) === parameterIdentity),
  );
  let sourceCalls = reachable.filter((node) => {
    if (!ts.isCallExpression(node)) return false;
    const callee = node.expression;
    return (
      (ts.isPropertyAccessExpression(callee) &&
        callee.name.text === binding &&
        receiverSymbol(checker, callee.expression) === parameterIdentity) ||
      (ts.isElementAccessExpression(callee) &&
        ts.isStringLiteral(callee.argumentExpression) &&
        callee.argumentExpression.text === binding &&
        receiverSymbol(checker, callee.expression) === parameterIdentity)
    );
  });
  if (!sourceCalls.length && !sourceAccesses.length) {
    sourceCalls = reachable.filter((node) => {
      if (!ts.isCallExpression(node)) return false;
      const callee = node.expression;
      return (
        (ts.isPropertyAccessExpression(callee) ||
          ts.isElementAccessExpression(callee)) &&
        receiverSymbol(checker, callee.expression) === parameterIdentity
      );
    });
  }
  if (!sourceCalls.length && !sourceAccesses.length) return false;
  const sourceNodes = new Set([...sourceCalls, ...sourceAccesses]);
  const tainted = new Set();

  function containsTaint(node) {
    let current = node;
    while (
      ts.isParenthesizedExpression(current) ||
      ts.isAsExpression(current) ||
      ts.isTypeAssertionExpression(current) ||
      ts.isSatisfiesExpression(current) ||
      ts.isNonNullExpression(current) ||
      ts.isAwaitExpression(current)
    )
      current = current.expression;
    if (
      ts.isBinaryExpression(current) &&
      current.operatorToken.kind === ts.SyntaxKind.CommaToken
    )
      return containsTaint(current.right);
    if (sourceNodes.has(current)) return true;
    if (ts.isCallExpression(current)) {
      const argumentCarriesTaint = current.arguments.some((argument) =>
        containsTaint(argument),
      );
      if (argumentCarriesTaint) {
        const argumentIndex = current.arguments.findIndex((argument) =>
          containsTaint(argument),
        );
        if (
          argumentIndex < 0 ||
          !callPreservesArgument(checker, current, argumentIndex)
        )
          return false;
      }
    }
    return (
      walk(
        current,
        (candidate) => {
          const symbol = ts.isShorthandPropertyAssignment(candidate)
            ? canonicalSymbol(
                checker,
                checker.getShorthandAssignmentValueSymbol(candidate) ||
                  candidate.name,
              )
            : canonicalSymbol(checker, candidate);
          return sourceNodes.has(candidate) || tainted.has(symbol);
        },
        (candidate) => ts.isFunctionLike(candidate),
      ).length > 0
    );
  }

  function bindingValue(source, binding, index) {
    if (!source) return null;
    let current = source;
    while (
      ts.isParenthesizedExpression(current) ||
      ts.isAsExpression(current) ||
      ts.isTypeAssertionExpression(current) ||
      ts.isSatisfiesExpression(current) ||
      ts.isNonNullExpression(current)
    )
      current = current.expression;
    if (ts.isArrayLiteralExpression(current)) {
      if (ts.isBindingElement(binding) && binding.dotDotDotToken)
        return current;
      return current.elements[index] || null;
    }
    if (ts.isObjectLiteralExpression(current)) {
      const propertyName =
        ts.isBindingElement(binding) && binding.propertyName
          ? binding.propertyName
          : ts.isBindingElement(binding)
            ? binding.name
            : binding;
      const name =
        propertyName &&
        (ts.isIdentifier(propertyName) ||
          ts.isStringLiteral(propertyName) ||
          ts.isNumericLiteral(propertyName))
          ? propertyName.text
          : null;
      return name === null ? null : objectPropertyValue(current, name);
    }
    return null;
  }

  function addTarget(name, source = null) {
    if (ts.isIdentifier(name)) {
      if (source && !containsTaint(source)) return false;
      const symbol = canonicalSymbol(checker, name);
      if (symbol && !tainted.has(symbol)) {
        tainted.add(symbol);
        return true;
      }
      return false;
    }
    if (ts.isArrayBindingPattern(name) || ts.isObjectBindingPattern(name)) {
      let changed = false;
      for (let index = 0; index < name.elements.length; index += 1) {
        const element = name.elements[index];
        if (!ts.isOmittedExpression(element))
          changed =
            addTarget(element.name, bindingValue(source, element, index)) ||
            changed;
      }
      return changed;
    }
    const root = rootIdentifierSymbol(checker, name);
    if (root && !tainted.has(root)) {
      tainted.add(root);
      return true;
    }
    return false;
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (const node of reachable) {
      if (
        ts.isVariableDeclaration(node) &&
        node.initializer &&
        containsTaint(node.initializer)
      )
        changed = addTarget(node.name, node.initializer) || changed;
      if (
        ts.isBinaryExpression(node) &&
        node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
        containsTaint(node.right)
      )
        changed = addTarget(node.left, node.right) || changed;
      if (ts.isCallExpression(node)) {
        const callee = canonicalSymbol(checker, node.expression);
        const declaration = declarationOf(
          callee,
          (candidate) =>
            candidate.pos >= factory.pos &&
            candidate.end <= factory.end &&
            (ts.isFunctionLike(candidate) ||
              (ts.isVariableDeclaration(candidate) &&
                Boolean(callableBody(candidate)))),
        );
        const parameters =
          declaration &&
          ts.isVariableDeclaration(declaration) &&
          ts.isFunctionLike(declaration.initializer)
            ? declaration.initializer.parameters
            : declaration?.parameters || [];
        for (let index = 0; index < node.arguments.length; index += 1) {
          if (parameters[index] && containsTaint(node.arguments[index]))
            changed =
              addTarget(parameters[index].name, node.arguments[index]) ||
              changed;
        }
      }
    }
  }

  const snapshotMember = returnedMemberSymbol(checker, factory, "getSnapshot");
  const snapshotSymbols = new Set(
    memberReachableNodes(checker, factory, snapshotMember)
      .filter(ts.isIdentifier)
      .map((node) => canonicalSymbol(checker, node))
      .filter(Boolean),
  );
  function belongsToSnapshot(candidate) {
    let current = candidate;
    while (current && current !== factory) {
      const parent = current.parent;
      if (!parent) break;
      if (
        ts.isBinaryExpression(parent) &&
        parent.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
        parent.right === current &&
        snapshotSymbols.has(rootIdentifierSymbol(checker, parent.left))
      )
        return true;
      if (
        ts.isVariableDeclaration(parent) &&
        parent.initializer === current &&
        snapshotSymbols.has(rootIdentifierSymbol(checker, parent.name))
      )
        return true;
      current = parent;
    }
    return false;
  }

  function snapshotWriteFor(candidate) {
    if (
      ts.isBinaryExpression(candidate) &&
      candidate.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      snapshotSymbols.has(rootIdentifierSymbol(checker, candidate.left))
    )
      return candidate;
    let current = candidate;
    while (current && current !== factory) {
      const parent = current.parent;
      if (!parent) break;
      if (
        ts.isBinaryExpression(parent) &&
        parent.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
        parent.right === current &&
        snapshotSymbols.has(rootIdentifierSymbol(checker, parent.left))
      )
        return parent;
      if (
        ts.isVariableDeclaration(parent) &&
        parent.initializer === current &&
        snapshotSymbols.has(rootIdentifierSymbol(checker, parent.name))
      )
        return parent;
      current = parent;
    }
    return null;
  }

  function accessPath(expression) {
    if (!expression) return null;
    let current = expression;
    const properties = [];
    let unknownProperty = false;
    while (true) {
      while (
        ts.isParenthesizedExpression(current) ||
        ts.isAsExpression(current) ||
        ts.isTypeAssertionExpression(current) ||
        ts.isSatisfiesExpression(current) ||
        ts.isNonNullExpression(current)
      )
        current = current.expression;
      if (
        !ts.isPropertyAccessExpression(current) &&
        !ts.isElementAccessExpression(current)
      )
        break;
      properties.unshift(
        ts.isPropertyAccessExpression(current)
          ? current.name.text
          : (() => {
              let value = staticPrimitiveValue(
                checker,
                current.argumentExpression,
              );
              if (
                value === STATIC_UNKNOWN &&
                ts.isIdentifier(current.argumentExpression)
              ) {
                const declaration = declarationOf(
                  canonicalSymbol(checker, current.argumentExpression),
                  ts.isVariableDeclaration,
                );
                if (
                  declaration?.initializer &&
                  ts.isStringLiteral(declaration.initializer)
                )
                  value = declaration.initializer.text;
              }
              if (typeof value === "string") return value;
              unknownProperty = true;
              return "";
            })(),
      );
      current = current.expression;
    }
    if (!ts.isIdentifier(current)) return null;
    const root = canonicalSymbol(checker, current);
    return root ? { root, properties, unknownProperty } : null;
  }

  function objectPropertyValue(expression, propertyName) {
    let current = expression;
    while (
      ts.isParenthesizedExpression(current) ||
      ts.isAsExpression(current) ||
      ts.isTypeAssertionExpression(current) ||
      ts.isSatisfiesExpression(current) ||
      ts.isNonNullExpression(current)
    )
      current = current.expression;
    if (!ts.isObjectLiteralExpression(current)) return null;
    let result = null;
    for (const property of current.properties) {
      if (ts.isSpreadAssignment(property)) {
        const spread = objectPropertyValue(property.expression, propertyName);
        if (spread) result = spread;
        continue;
      }
      const name = property.name;
      if (
        !name ||
        (!ts.isIdentifier(name) &&
          !ts.isStringLiteral(name) &&
          !ts.isNumericLiteral(name)) ||
        name.text !== propertyName
      )
        continue;
      result =
        ts.isPropertyAssignment(property) ||
        ts.isShorthandPropertyAssignment(property)
          ? property
          : result;
      if (ts.isPropertyAssignment(property)) result = property.initializer;
    }
    return result;
  }

  function mergeTaintStates(states) {
    const normalized = states.filter((state) => state);
    if (!normalized.length) return null;
    if (normalized.every((state) => state === "tainted")) return "tainted";
    if (normalized.every((state) => state === "untainted")) return "untainted";
    return "mixed";
  }

  function pathWriteRecords(path, before) {
    const scope = containingFunction(before);
    return reachable
      .filter(
        (node) => node.pos < before.pos && containingFunction(node) === scope,
      )
      .flatMap((node) => {
        if (
          ts.isVariableDeclaration(node) &&
          ts.isIdentifier(node.name) &&
          canonicalSymbol(checker, node.name) === path.root &&
          node.initializer
        )
          return [{ node, properties: [], value: node.initializer }];
        if (
          !ts.isBinaryExpression(node) ||
          node.operatorToken.kind < ts.SyntaxKind.FirstAssignment ||
          node.operatorToken.kind > ts.SyntaxKind.LastAssignment
        )
          return [];
        const target = accessPath(node.left);
        if (
          !target ||
          target.root !== path.root ||
          target.unknownProperty ||
          target.properties.some(
            (property, index) => path.properties[index] !== property,
          ) ||
          target.properties.length > path.properties.length
        )
          return [];
        return [
          {
            node,
            properties: target.properties,
            value:
              node.operatorToken.kind === ts.SyntaxKind.EqualsToken
                ? node.right
                : null,
          },
        ];
      })
      .sort((left, right) => left.node.pos - right.node.pos);
  }

  function propertyPathTaintState(expression, visited = new Set()) {
    const path = accessPath(expression);
    if (!path || path.unknownProperty || !path.properties.length) return null;
    const key = `${symbolId(checker, path.root)}:${path.properties.join(".")}`;
    if (visited.has(key)) return "mixed";
    const nextVisited = new Set(visited).add(key);
    const writes = pathWriteRecords(path, expression);
    if (!writes.length) return tainted.has(path.root) ? "mixed" : null;
    function contextsContain(later, earlier) {
      return branchContexts(later.node).every((context) =>
        branchContexts(earlier.node).some(
          (candidate) =>
            candidate.control === context.control &&
            candidate.branch === context.branch,
        ),
      );
    }
    function guaranteedOverwrite(earlier, later) {
      return (
        later.node.pos > earlier.node.pos &&
        callsCanSharePath(earlier.node, later.node) &&
        contextsContain(later, earlier)
      );
    }
    function branchCoverage(earlier) {
      const earlierContexts = branchContexts(earlier.node);
      return writes.some((candidate) => {
        if (candidate.node.pos <= earlier.node.pos) return false;
        const contexts = branchContexts(candidate.node);
        return contexts.some((context) => {
          if (
            !ts.isIfStatement(context.control) ||
            earlierContexts.some(
              (entry) => entry.control === context.control,
            ) ||
            contexts.length !== 1
          )
            return false;
          return writes.some((sibling) => {
            if (sibling === candidate || sibling.node.pos <= earlier.node.pos)
              return false;
            const siblingContexts = branchContexts(sibling.node);
            return siblingContexts.some(
              (entry) =>
                entry.control === context.control &&
                entry.branch !== context.branch &&
                siblingContexts.length === 1,
            );
          });
        });
      });
    }
    const effectiveWrites = writes.filter(
      (write, index) =>
        !writes.some(
          (later, laterIndex) =>
            laterIndex > index && guaranteedOverwrite(write, later),
        ) && !branchCoverage(write),
    );
    function writeTaintState(write) {
      const remaining = path.properties.slice(write.properties.length);
      if (!remaining.length)
        return write.value
          ? valueTaintState(write.value, nextVisited)
          : "mixed";
      const value = objectPropertyValue(write.value, remaining[0]);
      if (!value) return "mixed";
      return remaining.length === 1
        ? valueTaintState(value, nextVisited)
        : propertyPathTaintState(value, nextVisited) || "mixed";
    }
    return mergeTaintStates(effectiveWrites.map(writeTaintState)) || "mixed";
  }

  function parameterTaintState(symbol, visited = new Set()) {
    const parameter = declarationOf(symbol, ts.isParameter);
    if (!parameter) return null;
    const owner = containingFunction(parameter);
    if (!owner) return null;
    const ownerSymbol = canonicalSymbol(
      checker,
      owner.name ||
        (ts.isVariableDeclaration(owner.parent) ? owner.parent.name : owner),
    );
    if (!ownerSymbol || visited.has(ownerSymbol)) return null;
    const index = owner.parameters.indexOf(parameter);
    if (index < 0) return null;
    const nextVisited = new Set(visited).add(ownerSymbol);
    const states = reachable
      .filter(
        (node) =>
          ts.isCallExpression(node) &&
          canonicalSymbol(checker, node.expression) === ownerSymbol &&
          node.arguments[index],
      )
      .map((node) => valueTaintState(node.arguments[index], nextVisited));
    return mergeTaintStates(states);
  }

  function assignmentTargetPaths(expression) {
    if (!expression) return [];
    let current = expression;
    while (ts.isParenthesizedExpression(current)) current = current.expression;
    const direct = accessPath(current);
    if (direct) return [direct];
    if (ts.isObjectLiteralExpression(current)) {
      const paths = [];
      for (const property of current.properties) {
        if (ts.isShorthandPropertyAssignment(property)) {
          const root = canonicalSymbol(
            checker,
            checker.getShorthandAssignmentValueSymbol(property) ||
              property.name,
          );
          if (root) paths.push({ root, properties: [] });
        } else if (ts.isPropertyAssignment(property)) {
          paths.push(...assignmentTargetPaths(property.initializer));
        } else if (ts.isSpreadAssignment(property)) {
          paths.push(...assignmentTargetPaths(property.expression));
        }
      }
      return paths;
    }
    if (ts.isArrayLiteralExpression(current)) {
      const paths = [];
      for (const element of current.elements) {
        if (ts.isSpreadElement(element))
          paths.push(...assignmentTargetPaths(element.expression));
        else if (!ts.isOmittedExpression(element))
          paths.push(...assignmentTargetPaths(element));
      }
      return paths;
    }
    return [];
  }

  function snapshotWriteIsKilled(write) {
    if (!write) return false;
    const scope = containingFunction(write);
    return reachable.some((node) => {
      if (
        node === write ||
        node.pos <= write.end ||
        containingFunction(node) !== scope ||
        isStaticallyUnreachableBranch(checker, node)
      )
        return false;
      const targetExpression =
        ts.isVariableDeclaration(node) && node.initializer
          ? node.name
          : ts.isBinaryExpression(node) &&
              node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
              node.operatorToken.kind <= ts.SyntaxKind.LastAssignment
            ? node.left
            : (ts.isPrefixUnaryExpression(node) ||
                  ts.isPostfixUnaryExpression(node)) &&
                (node.operator === ts.SyntaxKind.PlusPlusToken ||
                  node.operator === ts.SyntaxKind.MinusMinusToken)
              ? node.operand
              : ts.isDeleteExpression(node)
                ? node.expression
                : null;
      return assignmentTargetPaths(targetExpression).some(
        (target) =>
          snapshotSymbols.has(target.root) &&
          (target.unknownProperty ||
            target.properties.length === 0 ||
            target.properties[0] === field),
      );
    });
  }

  function localWritesFor(symbol, before) {
    const scope = containingFunction(before);
    return reachable
      .filter(
        (node) => node.pos < before.pos && containingFunction(node) === scope,
      )
      .map((node) => {
        if (
          ts.isVariableDeclaration(node) &&
          ts.isIdentifier(node.name) &&
          canonicalSymbol(checker, node.name) === symbol
        )
          return { node, value: node.initializer || null };
        if (
          ts.isBinaryExpression(node) &&
          node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
          node.operatorToken.kind <= ts.SyntaxKind.LastAssignment
        ) {
          let target = node.left;
          while (ts.isParenthesizedExpression(target))
            target = target.expression;
          if (
            ts.isIdentifier(target) &&
            canonicalSymbol(checker, target) === symbol
          )
            return {
              node,
              value:
                node.operatorToken.kind === ts.SyntaxKind.EqualsToken
                  ? node.right
                  : null,
            };
          if (
            ts.isObjectLiteralExpression(target) ||
            ts.isArrayLiteralExpression(target) ||
            ts.isObjectBindingPattern(target) ||
            ts.isArrayBindingPattern(target)
          ) {
            const writesSymbol = walk(target, ts.isIdentifier).some(
              (identifier) =>
                canonicalSymbol(
                  checker,
                  ts.isShorthandPropertyAssignment(identifier.parent)
                    ? checker.getShorthandAssignmentValueSymbol(
                        identifier.parent,
                      ) || identifier
                    : identifier,
                ) === symbol,
            );
            if (writesSymbol) return { node, value: null };
          }
        }
        if (
          (ts.isPrefixUnaryExpression(node) ||
            ts.isPostfixUnaryExpression(node)) &&
          (node.operator === ts.SyntaxKind.PlusPlusToken ||
            node.operator === ts.SyntaxKind.MinusMinusToken) &&
          ts.isIdentifier(node.operand) &&
          canonicalSymbol(checker, node.operand) === symbol
        )
          return { node, value: null };
        return null;
      })
      .filter(Boolean)
      .sort((left, right) => left.node.pos - right.node.pos);
  }

  function valueTaintState(node, visited = new Set()) {
    let current = node;
    while (
      ts.isParenthesizedExpression(current) ||
      ts.isAsExpression(current) ||
      ts.isTypeAssertionExpression(current) ||
      ts.isSatisfiesExpression(current) ||
      ts.isNonNullExpression(current) ||
      ts.isAwaitExpression(current)
    )
      current = current.expression;
    if (ts.isBinaryExpression(current)) {
      if (current.operatorToken.kind === ts.SyntaxKind.CommaToken)
        return valueTaintState(current.right, visited);
      if (
        current.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken ||
        current.operatorToken.kind === ts.SyntaxKind.BarBarToken ||
        current.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken
      ) {
        const left = valueTaintState(current.left, visited);
        const right = valueTaintState(current.right, visited);
        if (left === "mixed" || right === "mixed") return "mixed";
        if (left === right) return left;
        return "mixed";
      }
    }
    if (ts.isConditionalExpression(current)) {
      const whenTrue = valueTaintState(current.whenTrue, visited);
      const whenFalse = valueTaintState(current.whenFalse, visited);
      if (whenTrue === "mixed" || whenFalse === "mixed") return "mixed";
      if (whenTrue === whenFalse) return whenTrue;
      return "mixed";
    }
    if (
      ts.isDeleteExpression(current) ||
      ts.isTypeOfExpression(current) ||
      ts.isVoidExpression(current) ||
      ts.isPrefixUnaryExpression(current) ||
      ts.isPostfixUnaryExpression(current)
    )
      return "untainted";
    if (
      ts.isPropertyAccessExpression(current) ||
      ts.isElementAccessExpression(current)
    ) {
      const propertyState = propertyPathTaintState(current, visited);
      if (propertyState) return propertyState;
    }
    if (sourceNodes.has(current)) return "tainted";
    const symbol = ts.isShorthandPropertyAssignment(current)
      ? canonicalSymbol(
          checker,
          checker.getShorthandAssignmentValueSymbol(current) || current.name,
        )
      : canonicalSymbol(checker, current);
    const parameterState = symbol && parameterTaintState(symbol, visited);
    if (parameterState) return parameterState;
    if (symbol && tainted.has(symbol)) return "tainted";
    return containsTaint(current) ? "tainted" : "untainted";
  }

  function containsDirectSource(node) {
    return (
      walk(
        node,
        (candidate) => sourceNodes.has(candidate),
        (candidate) => ts.isFunctionLike(candidate),
        checker,
      ).length > 0
    );
  }

  function containsMixedTaint(node) {
    const state = valueTaintState(node);
    if (state === "mixed") return true;
    if (state === "untainted") return containsTaint(node);
    return false;
  }

  function queryValueWasKilled(value) {
    const identifier = ts.isShorthandPropertyAssignment(value)
      ? value.name
      : ts.isIdentifier(value)
        ? value
        : null;
    if (!identifier) return false;
    const symbol = canonicalSymbol(
      checker,
      ts.isShorthandPropertyAssignment(value)
        ? checker.getShorthandAssignmentValueSymbol(value) || identifier
        : identifier,
    );
    if (!symbol) return false;
    const writes = localWritesFor(symbol, identifier);
    const latest = writes.at(-1);
    if (writes.some((write) => write.value && containsMixedTaint(write.value)))
      return true;
    const taintedWrites = writes.filter(
      (write) => write.value && containsTaint(write.value),
    );
    const untaintedWrites = writes.filter(
      (write) => !write.value || !containsTaint(write.value),
    );
    if (
      taintedWrites.some((tainted) =>
        untaintedWrites.some(
          (untainted) =>
            untainted !== tainted &&
            !callsCanSharePath(tainted.node, untainted.node),
        ),
      )
    )
      return true;
    if (!latest || (latest.value && containsTaint(latest.value))) return false;
    return true;
  }

  return reachable.some((node) => {
    if (
      (ts.isPropertyAssignment(node) ||
        ts.isShorthandPropertyAssignment(node)) &&
      node.name &&
      (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name)) &&
      node.name.text === field &&
      belongsToSnapshot(node)
    ) {
      const value = ts.isPropertyAssignment(node) ? node.initializer : node;
      return (
        valueTaintState(value) === "tainted" &&
        !queryValueWasKilled(value) &&
        !snapshotWriteIsKilled(snapshotWriteFor(node))
      );
    }
    return (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isPropertyAccessExpression(node.left) &&
      node.left.name.text === field &&
      snapshotSymbols.has(
        rootIdentifierSymbol(checker, node.left.expression),
      ) &&
      valueTaintState(node.right) === "tainted" &&
      !queryValueWasKilled(node.right) &&
      !snapshotWriteIsKilled(snapshotWriteFor(node))
    );
  });
}

function lifecycleStateHasConsumer(
  checker,
  program,
  entrySource,
  sourceFile,
  rootPath,
  field,
  owner,
) {
  const ownerDeclaration = callableDeclarationByName(
    checker,
    sourceFile,
    owner,
  );
  if (!ownerDeclaration) return false;
  const nodes = reachableNodesFromCallable(checker, ownerDeclaration);
  const sourceFiles = program
    .getSourceFiles()
    .filter((candidate) => !candidate.isDeclarationFile);
  const parts = String(rootPath || "")
    .split(".")
    .filter(Boolean);
  function matchesRoot(expression) {
    let current = expression;
    for (let index = parts.length - 1; index >= 1; index -= 1) {
      if (
        !ts.isPropertyAccessExpression(current) ||
        current.name.text !== parts[index]
      )
        return false;
      current = current.expression;
    }
    return (
      parts.length > 0 &&
      ts.isIdentifier(current) &&
      current.text === parts[0] &&
      Boolean(canonicalSymbol(checker, current))
    );
  }

  function sourceIsReachable(source) {
    return (
      source === entrySource ||
      sourceReachableFromEntry(program, checker, entrySource, source)
    );
  }

  function callableIsReachable(callable) {
    return callableReachableFromEntry(
      program,
      checker,
      entrySource,
      callable,
      true,
    );
  }

  function callSitesFor(symbol) {
    if (!symbol) return [];
    return sourceFiles.flatMap((candidate) =>
      walk(candidate, ts.isCallExpression).filter(
        (call) => canonicalSymbol(checker, call.expression) === symbol,
      ),
    );
  }

  function callSiteIsReachable(call) {
    const scope = containingFunction(call);
    return scope
      ? callableIsReachable(scope)
      : sourceIsReachable(call.getSourceFile());
  }

  function directAssignmentTarget(node) {
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
      node.operatorToken.kind <= ts.SyntaxKind.LastAssignment
    )
      return node.left;
    if (
      (ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) &&
      (node.operator === ts.SyntaxKind.PlusPlusToken ||
        node.operator === ts.SyntaxKind.MinusMinusToken)
    )
      return node.operand;
    if (ts.isDeleteExpression(node)) return node.expression;
    return null;
  }

  function symbolWasWrittenBetween(symbol, after, before) {
    return nodes.some((node) => {
      if (
        node.pos <= after.end ||
        node.pos >= before.pos ||
        isStaticallyUnreachableBranch(checker, node)
      )
        return false;
      const target = directAssignmentTarget(node);
      return (
        target &&
        ts.isIdentifier(target) &&
        canonicalSymbol(checker, target) === symbol
      );
    });
  }

  function jsxElementFor(node) {
    let current = node;
    while (current && current.parent) {
      if (
        ts.isJsxElement(current) ||
        ts.isJsxSelfClosingElement(current) ||
        ts.isJsxOpeningElement(current)
      )
        return current;
      current = current.parent;
    }
    return null;
  }

  function importedSourcesFromDynamicImport(call) {
    const specifier = call.arguments[0];
    if (!specifier || !ts.isStringLiteral(specifier)) return [];
    const sources = new Set();
    const moduleSymbol = canonicalSymbol(checker, specifier);
    for (const declaration of moduleSymbol?.declarations || []) {
      if (ts.isSourceFile(declaration)) sources.add(declaration);
    }
    if (specifier.text.startsWith(".")) {
      const base = path.resolve(
        path.dirname(call.getSourceFile().fileName),
        specifier.text,
      );
      for (const candidate of [
        base,
        `${base}.js`,
        `${base}.ts`,
        `${base}.tsx`,
      ]) {
        const source = sourceFiles.find(
          (entry) => normalize(entry.fileName) === normalize(candidate),
        );
        if (source) sources.add(source);
      }
    }
    return [...sources];
  }

  function jsxTagRepresents(element, targetSymbol) {
    const tagSymbol = canonicalSymbol(checker, element.tagName);
    if (!tagSymbol) return false;
    if (tagSymbol === targetSymbol) return true;
    for (const declaration of tagSymbol.declarations || []) {
      if (!ts.isVariableDeclaration(declaration) || !declaration.initializer)
        continue;
      for (const call of walk(declaration.initializer, ts.isCallExpression)) {
        if (call.expression.kind !== ts.SyntaxKind.ImportKeyword) continue;
        if (
          importedSourcesFromDynamicImport(call).some(
            (source) =>
              exportedSymbol(checker, source, "default") === targetSymbol,
          )
        )
          return true;
      }
    }
    return false;
  }

  function renderCallConsumes(call) {
    let current = call;
    while (
      current.parent &&
      (ts.isParenthesizedExpression(current.parent) ||
        ts.isAsExpression(current.parent) ||
        ts.isNonNullExpression(current.parent))
    )
      current = current.parent;
    const parent = current.parent;
    if (!parent || !ts.isCallExpression(parent)) return false;
    const argumentIndex = parent.arguments.indexOf(current);
    return (
      argumentIndex >= 0 &&
      ts.isPropertyAccessExpression(parent.expression) &&
      parent.expression.name.text === "render" &&
      callSiteIsReachable(parent)
    );
  }

  function callableResultIsConsumed(callable, visited = new Set()) {
    const symbol = canonicalSymbol(checker, callable?.name || callable);
    if (!symbol || visited.has(symbol)) return false;
    const nextVisited = new Set(visited).add(symbol);

    for (const candidate of sourceFiles) {
      for (const element of walk(
        candidate,
        (node) =>
          ts.isJsxElement(node) ||
          ts.isJsxSelfClosingElement(node) ||
          ts.isJsxOpeningElement(node),
      )) {
        if (!jsxTagRepresents(element, symbol)) continue;
        if (!jsxElementIsRendered(checker, element)) continue;
        const scope = containingFunction(element);
        if (!scope) {
          if (sourceIsReachable(candidate)) return true;
        } else if (
          scope !== callable &&
          callableResultIsConsumed(scope, nextVisited)
        ) {
          return true;
        }
      }
    }

    for (const call of callSitesFor(symbol)) {
      if (isStaticallyUnreachableBranch(checker, call)) continue;
      if (!callSiteIsReachable(call)) continue;
      if (renderCallConsumes(call)) return true;
      let current = call;
      while (
        current.parent &&
        (ts.isParenthesizedExpression(current.parent) ||
          ts.isAsExpression(current.parent) ||
          ts.isNonNullExpression(current.parent))
      )
        current = current.parent;
      const parent = current.parent;
      if (parent && ts.isReturnStatement(parent)) {
        const scope = containingFunction(parent);
        if (scope && callableResultIsConsumed(scope, nextVisited)) return true;
      }
    }
    return false;
  }

  function receiverReferencesReachSink(
    receiver,
    assignment,
    visited = new Set(),
  ) {
    const symbol = rootIdentifierSymbol(checker, receiver);
    if (!symbol || visited.has(symbol)) return false;
    const nextVisited = new Set(visited).add(symbol);
    function accessPath(expression) {
      let current = expression;
      const properties = [];
      while (
        ts.isPropertyAccessExpression(current) ||
        (ts.isElementAccessExpression(current) &&
          ts.isStringLiteral(current.argumentExpression))
      ) {
        properties.unshift(
          ts.isPropertyAccessExpression(current)
            ? current.name.text
            : current.argumentExpression.text,
        );
        current = current.expression;
      }
      if (!ts.isIdentifier(current)) return null;
      const root = canonicalSymbol(checker, current);
      return root ? { root, properties } : null;
    }
    const receiverPath = accessPath(receiver);
    const assignedPath = accessPath(assignment.left);
    if (!receiverPath || !assignedPath) return false;
    function overwrittenBefore(candidate) {
      return nodes.some((node) => {
        if (
          node.pos <= assignment.end ||
          node.pos >= candidate.pos ||
          isStaticallyUnreachableBranch(checker, node)
        )
          return false;
        const target = directAssignmentTarget(node);
        const targetPath = target && accessPath(target);
        return Boolean(
          targetPath &&
          targetPath.root === assignedPath.root &&
          (targetPath.properties.length === 0 ||
            sameAccessPath(targetPath, assignedPath)),
        );
      });
    }
    return nodes.some((candidate) => {
      if (candidate.pos <= assignment.end || candidate === assignment)
        return false;
      if (
        ts.isIdentifier(candidate) &&
        canonicalSymbol(checker, candidate) === symbol
      ) {
        if (
          (ts.isPropertyAccessExpression(candidate.parent) ||
            ts.isElementAccessExpression(candidate.parent)) &&
          candidate.parent.expression === candidate
        )
          return false;
        return (
          callsCanSharePath(assignment, candidate) &&
          !overwrittenBefore(candidate) &&
          reachesObservableSink(candidate, nextVisited)
        );
      }
      if (
        !ts.isPropertyAccessExpression(candidate) &&
        !ts.isElementAccessExpression(candidate)
      )
        return false;
      const candidatePath = accessPath(candidate);
      if (
        !candidatePath ||
        (!sameAccessPath(candidatePath, receiverPath) &&
          !sameAccessPath(candidatePath, assignedPath))
      )
        return false;
      if (
        ts.isBinaryExpression(candidate.parent) &&
        candidate.parent.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
        candidate.parent.left === candidate
      )
        return false;
      return (
        callsCanSharePath(assignment, candidate) &&
        !overwrittenBefore(candidate) &&
        reachesObservableSink(candidate, nextVisited)
      );
    });
  }

  function reachesObservableSink(value, visited = new Set()) {
    if (isStaticallyUnreachableBranch(checker, value)) return false;
    let current = value;
    while (current && current !== ownerDeclaration) {
      const parent = current.parent;
      if (!parent) return false;
      if (ts.isVoidExpression(parent) || ts.isExpressionStatement(parent))
        return false;
      if (ts.isReturnStatement(parent) && parent.expression === current)
        return callableResultIsConsumed(ownerDeclaration, visited);
      if (ts.isJsxExpression(parent) || ts.isJsxAttribute(parent)) {
        const element = jsxElementFor(parent);
        return Boolean(
          element &&
          jsxElementIsRendered(checker, element) &&
          callableResultIsConsumed(ownerDeclaration, visited),
        );
      }
      if (
        ts.isArrayLiteralExpression(parent) &&
        ts.isCallExpression(parent.parent) &&
        parent.parent.arguments.indexOf(parent) === 1 &&
        ((ts.isIdentifier(parent.parent.expression) &&
          ["useEffect", "useLayoutEffect", "useInsertionEffect"].includes(
            parent.parent.expression.text,
          )) ||
          (ts.isPropertyAccessExpression(parent.parent.expression) &&
            ["useEffect", "useLayoutEffect", "useInsertionEffect"].includes(
              parent.parent.expression.name.text,
            ))) &&
        callInvokesCallbackArgument(checker, parent.parent, 0)
      )
        return true;
      if (ts.isArrowFunction(parent) && parent.body === current) {
        const call = parent.parent;
        if (call && ts.isCallExpression(call)) {
          const argumentIndex = call.arguments.indexOf(parent);
          if (
            argumentIndex >= 0 &&
            callInvokesCallbackArgument(checker, call, argumentIndex)
          )
            return true;
        }
        return false;
      }
      if (
        (ts.isCallExpression(parent) &&
          (parent.expression === current ||
            parent.arguments.includes(current))) ||
        (ts.isNewExpression(parent) &&
          (parent.expression === current ||
            parent.arguments?.includes(current)))
      ) {
        if (parent.expression === current) return true;
        const argumentIndex = parent.arguments.indexOf(current);
        if (
          argumentIndex >= 0 &&
          ts.isPropertyAccessExpression(parent.expression) &&
          parent.expression.name.text === "render"
        )
          return callSiteIsReachable(parent);
        return (
          argumentIndex >= 0 &&
          callInvokesCallbackArgument(checker, parent, argumentIndex)
        );
      }
      if (
        ts.isBinaryExpression(parent) &&
        parent.operatorToken.kind === ts.SyntaxKind.CommaToken &&
        parent.left === current
      )
        return false;
      if (
        (ts.isPropertyAssignment(parent) ||
          ts.isShorthandPropertyAssignment(parent)) &&
        parent.parent &&
        ts.isObjectLiteralExpression(parent.parent)
      ) {
        const propertyIndex = parent.parent.properties.indexOf(parent);
        const propertyName = parent.name?.text;
        if (
          propertyIndex >= 0 &&
          propertyName &&
          parent.parent.properties
            .slice(propertyIndex + 1)
            .some(
              (property) =>
                ts.isSpreadAssignment(property) ||
                namedProperty(property, propertyName),
            )
        )
          return false;
      }
      if (
        ts.isBinaryExpression(parent) &&
        parent.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
        parent.right === current
      ) {
        if (ts.isIdentifier(parent.left)) {
          const symbol = canonicalSymbol(checker, parent.left);
          if (!symbol || visited.has(symbol)) return false;
          const nextVisited = new Set(visited).add(symbol);
          return nodes.some(
            (use) =>
              use !== parent.left &&
              ts.isIdentifier(use) &&
              canonicalSymbol(checker, use) === symbol &&
              use.pos > parent.end &&
              !symbolWasWrittenBetween(symbol, parent, use) &&
              reachesObservableSink(use, nextVisited),
          );
        }
        if (
          ts.isPropertyAccessExpression(parent.left) ||
          ts.isElementAccessExpression(parent.left)
        )
          return receiverReferencesReachSink(
            parent.left.expression,
            parent,
            visited,
          );
        return false;
      }
      if (
        ts.isBinaryExpression(parent) &&
        parent.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
        parent.left === current
      ) {
        if (
          ts.isPropertyAccessExpression(parent.left) ||
          ts.isElementAccessExpression(parent.left)
        )
          return receiverReferencesReachSink(
            parent.left.expression,
            parent,
            visited,
          );
        return false;
      }
      if (ts.isBindingElement(parent) && parent.name === current) {
        const identifiers = walk(parent.name, ts.isIdentifier);
        return identifiers.some((identifier) => {
          const symbol = canonicalSymbol(checker, identifier);
          if (!symbol || visited.has(symbol)) return false;
          const nextVisited = new Set(visited).add(symbol);
          return nodes.some(
            (use) =>
              ts.isIdentifier(use) &&
              use !== identifier &&
              canonicalSymbol(checker, use) === symbol &&
              !symbolWasWrittenBetween(symbol, parent, use) &&
              reachesObservableSink(use, nextVisited),
          );
        });
      }
      if (ts.isVariableDeclaration(parent) && parent.initializer === current) {
        const identifiers = walk(parent.name, ts.isIdentifier);
        return identifiers.some((identifier) => {
          const symbol = canonicalSymbol(checker, identifier);
          if (!symbol || visited.has(symbol)) return false;
          const nextVisited = new Set(visited).add(symbol);
          return nodes.some(
            (use) =>
              ts.isIdentifier(use) &&
              use !== identifier &&
              canonicalSymbol(checker, use) === symbol &&
              !symbolWasWrittenBetween(symbol, parent, use) &&
              reachesObservableSink(use, nextVisited),
          );
        });
      }
      if (
        ts.isParenthesizedExpression(parent) ||
        ts.isAsExpression(parent) ||
        ts.isTypeAssertionExpression(parent) ||
        ts.isSatisfiesExpression(parent) ||
        ts.isNonNullExpression(parent) ||
        ts.isAwaitExpression(parent) ||
        ts.isPropertyAccessExpression(parent) ||
        ts.isElementAccessExpression(parent) ||
        ts.isBinaryExpression(parent) ||
        ts.isConditionalExpression(parent) ||
        ts.isTemplateExpression(parent) ||
        ts.isArrayLiteralExpression(parent) ||
        ts.isObjectLiteralExpression(parent) ||
        ts.isPropertyAssignment(parent) ||
        ts.isSpreadElement(parent)
      ) {
        current = parent;
        continue;
      }
      return false;
    }
    return false;
  }
  return nodes.some((node) => {
    if (ts.isPropertyAccessExpression(node) && node.name.text === field)
      return matchesRoot(node.expression) && reachesObservableSink(node);
    if (!ts.isBindingElement(node)) return false;
    const name = node.propertyName || node.name;
    if (!ts.isIdentifier(name) || name.text !== field) return false;
    const pattern = node.parent;
    const declaration = pattern && pattern.parent;
    return (
      ts.isVariableDeclaration(declaration) &&
      Boolean(declaration.initializer) &&
      matchesRoot(declaration.initializer) &&
      reachesObservableSink(node.name)
    );
  });
}

function lifecycleConsumerDerivesFromFeatureSnapshot(
  checker,
  program,
  sourceFile,
  rootPath,
  owner,
  factory,
  entrySource,
) {
  const snapshotMember = returnedMemberSymbol(checker, factory, "getSnapshot");
  const ownerDeclaration = callableDeclarationByName(
    checker,
    sourceFile,
    owner,
  );
  if (!snapshotMember || !ownerDeclaration) return false;
  const parts = String(rootPath || "")
    .split(".")
    .filter(Boolean);
  if (!parts.length) return false;

  function jsxTagRepresents(element, targetSymbol) {
    const tagSymbol = canonicalSymbol(checker, element.tagName);
    if (!tagSymbol) return false;
    if (tagSymbol === targetSymbol) return true;
    for (const declaration of tagSymbol.declarations || []) {
      if (!ts.isVariableDeclaration(declaration) || !declaration.initializer)
        continue;
      for (const call of walk(declaration.initializer, ts.isCallExpression)) {
        if (call.expression.kind !== ts.SyntaxKind.ImportKeyword) continue;
        const specifier = call.arguments[0];
        if (!specifier || !ts.isStringLiteral(specifier)) continue;
        const sources = new Set();
        const moduleSymbol = canonicalSymbol(checker, specifier);
        for (const moduleDeclaration of moduleSymbol?.declarations || []) {
          if (ts.isSourceFile(moduleDeclaration))
            sources.add(moduleDeclaration);
        }
        if (specifier.text.startsWith(".")) {
          const base = path.resolve(
            path.dirname(call.getSourceFile().fileName),
            specifier.text,
          );
          for (const candidate of [
            base,
            `${base}.js`,
            `${base}.ts`,
            `${base}.tsx`,
          ]) {
            const source = program.getSourceFile(candidate);
            if (source) sources.add(source);
          }
        }
        if (
          [...sources].some(
            (source) =>
              exportedSymbol(checker, source, "default") === targetSymbol,
          )
        )
          return true;
      }
    }
    return false;
  }

  const nodes = reachableNodesFromCallable(checker, ownerDeclaration);
  const roots = new Set();
  for (const node of nodes) {
    if (!ts.isIdentifier(node) || node.text !== parts[0]) continue;
    let current = node;
    let matches = true;
    for (let index = 1; index < parts.length; index += 1) {
      const parent = current.parent;
      if (
        !ts.isPropertyAccessExpression(parent) ||
        parent.expression !== current ||
        parent.name.text !== parts[index]
      ) {
        matches = false;
        break;
      }
      current = parent;
    }
    if (matches) roots.add(canonicalSymbol(checker, node));
  }

  const pending = [...roots];
  const visited = new Set();
  while (pending.length) {
    const symbol = canonicalSymbol(checker, pending.shift());
    if (!symbol || visited.has(symbol)) continue;
    if (symbol === snapshotMember) return true;
    visited.add(symbol);
    for (const declaration of symbol.declarations || []) {
      let origin = null;
      if (ts.isVariableDeclaration(declaration))
        origin = declaration.initializer;
      else if (ts.isBindingElement(declaration)) {
        const pattern = declaration.parent;
        const bindingOwner = pattern && pattern.parent;
        if (ts.isVariableDeclaration(bindingOwner))
          origin = bindingOwner.initializer;
        else if (ts.isParameter(bindingOwner)) {
          const callable = bindingOwner.parent;
          const callableSymbol = canonicalSymbol(
            checker,
            callable.name || callable,
          );
          const propertyName = declaration.propertyName || declaration.name;
          const prop =
            ts.isIdentifier(propertyName) || ts.isStringLiteral(propertyName)
              ? propertyName.text
              : null;
          if (callableSymbol && prop) {
            for (const candidate of program.getSourceFiles()) {
              if (candidate.isDeclarationFile) continue;
              for (const element of walk(
                candidate,
                (node) =>
                  ts.isJsxOpeningElement(node) ||
                  ts.isJsxSelfClosingElement(node),
              )) {
                if (!jsxTagRepresents(element, callableSymbol)) continue;
                const elementOwner = containingFunction(element);
                if (
                  isStaticallyUnreachableBranch(checker, element) ||
                  !jsxElementIsRendered(checker, element) ||
                  (elementOwner
                    ? !callableReachableFromEntry(
                        program,
                        checker,
                        entrySource,
                        elementOwner,
                        true,
                      )
                    : !sourceReachableFromEntry(
                        program,
                        checker,
                        entrySource,
                        candidate,
                      ))
                )
                  continue;
                const attribute = element.attributes.properties.find(
                  (entry) =>
                    ts.isJsxAttribute(entry) && entry.name.text === prop,
                );
                const expression =
                  attribute?.initializer &&
                  ts.isJsxExpression(attribute.initializer)
                    ? attribute.initializer.expression
                    : null;
                if (!expression) continue;
                for (const node of walk(expression, () => true)) {
                  const wiredSymbol = canonicalSymbol(checker, node);
                  if (wiredSymbol === snapshotMember) return true;
                  if (
                    ts.isIdentifier(node) ||
                    ts.isPropertyAccessExpression(node)
                  )
                    pending.push(wiredSymbol);
                }
              }
            }
          }
        }
      }
      if (!origin) continue;
      const originNodes = walk(
        origin,
        () => true,
        (node) => ts.isFunctionLike(node),
      );
      for (const node of originNodes) {
        const originSymbol = canonicalSymbol(checker, node);
        if (originSymbol === snapshotMember) return true;
        if (ts.isIdentifier(node) || ts.isPropertyAccessExpression(node))
          pending.push(originSymbol);
        if (!ts.isCallExpression(node)) continue;
        const callee = canonicalSymbol(checker, node.expression);
        for (const callable of callee?.declarations || []) {
          if (
            !ts.isFunctionLike(callable) &&
            !(
              ts.isVariableDeclaration(callable) &&
              Boolean(callableBody(callable))
            )
          )
            continue;
          for (const reachable of reachableNodesFromCallable(
            checker,
            callable,
          )) {
            const reachableSymbol = canonicalSymbol(checker, reachable);
            if (reachableSymbol === snapshotMember) return true;
            if (
              ts.isIdentifier(reachable) ||
              ts.isPropertyAccessExpression(reachable)
            )
              pending.push(reachableSymbol);
          }
        }
      }
    }
  }
  return false;
}

function factoryPassesParameterToNestedFactory(
  checker,
  factory,
  nestedFactorySymbol,
  outerParameter,
) {
  if (!factory || !nestedFactorySymbol || !outerParameter) return false;
  const nestedFactory = declarationOf(nestedFactorySymbol, (candidate) =>
    ts.isFunctionLike(candidate),
  );
  if (!nestedFactory) return false;
  const nestedParameter = nestedFactory.parameters[0];
  if (!nestedParameter) return false;
  const nestedParameterIndex = 0;
  return walk(
    factory,
    ts.isCallExpression,
    (node) => node !== factory && ts.isFunctionLike(node),
    checker,
  ).some(
    (call) =>
      canonicalSymbol(checker, call.expression) === nestedFactorySymbol &&
      canonicalSymbol(checker, call.arguments[nestedParameterIndex]) ===
        outerParameter,
  );
}

function nestedFeatureEvidence(
  context,
  outerFeatureEvidence,
  caller,
  bridgeExport,
  nested,
) {
  if (!nested || !outerFeatureEvidence) return null;
  const nestedSource = evidenceSource(context, nested.source);
  if (!nestedSource)
    return { ok: false, reasons: ["nested feature source is missing"] };
  const nestedEvidence = featureMemberEvidence(
    context.checker,
    nestedSource,
    nested.method,
    nested.container,
  );
  if (!nestedEvidence)
    return {
      ok: false,
      reasons: ["nested feature member has no TypeChecker symbol"],
    };
  const nestedParameter = factoryParameterReachesBinding(
    context.checker,
    nestedEvidence.factory,
    nestedEvidence.memberSymbol,
    nested.binding,
  );
  const outerParameter = parameterSymbol(
    context.checker,
    outerFeatureEvidence.factory,
    "adapters",
  );
  const nestedReceivesOuter = factoryPassesParameterToNestedFactory(
    context.checker,
    outerFeatureEvidence.factory,
    nestedEvidence.factorySymbol,
    outerParameter,
  );
  const compositionBindsBridgeValue = compositionBindsBridge(
    context.checker,
    evidenceSource(context, caller.feature),
    outerFeatureEvidence.factorySymbol,
    outerParameter,
    caller.featureBinding,
    bridgeExport,
  );
  return {
    source: nestedSource,
    evidence: nestedEvidence,
    parameter: nestedParameter,
    bridgeBinding:
      Boolean(nestedParameter) &&
      nestedReceivesOuter &&
      Boolean(compositionBindsBridgeValue),
    compositionBindsBridgeValue,
    stateUpdates: nested.stateField
      ? lifecycleUpdatesField(
          context.checker,
          nestedEvidence.factory,
          nestedEvidence.memberSymbol,
          nested.stateField,
        )
      : false,
    resultReachesState: nested.stateField
      ? lifecycleQueryResultReachesField(
          context.checker,
          nestedEvidence.factory,
          nestedEvidence.memberSymbol,
          nestedParameter,
          nested.binding,
          nested.stateField,
        )
      : false,
    eventDisposes: nested.cleanupMethod
      ? eventFeatureDisposes(
          context.checker,
          nestedEvidence.factory,
          nested.binding,
          nestedEvidence.memberSymbol,
          nested.cleanupMethod,
        )
      : false,
    cleanupMember: nested.cleanupMethod
      ? returnedMemberSymbol(
          context.checker,
          nestedEvidence.factory,
          nested.cleanupMethod,
        )
      : null,
  };
}

function cleanupMemberCallsNestedCleanup(
  checker,
  outerFactory,
  outerCleanupMember,
  nestedCleanupMember,
) {
  if (!outerCleanupMember || !nestedCleanupMember) return false;
  const nested = canonicalSymbol(checker, nestedCleanupMember);
  if (!nested) return false;
  return memberReachableNodes(
    checker,
    outerFactory,
    outerCleanupMember,
    true,
  ).some((node) => {
    if (!ts.isCallExpression(node)) return false;
    const callee = node.expression;
    if (canonicalSymbol(checker, callee) === nested) return true;
    return (
      ts.isPropertyAccessExpression(callee) &&
      canonicalSymbol(checker, callee.name) === nested
    );
  });
}

function verifyCapabilityEvidence(context, fixture) {
  const { applicationRoot, program, checker } = context;
  const caller = fixture.productionCaller;
  const consumer = caller.consumer;
  const requireQueryResult =
    fixture.kind === "query" || consumer.kind === "lifecycle";
  const reasons = [];
  const trace = {};
  const consumerSource = evidenceSource(context, consumer.source);
  const consumerEntrySource = consumer.entrySource
    ? evidenceSource(context, consumer.entrySource)
    : null;
  const featureSource = evidenceSource(context, consumer.featureSource);
  const compositionSource = evidenceSource(context, caller.feature);
  const bridgeSource = evidenceSource(context, caller.bridge);
  const preloadSource = evidenceSource(
    context,
    caller.preload || "desktop/preload.js",
  );
  const registrarSource = evidenceSource(context, caller.registrar);
  if (
    !consumerSource ||
    !featureSource ||
    !compositionSource ||
    !bridgeSource ||
    !preloadSource ||
    !registrarSource
  )
    return { ok: false, reasons: ["missing production source"], trace };

  if (consumer.entrySource) {
    if (
      !consumerEntrySource ||
      !sourceReachableFromEntry(
        program,
        checker,
        consumerEntrySource,
        consumerSource,
      )
    )
      reasons.push(
        "consumer module is not reachable from the recorded renderer entry",
      );
    else {
      const owner = callableDeclarationByName(
        checker,
        consumerSource,
        consumer.owner,
      );
      if (
        !owner ||
        !callableReachableFromEntry(
          program,
          checker,
          consumerEntrySource,
          owner,
          true,
        )
      )
        reasons.push(
          "consumer owner is not callable-reachable from the recorded renderer entry",
        );
    }
  }

  let featureEvidence = null;
  let featureMember = null;
  if (consumer.featureDirect === true) {
    featureMember =
      exportedSymbol(checker, featureSource, consumer.featureMethod) ||
      importTarget(checker, featureSource, consumer.featureMethod);
  } else {
    featureEvidence = featureMemberEvidence(
      checker,
      featureSource,
      consumer.featureMethod,
      consumer.featureContainer,
    );
    featureMember = featureEvidence?.memberSymbol || null;
  }
  trace.featureMember = symbolId(checker, featureMember);
  if (!featureMember)
    reasons.push("feature public member has no TypeChecker symbol");

  const calls = featureMember
    ? consumerCalls(checker, program, consumerSource, consumer, featureMember)
    : [];
  const callee = calls[0]
    ? canonicalSymbol(
        checker,
        ts.isPropertyAccessExpression(calls[0].expression)
          ? calls[0].expression.name
          : calls[0].expression,
      )
    : null;
  trace.consumerCallee = symbolId(checker, callee);
  if (!callee)
    reasons.push(
      consumer.owner
        ? "consumer call is not in the reachable production owner or uses another receiver symbol"
        : "consumer call has no TypeChecker callee symbol",
    );

  const wiringSource = consumer.wiringSource
    ? evidenceSource(context, consumer.wiringSource)
    : null;
  if (
    callee &&
    featureMember &&
    callee !== featureMember &&
    !jsxWiringUsesMember(
      checker,
      program,
      wiringSource,
      consumer.wiringProp,
      featureMember,
    )
  )
    reasons.push(
      "consumer callee symbol is not closed by explicit parent wiring",
    );

  const bridgeExport = exportedSymbol(
    checker,
    bridgeSource,
    caller.bridgeSymbol,
  );
  trace.bridgeExport = symbolId(checker, bridgeExport);
  if (!bridgeExport) reasons.push("bridge export has no TypeChecker symbol");
  const nestedEvidence =
    featureEvidence && bridgeExport
      ? nestedFeatureEvidence(
          context,
          featureEvidence,
          caller,
          bridgeExport,
          consumer.nestedFeature,
        )
      : null;
  trace.nestedFeature = nestedEvidence
    ? {
        member: symbolId(checker, nestedEvidence.evidence?.memberSymbol),
        parameter: symbolId(checker, nestedEvidence.parameter),
        bridgeBinding: nestedEvidence.bridgeBinding,
        stateUpdates: nestedEvidence.stateUpdates,
        resultReachesState: nestedEvidence.resultReachesState,
        eventDisposes: nestedEvidence.eventDisposes,
      }
    : null;
  const nestedBridgeBinding = nestedEvidence?.bridgeBinding === true;
  let compositionCall = null;
  let directBridgeBinding = false;
  let featureParameter = null;
  if (featureEvidence) {
    directBridgeBinding = featureMemberDirectlyBindsSymbol(
      checker,
      featureEvidence.factory,
      featureMember,
      bridgeExport,
    );
    featureParameter = factoryParameterReachesBinding(
      checker,
      featureEvidence.factory,
      featureMember,
      caller.featureBinding,
    );
    trace.featureParameter = symbolId(checker, featureParameter);
    if (!featureParameter && !directBridgeBinding && !nestedBridgeBinding)
      reasons.push(
        "feature member symbol does not reach the bridge parameter binding",
      );
    compositionCall = compositionBindsBridge(
      checker,
      compositionSource,
      featureEvidence.factorySymbol,
      featureParameter,
      caller.featureBinding,
      bridgeExport,
    );
    if (!directBridgeBinding && !compositionCall && !nestedBridgeBinding)
      reasons.push(
        "bridge import symbol is not passed to the feature factory binding",
      );
  }
  if (
    calls[0] &&
    consumer.receiver &&
    featureEvidence &&
    !directBridgeBinding &&
    compositionCall &&
    !receiverReachesCompositionCall(
      checker,
      program,
      calls[0],
      compositionCall,
      consumer.method,
      consumerEntrySource,
    )
  )
    reasons.push(
      "consumer receiver is not the recorded production feature instance",
    );

  const preloadTransportReceiver = recordedPreloadTransportReceiver(
    context,
    preloadSource,
    caller,
  );
  trace.preloadTransportReceiver = symbolId(checker, preloadTransportReceiver);
  const preloadEvidence = preloadMemberEvidence(
    checker,
    preloadSource,
    caller.preloadMethod,
    fixture.channel,
    fixture.kind,
    preloadTransportReceiver,
    requireQueryResult,
  );
  const preloadMember = preloadEvidence?.symbol || null;
  trace.preloadMember = symbolId(checker, preloadMember);
  if (!preloadTransportReceiver)
    reasons.push("recorded Electron ipcRenderer binding is missing");
  if (!preloadMember)
    reasons.push(
      fixture.kind === "event"
        ? "event preload does not use the recorded Electron ipcRenderer receiver"
        : "preload member does not invoke the recorded Electron ipcRenderer symbol",
    );
  const bridgePreload = preloadEvidence?.namespace
    ? bridgeCallsPreloadMember(
        checker,
        bridgeSource,
        caller.bridgeSymbol,
        preloadEvidence.namespace,
        caller.preloadMethod,
        requireQueryResult || fixture.kind === "event",
      )
    : null;
  trace.bridgePreloadMember = symbolId(checker, bridgePreload);
  if (!bridgePreload)
    reasons.push(
      "bridge export does not call the recorded preload member symbol",
    );
  if (fixture.kind !== "event") {
    const registrationEntry = caller.registrationEntry
      ? evidenceSource(context, caller.registrationEntry)
      : null;
    trace.registrar = {};
    if (
      !registrationEntry ||
      !registrarEvidence(
        program,
        checker,
        registrarSource,
        registrationEntry,
        caller.registrationEntryOwner,
        caller.registrationReceiver,
        caller.registrationApplication,
        caller.registrationApplicationProjectsRegistrar === true,
        caller.registrarOwner,
        caller.registrarReceiver,
        fixture.channel,
        caller.application,
        trace.registrar,
        requireQueryResult,
      )
    )
      reasons.push(
        "real ipcMain registration does not bind channel to application symbol",
      );
  }

  if (consumer.kind === "lifecycle") {
    const stateSource = consumer.stateSource
      ? evidenceSource(context, consumer.stateSource)
      : null;
    if (!stateSource) reasons.push("lifecycle state source is missing");
    else {
      const stateOwner = callableDeclarationByName(
        checker,
        stateSource,
        consumer.stateOwner,
      );
      if (
        !stateOwner ||
        !consumerEntrySource ||
        !callableReachableFromEntry(
          program,
          checker,
          consumerEntrySource,
          stateOwner,
          true,
        )
      )
        reasons.push(
          "lifecycle snapshot consumer owner is not callable-reachable from the recorded renderer entry",
        );
      else if (
        !lifecycleStateHasConsumer(
          checker,
          program,
          consumerEntrySource,
          stateSource,
          consumer.stateRoot,
          consumer.stateField,
          consumer.stateOwner,
        )
      )
        reasons.push(
          "lifecycle snapshot field has no reachable production consumer",
        );
      else if (
        featureEvidence &&
        !lifecycleConsumerDerivesFromFeatureSnapshot(
          checker,
          program,
          stateSource,
          consumer.stateRoot,
          consumer.stateOwner,
          featureEvidence.factory,
          consumerEntrySource,
        )
      )
        reasons.push(
          "lifecycle snapshot consumer is not derived from the recorded feature snapshot",
        );
    }
    const lifecycleUpdates =
      featureEvidence &&
      (lifecycleUpdatesField(
        checker,
        featureEvidence.factory,
        featureMember,
        consumer.stateField,
      ) ||
        nestedEvidence?.stateUpdates === true);
    if (featureEvidence && !lifecycleUpdates)
      reasons.push(
        "lifecycle query does not update the recorded snapshot field",
      );
    else if (
      featureEvidence &&
      !directBridgeBinding &&
      !nestedBridgeBinding &&
      !lifecycleQueryResultReachesField(
        checker,
        featureEvidence.factory,
        featureMember,
        featureParameter,
        caller.featureBinding,
        consumer.stateField,
      )
    )
      reasons.push(
        "lifecycle query result does not reach the recorded snapshot field",
      );
  }

  if (fixture.kind === "event") {
    const producerSource = caller.producer
      ? evidenceSource(context, caller.producer)
      : null;
    const producerEntry = caller.producerEntry
      ? evidenceSource(context, caller.producerEntry)
      : null;
    const producerOwner =
      producerSource && caller.producerOwner
        ? callableDeclarationByName(
            checker,
            producerSource,
            caller.producerOwner,
          )
        : null;
    const producerEntryOwner =
      producerEntry && caller.producerEntryOwner
        ? callableDeclarationByName(
            checker,
            producerEntry,
            caller.producerEntryOwner,
          )
        : null;
    const producerSend = producerSendEvidence(checker, producerOwner, fixture);
    trace.producerOwner = symbolId(
      checker,
      producerOwner &&
        canonicalSymbol(checker, producerOwner.name || producerOwner),
    );
    trace.producerApplicationMember = symbolId(
      checker,
      producerSend && ts.isPropertyAccessExpression(producerSend.expression)
        ? canonicalSymbol(checker, producerSend.expression.name)
        : producerSend
          ? canonicalSymbol(checker, producerSend.expression)
          : null,
    );
    if (!producerSource) reasons.push("event producer source is missing");
    else if (
      !producerEntry ||
      !producerOwner ||
      !(producerEntryOwner
        ? recordedOwnerReachable(
            program,
            checker,
            producerEntryOwner,
            producerOwner,
          )
        : callableReachableFromEntry(
            program,
            checker,
            producerEntry,
            producerOwner,
            true,
          ))
    )
      reasons.push(
        "event producer owner is not callable-reachable from the recorded production entry",
      );
    else if (!caller.producerApplication)
      reasons.push("event producer application evidence is missing");
    else if (!producerSend)
      reasons.push(
        "event producer application does not send the recorded channel",
      );
    const applicationEvidence = recordedApplicationEvidence(
      context,
      caller,
      producerSend,
      producerEntryOwner || producerEntry,
    );
    trace.applicationReceiver = symbolId(
      checker,
      applicationEvidence?.receiver,
    );
    trace.applicationMember = symbolId(checker, applicationEvidence?.member);
    if (!applicationEvidence)
      reasons.push(
        "event application symbol is not the producer send call member",
      );
    if (
      !preloadEventDisposes(
        checker,
        preloadSource,
        caller.preloadMethod,
        fixture.channel,
        preloadTransportReceiver,
      )
    )
      reasons.push(
        "event preload does not remove the same channel and callback",
      );
    if (!uniqueBridgeConsumer(checker, program, bridgeSource, bridgeExport))
      reasons.push(
        "event bridge export does not have exactly one direct production consumer",
      );
    if (featureEvidence) {
      const cleanupMethod = consumer.cleanupMethod || "dispose";
      const cleanupMember = returnedMemberSymbol(
        checker,
        featureEvidence.factory,
        cleanupMethod,
      );
      const composedFeatureDisposes = eventFeatureDisposes(
        checker,
        featureEvidence.factory,
        caller.featureBinding,
        featureMember,
        cleanupMethod,
      );
      const nestedFeatureDisposes = nestedEvidence?.eventDisposes === true;
      const nestedCleanupForwarded =
        !nestedFeatureDisposes ||
        cleanupMemberCallsNestedCleanup(
          checker,
          featureEvidence.factory,
          cleanupMember,
          nestedEvidence.cleanupMember,
        );
      const featureDisposes =
        composedFeatureDisposes ||
        (nestedFeatureDisposes && nestedCleanupForwarded);
      if (
        !featureDisposes &&
        !(directBridgeBinding && eventConsumerDisposes(checker, calls[0]))
      )
        reasons.push(
          "event feature does not dispose the recorded subscription",
        );
      else if (featureDisposes && !cleanupMember)
        reasons.push(
          "event subscription cleanup is not callable-reachable from the recorded renderer entry",
        );
      else if (featureDisposes) {
        const cleanupSource = consumer.cleanupSource
          ? evidenceSource(context, consumer.cleanupSource)
          : consumerSource;
        const cleanupCalls = consumerCalls(
          checker,
          program,
          cleanupSource,
          {
            ...consumer,
            owner: consumer.cleanupOwner || consumer.owner,
            receiver:
              consumer.cleanupReceiver === undefined
                ? consumer.receiver
                : consumer.cleanupReceiver,
            method: cleanupMethod,
          },
          cleanupMember,
        );
        if (!cleanupCalls.length)
          reasons.push(
            "event subscription cleanup is not callable-reachable from the recorded renderer entry",
          );
        else if (
          !eventCleanupFollowsStart(
            checker,
            program,
            calls,
            cleanupCalls,
            consumer.allowCrossSourceCleanup === true,
          )
        )
          reasons.push(
            "event cleanup is not ordered after the recorded subscription",
          );
      }
    }
  }

  return { ok: reasons.length === 0, reasons, trace };
}

function walk(node, predicate, boundary, checker = null) {
  const matches = [];
  function visit(current) {
    const stopsHere = current !== node && boundary?.(current);
    if (
      (!stopsHere ||
        !checker ||
        !isStaticallyUnreachableBranch(checker, current)) &&
      predicate(current)
    )
      matches.push(current);
    if (stopsHere) return;
    ts.forEachChild(current, visit);
  }
  visit(node);
  return matches;
}

const STATIC_UNKNOWN = Symbol("STATIC_UNKNOWN");
const STATIC_TRUTHY = Symbol("STATIC_TRUTHY");

function staticLiteralTruthiness(expression) {
  let current = expression;
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isTypeAssertionExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isNonNullExpression(current)
  )
    current = current.expression;
  return ts.isArrayLiteralExpression(current) ||
    ts.isObjectLiteralExpression(current) ||
    ts.isFunctionExpression(current) ||
    ts.isArrowFunction(current) ||
    ts.isClassExpression(current) ||
    ts.isRegularExpressionLiteral(current) ||
    ts.isNewExpression(current)
    ? STATIC_TRUTHY
    : STATIC_UNKNOWN;
}

function staticOptionalChainValue(checker, expression, visited) {
  let current = expression;
  while (
    ts.isPropertyAccessExpression(current) ||
    ts.isElementAccessExpression(current) ||
    ts.isCallExpression(current)
  ) {
    if (current.questionDotToken) {
      const base = staticLogicalAssignmentValue(
        checker,
        current.expression,
        visited,
      );
      if (base === null || base === undefined) return undefined;
    }
    current = current.expression;
  }
  return STATIC_UNKNOWN;
}

function staticPropertyName(name) {
  if (
    ts.isIdentifier(name) ||
    ts.isStringLiteral(name) ||
    ts.isNumericLiteral(name)
  )
    return name.text;
  return null;
}

function staticObjectPropertyValue(checker, expression, propertyName, visited) {
  let current = expression;
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isTypeAssertionExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isNonNullExpression(current)
  )
    current = current.expression;
  if (propertyName === "length") {
    if (ts.isArrayLiteralExpression(current)) {
      return current.elements.some(ts.isSpreadElement)
        ? STATIC_UNKNOWN
        : current.elements.length;
    }
    if (ts.isStringLiteral(current)) return current.text.length;
  }
  if (ts.isObjectLiteralExpression(current)) {
    for (let index = current.properties.length - 1; index >= 0; index -= 1) {
      const property = current.properties[index];
      if (ts.isSpreadAssignment(property)) return STATIC_UNKNOWN;
      const name = staticPropertyName(property.name);
      if (name === null) return STATIC_UNKNOWN;
      if (ts.isPropertyAssignment(property) && name === propertyName)
        return staticPrimitiveValue(checker, property.initializer, visited);
      if (ts.isShorthandPropertyAssignment(property) && name === propertyName)
        return staticPrimitiveValue(checker, property.name, visited);
    }
    return STATIC_UNKNOWN;
  }
  if (ts.isIdentifier(current) && checker) {
    const symbol = canonicalSymbol(checker, current);
    if (!symbol || visited.has(symbol)) return STATIC_UNKNOWN;
    const declaration = declarationOf(symbol, ts.isVariableDeclaration);
    if (
      !declaration?.initializer ||
      !ts.isVariableDeclarationList(declaration.parent) ||
      !(declaration.parent.flags & ts.NodeFlags.Const)
    )
      return STATIC_UNKNOWN;
    return staticObjectPropertyValue(
      checker,
      declaration.initializer,
      propertyName,
      new Set(visited).add(symbol),
    );
  }
  return STATIC_UNKNOWN;
}

const MUTABLE_ASSIGNMENT_OPERATORS = new Set([
  ts.SyntaxKind.EqualsToken,
  ts.SyntaxKind.PlusEqualsToken,
  ts.SyntaxKind.MinusEqualsToken,
  ts.SyntaxKind.AsteriskEqualsToken,
  ts.SyntaxKind.AsteriskAsteriskEqualsToken,
  ts.SyntaxKind.SlashEqualsToken,
  ts.SyntaxKind.PercentEqualsToken,
  ts.SyntaxKind.LessThanLessThanEqualsToken,
  ts.SyntaxKind.GreaterThanGreaterThanEqualsToken,
  ts.SyntaxKind.GreaterThanGreaterThanGreaterThanEqualsToken,
  ts.SyntaxKind.AmpersandEqualsToken,
  ts.SyntaxKind.BarEqualsToken,
  ts.SyntaxKind.CaretEqualsToken,
  ts.SyntaxKind.AmpersandAmpersandEqualsToken,
  ts.SyntaxKind.BarBarEqualsToken,
  ts.SyntaxKind.QuestionQuestionEqualsToken,
]);

function mutableVariableHasPriorWrite(checker, declaration, useSite) {
  const symbol = canonicalSymbol(checker, declaration.name);
  if (!symbol) return true;
  const scope = containingFunction(declaration) || declaration.getSourceFile();
  return (
    walk(
      scope,
      (node) => {
        if (node === declaration || node.pos >= useSite.pos) return false;
        if (
          ts.isBinaryExpression(node) &&
          MUTABLE_ASSIGNMENT_OPERATORS.has(node.operatorToken.kind) &&
          canonicalSymbol(checker, node.left) === symbol
        )
          return true;
        if (
          (ts.isPrefixUnaryExpression(node) ||
            ts.isPostfixUnaryExpression(node)) &&
          (node.operator === ts.SyntaxKind.PlusPlusToken ||
            node.operator === ts.SyntaxKind.MinusMinusToken) &&
          canonicalSymbol(checker, node.operand) === symbol
        )
          return true;
        return false;
      },
      null,
      checker,
    ).length > 0
  );
}

function staticPrimitiveValue(checker, expression, visited = new Set()) {
  if (!expression) return STATIC_UNKNOWN;
  let current = expression;
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isTypeAssertionExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isNonNullExpression(current)
  )
    current = current.expression;
  const optional = staticOptionalChainValue(checker, current, visited);
  if (optional !== STATIC_UNKNOWN) return optional;
  if (ts.isTypeOfExpression(current)) {
    const operand = staticPrimitiveValue(checker, current.expression, visited);
    if (operand !== STATIC_UNKNOWN)
      return operand === null ? "object" : typeof operand;
  }
  if (ts.isPropertyAccessExpression(current)) {
    return staticObjectPropertyValue(
      checker,
      current.expression,
      current.name.text,
      visited,
    );
  }
  if (ts.isElementAccessExpression(current) && current.argumentExpression) {
    const property = staticPrimitiveValue(
      checker,
      current.argumentExpression,
      visited,
    );
    if (typeof property === "string" || typeof property === "number")
      return staticObjectPropertyValue(
        checker,
        current.expression,
        String(property),
        visited,
      );
  }
  if (current.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (current.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (ts.isNumericLiteral(current)) return Number(current.text);
  if (ts.isBigIntLiteral(current)) return BigInt(current.text.slice(0, -1));
  if (ts.isStringLiteral(current)) return current.text;
  if (current.kind === ts.SyntaxKind.NullKeyword) return null;
  if (ts.isVoidExpression(current)) return undefined;
  if (ts.isIdentifier(current) && checker) {
    const symbol = canonicalSymbol(checker, current);
    const isGlobalPrimitive =
      !symbol ||
      (symbol.declarations || []).every(
        (declaration) => declaration.getSourceFile().isDeclarationFile,
      );
    if (current.text === "undefined" && isGlobalPrimitive) return undefined;
    if (current.text === "NaN" && isGlobalPrimitive) return Number.NaN;
    if (!symbol || visited.has(symbol)) return STATIC_UNKNOWN;
    const declaration = declarationOf(symbol, ts.isVariableDeclaration);
    if (
      !declaration?.initializer ||
      !ts.isVariableDeclarationList(declaration.parent) ||
      !(declaration.parent.flags & ts.NodeFlags.Const)
    )
      return STATIC_UNKNOWN;
    const nextVisited = new Set(visited).add(symbol);
    return staticPrimitiveValue(checker, declaration.initializer, nextVisited);
  }
  return STATIC_UNKNOWN;
}

function staticLogicalAssignmentValue(
  checker,
  expression,
  visited = new Set(),
) {
  let current = expression;
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isTypeAssertionExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isNonNullExpression(current)
  )
    current = current.expression;
  const primitive = staticPrimitiveValue(checker, current);
  if (primitive !== STATIC_UNKNOWN) return primitive;
  const literal = staticLiteralTruthiness(current);
  if (literal !== STATIC_UNKNOWN) return literal;
  if (!ts.isIdentifier(current)) return STATIC_UNKNOWN;
  const symbol = canonicalSymbol(checker, current);
  if (!symbol || visited.has(symbol)) return STATIC_UNKNOWN;
  const declaration = declarationOf(symbol, ts.isVariableDeclaration);
  if (
    !declaration?.initializer ||
    !ts.isVariableDeclarationList(declaration.parent) ||
    declaration.parent.flags & ts.NodeFlags.Const ||
    mutableVariableHasPriorWrite(checker, declaration, current)
  )
    return STATIC_UNKNOWN;
  return staticLogicalAssignmentValue(
    checker,
    declaration.initializer,
    new Set(visited).add(symbol),
  );
}

function staticBooleanValue(checker, expression, visited = new Set()) {
  let current = expression;
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isTypeAssertionExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isNonNullExpression(current)
  )
    current = current.expression;
  if (
    ts.isPrefixUnaryExpression(current) &&
    current.operator === ts.SyntaxKind.ExclamationToken
  ) {
    const operand = staticBooleanValue(checker, current.operand, visited);
    return operand === null ? null : !operand;
  }
  if (ts.isBinaryExpression(current)) {
    const left = staticPrimitiveValue(checker, current.left, visited);
    const right = staticPrimitiveValue(checker, current.right, visited);
    if (left !== STATIC_UNKNOWN && right !== STATIC_UNKNOWN) {
      switch (current.operatorToken.kind) {
        case ts.SyntaxKind.EqualsEqualsToken:
          return left == right;
        case ts.SyntaxKind.EqualsEqualsEqualsToken:
          return left === right;
        case ts.SyntaxKind.ExclamationEqualsToken:
          return left != right;
        case ts.SyntaxKind.ExclamationEqualsEqualsToken:
          return left !== right;
        case ts.SyntaxKind.LessThanToken:
          return left < right;
        case ts.SyntaxKind.LessThanEqualsToken:
          return left <= right;
        case ts.SyntaxKind.GreaterThanToken:
          return left > right;
        case ts.SyntaxKind.GreaterThanEqualsToken:
          return left >= right;
      }
    }
  }
  const primitive = staticPrimitiveValue(checker, current, visited);
  return primitive === STATIC_UNKNOWN ? null : Boolean(primitive);
}

function staticBranchValue(checker, expression) {
  const boolean = staticBooleanValue(checker, expression);
  if (boolean !== null) return boolean;
  if (staticLiteralTruthiness(expression) === STATIC_TRUTHY) return true;
  const primitive = staticPrimitiveValue(checker, expression);
  return primitive === STATIC_UNKNOWN ? null : Boolean(primitive);
}

function hasEscapingLoopBreak(checker, statement) {
  let found = false;
  function visit(node, nested) {
    if (found || nested) return;
    if (
      ts.isBreakStatement(node) &&
      !node.label &&
      !isStaticallyUnreachableBranch(checker, node)
    ) {
      found = true;
      return;
    }
    ts.forEachChild(node, (child) =>
      visit(
        child,
        child !== statement &&
          (ts.isFunctionLike(child) ||
            ts.isIterationStatement(child) ||
            ts.isSwitchStatement(child)),
      ),
    );
  }
  visit(statement, false);
  return found;
}

function switchClauseIsStaticallyUnreachable(checker, clause) {
  const caseBlock = clause.parent;
  const statement = caseBlock?.parent;
  if (!caseBlock || !ts.isSwitchStatement(statement)) return false;
  const selector = staticPrimitiveValue(checker, statement.expression);
  if (selector === STATIC_UNKNOWN) return false;
  const clauses = caseBlock.clauses;
  const selectedIndex = clauses.findIndex(
    (candidate) =>
      ts.isCaseClause(candidate) &&
      staticPrimitiveValue(checker, candidate.expression) !== STATIC_UNKNOWN &&
      staticPrimitiveValue(checker, candidate.expression) === selector,
  );
  const defaultIndex = clauses.findIndex(ts.isDefaultClause);
  const activeIndex = selectedIndex >= 0 ? selectedIndex : defaultIndex;
  const clauseIndex = clauses.indexOf(clause);
  if (activeIndex < 0 || activeIndex > clauseIndex) return true;
  return clauses
    .slice(activeIndex, clauseIndex)
    .some((candidate) =>
      candidate.statements.some((child) =>
        statementAlwaysAbrupt(checker, child),
      ),
    );
}

function statementMayThrow(checker, statement) {
  return (
    walk(
      statement,
      (node) =>
        ts.isThrowStatement(node) ||
        ts.isCallExpression(node) ||
        ts.isNewExpression(node) ||
        ts.isAwaitExpression(node) ||
        ts.isPropertyAccessExpression(node) ||
        ts.isElementAccessExpression(node),
      (node) => node !== statement && ts.isFunctionLike(node),
      checker,
    ).length > 0
  );
}

function callableBodyAlwaysAbrupt(checker, body, visiting) {
  return Boolean(
    body &&
    !walk(
      body,
      ts.isReturnStatement,
      (node) => node !== body && ts.isFunctionLike(node),
      checker,
    ).length &&
    statementAlwaysAbrupt(checker, body, visiting),
  );
}

function statementAlwaysReturnsNormally(checker, statement) {
  if (!statement) return false;
  if (ts.isReturnStatement(statement))
    return (
      !statement.expression || !statementMayThrow(checker, statement.expression)
    );
  if (ts.isBlock(statement)) {
    for (const child of statement.statements) {
      if (statementAlwaysReturnsNormally(checker, child)) return true;
      if (statementAlwaysAbrupt(checker, child)) return false;
    }
    return false;
  }
  if (ts.isIfStatement(statement)) {
    const condition = staticBooleanValue(checker, statement.expression);
    if (condition === true)
      return statementAlwaysReturnsNormally(checker, statement.thenStatement);
    if (condition === false)
      return statementAlwaysReturnsNormally(checker, statement.elseStatement);
    return Boolean(
      statement.elseStatement &&
      statementAlwaysReturnsNormally(checker, statement.thenStatement) &&
      statementAlwaysReturnsNormally(checker, statement.elseStatement),
    );
  }
  if (ts.isTryStatement(statement)) {
    if (statement.finallyBlock)
      return statementAlwaysReturnsNormally(checker, statement.finallyBlock);
    if (!statement.catchClause)
      return statementAlwaysReturnsNormally(checker, statement.tryBlock);
    return Boolean(
      statementAlwaysReturnsNormally(checker, statement.tryBlock) &&
      statementAlwaysReturnsNormally(checker, statement.catchClause.block),
    );
  }
  return false;
}

function callableCallbackThrowEscaped(checker, callbackCall, callable) {
  let current = callbackCall;
  while (current && current !== callable) {
    const parent = current.parent;
    if (
      ts.isTryStatement(parent) &&
      parent.catchClause &&
      nodeWithin(current, parent.tryBlock)
    )
      return false;
    if (
      ts.isTryStatement(parent) &&
      parent.finallyBlock &&
      nodeWithin(current, parent.tryBlock) &&
      statementAlwaysReturnsNormally(checker, parent.finallyBlock)
    )
      return false;
    current = parent;
  }
  return true;
}

function callableAlwaysAbrupt(checker, call, visiting = new Set()) {
  if (!checker) return false;
  const callExpression = ts.isCallExpression(call) ? call : null;
  if (ts.isFunctionLike(call))
    return callableBodyAlwaysAbrupt(checker, callableBody(call), visiting);
  const symbol = canonicalSymbol(checker, call.expression || call);
  if (!symbol) return false;
  let callCache = null;
  if (callExpression) {
    callCache = abruptCallByChecker.get(checker);
    if (!callCache) {
      callCache = new WeakMap();
      abruptCallByChecker.set(checker, callCache);
    }
    if (callCache.has(callExpression)) return callCache.get(callExpression);
  }
  let cache = abruptCallableByChecker.get(checker);
  if (!cache) {
    cache = new Map();
    abruptCallableByChecker.set(checker, cache);
  }
  if (visiting.has(symbol)) return false;
  const cached = cache.get(symbol);
  if (cached === true) {
    callCache?.set(callExpression, true);
    return true;
  }
  if (cached === false && !callExpression) return false;
  if (cached === null) return false;
  const bodyWasAnalyzed = cached === false;
  cache.set(symbol, null);
  const nextVisiting = new Set(visiting).add(symbol);
  let callbackAbrupt = false;
  for (const declaration of symbol.declarations || []) {
    let body = null;
    let alias = null;
    if (ts.isFunctionLike(declaration)) body = callableBody(declaration);
    else if (
      ts.isVariableDeclaration(declaration) ||
      ts.isPropertyAssignment(declaration)
    ) {
      const value = declaration.initializer;
      if (ts.isFunctionLike(value)) body = callableBody(value);
      else alias = canonicalSymbol(checker, value);
    } else if (ts.isShorthandPropertyAssignment(declaration)) {
      alias = canonicalSymbol(
        checker,
        checker.getShorthandAssignmentValueSymbol(declaration) ||
          declaration.name,
      );
    }
    if (
      !bodyWasAnalyzed &&
      callableBodyAlwaysAbrupt(checker, body, nextVisiting)
    ) {
      cache.set(symbol, true);
      callCache?.set(callExpression, true);
      return true;
    }
    if (ts.isCallExpression(call) && body) {
      const callable = ts.isFunctionLike(declaration)
        ? declaration
        : ts.isFunctionLike(declaration.initializer)
          ? declaration.initializer
          : null;
      for (
        let index = 0;
        callable && index < callable.parameters.length;
        index += 1
      ) {
        const parameter = callable.parameters[index];
        const parameterSymbol = canonicalSymbol(checker, parameter.name);
        const argument = call.arguments[index];
        if (
          !parameterSymbol ||
          !argument ||
          !(
            ts.isIdentifier(argument) ||
            ts.isPropertyAccessExpression(argument) ||
            ts.isElementAccessExpression(argument) ||
            ts.isFunctionLike(argument)
          ) ||
          !callInvokesCallbackArgument(checker, call, index) ||
          !callableAlwaysAbrupt(checker, argument, nextVisiting)
        )
          continue;
        if (
          walk(
            body,
            (node) =>
              ts.isCallExpression(node) &&
              canonicalSymbol(checker, node.expression) === parameterSymbol,
            (node) => node !== body && ts.isFunctionLike(node),
            checker,
          ).some((node) =>
            callableCallbackThrowEscaped(checker, node, callable),
          )
        ) {
          callbackAbrupt = true;
        }
      }
    }
    if (alias && alias !== symbol) {
      if (callableAlwaysAbrupt(checker, alias, nextVisiting)) {
        cache.set(symbol, true);
        callCache?.set(callExpression, true);
        return true;
      }
    }
  }
  cache.set(symbol, false);
  callCache?.set(callExpression, callbackAbrupt);
  return callbackAbrupt;
}

function statementAlwaysAbrupt(checker, statement, visiting = new Set()) {
  if (!statement) return false;
  if (
    ts.isReturnStatement(statement) ||
    ts.isThrowStatement(statement) ||
    ts.isBreakStatement(statement) ||
    ts.isContinueStatement(statement)
  )
    return true;
  if (ts.isCallExpression(statement))
    return callableAlwaysAbrupt(checker, statement, visiting);
  if (ts.isExpressionStatement(statement))
    return statementAlwaysAbrupt(checker, statement.expression, visiting);
  if (ts.isBlock(statement)) {
    for (const child of statement.statements) {
      if (statementAlwaysAbrupt(checker, child, visiting)) return true;
    }
    return false;
  }
  if (ts.isIfStatement(statement)) {
    const condition = staticBooleanValue(checker, statement.expression);
    if (condition === true)
      return statementAlwaysAbrupt(checker, statement.thenStatement, visiting);
    if (condition === false)
      return statementAlwaysAbrupt(checker, statement.elseStatement, visiting);
    return Boolean(
      statement.elseStatement &&
      statementAlwaysAbrupt(checker, statement.thenStatement, visiting) &&
      statementAlwaysAbrupt(checker, statement.elseStatement, visiting),
    );
  }
  if (ts.isWhileStatement(statement))
    return (
      staticBranchValue(checker, statement.expression) === true &&
      !hasEscapingLoopBreak(checker, statement.statement)
    );
  if (ts.isForStatement(statement))
    return (
      (!statement.condition ||
        staticBranchValue(checker, statement.condition) === true) &&
      !hasEscapingLoopBreak(checker, statement.statement)
    );
  if (ts.isDoStatement(statement))
    return (
      staticBranchValue(checker, statement.expression) === true &&
      !hasEscapingLoopBreak(checker, statement.statement)
    );
  if (ts.isSwitchStatement(statement)) {
    const selector = staticPrimitiveValue(checker, statement.expression);
    if (selector === STATIC_UNKNOWN) return false;
    const clauses = statement.caseBlock.clauses;
    const selectedIndex = clauses.findIndex(
      (clause) =>
        ts.isCaseClause(clause) &&
        staticPrimitiveValue(checker, clause.expression) === selector,
    );
    const activeIndex =
      selectedIndex >= 0
        ? selectedIndex
        : clauses.findIndex(ts.isDefaultClause);
    if (activeIndex < 0) return false;
    for (const clause of clauses.slice(activeIndex)) {
      if (clause.statements.some(ts.isBreakStatement)) return false;
      if (
        clause.statements.some((child) =>
          statementAlwaysAbrupt(checker, child, visiting),
        )
      )
        return true;
    }
    return false;
  }
  if (ts.isTryStatement(statement)) {
    if (
      statement.finallyBlock &&
      statementAlwaysAbrupt(checker, statement.finallyBlock, visiting)
    )
      return true;
    const tryAbrupt = statementAlwaysAbrupt(
      checker,
      statement.tryBlock,
      visiting,
    );
    if (!statement.catchClause) return tryAbrupt;
    if (tryAbrupt && !statementMayThrow(checker, statement.tryBlock))
      return true;
    return (
      tryAbrupt &&
      statementAlwaysAbrupt(checker, statement.catchClause.block, visiting)
    );
  }
  return false;
}

function staticIterableIsEmpty(expression) {
  let current = expression;
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isTypeAssertionExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isNonNullExpression(current)
  )
    current = current.expression;
  if (ts.isArrayLiteralExpression(current))
    return current.elements.length === 0;
  if (ts.isObjectLiteralExpression(current))
    return current.properties.length === 0;
  return ts.isStringLiteral(current) && current.text.length === 0;
}

function nodeWithin(node, ancestor) {
  let current = node;
  while (current && current !== ancestor) current = current.parent;
  return current === ancestor;
}

function optionalChainSkipsNode(checker, parent, node) {
  const skippedRoots = ts.isElementAccessExpression(parent)
    ? [parent.argumentExpression]
    : ts.isCallExpression(parent)
      ? parent.arguments
      : [];
  return (
    skippedRoots.some((root) => root && nodeWithin(node, root)) &&
    staticOptionalChainValue(checker, parent) === undefined
  );
}

function isStaticallyUnreachableBranch(checker, node) {
  let current = node;
  while (current.parent) {
    const parent = current.parent;
    if (optionalChainSkipsNode(checker, parent, current)) return true;
    if ((ts.isBlock(parent) || ts.isSourceFile(parent)) && parent.statements) {
      const statementIndex = parent.statements.indexOf(current);
      if (
        statementIndex > 0 &&
        parent.statements
          .slice(0, statementIndex)
          .some(
            (statement) =>
              statementAlwaysAbrupt(checker, statement) ||
              (ts.isWhileStatement(statement) &&
                staticBranchValue(checker, statement.expression) === true &&
                !hasEscapingLoopBreak(checker, statement.statement)) ||
              (ts.isForStatement(statement) &&
                (!statement.condition ||
                  staticBranchValue(checker, statement.condition) === true) &&
                !hasEscapingLoopBreak(checker, statement.statement)),
          )
      )
        return true;
    }
    if (
      ts.isWhileStatement(parent) &&
      parent.statement === current &&
      staticBranchValue(checker, parent.expression) === false
    )
      return true;
    if (
      ts.isForStatement(parent) &&
      parent.statement === current &&
      parent.condition &&
      staticBranchValue(checker, parent.condition) === false
    )
      return true;
    if (
      (ts.isForOfStatement(parent) || ts.isForInStatement(parent)) &&
      parent.statement === current &&
      staticIterableIsEmpty(parent.expression)
    )
      return true;
    if (ts.isIfStatement(parent)) {
      const condition = staticBranchValue(checker, parent.expression);
      if (
        (condition === false && parent.thenStatement === current) ||
        (condition === true && parent.elseStatement === current)
      )
        return true;
    }
    if (ts.isConditionalExpression(parent)) {
      const condition = staticBranchValue(checker, parent.condition);
      if (
        (condition === false && parent.whenTrue === current) ||
        (condition === true && parent.whenFalse === current)
      )
        return true;
    }
    if (
      (ts.isCaseClause(parent) || ts.isDefaultClause(parent)) &&
      parent.statements.includes(current) &&
      switchClauseIsStaticallyUnreachable(checker, parent)
    )
      return true;
    if (
      ts.isBinaryExpression(parent) &&
      parent.right === current &&
      ((parent.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken &&
        staticBranchValue(checker, parent.left) === false) ||
        (parent.operatorToken.kind ===
          ts.SyntaxKind.AmpersandAmpersandEqualsToken &&
          (() => {
            const left = staticLogicalAssignmentValue(checker, parent.left);
            return left !== STATIC_UNKNOWN && !Boolean(left);
          })()) ||
        (parent.operatorToken.kind === ts.SyntaxKind.BarBarToken &&
          staticBranchValue(checker, parent.left) === true) ||
        (parent.operatorToken.kind === ts.SyntaxKind.BarBarEqualsToken &&
          (() => {
            const left = staticLogicalAssignmentValue(checker, parent.left);
            return left !== STATIC_UNKNOWN && Boolean(left);
          })()) ||
        (parent.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken &&
          (() => {
            const left = staticPrimitiveValue(checker, parent.left);
            return (
              left !== STATIC_UNKNOWN && left !== null && left !== undefined
            );
          })()) ||
        (parent.operatorToken.kind ===
          ts.SyntaxKind.QuestionQuestionEqualsToken &&
          (() => {
            const left = staticLogicalAssignmentValue(checker, parent.left);
            return (
              left !== STATIC_UNKNOWN && left !== null && left !== undefined
            );
          })()))
    )
      return true;
    current = parent;
  }
  return false;
}

function canonicalSymbol(checker, nodeOrSymbol) {
  if (!nodeOrSymbol) return null;
  let symbol =
    nodeOrSymbol.escapedName !== undefined
      ? nodeOrSymbol
      : checker.getSymbolAtLocation(nodeOrSymbol);
  if (!symbol) return null;
  if (symbol.flags & ts.SymbolFlags.Alias)
    symbol = checker.getAliasedSymbol(symbol);
  return symbol;
}

function symbolId(checker, symbol) {
  const target = canonicalSymbol(checker, symbol);
  if (!target) return null;
  const declarations = (target.declarations || []).map((declaration) => {
    const source = declaration.getSourceFile();
    return `${normalize(source.fileName)}:${declaration.getStart(source)}`;
  });
  return `${checker.getFullyQualifiedName(target)}@${declarations.join("|")}`;
}

function exportedSymbol(checker, sourceFile, name) {
  const moduleSymbol = checker.getSymbolAtLocation(sourceFile);
  if (!moduleSymbol) return null;
  return canonicalSymbol(
    checker,
    checker
      .getExportsOfModule(moduleSymbol)
      .find((entry) => entry.name === name),
  );
}

function declarationOf(symbol, predicate = () => true) {
  return (symbol?.declarations || []).find(predicate) || null;
}

function containingFunction(node) {
  let current = node.parent;
  while (current) {
    if (ts.isFunctionLike(current)) return current;
    current = current.parent;
  }
  return null;
}

function parameterSymbol(checker, declaration, name) {
  const parameter = declaration.parameters?.find(
    (entry) => ts.isIdentifier(entry.name) && entry.name.text === name,
  );
  return parameter ? canonicalSymbol(checker, parameter.name) : null;
}

function receiverSymbol(checker, expression) {
  if (ts.isIdentifier(expression)) return canonicalSymbol(checker, expression);
  if (ts.isPropertyAccessExpression(expression))
    return canonicalSymbol(checker, expression.name);
  return null;
}

function returnedMemberSymbol(checker, factoryDeclaration, member) {
  const signature = checker.getSignatureFromDeclaration(factoryDeclaration);
  const returnType = signature && checker.getReturnTypeOfSignature(signature);
  return returnType ? checker.getPropertyOfType(returnType, member) : null;
}

function localCallableDeclaration(symbol, factoryDeclaration) {
  return declarationOf(symbol, (declaration) => {
    if (
      !ts.isFunctionDeclaration(declaration) &&
      !ts.isMethodDeclaration(declaration) &&
      !ts.isVariableDeclaration(declaration)
    )
      return false;
    return (
      declaration.pos >= factoryDeclaration.pos &&
      declaration.end <= factoryDeclaration.end
    );
  });
}

function callableBody(declaration) {
  if (!declaration) return null;
  if (ts.isVariableDeclaration(declaration))
    return declaration.initializer || null;
  if (ts.isPropertyAssignment(declaration))
    return declaration.initializer || null;
  return declaration.body || declaration;
}

function memberReachesParameterBinding(
  checker,
  factoryDeclaration,
  memberSymbol,
  parameter,
  binding,
) {
  const parameterIdentity = parameterSymbol(
    checker,
    factoryDeclaration,
    parameter,
  );
  const pending = [];
  const visited = new Set();
  for (const declaration of memberSymbol?.declarations || []) {
    if (
      declaration.pos < factoryDeclaration.pos ||
      declaration.end > factoryDeclaration.end
    )
      continue;
    if (ts.isPropertyAssignment(declaration)) {
      if (ts.isIdentifier(declaration.initializer))
        pending.push({
          symbol: canonicalSymbol(checker, declaration.initializer),
          constants: new Map(),
        });
      else
        pending.push({ body: declaration.initializer, constants: new Map() });
    } else if (ts.isShorthandPropertyAssignment(declaration)) {
      pending.push({
        symbol: canonicalSymbol(
          checker,
          checker.getShorthandAssignmentValueSymbol(declaration) ||
            declaration.name,
        ),
        constants: new Map(),
      });
    } else {
      pending.push({
        symbol: canonicalSymbol(checker, declaration.name || declaration),
        constants: new Map(),
      });
    }
  }
  while (pending.length) {
    const entry = pending.shift();
    const current = canonicalSymbol(checker, entry.symbol);
    const body =
      entry.body ||
      callableBody(localCallableDeclaration(current, factoryDeclaration));
    if (!body) continue;
    const visitKey = `${current ? symbolId(checker, current) : `${body.pos}:${body.end}`}:${[...entry.constants.entries()].map(([key, value]) => `${symbolId(checker, key)}=${value}`).join(",")}`;
    if (visited.has(visitKey)) continue;
    visited.add(visitKey);
    for (const declaration of walk(body, ts.isVariableDeclaration, (node) =>
      ts.isFunctionLike(node),
    )) {
      if (
        !ts.isArrayBindingPattern(declaration.name) ||
        !declaration.initializer
      )
        continue;
      const values = literalTupleFromIndexedConstant(
        checker,
        declaration.initializer,
        entry.constants,
      );
      if (!values) continue;
      declaration.name.elements.forEach((element, index) => {
        if (
          !ts.isOmittedExpression(element) &&
          ts.isIdentifier(element.name) &&
          typeof values[index] === "string"
        )
          entry.constants.set(
            canonicalSymbol(checker, element.name),
            values[index],
          );
      });
    }
    const bindingAccess = walk(
      body,
      (node) =>
        (ts.isPropertyAccessExpression(node) &&
          node.name.text === binding &&
          receiverSymbol(checker, node.expression) === parameterIdentity) ||
        (ts.isElementAccessExpression(node) &&
          receiverSymbol(checker, node.expression) === parameterIdentity &&
          ((ts.isStringLiteral(node.argumentExpression) &&
            node.argumentExpression.text === binding) ||
            (ts.isIdentifier(node.argumentExpression) &&
              entry.constants.get(
                canonicalSymbol(checker, node.argumentExpression),
              ) === binding))),
      (node) => ts.isFunctionLike(node),
    );
    if (bindingAccess.length) return true;
    for (const call of walk(body, ts.isCallExpression, (node) =>
      ts.isFunctionLike(node),
    )) {
      const callee = call.expression;
      if (
        ts.isPropertyAccessExpression(callee) &&
        callee.name.text === binding &&
        receiverSymbol(checker, callee.expression) === parameterIdentity
      )
        return true;
      if (
        ts.isElementAccessExpression(callee) &&
        receiverSymbol(checker, callee.expression) === parameterIdentity &&
        ((ts.isStringLiteral(callee.argumentExpression) &&
          callee.argumentExpression.text === binding) ||
          (ts.isIdentifier(callee.argumentExpression) &&
            entry.constants.get(
              canonicalSymbol(checker, callee.argumentExpression),
            ) === binding))
      )
        return true;
      if (ts.isPropertyAccessExpression(callee)) {
        const member = canonicalSymbol(checker, callee.name);
        if (localCallableDeclaration(member, factoryDeclaration)) {
          pending.push({ symbol: member, constants: new Map(entry.constants) });
          continue;
        }
      }
      const local = ts.isIdentifier(callee)
        ? canonicalSymbol(checker, callee)
        : null;
      const localDeclaration = localCallableDeclaration(
        local,
        factoryDeclaration,
      );
      if (localDeclaration) {
        const constants = new Map();
        const parameters =
          ts.isVariableDeclaration(localDeclaration) &&
          ts.isFunctionLike(localDeclaration.initializer)
            ? localDeclaration.initializer.parameters
            : localDeclaration.parameters || [];
        for (let index = 0; index < parameters.length; index += 1) {
          const argument = call.arguments[index];
          const target = canonicalSymbol(checker, parameters[index].name);
          if (argument && ts.isStringLiteral(argument))
            constants.set(target, argument.text);
          else if (argument && ts.isIdentifier(argument)) {
            const value = entry.constants.get(
              canonicalSymbol(checker, argument),
            );
            if (value !== undefined) constants.set(target, value);
          }
        }
        pending.push({ symbol: local, constants });
        for (let index = 0; index < call.arguments.length; index += 1) {
          const argument = call.arguments[index];
          if (argument && ts.isFunctionLike(argument))
            pending.push({ body: argument, constants: entry.constants });
        }
      }
    }
  }
  return false;
}

function literalTupleFromIndexedConstant(checker, expression, constants) {
  if (!ts.isElementAccessExpression(expression)) return null;
  const index = expression.argumentExpression;
  const key = ts.isStringLiteral(index)
    ? index.text
    : ts.isIdentifier(index)
      ? constants.get(canonicalSymbol(checker, index))
      : null;
  if (typeof key !== "string" || !ts.isIdentifier(expression.expression))
    return null;
  const table = canonicalSymbol(checker, expression.expression);
  const declaration = declarationOf(table, ts.isVariableDeclaration);
  if (!declaration?.initializer) return null;
  let initializer = declaration.initializer;
  if (
    ts.isCallExpression(initializer) &&
    initializer.arguments[0] &&
    ts.isObjectLiteralExpression(initializer.arguments[0])
  )
    initializer = initializer.arguments[0];
  if (!ts.isObjectLiteralExpression(initializer)) return null;
  const property = initializer.properties.find((entry) =>
    namedProperty(entry, key),
  );
  if (!property || !ts.isPropertyAssignment(property)) return null;
  let tuple = property.initializer;
  if (
    ts.isCallExpression(tuple) &&
    tuple.arguments[0] &&
    ts.isArrayLiteralExpression(tuple.arguments[0])
  )
    tuple = tuple.arguments[0];
  if (!ts.isArrayLiteralExpression(tuple)) return null;
  return tuple.elements.map((element) =>
    ts.isStringLiteral(element) ? element.text : undefined,
  );
}

module.exports = {
  canonicalSymbol,
  createMemoryProgram,
  createProductionProgram,
  registrarEvidence,
  symbolId,
  verifyCapabilityEvidence,
};
