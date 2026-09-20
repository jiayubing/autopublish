"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { createAtomicFileWriter } = require("../src/content/content-file-transaction");
const { geoError } = require("../src/content/geo-knowledge-schema");

function createGeoKnowledgePromptStore(options) {
  const root = path.resolve(options.roamingConfigRoot || options.userDataPath || path.join(options.workspaceRoot, ".autopublish"));
  if (!path.isAbsolute(root)) throw geoError("GEO_POLICY_INVALID");
  const file = path.join(root, "geo-knowledge-policy.json");
  const writer = options.promptAtomicWriter || createAtomicFileWriter();
  function ensureSafeFile(allowMissing) {
    if (!fs.existsSync(file)) {
      if (allowMissing) return;
      fs.mkdirSync(root, { recursive: true });
      return;
    }
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink()) throw geoError("GEO_POLICY_INVALID");
  }
  function load() {
    ensureSafeFile(true);
    if (!fs.existsSync(file)) return { researchPromptOverride: "" };
    let document;
    try { document = JSON.parse(fs.readFileSync(file, "utf8")); }
    catch (_) { throw geoError("GEO_POLICY_INVALID"); }
    const value = document?.researchPromptOverride;
    if (!document || document.version !== 1 || (value !== undefined && (typeof value !== "string" || value.length > 8000))) throw geoError("GEO_POLICY_INVALID");
    return { researchPromptOverride: value || "" };
  }
  function save(researchPromptOverride) {
    if (typeof researchPromptOverride !== "string" || researchPromptOverride.length > 8000) throw geoError("GEO_POLICY_INVALID");
    ensureSafeFile(false);
    const document = researchPromptOverride ? { version: 1, researchPromptOverride } : { version: 1 };
    try {
      if (writer.write(file, JSON.stringify(document, null, 2) + "\n", { keepExisting: false }) !== true) throw geoError("GEO_POLICY_SAVE_FAILED");
    } catch (_) { throw geoError("GEO_POLICY_SAVE_FAILED"); }
    return { researchPromptOverride };
  }
  return { load, save };
}

module.exports = { createGeoKnowledgePromptStore };
