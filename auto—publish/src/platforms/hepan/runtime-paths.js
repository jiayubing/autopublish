const fs = require("node:fs");
const path = require("node:path");

function resolveHepanVendorDir(options) {
  const values = options || {};
  const io = values.fs || fs;
  const pathApi = values.path || path;
  const scriptPath = values.scriptPath || pathApi.join(__dirname, "hepan_publish.py");
  const candidates = [];
  if (values.explicit) candidates.push(values.explicit);
  if (process.resourcesPath) {
    candidates.push(pathApi.join(process.resourcesPath, "app.asar.unpacked", "resources", "hepan", "vendor-pure"));
    candidates.push(pathApi.join(process.resourcesPath, "app", "resources", "hepan", "vendor-pure"));
  }
  candidates.push(pathApi.resolve(pathApi.dirname(scriptPath), "../../../resources/hepan/vendor-pure"));
  return candidates.find((candidate) => {
    try { return io.lstatSync(candidate).isDirectory(); } catch (_) { return false; }
  }) || "";
}

function withHepanVendorEnvironment(options, vendorDir) {
  if (!vendorDir) return options || {};
  return Object.assign({}, options || {}, {
    env: Object.assign({}, process.env, options && options.env || {}, { PYTHONPATH: vendorDir, PYTHONDONTWRITEBYTECODE: "1" })
  });
}

module.exports = { resolveHepanVendorDir, withHepanVendorEnvironment };
