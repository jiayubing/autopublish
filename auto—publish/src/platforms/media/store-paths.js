const path = require("node:path");

function resolveStorePath(options, filename) {
  const opts = options || {};
  if (opts.storePath || opts.filePath) return opts.storePath || opts.filePath;
  if (opts.paths && opts.paths.data) return path.join(opts.paths.data, filename);
  const root = process.env.AUTO_PUBLISH_ROOT_DIR || process.env.AUTO_PUBLISH_WORKSPACE || process.cwd();
  return path.join(root, "data", filename);
}

module.exports = { resolveStorePath };
