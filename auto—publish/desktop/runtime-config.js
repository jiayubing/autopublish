const path = require("node:path");
const fs = require("node:fs");
const dotenv = require("dotenv");
const { createStoragePaths } = require("../src/infrastructure/workspace/storage-paths");
const { createWorkspacePaths, ensureWorkspaceDirectories } = require("../src/infrastructure/workspace/workspace-paths");
const { createRuntimeConfigStore, SUPPORTED_RUNTIME_CONFIG_KEYS, LEGACY_RUNTIME_CONFIG_KEYS } = require("./runtime-config-store");
const { createRuntimeDiagnosticsService } = require("./services/runtime-diagnostics-service");
const { reportDiagnostic } = require("../src/diagnostics/diagnostic-producer");

let loadedWorkspaceEnv;
let loadedWorkspaceValues = {};
let loadedApplicationValues = {};

function unloadValues(values) {
  Object.keys(values).forEach(function(key) {
    const loaded = values[key];
    if (process.env[key] !== loaded.value) return;
    if (loaded.previous === undefined) delete process.env[key];
    else process.env[key] = loaded.previous;
  });
}

function unloadWorkspaceEnvironment() {
  unloadValues(loadedWorkspaceValues);
  loadedWorkspaceValues = {};
  loadedWorkspaceEnv = undefined;
}

function loadApplicationEnvironment(configRoot, store) {
  unloadValues(loadedApplicationValues);
  loadedApplicationValues = {};
  let values = {};
  try {
    values = store.read();
  } catch (_) {
    reportDiagnostic({
      code: "RUNTIME_CONFIG_READ_FAILED",
      module: "runtime-config",
      category: "storage",
      metadata: { operation: "load-application-environment", phase: "read" },
    });
    values = {};
  }
  SUPPORTED_RUNTIME_CONFIG_KEYS.forEach(function(key) {
    if (process.env[key] !== undefined || values[key] === undefined) return;
    process.env[key] = values[key];
    loadedApplicationValues[key] = { previous: undefined, value: values[key] };
  });
  return values;
}

function loadWorkspaceEnvironment(workspaceRoot) {
  const envPath = path.join(workspaceRoot, ".env");
  if (loadedWorkspaceEnv === envPath) return;

  unloadWorkspaceEnvironment();
  loadedWorkspaceEnv = envPath;
  if (!fs.existsSync(envPath)) return;

  const values = dotenv.parse(fs.readFileSync(envPath, "utf8"));
  Object.keys(values).forEach(function(key) {
    // Tool paths are non-secret compatibility settings. Provider credentials and
    // cookie paths are legacy-only and must never be loaded from a content library.
    if (!SUPPORTED_RUNTIME_CONFIG_KEYS.includes(key)) return;
    if (process.env[key] !== undefined) return;
    process.env[key] = values[key];
    loadedWorkspaceValues[key] = { previous: undefined, value: values[key] };
  });
}

function validateRuntimeConfiguration(environment) {
  const env = environment || process.env;
  const errors = [];
  // Provider credentials are optional until configured in Settings. Playwright
  // and Hepan remain independent capabilities reported by diagnostics.
  void env;
  return errors;
}

function safeLegacyFile(filename, io) {
  try {
    const stat = io.lstatSync(filename);
    if (stat.isSymbolicLink() || !stat.isFile()) return null;
    return stat;
  } catch (error) {
    if (error && error.code === "ENOENT") return null;
    reportDiagnostic({
      code: "LEGACY_RUNTIME_CONFIG_PROBE_FAILED",
      module: "runtime-config",
      category: "storage",
      metadata: { operation: "legacy-file-probe", phase: "inspect" },
    });
    return null;
  }
}

function readLegacyEnvironmentFile(filename, io) {
  if (!safeLegacyFile(filename, io)) return {};
  try {
    return dotenv.parse(io.readFileSync(filename, "utf8"));
  } catch (_) {
    reportDiagnostic({
      code: "LEGACY_ENV_PARSE_FAILED",
      module: "runtime-config",
      category: "storage",
      metadata: { operation: "legacy-environment", phase: "parse" },
    });
    return {};
  }
}

function readLegacyRuntimeValues(store) {
  if (!store || typeof store.readLegacy !== "function") return {};
  try {
    return store.readLegacy();
  } catch (_) {
    reportDiagnostic({
      code: "LEGACY_RUNTIME_CONFIG_READ_FAILED",
      module: "runtime-config",
      category: "storage",
      metadata: { operation: "legacy-runtime-config", phase: "read" },
    });
    return {};
  }
}

function legacyCandidate(values, source) {
  const value = values || {};
  const media = typeof value.XQW_API_KEY === "string" && value.XQW_API_KEY.trim() !== "";
  return {
    source: source,
    media: media ? {
      apiKey: value.XQW_API_KEY,
      baseUrl: value.XQW_BASE_URL,
      timeoutMs: value.XQW_TIMEOUT_MS,
      allowInsecure: value.XQW_ALLOW_INSECURE
    } : null
  };
}

function createLegacyProviderSettingsMigration(options) {
  const values = options || {};
  const io = values.fs || fs;
  const pathApi = values.path || path;
  const clock = values.clock || (() => new Date().toISOString());
  const workspaceRoot = typeof values.workspaceRoot === "string" ? pathApi.resolve(values.workspaceRoot) : null;
  const configRoot = typeof values.configRoot === "string" ? pathApi.resolve(values.configRoot) : null;
  const runtimeConfigStore = values.runtimeConfigStore || (configRoot ? createRuntimeConfigStore({ configRoot }) : null);
  const platformSettingsService = values.platformSettingsService;
  const migrationFile = pathApi.join(configRoot || pathApi.resolve("."), "platform-settings-migration.json");

  function candidates() {
    const result = [];
    const runtime = legacyCandidate(readLegacyRuntimeValues(runtimeConfigStore), "application-runtime-config");
    if (runtime.media) result.push(runtime);
    if (workspaceRoot) {
      const workspace = legacyCandidate(readLegacyEnvironmentFile(pathApi.join(workspaceRoot, ".env"), io), "workspace-env");
      if (workspace.media) result.push(workspace);
    }
    return result;
  }

  function publicReport() {
    const sourceList = candidates();
    const mediaSources = sourceList.filter((item) => item.media).map((item) => item.source);
    return {
      media: { available: mediaSources.length > 0, sources: mediaSources },
      sources: sourceList.map((item) => item.source),
      importable: mediaSources.length > 0
    };
  }

  function readRecord() {
    if (!safeLegacyFile(migrationFile, io)) return null;
    try {
      const record = JSON.parse(io.readFileSync(migrationFile, "utf8"));
      if (!record || record.version !== 1 || !Array.isArray(record.entries)) return null;
      return {
        version: 1,
        updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : null,
        entries: record.entries.map((entry) => ({ platform: entry.platform, source: entry.source, status: entry.status, code: entry.code || null }))
      };
    } catch (_) {
      reportDiagnostic({
        code: "PLATFORM_CONFIG_MIGRATION_RECORD_READ_FAILED",
        module: "runtime-config",
        category: "storage",
        metadata: { operation: "platform-settings-migration", phase: "read" },
      });
      return null;
    }
  }

  function writeRecord(entries) {
    const record = { version: 1, updatedAt: clock(), entries: entries.map((entry) => ({ platform: entry.platform, source: entry.source, status: entry.status, code: entry.code || null })) };
    io.mkdirSync(pathApi.dirname(migrationFile), { recursive: true });
    const temporary = migrationFile + ".tmp-" + process.pid + "-" + Date.now();
    try {
      io.writeFileSync(temporary, JSON.stringify(record, null, 2) + "\n", { encoding: "utf8", mode: 0o600 });
      io.renameSync(temporary, migrationFile);
    } finally {
      try {
        if (io.existsSync(temporary)) io.unlinkSync(temporary);
      } catch (_) {
        reportDiagnostic({
          code: "PLATFORM_CONFIG_MIGRATION_TEMP_CLEANUP_FAILED",
          module: "runtime-config",
          category: "storage",
          metadata: { operation: "platform-settings-migration", phase: "cleanup", action: "unlink" },
        });
      }
    }
    return record;
  }

  function hasApplicationConfig(platformId) {
    if (!platformSettingsService) return false;
    if (typeof platformSettingsService.getApplicationConfig === "function") return Boolean(platformSettingsService.getApplicationConfig(platformId));
    const status = platformSettingsService.getStatus(platformId);
    return status && status.source === "application" && status.configured === true;
  }

  function isEnvironmentOverride(platformId) {
    if (!platformSettingsService || typeof platformSettingsService.getStatus !== "function") return false;
    return platformSettingsService.getStatus(platformId).source === "environment";
  }

  function mergeSource(platform, sourceList) {
    for (const item of sourceList) {
      if (item[platform]) return { source: item.source, value: item[platform] };
    }
    return null;
  }

  async function importLegacy(input) {
    if (!input || input.confirmed !== true) {
      const error = new Error("Legacy provider settings import requires explicit confirmation");
      error.code = "PLATFORM_CONFIG_MIGRATION_CONFIRMATION_REQUIRED";
      throw error;
    }
    if (!platformSettingsService) {
      const error = new Error("Platform settings service is required");
      error.code = "PLATFORM_CONFIG_MIGRATION_UNAVAILABLE";
      throw error;
    }
    const sourceList = candidates();
    const entries = [];
    const imported = [];
    const media = mergeSource("media", sourceList);
    if (media) {
      if (hasApplicationConfig("media")) entries.push({ platform: "media", source: media.source, status: "skipped-existing" });
      else if (isEnvironmentOverride("media")) entries.push({ platform: "media", source: media.source, status: "skipped-environment" });
      else {
        try {
          platformSettingsService.save("media", {
            apiKey: media.value.apiKey,
            baseUrl: media.value.baseUrl,
            timeoutMs: media.value.timeoutMs,
            allowInsecure: media.value.allowInsecure === "1" || media.value.allowInsecure === "true"
          });
          entries.push({ platform: "media", source: media.source, status: "imported" });
          imported.push("media");
          if (runtimeConfigStore && media.source === "application-runtime-config" && typeof runtimeConfigStore.removeKeys === "function") runtimeConfigStore.removeKeys(["XQW_API_KEY", "XQW_BASE_URL", "XQW_TIMEOUT_MS", "XQW_ALLOW_INSECURE"]);
        } catch (error) {
          entries.push({ platform: "media", source: media.source, status: "failed", code: error && error.code || "PLATFORM_CONFIG_MIGRATION_FAILED" });
        }
      }
    }
    const record = writeRecord(entries);
    return { imported, entries: record.entries, record: record };
  }

  return { discover: publicReport, getRecord: readRecord, importLegacy };
}

function requiredRoot(value, name) {
  if (typeof value !== "string" || value.trim() === "") throw new Error(name + " is required");
  return value;
}

function configureRuntimeEnvironment(options) {
  const values = options || {};
  const appRoot = path.resolve(requiredRoot(values.appRoot, "appRoot"));
  const contentLibrary = path.resolve(requiredRoot(values.contentLibraryRoot || values.workspaceRoot, "workspaceRoot"));
  const roamingConfig = path.resolve(requiredRoot(values.roamingConfigRoot || values.userDataPath, "roamingConfigRoot"));
  const localState = path.resolve(requiredRoot(values.localStateRoot || values.sessionDataPath, "localStateRoot"));
  const storage = createStoragePaths({
    installation: appRoot,
    roamingConfig: roamingConfig,
    localState: localState,
    contentLibrary: contentLibrary
  });
  const paths = createWorkspacePaths(contentLibrary, storage);

  process.env.AUTO_PUBLISH_ROOT_DIR = contentLibrary;
  process.env.AUTO_PUBLISH_APP_ROOT = appRoot;
  process.env.AUTO_PUBLISH_WORKSPACE = contentLibrary;
  process.env.AUTO_PUBLISH_LOCAL_STATE = localState;

  const runtimeConfigStore = createRuntimeConfigStore({ configRoot: roamingConfig });
  const applicationValues = loadApplicationEnvironment(roamingConfig, runtimeConfigStore);
  loadWorkspaceEnvironment(contentLibrary);
  ensureWorkspaceDirectories(paths);
  // The diagnostic sink owns log-directory creation and cleanup so a symlinked
  // local-state path cannot be followed by this generic bootstrap mkdir.
  [paths.cache, paths.tmp, paths.work, paths.browser].forEach(function(directory) {
    fs.mkdirSync(directory, { recursive: true });
  });

  const diagnosticsService = createRuntimeDiagnosticsService({
    workspaceRoot: contentLibrary,
    appRoot: appRoot,
    resourcesPath: values.resourcesPath,
    paths: paths,
    applicationValues: applicationValues,
    packaged: process.env.AUTO_PUBLISH_PACKAGED === "1"
  });
  const diagnostics = diagnosticsService.diagnose();
  if (!process.env.PLAYWRIGHT_CLI_JS && diagnostics.tools.playwrightCli.command) process.env.PLAYWRIGHT_CLI_JS = diagnostics.tools.playwrightCli.command;
  if (!process.env.AUTO_PUBLISH_NODE_EXEC_PATH && diagnostics.tools.playwrightNode.command) process.env.AUTO_PUBLISH_NODE_EXEC_PATH = diagnostics.tools.playwrightNode.command;
  if (!process.env.BROWSER_CHANNEL && diagnostics.tools.browserChannel.channel) process.env.BROWSER_CHANNEL = diagnostics.tools.browserChannel.channel;
  paths.playwrightNodeExecPath = diagnostics.tools.playwrightNode.command;
  paths.playwrightCliJs = diagnostics.tools.playwrightCli.command;
  paths.browserChannel = diagnostics.tools.browserChannel.channel || "msedge";
  // src/core/files loads scripts/config.js at module evaluation time. Delay
  // that dependency until diagnostics has applied tool resolution so values
  // from runtime-tools.json are not frozen to development defaults.
  const { configureRuntimePaths } = require("../src/core/files");
  configureRuntimePaths(paths);
  const configErrors = validateRuntimeConfiguration().concat(diagnostics.errors);

  return {
    appRoot: appRoot,
    workspaceRoot: contentLibrary,
    contentLibrary: contentLibrary,
    storage: storage,
    paths: paths,
    runtimeConfigStore: runtimeConfigStore,
    legacyProviderSettings: createLegacyProviderSettingsMigration({ configRoot: roamingConfig, workspaceRoot: contentLibrary, runtimeConfigStore: runtimeConfigStore }),
    applicationValues: applicationValues,
    diagnosticsService: diagnosticsService,
    configErrors: configErrors,
    diagnostics: diagnostics
  };
}

module.exports = {
  configureRuntimeEnvironment,
  loadWorkspaceEnvironment,
  unloadWorkspaceEnvironment,
  validateRuntimeConfiguration,
  createLegacyProviderSettingsMigration,
  LEGACY_RUNTIME_CONFIG_KEYS
};
