const path = require("path");
const { fileURLToPath } = require("url");

function isAllowedRendererNavigation(value, rendererEntryPath) {
  try {
    var url = new URL(value);
    return url.protocol === "file:" && !url.search && !url.hash &&
      path.resolve(fileURLToPath(url)) === path.resolve(rendererEntryPath);
  } catch (_) { return false; }
}

module.exports = { isAllowedRendererNavigation };
