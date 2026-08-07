const fs = require("fs");
const path = require("path");

const { reportDiagnostic } = require("../diagnostics/diagnostic-producer");

function configPath() {
  return path.resolve(__dirname, "../../config/platforms.json");
}

function normalizePlatformIds(platformIds) {
  if (!Array.isArray(platformIds) || platformIds.length === 0) {
    return null;
  }

  var selected = {};
  for (var i = 0; i < platformIds.length; i++) {
    if (platformIds[i]) {
      selected[String(platformIds[i])] = true;
    }
  }
  return selected;
}

function validateAdapter(adapter, id) {
  if (!adapter || adapter.id !== id) {
    return "平台 adapter id 不匹配: 配置=" + id + " 模块=" + (adapter && adapter.id);
  }

  if (!adapter.scanDir) {
    return "[" + id + "] adapter missing scanDir";
  }

  var requiredFunctions = [
    "ensureSession",
    "ensureLoggedIn",
    "publishArticle",
    "closeSession"
  ];

  for (var i = 0; i < requiredFunctions.length; i++) {
    var name = requiredFunctions[i];
    if (typeof adapter[name] !== "function") {
      return "[" + id + "] adapter missing function: " + name;
    }
  }

  if (
    adapter.contentQueueImport === true &&
    adapter.publicationTarget &&
    adapter.publicationTarget.kind === "platform" &&
    typeof adapter.preparePlatformSubmission !== "function"
  ) {
    return "[" + id + "] adapter missing function: preparePlatformSubmission";
  }

  var hasOwnScan = typeof adapter.scanArticles === "function";
  var hasOwnParse = typeof adapter.parseArticleFiles === "function";
  if (hasOwnScan !== hasOwnParse) {
    return "[" + id + "] adapter scanArticles and parseArticleFiles must be provided together";
  }

  return null;
}

function loadPlatforms(options) {
  var opts = options || {};
  var selected = normalizePlatformIds(opts.platformIds);
  var raw = fs.readFileSync(configPath(), "utf-8");
  var cfg = JSON.parse(raw);
  var enabled = cfg.enabled || [];
  var platforms = [];

  for (var i = 0; i < enabled.length; i++) {
    var id = enabled[i];
    if (selected && !selected[id]) {
      continue;
    }

    var adapterPath = path.resolve(__dirname, "../platforms", id, "adapter");
    var adapter;
    try {
      adapter = require(adapterPath);
    } catch (e) {
      reportDiagnostic({
        code: "PLATFORM_ADAPTER_LOAD_FAILED",
        module: "core-platforms",
        category: "internal",
        operationId: "platform-loader",
        metadata: { platformId: id, action: "load" },
      });
      continue;
    }

    var error = validateAdapter(adapter, id);
    if (error) {
      reportDiagnostic({
        code: "PLATFORM_ADAPTER_INVALID",
        module: "core-platforms",
        category: "validation",
        operationId: "platform-loader",
        metadata: { platformId: id, action: "validate" },
      });
      continue;
    }

    platforms.push(adapter);
  }

  if (platforms.length === 0) {
    throw new Error("没有可用的平台 adapter，请检查 config/platforms.json");
  }
  return platforms;
}

module.exports = { loadPlatforms, validateAdapter };
