const DEFAULT_CLIENT_IMAGE_CACHE_CAPACITY = 32;
const MAX_CLIENT_IMAGE_CACHE_CAPACITY = 10000;

function cacheError(code, message) {
  const error = new Error(message || code);
  error.code = code;
  return error;
}

function normalizeCapacity(value) {
  const capacity = Number(value);
  if (!Number.isSafeInteger(capacity) || capacity < 1 || capacity > MAX_CLIENT_IMAGE_CACHE_CAPACITY) {
    throw cacheError("CLIENT_IMAGE_CACHE_CAPACITY_INVALID", "Client image cache capacity is invalid");
  }
  return capacity;
}

function createClientImageScanCache(options) {
  const opts = options || {};
  const scope = typeof opts.scope === "string" ? opts.scope : "client-image-library";
  const configuredCapacity = opts.capacity === undefined ? opts.maxEntries : opts.capacity;
  const capacity = normalizeCapacity(configuredCapacity === undefined ? DEFAULT_CLIENT_IMAGE_CACHE_CAPACITY : configuredCapacity);
  const entries = new Map();

  function key(clientKey) {
    return scope + "\0" + String(clientKey);
  }

  function get(clientKey) {
    const cacheKey = key(clientKey);
    if (!entries.has(cacheKey)) return null;
    const snapshot = entries.get(cacheKey);
    entries.delete(cacheKey);
    entries.set(cacheKey, snapshot);
    return snapshot;
  }

  function set(clientKey, snapshot) {
    const cacheKey = key(clientKey);
    if (entries.has(cacheKey)) entries.delete(cacheKey);
    entries.set(cacheKey, snapshot);
    while (entries.size > capacity) entries.delete(entries.keys().next().value);
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
    get capacity() {
      return capacity;
    },
  };
}

module.exports = {
  DEFAULT_CLIENT_IMAGE_CACHE_CAPACITY,
  MAX_CLIENT_IMAGE_CACHE_CAPACITY,
  createClientImageScanCache,
};
