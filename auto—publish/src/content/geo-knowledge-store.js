"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { createContentPathPolicy } = require("./content-path-policy");
const { createAtomicFileWriter } = require("./content-file-transaction");
const { SECTIONS, geoError, validateKnowledge } = require("./geo-knowledge-schema");

function createGeoKnowledgeStore(options) {
  const policy = createContentPathPolicy(options.workspaceRoot, { paths: options.paths });
  const writer = options.atomicWriter || createAtomicFileWriter();
  function filename(clientId, create) {
    if (!policy.isSafeSegment(clientId)) throw geoError("GEO_PATH_UNSAFE");
    const directory = policy.assertDirectory(policy.workspace.geoKnowledge, {
      boundary: policy.root, create, returnMissing: false, code: "GEO_PATH_UNSAFE", label: "Knowledge directory",
    });
    if (!directory) return null;
    const file = path.join(directory, clientId + ".json");
    policy.assertRegularFile(file, { boundary: directory, allowMissing: true, code: "GEO_PATH_UNSAFE", label: "Knowledge file" });
    return file;
  }
  function load(clientId) {
    const file = filename(clientId, false);
    if (!file) return null;
    let raw;
    try { raw = fs.readFileSync(file, "utf8"); }
    catch (error) { if (error.code === "ENOENT") return null; throw geoError("GEO_READ_FAILED"); }
    let document;
    try { document = JSON.parse(raw); } catch (_) { throw geoError("GEO_KNOWLEDGE_INVALID"); }
    if (document.clientId !== clientId) throw geoError("GEO_KNOWLEDGE_INVALID");
    return validateKnowledge(document);
  }
  function save(document, expectedRevision) {
    const valid = validateKnowledge(document);
    const current = load(valid.clientId);
    if (expectedRevision !== (current?.revision || 0)) throw geoError("GEO_REVISION_CONFLICT");
    valid.revision = expectedRevision + 1;
    valid.updatedAt = new Date().toISOString();
    const file = filename(valid.clientId, true);
    try {
      if (writer.write(file, JSON.stringify(valid, null, 2) + "\n", { keepExisting: false }) !== true) throw geoError("GEO_SAVE_FAILED");
    } catch (_) { throw geoError("GEO_SAVE_FAILED"); }
    return valid;
  }
  function edit(clientId, revision, section, id, changes) {
    if (!["profile", ...SECTIONS].includes(section)) throw geoError("GEO_KNOWLEDGE_INVALID");
    const current = load(clientId);
    if (!current) throw geoError("GEO_NOT_FOUND");
    const item = section === "profile" ? current.profile : current[section].find(value => value.id === id);
    if (!item || item.id !== id) throw geoError("GEO_ITEM_NOT_FOUND");
    const allowed = section === "profile" ? ["fields"] : ["name", "description"];
    if (!changes || Object.keys(changes).some(key => !allowed.includes(key))) throw geoError("GEO_KNOWLEDGE_INVALID");
    Object.assign(item, structuredClone(changes), { origin: "manual", locked: true });
    return save(current, revision);
  }
  return { load, save, edit };
}
module.exports = { createGeoKnowledgeStore };
