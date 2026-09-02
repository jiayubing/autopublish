"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const { builtinModules } = require("node:module");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const asar = require("@electron/asar");
const {
  LEGACY_PATHS,
  scanArchive,
  scanSourceTree,
} = require("./verify-legacy-absence");
const ROOT = path.resolve(__dirname, "..");
const SOURCE_EXTENSIONS = new Set([".cjs", ".js", ".mjs", ".ts", ".tsx"]);
const SOURCE_ROOTS = [
  "src",
  "desktop",
  "media-workbench/src",
  "auth-server/src",
];
const ARCHITECTURE_ROOTS = [...SOURCE_ROOTS, "scripts", "auth-server/scripts"];
const NODE_BUILTIN_SPECIFIERS = new Set([
  ...builtinModules,
  ...builtinModules.map((name) => `node:${name}`),
]);
const DEPENDENCY_RULES = [
  {
    name: "application-service-to-ipc-contract",
    roots: ["desktop/services"],
    forbidden: (specifier) =>
      /(?:^|\/)desktop\/ipc\/contracts(?:\/|$)/.test(specifier),
  },
  {
    name: "src-to-desktop",
    roots: ["src"],
    // Platform modules own the registration point for their named optional
    // settings contribution while the settings implementation remains in its
    // desktop application-service owner.
    allowlist: new Map([
      ["src/platforms/hepan/platform.js", 1],
      ["src/platforms/media/platform.js", 1],
    ]),
    forbidden: (specifier) => /^desktop(?:\/|$)/.test(specifier),
  },
  {
    name: "domain-application-to-implementation",
    roots: ["src/domain", "src/application"],
    forbidden: (specifier) =>
      /^(?:desktop|media-workbench|src\/infrastructure|operational-store)(?:\/|$)/.test(
        specifier,
      ) || /^(?:electron|ipc|sqlite3?|better-sqlite3)$/.test(specifier),
  },
  {
    name: "renderer-to-node-infrastructure",
    roots: ["media-workbench/src"],
    forbidden: (specifier) =>
      isRendererNodeSpecifier(specifier) ||
      /^(?:electron|sqlite3?|better-sqlite3)$/.test(specifier) ||
      /^(?:desktop|src\/infrastructure)(?:\/|$)/.test(specifier),
  },
  {
    name: "renderer-to-platform-automation",
    roots: ["media-workbench/src"],
    forbidden: (specifier) =>
      /^(?:src\/platforms|src\/core\/playwright|desktop\/services|desktop\/worker)(?:\/|$)/.test(
        specifier,
      ) ||
      /^(?:playwright|playwright-core|@playwright|puppeteer(?:-core)?)(?:\/|$)/.test(
        specifier,
      ),
  },
  {
    name: "platform-adapter-to-global-runtime-config",
    roots: ["src/platforms"],
    allowlist: new Map([
      ["src/platforms/lieju/adapter.js", 1],
      ["src/platforms/media/adapter.js", 1],
    ]),
    forbidden: (specifier) => /^(?:scripts\/config)(?:\.js)?$/.test(specifier),
  },
  {
    name: "worker-adapter-to-operational-writer",
    roots: ["desktop/worker", "src/platforms"],
    forbidden: (specifier) =>
      /^(?:operational-store|src\/infrastructure\/operational-store)(?:\/|$)/.test(
        specifier,
      ),
  },
];
const IMPORT_PATTERNS = [
  /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
  /\bfrom\s*["']([^"']+)["']/g,
  /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
  /\bimport\s+["']([^"']+)["']/g,
];
const INTERNAL_PREFIX = "src/infrastructure/operational-store/internal";
const OPERATIONAL_FACADE =
  "src/infrastructure/operational-store/operational-store.js";
const MIGRATION_IMPORTER = "scripts/migrate-operational-store-v1.js";
const RECOVERY_GUARD_IMPORT = `${INTERNAL_PREFIX}/operational-store-recovery-guard`;
const OPERATIONAL_FACADE_IMPORTERS = new Set([
  "desktop/composition/publication-recovery-composition.js",
  "desktop/composition/workspace-migration-composition.js",
  "desktop/composition/workspace-runtime-composition.js",
  "scripts/migrate-operational-store-v1.js",
  // Ticket 25-F evidence tooling measures the public persistence boundary;
  // it does not write business facts or depend on OperationalStore internals.
  "scripts/run-ticket-25-f-benchmark.js",
]);
const RETIRED_ARCHITECTURE_PATHS = Object.freeze([
  "desktop/storage-paths.js",
  "desktop/workspace-paths.js",
  "desktop/packaging/packaged-runtime-resolver.js",
  "desktop/packaging/playwright-runtime-paths.js",
]);
const REQUIRED_ARCHITECTURE_PATHS = Object.freeze([
  "src/infrastructure/workspace/storage-paths.js",
  "src/infrastructure/workspace/workspace-paths.js",
  "src/infrastructure/runtime/packaged-runtime-resolver.js",
  "src/infrastructure/runtime/playwright-runtime-paths.js",
  "src/infrastructure/runtime/playwright-runtime-resolver.js",
]);
const PUBLISHER_OWNER_FILES = Object.freeze([
  "desktop/services/desktop-publisher-router.js",
  "desktop/services/worker-publisher.js",
  "desktop/services/media-publisher.js",
]);
const SQLITE_WRITER_OWNERS = new Set([
  "auth-server/scripts/migration-roundtrip-evidence.js",
]);
const SQLITE_MODULE_IMPORT_PATTERN =
  /(?:require\s*\(\s*["'](?:node:sqlite|sqlite3|better-sqlite3)["']\s*\)|from\s*["'](?:node:sqlite|sqlite3|better-sqlite3)["'])/;
const PRIVATE_PACKAGE_PATHS = [
  /(^|\/)(?:tests?|fixtures?|coverage|build|logs?|tmp|work|published|failed|input|research|generated)(?:\/|$)/i,
  /(^|\/)(?:\.env(?:\.[^/]+)?|[^/]+\.db|[^/]+\.log)$/i,
  /(^|\/)(?:ai-provider|media-provider|hepan-provider|platform-settings-migration|workspace-location|device-identity)\.json$/i,
  /(?:publish-log|legacy-adapter-publisher|src\/infrastructure\/publishers\/publisher-router)/i,
];
const SENSITIVE_VALUE_PATTERN =
  /(?<![A-Za-z0-9_])(?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|cookie)\s*["']?\s*[:=]\s*["'][^"'\r\n]{6,}["']/i;
const TEXT_FILE_PATTERN =
  /\.(?:cjs|js|mjs|ts|tsx|json|env|log|md|txt|csv|yaml|yml|py|html|css|xml|sql|sh|bat|cmd|ps1)$/i;
const TRACKED_GENERATED_PATTERN =
  /(^|\/)(?:node_modules|dist|coverage|release(?:-|\/)|build|__pycache__)(?:\/|$)|\.(?:pyc|tsbuildinfo|map|log)$/i;
const PACKAGE_ALLOWED_PATHS = new Set(["build/preload/preload.cjs"]);

function gateError(code, message, details) {
  const error = new Error(message);
  error.code = code;
  error.details = details;
  return error;
}

function sourceFilesUnder(directory) {
  if (!fs.existsSync(directory)) return [];
  const result = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...sourceFilesUnder(filename));
    else if (SOURCE_EXTENSIONS.has(path.extname(entry.name)))
      result.push(filename);
  }
  return result;
}

function productionSourceFiles() {
  return SOURCE_ROOTS.flatMap((relative) =>
    sourceFilesUnder(path.join(ROOT, relative)),
  );
}

function architectureSourceFiles() {
  return ARCHITECTURE_ROOTS.flatMap((relative) =>
    sourceFilesUnder(path.join(ROOT, relative)),
  );
}

function relative(filename) {
  return path.relative(ROOT, filename).replaceAll("\\", "/");
}

function resolveImportSpecifier(filename, specifier) {
  if (!specifier.startsWith(".")) return specifier;
  return path
    .relative(ROOT, path.resolve(path.dirname(filename), specifier))
    .replaceAll("\\", "/");
}

function isRendererNodeSpecifier(specifier) {
  return NODE_BUILTIN_SPECIFIERS.has(specifier);
}

function sqliteWriterOpenings(source) {
  if (!SQLITE_MODULE_IMPORT_PATTERN.test(source)) return [];
  const openings = [];
  const patterns = [
    /\bnew\s+(?:(?:[A-Za-z_$][\w$]*\.)*)Database(?:Sync)?\s*\(([^)]*)\)/g,
    /\b[A-Za-z_$][\w$]*\.(?:open|openDatabase|connect)\s*\(([^)]*)\)/g,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const argumentsText = match[1] || "";
      const constructor = match[0].startsWith("new ");
      openings.push({
        kind: constructor ? "constructor" : "open",
        argumentsText,
        writable: constructor
          ? !/\breadOnly\s*:\s*true\b/.test(argumentsText)
          : true,
      });
    }
  }
  return openings;
}

function publisherOwnerCandidates(fileRecords) {
  return fileRecords
    .filter(({ name, source }) => {
      const normalized = name.replaceAll("\\", "/");
      if (!normalized.startsWith("desktop/services/")) return false;
      return (
        /\bfunction\s+create[A-Za-z_$]*Publisher[A-Za-z_$]*\s*\(/.test(
          source,
        ) ||
        /\bcreate[A-Za-z_$]*Publisher[A-Za-z_$]*\s*=\s*(?:async\s*)?(?:function|\()/.test(
          source,
        ) ||
        /(?:^|[,{])\s*publish\s*(?:\(|:\s*(?:async\s*)?(?:function\s*)?\()/.test(
          source,
        )
      );
    })
    .map(({ name }) => name.replaceAll("\\", "/"));
}

function findImports(source, filename, isForbidden) {
  const violations = [];
  for (const pattern of IMPORT_PATTERNS) {
    let match;
    while ((match = pattern.exec(source))) {
      const specifier = match[1].replaceAll("\\", "/");
      const resolved = resolveImportSpecifier(filename, specifier);
      if (!isForbidden(resolved)) continue;
      violations.push({
        file: relative(filename),
        line: source.slice(0, match.index).split(/\r?\n/).length,
        specifier,
      });
    }
  }
  return violations;
}

function dependencyDirectionReport() {
  const filesByRoot = new Map(
    SOURCE_ROOTS.map((root) => [root, sourceFilesUnder(path.join(ROOT, root))]),
  );
  const violations = [];
  for (const rule of DEPENDENCY_RULES) {
    for (const root of rule.roots) {
      for (const filename of filesByRoot.get(root) ||
        sourceFilesUnder(path.join(ROOT, root))) {
        const found = findImports(
          fs.readFileSync(filename, "utf8"),
          filename,
          rule.forbidden,
        ).map((item) => Object.assign({ rule: rule.name }, item));
        if (rule.allowlist instanceof Map) {
          const allowed = rule.allowlist.get(relative(filename)) || 0;
          violations.push(...found.slice(allowed));
          if (allowed > 0 && found.length < allowed) {
            violations.push({
              rule: `${rule.name}-stale-allowlist`,
              file: relative(filename),
              allowed,
              found: found.length,
            });
          }
        } else {
          violations.push(...found);
        }
      }
    }
  }
  for (const retiredPath of RETIRED_ARCHITECTURE_PATHS) {
    if (fs.existsSync(path.join(ROOT, retiredPath)))
      violations.push({ rule: "retired-architecture-path", file: retiredPath });
  }
  for (const requiredPath of REQUIRED_ARCHITECTURE_PATHS) {
    if (!fs.existsSync(path.join(ROOT, requiredPath)))
      violations.push({
        rule: "required-architecture-path",
        file: requiredPath,
      });
  }
  return { status: violations.length ? "FAILED" : "PASSED", violations };
}

function isInternalImport(resolved) {
  return (
    resolved === INTERNAL_PREFIX || resolved.startsWith(`${INTERNAL_PREFIX}/`)
  );
}

function isOperationalFacadeImport(resolved) {
  return (
    resolved === OPERATIONAL_FACADE ||
    resolved === OPERATIONAL_FACADE.replace(/\.js$/, "")
  );
}

function isAllowedInternalImport(importer, resolved) {
  if (importer === MIGRATION_IMPORTER)
    return resolved === RECOVERY_GUARD_IMPORT;
  return (
    importer === OPERATIONAL_FACADE ||
    importer.startsWith(`${INTERNAL_PREFIX}/`)
  );
}

function operationalStoreBoundaryReport() {
  const violations = [];
  for (const filename of architectureSourceFiles()) {
    const importer = relative(filename);
    const source = fs.readFileSync(filename, "utf8");
    for (const pattern of IMPORT_PATTERNS) {
      let match;
      while ((match = pattern.exec(source))) {
        const resolved = resolveImportSpecifier(filename, match[1]);
        if (
          isInternalImport(resolved) &&
          !isAllowedInternalImport(importer, resolved)
        ) {
          violations.push({
            file: importer,
            line: source.slice(0, match.index).split(/\r?\n/).length,
            specifier: match[1],
          });
        }
        if (
          isOperationalFacadeImport(resolved) &&
          !OPERATIONAL_FACADE_IMPORTERS.has(importer)
        ) {
          violations.push({
            file: importer,
            line: source.slice(0, match.index).split(/\r?\n/).length,
            specifier: match[1],
            rule: "operational-store-facade-importer",
          });
        }
      }
    }
  }
  return { status: violations.length ? "FAILED" : "PASSED", violations };
}

function ownershipReport() {
  const files = productionSourceFiles();
  const retiredWriterReferences = [];
  const workerWriterReferences = [];
  const directSqliteWriters = [];
  const fileRecords = [];
  for (const filename of files) {
    const name = relative(filename);
    const source = fs.readFileSync(filename, "utf8");
    fileRecords.push({ name, source });
    if (
      /publish-log|publication-ledger|legacy-adapter-publisher|src\/infrastructure\/publishers\//i.test(
        source,
      )
    )
      retiredWriterReferences.push(name);
    if (
      (name.startsWith("desktop/worker/") ||
        name.startsWith("src/platforms/")) &&
      /operational-store|new\s+DatabaseSync|DatabaseSync\s*\(/.test(source)
    )
      workerWriterReferences.push(name);
    const hasWritableDatabaseOpening = sqliteWriterOpenings(source).some(
      (opening) => opening.writable,
    );
    if (
      hasWritableDatabaseOpening &&
      !name.startsWith("src/infrastructure/operational-store/") &&
      !name.startsWith("auth-server/src/") &&
      !SQLITE_WRITER_OWNERS.has(name)
    )
      directSqliteWriters.push(name);
  }
  const publisherOwners = publisherOwnerCandidates(fileRecords);
  const unexpectedPublisherOwners = publisherOwners.filter(
    (file) => !PUBLISHER_OWNER_FILES.includes(file),
  );
  const missingOwners = [];
  for (const expected of [
    ...PUBLISHER_OWNER_FILES,
    "src/infrastructure/operational-store/operational-store.js",
  ]) {
    if (!fs.existsSync(path.join(ROOT, expected))) missingOwners.push(expected);
  }
  const violations = [
    ...retiredWriterReferences.map((file) => ({
      rule: "retired-writer-absence",
      file,
    })),
    ...workerWriterReferences.map((file) => ({
      rule: "worker-adapter-writer-boundary",
      file,
    })),
    ...directSqliteWriters
      .filter(
        (file) => !file.startsWith("src/infrastructure/operational-store/"),
      )
      .map((file) => ({ rule: "single-sqlite-owner", file })),
    ...unexpectedPublisherOwners.map((file) => ({
      rule: "unexpected-publisher-owner",
      file,
    })),
    ...missingOwners.map((file) => ({ rule: "required-owner-missing", file })),
  ];
  return {
    status: violations.length ? "FAILED" : "PASSED",
    uniqueOwners: {
      publication: "src/infrastructure/operational-store/operational-store.js",
      remotePublisher: "desktop/services/desktop-publisher-router.js",
      publisherOwners,
    },
    violations,
  };
}

function capabilityReachabilityReport() {
  let fixtures;
  let registry;
  let createProductionProgram;
  let verifyCapabilityEvidence;
  try {
    ({
      productionIpcRegistry: registry,
    } = require("../desktop/ipc/contracts/production-registry"));
    ({
      productionIpcContractFixtures: fixtures,
    } = require("../tests/fixtures/phase-06-production-ipc-contract-fixtures"));
    ({
      createProductionProgram,
      verifyCapabilityEvidence,
    } = require("../tests/helpers/typescript-symbol-evidence"));
  } catch (error) {
    throw gateError(
      "PHASE08_CAPABILITY_GATE_UNAVAILABLE",
      "Capability inventory is unavailable",
      { code: error.code || "LOAD_FAILED" },
    );
  }
  let productionContext;
  try {
    productionContext = {
      ...createProductionProgram(ROOT),
      applicationRoot: ROOT,
    };
  } catch (error) {
    throw gateError(
      "PHASE08_CAPABILITY_GATE_UNAVAILABLE",
      "Capability reachability verifier is unavailable",
      { code: error.code || "PROGRAM_LOAD_FAILED" },
    );
  }
  const missing = [];
  const unowned = [];
  const unreachable = [];
  for (const fixture of fixtures || []) {
    const capability = fixture && fixture.capability;
    const contract = capability && registry.byCapability(capability);
    if (!contract) {
      missing.push(capability || "unknown-capability");
      continue;
    }
    const consumer =
      fixture.productionCaller && fixture.productionCaller.consumer;
    const requiredConsumerFields = [
      "kind",
      "source",
      "owner",
      "method",
      "featureSource",
      "featureMethod",
    ];
    const missingFields = requiredConsumerFields.filter(
      (field) =>
        !consumer ||
        typeof consumer[field] !== "string" ||
        consumer[field].trim() === "",
    );
    if (
      !consumer ||
      !Object.prototype.hasOwnProperty.call(consumer, "receiver")
    )
      missingFields.push("receiver");
    if (missingFields.length) unowned.push({ capability, missingFields });
    else {
      const evidence = verifyCapabilityEvidence(productionContext, {
        ...fixture,
        kind: contract.kind,
      });
      if (!evidence.ok)
        unreachable.push({
          capability,
          reasons: evidence.reasons || ["symbol reachability failed"],
        });
    }
  }
  const violations = [
    ...missing.map((capability) => ({ rule: "registry-missing", capability })),
    ...unowned.map(({ capability, missingFields }) => ({
      rule: "production-consumer-missing",
      capability,
      missingFields,
    })),
    ...unreachable.map(({ capability, reasons }) => ({
      rule: "production-consumer-unreachable",
      capability,
      reasons,
    })),
  ];
  return {
    status: violations.length ? "FAILED" : "PASSED",
    capabilityCount: (fixtures || []).length,
    reachableCount:
      (fixtures || []).length -
      missing.length -
      unowned.length -
      unreachable.length,
    violations,
  };
}

function trackedGeneratedOutputReport() {
  const rootResult = spawnSync("git", ["rev-parse", "--show-toplevel"], {
    cwd: ROOT,
    encoding: "utf8",
    windowsHide: true,
  });
  if (rootResult.status !== 0)
    throw gateError("PHASE08_GIT_GATE_UNAVAILABLE", "Git root is unavailable");
  const gitRoot = rootResult.stdout.trim();
  const result = spawnSync("git", ["ls-files", "-z"], {
    cwd: gitRoot,
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.status !== 0)
    throw gateError(
      "PHASE08_GIT_GATE_UNAVAILABLE",
      "Tracked file inventory is unavailable",
    );
  const matches = String(result.stdout || "")
    .split("\0")
    .filter(Boolean)
    .map((filename) => filename.replaceAll("\\", "/"))
    .filter((filename) => TRACKED_GENERATED_PATTERN.test(filename));
  return { status: matches.length ? "FAILED" : "PASSED", matches };
}

function isAppOwnedPackagePath(entry) {
  return !/(^|\/)node_modules\//i.test(entry);
}

function isAllowedPackagePath(entry) {
  return [...PACKAGE_ALLOWED_PATHS].some(
    (allowed) => entry === allowed || entry.endsWith(`/${allowed}`),
  );
}

function privatePackageMatches(entries) {
  const directoryEntries = new Set(
    entries.filter((entry) =>
      entries.some((candidate) => candidate.startsWith(`${entry}/`)),
    ),
  );
  return entries.filter(
    (entry) =>
      isAppOwnedPackagePath(entry) &&
      !directoryEntries.has(entry) &&
      !isAllowedPackagePath(entry) &&
      PRIVATE_PACKAGE_PATHS.some((pattern) => pattern.test(entry)),
  );
}

function sensitivePackageMatches(entries, readEntry) {
  const matches = [];
  const unreadable = [];
  for (const entry of entries) {
    if (!isAppOwnedPackagePath(entry) || !TEXT_FILE_PATTERN.test(entry))
      continue;
    let content;
    try {
      content = readEntry(entry).toString("utf8");
    } catch (_) {
      unreadable.push(entry);
      continue;
    }
    if (SENSITIVE_VALUE_PATTERN.test(content)) matches.push(entry);
  }
  return { matches, unreadable };
}

function listRegularFiles(directory, prefix, output) {
  if (!fs.existsSync(directory)) return output;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    const relativeName = `${prefix}/${entry.name}`.replace(/^\//, "");
    if (entry.isDirectory()) listRegularFiles(filename, relativeName, output);
    else if (entry.isSymbolicLink())
      output.push({ path: relativeName, filename, link: true });
    else if (entry.isFile())
      output.push({ path: relativeName, filename, link: false });
  }
  return output;
}

function listExtraResourceFiles(resources) {
  const output = [];
  if (!fs.existsSync(resources)) return output;
  for (const entry of fs.readdirSync(resources, { withFileTypes: true })) {
    if (entry.name === "app.asar" || entry.name === "app.asar.unpacked")
      continue;
    const filename = path.join(resources, entry.name);
    const relativeName = `extraResources/${entry.name}`;
    if (entry.isDirectory()) listRegularFiles(filename, relativeName, output);
    else if (entry.isSymbolicLink())
      output.push({ path: relativeName, filename, link: true });
    else if (entry.isFile())
      output.push({ path: relativeName, filename, link: false });
  }
  return output;
}

function packageBoundaryReport(resourcesPath) {
  const resources = path.resolve(resourcesPath);
  const archive = path.join(resources, "app.asar");
  let entries;
  try {
    entries = asar
      .listPackage(archive)
      .map((entry) => entry.replace(/^[/\\]+/, "").replaceAll("\\", "/"));
  } catch (_) {
    throw gateError(
      "PHASE08_PACKAGE_UNAVAILABLE",
      "Production app archive is unavailable",
    );
  }
  const unpackedRoot = path.join(resources, "app.asar.unpacked");
  const unpacked = listRegularFiles(unpackedRoot, "", []);
  const unpackedPaths = unpacked.map((item) => item.path);
  const extra = listExtraResourceFiles(resources);
  const extraPaths = extra.map((item) => item.path);
  const allEntries = [
    ...entries,
    ...unpackedPaths.map((entry) => `app.asar.unpacked/${entry}`),
    ...extraPaths,
  ];
  const privateMatches = privatePackageMatches(allEntries);
  const legacyMatches = allEntries.filter((entry) =>
    LEGACY_PATHS.some(
      (legacyPath) => entry === legacyPath || entry.endsWith(`/${legacyPath}`),
    ),
  );
  const sensitiveMatches = sensitivePackageMatches(entries, (entry) =>
    asar.extractFile(archive, entry.replaceAll("/", path.sep)),
  );
  const unpackedSensitiveMatches = sensitivePackageMatches(
    unpackedPaths,
    (entry) => fs.readFileSync(path.join(unpackedRoot, entry)),
  );
  const extraSensitiveMatches = sensitivePackageMatches(extraPaths, (entry) =>
    fs.readFileSync(extra.find((item) => item.path === entry).filename),
  );
  const linkMatches = [...unpacked, ...extra]
    .filter((item) => item.link)
    .map((item) => item.path);
  const violations = [
    ...privateMatches.map((entry) => ({
      rule: "private-or-test-content",
      entry,
    })),
    ...legacyMatches.map((entry) => ({ rule: "retired-source", entry })),
    ...sensitiveMatches.matches
      .concat(unpackedSensitiveMatches.matches, extraSensitiveMatches.matches)
      .map((entry) => ({ rule: "sensitive-content", entry })),
    ...sensitiveMatches.unreadable
      .concat(
        unpackedSensitiveMatches.unreadable,
        extraSensitiveMatches.unreadable,
      )
      .map((entry) => ({ rule: "unreadable-package-entry", entry })),
    ...linkMatches.map((entry) => ({ rule: "resource-link", entry })),
  ];
  return {
    status: violations.length ? "FAILED" : "PASSED",
    archiveEntries: entries.length,
    unpackedEntries: unpackedPaths.length,
    extraResourceEntries: extraPaths.length,
    archiveSha256: crypto
      .createHash("sha256")
      .update(fs.readFileSync(archive))
      .digest("hex"),
    violations,
  };
}

function legacyReport(resourcesPath) {
  const sourceMatches = scanSourceTree(ROOT);
  const archiveMatches = resourcesPath
    ? scanArchive(resourcesPath).matches
    : [];
  const violations = [...sourceMatches, ...archiveMatches];
  return {
    status: violations.length ? "FAILED" : "PASSED",
    sourceMatches,
    archiveMatches,
    archiveStatus: resourcesPath
      ? archiveMatches.length
        ? "FAILED"
        : "PASSED"
      : "NOT_APPLICABLE",
    violations,
  };
}

function verifyPhase08Gates(options) {
  const opts = options || {};
  const checks = {
    dependencyDirection: dependencyDirectionReport(),
    operationalStoreBoundary: operationalStoreBoundaryReport(),
    uniqueOwnersAndWriters: ownershipReport(),
    capabilityReachability: capabilityReachabilityReport(),
    legacyAbsence: legacyReport(opts.resourcesPath),
    trackedGeneratedOutput: trackedGeneratedOutputReport(),
  };
  if (opts.resourcesPath)
    checks.packageBoundary = packageBoundaryReport(opts.resourcesPath);
  else checks.packageBoundary = { status: "NOT_APPLICABLE", violations: [] };
  const failures = Object.entries(checks).flatMap(([name, value]) =>
    value.status === "FAILED"
      ? [{ check: name, violations: value.violations || [] }]
      : [],
  );
  return {
    status: failures.length ? "FAILED" : "PASSED",
    operation: "phase-08-architecture-and-package-gates",
    checks,
    failures,
  };
}

function parseArguments(argv) {
  const args = Array.from(argv || []);
  const options = {};
  while (args.length) {
    const arg = args.shift();
    if (arg === "--resources" || arg === "--output") {
      const value = args.shift();
      if (!value || value.startsWith("--"))
        throw gateError("PHASE08_ARGUMENT_INVALID", `${arg} requires a value`);
      options[arg.slice(2) + (arg === "--resources" ? "Path" : "")] =
        path.resolve(value);
    } else {
      throw gateError("PHASE08_ARGUMENT_INVALID", "unknown option");
    }
  }
  return options;
}

function writeReport(filename, report) {
  const output = path.resolve(filename);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(report, null, 2) + "\n", {
    encoding: "utf8",
    mode: 0o600,
  });
}

if (require.main === module) {
  try {
    const options = parseArguments(process.argv.slice(2));
    const report = verifyPhase08Gates(options);
    if (options.output) writeReport(options.output, report);
    process.stdout.write(JSON.stringify(report) + "\n");
    if (report.status !== "PASSED") process.exitCode = 1;
  } catch (error) {
    const code =
      error &&
      typeof error.code === "string" &&
      /^PHASE08_[A-Z0-9_]{1,72}$/.test(error.code)
        ? error.code
        : "PHASE08_GATE_FAILED";
    process.stderr.write(code + "\n");
    process.exitCode = 1;
  }
}

module.exports = {
  DEPENDENCY_RULES,
  dependencyDirectionReport,
  isOperationalFacadeImport,
  isRendererNodeSpecifier,
  packageBoundaryReport,
  parseArguments,
  publisherOwnerCandidates,
  sqliteWriterOpenings,
  verifyPhase08Gates,
};
