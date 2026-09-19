"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { createAtomicFileWriter } = require("../src/content/content-file-transaction");
const { geoError } = require("../src/content/geo-knowledge-schema");

function createDoubaoGeoConfigStore({ userDataPath, safeStorage }) {
  if (!path.isAbsolute(userDataPath)) throw geoError("GEO_CONFIG_STORAGE_INVALID");
  const file = path.join(userDataPath, "doubao-geo.json");
  function checkPath(target, directory = false) {
    try {
      const stat = fs.lstatSync(target);
      if (stat.isSymbolicLink() || (directory ? !stat.isDirectory() : !stat.isFile())) throw geoError("GEO_CONFIG_STORAGE_INVALID");
    } catch (error) { if (error.code !== "ENOENT") throw geoError("GEO_CONFIG_STORAGE_INVALID"); }
  }
  function encryption() {
    if (!safeStorage?.isEncryptionAvailable()) throw geoError("GEO_ENCRYPTION_UNAVAILABLE");
  }
  function read() {
    checkPath(userDataPath, true);
    checkPath(file);
    let raw;
    try { raw = fs.readFileSync(file, "utf8"); }
    catch (error) { if (error.code === "ENOENT") return null; throw geoError("GEO_CONFIG_STORAGE_INVALID"); }
    encryption();
    try {
      const stored = JSON.parse(raw);
      if (stored.version !== 1 || typeof stored.model !== "string" || !stored.model.trim() || typeof stored.webSearch !== "boolean") throw geoError("GEO_CONFIG_INVALID");
      const apiKey = safeStorage.decryptString(Buffer.from(stored.encryptedApiKey, "base64"));
      if (!apiKey) throw geoError("GEO_CONFIG_INVALID");
      return { model: stored.model, webSearch: stored.webSearch, apiKey };
    } catch (_) { throw geoError("GEO_CONFIG_STORAGE_INVALID"); }
  }
  function status() {
    const value = read();
    return { configured: Boolean(value), model: value?.model || "", webSearch: value?.webSearch ?? true };
  }
  function save(input) {
    encryption();
    if (!input || typeof input.model !== "string" || !/^[A-Za-z0-9._:-]{1,200}$/.test(input.model) || typeof input.webSearch !== "boolean" || typeof input.apiKey !== "string" || input.apiKey.length > 4000) throw geoError("GEO_CONFIG_INVALID");
    const apiKey = input.apiKey.trim() || read()?.apiKey;
    if (!apiKey) throw geoError("GEO_CONFIG_REQUIRED");
    checkPath(userDataPath, true);
    checkPath(file);
    try {
      fs.mkdirSync(userDataPath, { recursive: true });
      createAtomicFileWriter().write(file, JSON.stringify({ version: 1, model: input.model, webSearch: input.webSearch, encryptedApiKey: safeStorage.encryptString(apiKey).toString("base64") }), { keepExisting: false });
    } catch (_) { throw geoError("GEO_CONFIG_SAVE_FAILED"); }
    return status();
  }
  return { read, status, save };
}
module.exports = { createDoubaoGeoConfigStore };
