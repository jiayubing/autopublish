const fs = require("node:fs");
const path = require("node:path");

const VERSION = 1;

function validConversationUrl(value) {
  if (typeof value !== "string" || !value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.hostname !== "www.doubao.com") return null;
    if (!/^\/chat\/\d+\/?$/.test(url.pathname)) return null;
    url.hash = "";
    return url.toString();
  } catch (_) {
    return null;
  }
}

function createDoubaoConversationStore(filename, options) {
  const fsApi = options && options.fs || fs;
  const stateFile = path.resolve(filename);
  let cache = null;

  function load() {
    if (cache) return cache;
    cache = {};
    try {
      if (!fsApi.existsSync(stateFile)) return cache;
      const parsed = JSON.parse(fsApi.readFileSync(stateFile, "utf8"));
      if (!parsed || parsed.version !== VERSION || !parsed.conversations || typeof parsed.conversations !== "object") return cache;
      Object.entries(parsed.conversations).forEach(function(entry) {
        const clientId = entry[0];
        const url = validConversationUrl(entry[1]);
        if (typeof clientId === "string" && clientId && url) cache[clientId] = url;
      });
    } catch (_) {
      cache = {};
    }
    return cache;
  }

  function persist() {
    try {
      fsApi.mkdirSync(path.dirname(stateFile), { recursive: true });
      fsApi.writeFileSync(
        stateFile,
        JSON.stringify({ version: VERSION, conversations: load() }, null, 2) + "\n",
        "utf8",
      );
      return true;
    } catch (_) {
      return false;
    }
  }

  function get(clientId) {
    return load()[clientId] || null;
  }

  function set(clientId, value) {
    const url = validConversationUrl(value);
    if (typeof clientId !== "string" || !clientId || !url) return false;
    const conversations = load();
    if (conversations[clientId] === url) return true;
    conversations[clientId] = url;
    return persist();
  }

  function remove(clientId) {
    const conversations = load();
    if (!Object.prototype.hasOwnProperty.call(conversations, clientId)) return true;
    delete conversations[clientId];
    return persist();
  }

  return { get, set, remove };
}

module.exports = {
  createDoubaoConversationStore,
  validConversationUrl,
};
