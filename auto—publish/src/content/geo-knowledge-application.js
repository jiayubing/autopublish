"use strict";

const { geoError, generationErrorCode } = require("./geo-knowledge-schema");
const { mergeKnowledge } = require("./geo-knowledge-merge");
const { proseFacts } = require("./continuous-knowledge-canonical");
const FAILURE_PHASES = new Set([
  "materials",
  "extracting",
  "planning",
  "researching",
  "synthesizing",
  "saving",
  "R1",
  "R2",
  "R3",
  "R4",
  "R5",
  "K",
]);

function createGeoKnowledgeApplication({
  store,
  materialStore,
  getClient,
  research,
  getPromptSnapshot = () => ({}),
  onChange = () => {},
}) {
  const running = new Map();
  const states = new Map();
  let disposed = false;
  function state(clientId) {
    return structuredClone(
      states.get(clientId) || { phase: "idle", running: false },
    );
  }
  async function generate(clientId, { temporaryPrompt = "" } = {}) {
    if (disposed) throw geoError("GEO_CANCELLED");
    if (running.has(clientId)) throw geoError("GEO_ALREADY_RUNNING");
    const client = getClient(clientId);
    if (!client) throw geoError("CLIENT_NOT_FOUND");
    const initial = store.inspect ? store.inspect(clientId) : { status: "current_v2", knowledge: store.load(clientId) };
    if (initial.status === "invalid") throw geoError("GEO_KNOWLEDGE_INVALID");
    const current = initial.knowledge;
    const promptSnapshot = getPromptSnapshot(clientId, temporaryPrompt);
    const controller = new AbortController();
    running.set(clientId, controller);
    function progress(phase, extra = {}) {
      states.set(clientId, {
        phase,
        running: true,
        ...(extra.completed !== undefined ? { completed: extra.completed } : {}),
        ...(extra.total !== undefined ? { total: extra.total } : {}),
      });
    }
    try {
      progress("materials");
      const materials = await materialStore.listMaterials(clientId);
      controller.signal.throwIfAborted();
      progress("R1");
      const result = await research.run({
        clientId,
        clientName: client.name || client.displayName || clientId,
        materials,
        signal: controller.signal,
        progress,
        current,
        promptSnapshot,
      });
      const document = result.document;
      if (materials.some((item) => item.status !== "ready")) {
        document.status.outcome = "partial";
        document.status.warnings.push("部分客户资料未能读取");
      }
      controller.signal.throwIfAborted();
      progress("saving");
      const merged = mergeKnowledge(current, document);
      if (result.markdown)
        merged.deliverable = {
          version: 1,
          knowledgeRevision: merged.revision,
          status:
            proseFacts(merged) === proseFacts(document)
              ? result.knowledge.quality.status
              : "stale",
          markdown: result.markdown,
          warnings: [
            ...(result.knowledge.quality.shortSections.length ||
            result.knowledge.quality.overlongSections.length
              ? ["部分板块篇幅不在600—1000字范围，已保留完整正文。"]
              : []),
            ...(proseFacts(merged) !== proseFacts(document)
              ? ["已保存知识保留了原有或人工确认事实，稿件需重新生成。"]
              : []),
          ],
        };
      const saved = initial.status === "legacy_v1"
        ? store.replaceLegacy(merged)
        : store.save(merged, current?.revision || 0);
      states.set(clientId, { phase: "complete", running: false });
      onChange(clientId);
      return saved;
    } catch (error) {
      const failure = controller.signal.aborted ? Object.assign(geoError("GEO_CANCELLED"), { outcome: error.outcome, stage: error.stage }) : error;
      const failedPhase = FAILURE_PHASES.has(failure.stage)
        ? failure.stage
        : states.get(clientId)?.phase;
      states.set(clientId, {
        phase: "failed",
        running: false,
        ...(FAILURE_PHASES.has(failedPhase) ? { failedPhase } : {}),
        ...(failure.outcome === "uncertain" ? { outcome: "uncertain" } : {}),
        errorCode: generationErrorCode(failure.code),
      });
      throw geoError(states.get(clientId).errorCode);
    } finally { running.delete(clientId); }
  }
  function cancel(clientId) { running.get(clientId)?.abort(); return state(clientId); }
  function dispose() { disposed = true; for (const controller of running.values()) controller.abort(); }
  return { generate, state, cancel, dispose };
}
module.exports = { createGeoKnowledgeApplication };
