"use strict";

const fs = require("node:fs");
const path = require("node:path");

const {
  productionIpcRegistry,
} = require("../desktop/ipc/contracts/production-registry");
const {
  scanSourceTree: scanRendererContractSource,
} = require("./verify-renderer-contract-absence");

const ROOT = path.resolve(__dirname, "..");

const RETIRED_CAPABILITIES = Object.freeze([
  "platform.submitSelected",
  "content.previewCleanupFailedSubmissionItems",
  "content.cleanupFailedSubmissionItems",
]);

const RETIRED_CHANNELS = Object.freeze([
  "content:preview-cleanup-failed-submission-items",
  "content:cleanup-failed-submission-items",
]);

const RETIRED_RENDERER_METHODS = Object.freeze([
  "submitSelected",
  "previewCleanupFailedSubmissionItems",
  "cleanupFailedSubmissionItems",
]);

const MIGRATION_ONLY_ALLOWLIST = Object.freeze([
  "src/content/legacy-migration-reader.js",
  "src/content/legacy-migration-planner.js",
  "src/domain/migration-import-contract.js",
  "src/infrastructure/operational-store/internal/operational-store-migration-import.js",
  "scripts/migrate-operational-store-v1.js",
]);

const NORMAL_COMPOSITION_FILES = Object.freeze([
  "desktop/main.js",
  "desktop/preload.js",
  "desktop/composition/workspace-runtime-composition.js",
]);

const NORMAL_SOURCE_ROOTS = Object.freeze([
  "desktop/ipc",
  "desktop/services",
  "desktop/worker",
  "media-workbench/src",
]);

const MIGRATION_MODULE_NAMES = Object.freeze([
  "legacy-migration-reader",
  "legacy-migration-planner",
  "migration-import-contract",
  "operational-store-migration-import",
  "migrate-operational-store-v1",
]);

function absenceError(code, message, details) {
  const error = new Error(message);
  error.code = code;
  if (details) error.details = details;
  return error;
}

function sourceFilesUnder(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFilesUnder(filename);
    return /\.(?:js|mjs|cjs|ts|tsx)$/.test(entry.name) ? [filename] : [];
  });
}

function relative(filename) {
  return path.relative(ROOT, filename).replaceAll("\\", "/");
}

function sourceFilesAt(relativePaths) {
  return relativePaths.flatMap((entry) => {
    const filename = path.join(ROOT, entry);
    if (!fs.existsSync(filename)) return [];
    return fs.statSync(filename).isDirectory()
      ? sourceFilesUnder(filename)
      : [filename];
  });
}

function assertRetiredCapabilitiesAbsent() {
  const capabilityMatches = RETIRED_CAPABILITIES.filter((capability) =>
    productionIpcRegistry.byCapability(capability),
  );
  const channelMatches = RETIRED_CHANNELS.filter((channel) =>
    productionIpcRegistry.byChannel(channel),
  );
  if (capabilityMatches.length || channelMatches.length)
    throw absenceError(
      "TICKET_24_E_CAPABILITY_PRESENT",
      "retired production capability is still registered",
      { capabilityMatches, channelMatches },
    );
  return {
    checkedCapabilities: RETIRED_CAPABILITIES.length,
    checkedChannels: RETIRED_CHANNELS.length,
  };
}

function assertRequestRejects(contract, payload, label) {
  try {
    productionIpcRegistry.encodeRequest(contract, payload);
  } catch (error) {
    if (error && error.code === "IPC_UNKNOWN_FIELD") return;
    throw absenceError(
      "TICKET_24_E_DTO_GATE_INVALID",
      `${label} did not fail at the closed DTO boundary`,
      { code: error && error.code },
    );
  }
  throw absenceError(
    "TICKET_24_E_DTO_FIELD_PRESENT",
    `${label} still accepts a retired DTO field`,
  );
}

function assertResultRejects(contract, payload, label) {
  try {
    productionIpcRegistry.success(contract, payload);
  } catch (error) {
    if (
      error &&
      ["IPC_RESULT_INVALID", "IPC_UNKNOWN_FIELD"].includes(error.code)
    )
      return;
    throw absenceError(
      "TICKET_24_E_DTO_GATE_INVALID",
      `${label} did not fail at the closed result boundary`,
      { code: error && error.code },
    );
  }
  throw absenceError(
    "TICKET_24_E_DTO_FIELD_PRESENT",
    `${label} still projects a retired DTO field`,
  );
}

function verifyPublicDtoAbsence() {
  const preview = productionIpcRegistry.byChannel(
    "content:preview-article-removal-impact",
  );
  const commit = productionIpcRegistry.byChannel("content:trash-articles");
  if (!preview || !commit)
    throw absenceError(
      "TICKET_24_E_DTO_OWNER_MISSING",
      "current article removal DTO owner is not registered",
    );

  const selection = { clientId: "client-24-e", articleId: "article-24-e" };
  assertRequestRejects(
    preview,
    { articles: [selection] },
    "content preview articles",
  );
  assertRequestRejects(
    commit,
    { articles: [selection], confirmed: true },
    "content commit articles",
  );
  assertRequestRejects(
    commit,
    { selections: [selection], legacy: true, confirmed: true },
    "content commit legacy",
  );

  assertResultRejects(
    preview,
    {
      token: "token-24-e",
      articleCount: 0,
      queuedToCancel: [],
      blockedItems: [],
      canCommit: true,
      legacy: true,
    },
    "content preview legacy",
  );
  assertResultRejects(
    commit,
    { articles: [] },
    "content commit result articles",
  );
  return { checkedRequests: 3, checkedResults: 2 };
}

function verifyIpcAndRendererMethodAbsence() {
  const files = [
    ...NORMAL_COMPOSITION_FILES.map((entry) => path.join(ROOT, entry)),
    ...sourceFilesAt(NORMAL_SOURCE_ROOTS),
  ];
  const matches = [];
  for (const filename of files) {
    const source = fs.readFileSync(filename, "utf8");
    for (const method of RETIRED_RENDERER_METHODS)
      if (new RegExp(`\\b${method}\\b`).test(source))
        matches.push({ file: relative(filename), method });
  }
  if (matches.length)
    throw absenceError(
      "TICKET_24_E_IPC_METHOD_PRESENT",
      "retired IPC or Renderer method is still present",
      { matches },
    );
  return {
    checkedFiles: files.length,
    checkedMethods: RETIRED_RENDERER_METHODS.length,
  };
}

function verifyDeadExportAbsence() {
  const snapshotExports = Object.keys(
    require("../desktop/services/article-management-snapshot"),
  );
  const workbench =
    require("../desktop/services/platform-workbench-service").createPlatformWorkbenchService(
      {
        rootDir: ROOT,
        platforms: [],
      },
    );
  const workbenchExports = Object.keys(workbench);
  const staleFiles = [
    "desktop/services/publication-submission-service.js",
    "scripts/repair-article-removal-regressions.js",
  ].filter((entry) => fs.existsSync(path.join(ROOT, entry)));
  const staleExports = [
    ...snapshotExports
      .filter((entry) => entry === "deriveWorkflow")
      .map((entry) => `article-management-snapshot:${entry}`),
    ...workbenchExports
      .filter((entry) => entry === "buildSelectedPlan")
      .map((entry) => `platform-workbench:${entry}`),
  ];
  if (staleFiles.length || staleExports.length)
    throw absenceError(
      "TICKET_24_E_DEAD_EXPORT_PRESENT",
      "a legacy extension seam still has a production export",
      { staleFiles, staleExports },
    );
  return {
    checkedExports: snapshotExports.length + workbenchExports.length,
    staleFiles: 0,
    staleExports: 0,
  };
}

function verifyRendererAbsence() {
  const matches = scanRendererContractSource(ROOT);
  if (matches.length)
    throw absenceError(
      "TICKET_24_E_RENDERER_COMPATIBILITY_PRESENT",
      "retired Renderer bridge or UI seam is still present",
      { matches },
    );
  return { sourceMatches: 0 };
}

function verifyMigrationIsolation() {
  const missing = MIGRATION_ONLY_ALLOWLIST.filter(
    (entry) => !fs.existsSync(path.join(ROOT, entry)),
  );
  if (missing.length)
    throw absenceError(
      "TICKET_24_E_MIGRATION_ALLOWLIST_INVALID",
      "a migration-only owner is missing",
      { missing },
    );

  const forbiddenImports = [];
  const files = [
    ...NORMAL_COMPOSITION_FILES.map((entry) => path.join(ROOT, entry)),
    ...sourceFilesAt(NORMAL_SOURCE_ROOTS),
  ];
  const specifierPattern = /(?:require\(\s*|from\s+)["']([^"']+)["']/g;
  for (const filename of files) {
    const source = fs.readFileSync(filename, "utf8");
    for (const match of source.matchAll(specifierPattern)) {
      const specifier = match[1].replaceAll("\\", "/");
      if (
        MIGRATION_MODULE_NAMES.some(
          (name) =>
            specifier.endsWith(`/${name}`) || specifier.endsWith(`/${name}.js`),
        )
      )
        forbiddenImports.push({ file: relative(filename), specifier });
    }
  }
  if (forbiddenImports.length)
    throw absenceError(
      "TICKET_24_E_MIGRATION_LEAK",
      "migration-only module entered normal composition or Renderer code",
      { forbiddenImports },
    );
  return {
    allowlist: MIGRATION_ONLY_ALLOWLIST,
    checkedFiles: files.length,
    forbiddenImports: 0,
  };
}

function verifyTicket24EAbsence() {
  const layers = {
    productionCapability: assertRetiredCapabilitiesAbsent(),
    publicDto: verifyPublicDtoAbsence(),
    ipcChannel: verifyIpcAndRendererMethodAbsence(),
    extensionSeam: verifyDeadExportAbsence(),
    rendererActionUi: verifyRendererAbsence(),
    migrationOnlyAllowlist: verifyMigrationIsolation(),
  };
  return { status: "PASSED", operation: "ticket-24-e-legacy-absence", layers };
}

if (require.main === module) {
  try {
    process.stdout.write(JSON.stringify(verifyTicket24EAbsence()) + "\n");
  } catch (error) {
    process.stderr.write(
      `${error.code || "TICKET_24_E_ABSENCE_FAILED"}:ticket 24-E absence verification failed\n`,
    );
    process.exitCode = 1;
  }
}

module.exports = {
  MIGRATION_ONLY_ALLOWLIST,
  RETIRED_CAPABILITIES,
  RETIRED_CHANNELS,
  verifyTicket24EAbsence,
};
