const fs = require("node:fs");

const { createContentPathPolicy } = require("./content-path-policy");

const TITLE_PREFIX_BYTES = 64 * 1024;

function isMissing(error) {
  return error && (error.code === "ENOENT" || error.code === "ENOTDIR");
}

function createArticleTitleReader(options) {
  const opts = options || {};
  const fsApi = opts.fs || fs;
  const policy = opts.pathPolicy || createContentPathPolicy(opts.workspaceRoot, {
    paths: opts.paths,
    fs: fsApi,
  });
  const cache = new Map();

  function exists(filename) {
    try {
      fsApi.lstatSync(filename);
      return true;
    } catch (error) {
      if (isMissing(error)) return false;
      throw error;
    }
  }

  function versionOf(files) {
    const stem = files.json.slice(0, -5);
    if (exists(stem + ".article-lock") || exists(stem + ".journal")) return null;
    try {
      const version = [files.json, files.markdown].map(function(filename) {
        const stat = fsApi.lstatSync(filename, { bigint: true });
        if (!stat.isFile() || stat.isSymbolicLink()) return null;
        const mtime = typeof stat.mtimeNs === "bigint" ? stat.mtimeNs : BigInt(Math.trunc(Number(stat.mtimeMs) * 1000000));
        const ctime = typeof stat.ctimeNs === "bigint" ? stat.ctimeNs : BigInt(Math.trunc(Number(stat.ctimeMs) * 1000000));
        return [stat.dev, stat.ino, stat.size, mtime, ctime].join(":");
      });
      if (version.includes(null) || exists(stem + ".article-lock") || exists(stem + ".journal")) return null;
      return version.join("|");
    } catch (error) {
      if (isMissing(error)) return null;
      throw error;
    }
  }

  function parseTitle(prefix) {
    const firstBreak = prefix.indexOf("\n");
    if (firstBreak < 0) return null;
    const secondBreak = prefix.indexOf("\n", firstBreak + 1);
    if (secondBreak < 0) return null;
    const heading = prefix.slice(firstBreak + 1, secondBreak).replace(/\r$/, "");
    return heading.startsWith("# ") ? heading.slice(2) : null;
  }

  function readPrefix(filename, directory) {
    policy.assertRegularFile(filename, {
      boundary: directory,
      code: "ARTICLE_PATH_OUT_OF_BOUNDS",
      label: "Article markdown",
    });
    if (typeof fsApi.openSync !== "function" || typeof fsApi.readSync !== "function" || typeof fsApi.closeSync !== "function") {
      return fsApi.readFileSync(filename, "utf8").slice(0, TITLE_PREFIX_BYTES);
    }
    const descriptor = fsApi.openSync(filename, "r");
    try {
      const buffer = Buffer.allocUnsafe(TITLE_PREFIX_BYTES);
      const bytesRead = fsApi.readSync(descriptor, buffer, 0, buffer.length, 0);
      return buffer.toString("utf8", 0, bytesRead);
    } finally {
      fsApi.closeSync(descriptor);
    }
  }

  function getTitle(clientId, articleId) {
    const files = policy.articlePaths(clientId, articleId, false);
    if (!files || !files.directory || !exists(files.json) || !exists(files.markdown)) return null;
    const before = versionOf(files);
    if (!before) return null;
    const key = JSON.stringify([clientId, articleId]);
    const cached = cache.get(key);
    if (cached && cached.version === before) return cached.title;

    const title = parseTitle(readPrefix(files.markdown, files.directory));
    if (title === null) return null;
    const after = versionOf(files);
    if (!after || after !== before) return null;
    cache.set(key, { version: after, title: title });
    return title;
  }

  function clear() {
    cache.clear();
  }

  return { getTitle, clear };
}

module.exports = { createArticleTitleReader };
