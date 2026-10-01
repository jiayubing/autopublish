"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { createContentPathPolicy } = require("./content-path-policy");
const { createAtomicFileWriter } = require("./content-file-transaction");
const { proseFacts } = require("./continuous-knowledge-canonical");
const {
  SECTIONS, basisAllowed, geoError, normalizeClaimValue, profileProjection,
  safeUrl, stableId, validateKnowledge,
} = require("./geo-knowledge-schema");

function createGeoKnowledgeStore(options) {
  const policy = createContentPathPolicy(options.workspaceRoot, {
    paths: options.paths,
  });
  const writer = options.atomicWriter || createAtomicFileWriter();
  function filename(clientId, create) {
    if (!policy.isSafeSegment(clientId)) throw geoError("GEO_PATH_UNSAFE");
    const directory = policy.assertDirectory(policy.workspace.geoKnowledge, {
      boundary: policy.root, create, returnMissing: false, code: "GEO_PATH_UNSAFE", label: "Knowledge directory",
    });
    if (!directory) return null;
    const file = path.join(directory, clientId + ".json");
    policy.assertRegularFile(file, {
      boundary: directory,
      allowMissing: true,
      code: "GEO_PATH_UNSAFE",
      label: "Knowledge file",
    });
    return file;
  }
  function policyFilename(clientId, create) {
    if (!policy.isSafeSegment(clientId)) throw geoError("GEO_PATH_UNSAFE");
    const directory = policy.assertDirectory(policy.workspace.geoKnowledge, {
      boundary: policy.root, create, returnMissing: false, code: "GEO_PATH_UNSAFE", label: "Knowledge directory",
    });
    if (!directory) return null;
    const file = path.join(directory, clientId + ".policy.json");
    policy.assertRegularFile(file, {
      boundary: directory,
      allowMissing: true,
      code: "GEO_PATH_UNSAFE",
      label: "Knowledge policy file",
    });
    return file;
  }
  function readRaw(clientId) {
    const file = filename(clientId, false);
    if (!file) return null;
    try { return JSON.parse(fs.readFileSync(file, "utf8")); }
    catch (error) {
      if (error.code === "ENOENT") return null;
      if (error instanceof SyntaxError) return { invalid: true };
      throw geoError("GEO_READ_FAILED");
    }
  }
  function isLegacyV1(document, clientId) {
    return (
      document && document.schemaVersion === 1 && document.clientId === clientId &&
      Number.isSafeInteger(document.revision) && document.revision >= 0 &&
      document.profile && typeof document.profile === "object" && Array.isArray(document.sources) &&
      [
        "offerings",
        "capabilities",
        "scenarios",
        "geoQuestions",
        "externalResearch",
        "restrictions",
      ].every((key) => Array.isArray(document[key]))
    );
  }
  function inspect(clientId) {
    const document = readRaw(clientId);
    if (!document) return { status: "missing", knowledge: null };
    if (document.invalid) return { status: "invalid", knowledge: null };
    if (isLegacyV1(document, clientId)) return { status: "legacy_v1", knowledge: null };
    if (document.schemaVersion !== 2 || document.clientId !== clientId) return { status: "invalid", knowledge: null };
    try { return { status: "current_v2", knowledge: validateKnowledge(document) }; }
    catch (_) { return { status: "invalid", knowledge: null }; }
  }
  function load(clientId) {
    const result = inspect(clientId);
    if (result.status === "invalid") throw geoError("GEO_KNOWLEDGE_INVALID");
    return result.knowledge;
  }
  function write(valid) {
    const file = filename(valid.clientId, true);
    try {
      if (
        writer.write(file, JSON.stringify(valid, null, 2) + "\n", {
          keepExisting: false,
        }) !== true
      )
        throw geoError("GEO_SAVE_FAILED");
    } catch (_) { throw geoError("GEO_SAVE_FAILED"); }
    return valid;
  }
  function save(document, expectedRevision) {
    const valid = validateKnowledge(document);
    const current = inspect(valid.clientId);
    if (current.status === "invalid" || current.status === "legacy_v1") throw geoError("GEO_REVISION_CONFLICT");
    if (expectedRevision !== (current.knowledge?.revision || 0)) throw geoError("GEO_REVISION_CONFLICT");
    valid.revision = expectedRevision + 1;
    if (valid.deliverable) {
      // Existing prose stays readable, but a content edit invalidates its currentness.
      if (
        current.knowledge?.deliverable &&
        JSON.stringify(valid.deliverable) ===
          JSON.stringify(current.knowledge.deliverable) &&
        proseFacts(valid) !== proseFacts(current.knowledge)
      ) {
        valid.deliverable.status = "stale";
        valid.deliverable.warnings = ["知识已修改，稿件需重新生成。"];
      }
      valid.deliverable.knowledgeRevision = valid.revision;
    }
    valid.updatedAt = new Date().toISOString();
    return write(validateKnowledge(valid));
  }
  function replaceLegacy(document) {
    const valid = validateKnowledge(document);
    if (inspect(valid.clientId).status !== "legacy_v1") throw geoError("GEO_REVISION_CONFLICT");
    valid.revision = 1;
    if (valid.deliverable) valid.deliverable.knowledgeRevision = 1;
    valid.updatedAt = new Date().toISOString();
    return write(validateKnowledge(valid));
  }
  function manualSource(current, clientId, revision, identity, title) {
    const source = {
      id: stableId("source", clientId + ":manual:" + revision + ":" + identity),
      type: "client_input",
      title,
    };
    if (!current.sources.some((value) => value.id === source.id))
      current.sources.push(source);
    return source;
  }
  function edit(clientId, revision, section, id, changes) {
    if (!["profile", ...SECTIONS].includes(section)) throw geoError("GEO_KNOWLEDGE_INVALID");
    const current = load(clientId);
    if (!current) throw geoError("GEO_NOT_FOUND");
    const item =
      section === "profile"
        ? current.profile
        : current[section].find((value) => value.id === id);
    if (!item || item.id !== id) throw geoError("GEO_ITEM_NOT_FOUND");
    const allowed = section === "profile" ? ["fields"] : ["name", "description"];
    if (!changes || Object.keys(changes).some((key) => !allowed.includes(key)))
      throw geoError("GEO_KNOWLEDGE_INVALID");
    const source = manualSource(
      current,
      clientId,
      revision,
      id,
      "人工编辑确认",
    );
    if (section === "profile") {
      if (!changes.fields || typeof changes.fields !== "object" || Array.isArray(changes.fields)) throw geoError("GEO_KNOWLEDGE_INVALID");
      for (const claim of current.profile.claims) if (claim.status === "accepted") claim.status = "rejected";
      for (const [field, value] of Object.entries(changes.fields)) {
        const claim = {
          id: stableId(
            "claim",
            clientId + ":manual:" + revision + ":" + field + ":" + normalizeClaimValue(value),
          ),
          field,
          value,
          status: "accepted",
          basis: "fact",
          origin: "manual",
          locked: true,
          sourceIds: [source.id],
        };
        current.profile.claims.push(claim);
      }
      current.profile = profileProjection(current.profile.claims);
    } else {
      Object.assign(item, structuredClone(changes), {
        basis: section === "recommendationAngles" ? "derived" : "fact",
        origin: "manual", locked: true, sourceIds: [source.id],
      });
    }
    return save(current, revision);
  }
  function confirmSourceType(clientId, revision, sourceId, targetType) {
    const current = load(clientId);
    if (!current) throw geoError("GEO_NOT_FOUND");
    if (current.revision !== revision) throw geoError("GEO_REVISION_CONFLICT");
    const source = current.sources.find((value) => value.id === sourceId);
    if (!source) throw geoError("GEO_SOURCE_INVALID");
    const allowed = (source.type === "third_party" && ["official_web", "client_public"].includes(targetType)) ||
      (source.type === "platform" && targetType === "client_public");
    if (!allowed || !safeUrl(source.url)) throw geoError("GEO_SOURCE_INVALID");
    source.type = targetType;
    const sourceMap = new Map(
      current.sources.map((value) => [value.id, value]),
    );
    for (const claim of current.profile.claims) if (!basisAllowed(claim.basis, claim.sourceIds, sourceMap)) throw geoError("GEO_KNOWLEDGE_INVALID");
    return save(current, revision);
  }
  function resolveConflict(clientId, revision, conflictId, resolution) {
    const current = load(clientId);
    if (!current) throw geoError("GEO_NOT_FOUND");
    if (current.revision !== revision) throw geoError("GEO_REVISION_CONFLICT");
    const conflict = current.restrictions.find(
      (item) => item.id === conflictId && item.type === "conflict",
    );
    if (!conflict || conflict.conflictStatus !== "open") throw geoError("GEO_ITEM_NOT_FOUND");
    const selected = resolution?.claimId
      ? current.profile.claims.find(
          (claim) =>
            conflict.claimIds.includes(claim.id) && claim.id === resolution.claimId,
        )
      : null;
    const value = selected?.value || resolution?.value;
    if (typeof value !== "string" || !value.trim()) throw geoError("GEO_KNOWLEDGE_INVALID");
    const source = manualSource(
      current,
      clientId,
      revision,
      conflict.identity,
      "人工冲突确认",
    );
    for (const claim of current.profile.claims) {
      if (claim.field === conflict.target.field && claim.status === "accepted") claim.status = "rejected";
      if (claim.field === conflict.target.field && (!selected || claim.id !== selected.id) && claim.status === "candidate") claim.status = "rejected";
    }
    const accepted = {
      id: stableId(
        "claim",
        clientId + ":resolution:" + revision + ":" + conflict.target.field + ":" + normalizeClaimValue(value),
      ),
      field: conflict.target.field,
      value,
      status: "accepted",
      basis: "fact",
      origin: "manual",
      locked: true,
      sourceIds: [source.id],
    };
    current.profile.claims.push(accepted);
    if (selected) selected.status = "candidate";
    current.profile = profileProjection(current.profile.claims);
    conflict.conflictStatus = "resolved";
    conflict.resolution = {
      acceptedClaimId: accepted.id,
      resolvedAt: new Date().toISOString(),
    };
    conflict.claimIds = [...new Set([...conflict.claimIds, accepted.id])];
    conflict.sourceIds = [...new Set([...conflict.sourceIds, source.id])];
    return save(current, revision);
  }
  function loadPolicy(clientId) {
    const file = policyFilename(clientId, false);
    if (!file) return { researchPrompt: "" };
    let document;
    try { document = JSON.parse(fs.readFileSync(file, "utf8")); }
    catch (error) {
      if (error.code === "ENOENT") return { researchPrompt: "" };
      throw geoError("GEO_POLICY_INVALID");
    }
    if (!document || document.version !== 1 || typeof document.researchPrompt !== "string" || document.researchPrompt.length > 4000) throw geoError("GEO_POLICY_INVALID");
    return { researchPrompt: document.researchPrompt };
  }
  function runDirectory(clientId, create = true) {
    if (!policy.isSafeSegment(clientId)) throw geoError("GEO_PATH_UNSAFE");
    return policy.assertDirectory(
      path.join(policy.workspace.geoKnowledge, ".runs", clientId),
      {
        boundary: policy.root,
        create,
        returnMissing: false,
        code: "GEO_PATH_UNSAFE",
        label: "Knowledge run directory",
      },
    );
  }
  function latestRun(clientId) {
    const root = runDirectory(clientId, false);
    if (!root) return null;
    const runs = fs
      .readdirSync(root)
      .filter((name) => /^run-[a-zA-Z0-9-]{1,80}$/.test(name))
      .map((name) => {
        const directory = policy.assertDirectory(path.join(root, name), {
          boundary: root,
          returnMissing: false,
          code: "GEO_PATH_UNSAFE",
          label: "Knowledge run",
        });
        return { directory, time: fs.statSync(directory).birthtimeMs };
      })
      .sort((a, b) => b.time - a.time);
    return runs[0] || null;
  }
  function loadRunState(clientId) {
    const latest = latestRun(clientId);
    if (!latest) return null;
    const file = path.join(latest.directory, "run-outcome.json");
    policy.assertRegularFile(file, {
      boundary: latest.directory,
      allowMissing: true,
      code: "GEO_PATH_UNSAFE",
      label: "Run outcome",
    });
    if (!fs.existsSync(file))
      return {
        phase: "failed",
        running: false,
        errorCode: "GEO_REQUEST_UNCERTAIN",
        outcome: "uncertain",
      };
    try {
      const result = JSON.parse(fs.readFileSync(file, "utf8"));
      if (result.phase === "complete") return null;
      if (
        result.phase !== "failed" ||
        !["input", "R1", "R2", "R3", "R4", "R5", "K"].includes(
          result.failedPhase,
        )
      )
        throw geoError("GEO_READ_FAILED");
      return {
        phase: "failed",
        running: false,
        ...(result.failedPhase === "input"
          ? {}
          : { failedPhase: result.failedPhase }),
        errorCode: /^GEO_[A-Z_]+$/.test(result.errorCode || "")
          ? result.errorCode
          : "GEO_GENERATION_FAILED",
        ...(result.outcome === "uncertain" ? { outcome: "uncertain" } : {}),
      };
    } catch (_) {
      throw geoError("GEO_READ_FAILED");
    }
  }
  function loadModelDraft(clientId) {
    const latest = latestRun(clientId);
    const current = load(clientId);
    if (!latest || (current && latest.time <= Date.parse(current.generatedAt)))
      return null;
    const file = path.join(
      latest.directory,
      "customer-knowledge-model-draft.md",
    );
    policy.assertRegularFile(file, {
      boundary: latest.directory,
      allowMissing: true,
      code: "GEO_PATH_UNSAFE",
      label: "Model draft",
    });
    if (!fs.existsSync(file)) return null;
    if (fs.statSync(file).size > 2000000) throw geoError("GEO_READ_FAILED");
    return { status: "unverified", markdown: fs.readFileSync(file, "utf8") };
  }
  function savePolicy(clientId, researchPrompt) {
    if (typeof researchPrompt !== "string" || researchPrompt.length > 4000) throw geoError("GEO_POLICY_INVALID");
    const file = policyFilename(clientId, true);
    try {
      if (
        writer.write(
          file,
          JSON.stringify({ version: 1, researchPrompt }, null, 2) + "\n",
          { keepExisting: false },
        ) !== true
      )
        throw geoError("GEO_POLICY_SAVE_FAILED");
    } catch (_) { throw geoError("GEO_POLICY_SAVE_FAILED"); }
    return { researchPrompt };
  }
  return {
    inspect,
    load,
    save,
    replaceLegacy,
    edit,
    confirmSourceType,
    resolveConflict,
    loadPolicy,
    savePolicy,
    runDirectory,
    loadModelDraft,
    loadRunState,
  };
}
module.exports = { createGeoKnowledgeStore };
