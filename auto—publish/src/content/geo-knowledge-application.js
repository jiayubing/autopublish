"use strict";

const { geoError } = require("./geo-knowledge-schema");
const { mergeKnowledge } = require("./geo-knowledge-merge");
const { createRequestBudget } = require("./geo-knowledge-research");

function createGeoKnowledgeApplication({ store, materialStore, getClient, research, request, getPromptSnapshot = () => ({}), onChange = () => {} }) {
  const running = new Map();
  const states = new Map();
  let disposed = false;
  function state(clientId) { return structuredClone(states.get(clientId) || { phase: "idle", running: false }); }
  async function generate(clientId, { online = true, temporaryPrompt = "" } = {}) {
    if (disposed) throw geoError("GEO_CANCELLED");
    if (running.has(clientId)) throw geoError("GEO_ALREADY_RUNNING");
    const client = getClient(clientId);
    if (!client) throw geoError("CLIENT_NOT_FOUND");
    const initial = store.inspect ? store.inspect(clientId) : { status: "current_v2", knowledge: store.load(clientId) };
    if (initial.status === "invalid") throw geoError("GEO_KNOWLEDGE_INVALID");
    const current = initial.knowledge;
    const promptSnapshot = getPromptSnapshot(clientId, temporaryPrompt);
    const controller = new AbortController();
    const budget = typeof request === "function" ? createRequestBudget(request) : null;
    running.set(clientId, controller);
    function progress(phase, extra = {}) { states.set(clientId, { phase, running: true, ...extra }); }
    try {
      progress("materials");
      const materials = await materialStore.listMaterials(clientId);
      controller.signal.throwIfAborted();
      progress("extracting");
      let document = await research.extract({ clientId, clientName: client.name || client.displayName || clientId, materials, signal: controller.signal, budgetedRequest: budget?.request, budget, promptSnapshot });
      if (online && research.enrich) document = await research.enrich(document, { signal: controller.signal, progress, current, budgetedRequest: budget?.request, budget, promptSnapshot });
      if (materials.some(item => item.status !== "ready")) {
        document.status.outcome = "partial";
        document.status.warnings.push("部分客户资料未能读取");
      }
      controller.signal.throwIfAborted();
      progress("saving");
      const merged = mergeKnowledge(current, document);
      const saved = initial.status === "legacy_v1"
        ? store.replaceLegacy(merged)
        : store.save(merged, current?.revision || 0);
      states.set(clientId, { phase: "complete", running: false });
      onChange(clientId);
      return saved;
    } catch (error) {
      const failure = controller.signal.aborted ? geoError("GEO_CANCELLED") : error;
      states.set(clientId, { phase: "failed", running: false, errorCode: /^GEO_|^CLIENT_/.test(failure.code || "") ? failure.code : "GEO_GENERATION_FAILED" });
      throw geoError(states.get(clientId).errorCode);
    } finally { running.delete(clientId); }
  }
  function cancel(clientId) { running.get(clientId)?.abort(); return state(clientId); }
  function dispose() { disposed = true; for (const controller of running.values()) controller.abort(); }
  return { generate, state, cancel, dispose };
}
module.exports = { createGeoKnowledgeApplication };
