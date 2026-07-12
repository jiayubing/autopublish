const path = require("node:path");

const HISTORICAL_APP_ROOT = path.resolve(__dirname, "..", "..", "..");

function resolveStorePath(options, filename) {
  const opts = options || {};
  if (opts.storePath || opts.filePath) return opts.storePath || opts.filePath;
  if (opts.paths && opts.paths.data) return path.join(opts.paths.data, filename);
  const root = process.env.AUTO_PUBLISH_ROOT_DIR || process.env.AUTO_PUBLISH_WORKSPACE || process.env.AUTO_PUBLISH_APP_ROOT || HISTORICAL_APP_ROOT;
  return path.join(root, "data", filename);
}

module.exports = { resolveStorePath };
