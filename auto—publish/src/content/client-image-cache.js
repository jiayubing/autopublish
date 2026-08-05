function createClientImageScanCache(options) {
  const opts = options || {};
  const scope =
    typeof opts.scope === "string" ? opts.scope : "client-image-library";
  const entries = new Map();

  function key(clientKey) {
    return scope + "\0" + String(clientKey);
  }

  function get(clientKey) {
    return entries.get(key(clientKey)) || null;
  }

  function set(clientKey, snapshot) {
    entries.set(key(clientKey), snapshot);
    return snapshot;
  }

  function invalidate(clientKey) {
    if (clientKey === undefined) {
      const count = entries.size;
      entries.clear();
      return count;
    }
    return entries.delete(key(clientKey)) ? 1 : 0;
  }

  return {
    get,
    set,
    invalidate,
    clear: function () {
      return invalidate();
    },
    get size() {
      return entries.size;
    },
  };
}

module.exports = { createClientImageScanCache };
