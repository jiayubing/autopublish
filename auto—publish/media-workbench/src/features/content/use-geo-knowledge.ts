import { useCallback, useEffect, useRef, useState } from "react";
import {
  loadKnowledge,
  knowledgeState,
  generateKnowledge,
  cancelKnowledge,
  editKnowledge,
  exportKnowledge,
  linkKnowledgeQuestions,
  confirmKnowledgeSourceType,
  resolveKnowledgeConflict,
  getGeoPromptSettings,
  saveGeoGlobalPrompt,
  saveGeoClientPrompt,
} from "../../bridge/geo-knowledge";
import type {
  GeoKnowledge,
  KnowledgeState,
  KnowledgeEdit,
  KnowledgeStorageStatus,
  GeoPromptSettings,
} from "../../types/geo-knowledge";

export function useGeoKnowledge(clientId: string) {
  const [knowledge, setKnowledge] = useState<GeoKnowledge | null>(null);
  const [state, setState] = useState<KnowledgeState>({
    phase: "idle",
    running: false,
  });
  const [storageStatus, setStorageStatus] = useState<KnowledgeStorageStatus>("missing");
  const [promptSettings, setPromptSettings] = useState<GeoPromptSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const epoch = useRef(0);
  const locked = useRef(false);
  const reload = useCallback(async () => {
    if (!clientId) {
      setLoading(false);
      return;
    }
    const version = epoch.current;
    setLoading(true);
    try {
      const [result, prompts] = await Promise.all([loadKnowledge(clientId), getGeoPromptSettings(clientId)]);
      if (version === epoch.current) {
        setKnowledge(result.knowledge);
        setStorageStatus(result.storageStatus);
        setPromptSettings(prompts);
        setState(result.state);
        setError("");
      }
    } catch (e) {
      if (version === epoch.current)
        setError(e instanceof Error ? e.message : "知识库读取失败。");
    } finally {
      if (version === epoch.current) setLoading(false);
    }
  }, [clientId]);
  useEffect(() => {
    epoch.current++;
    void reload();
    return () => {
      epoch.current++;
    };
  }, [reload]);
  useEffect(() => {
    if (!clientId || (!state.running && !busy)) return;
    const version = epoch.current;
    let pending = false;
    const timer = setInterval(async () => {
      if (pending) return;
      pending = true;
      try {
        const result = await knowledgeState(clientId);
        if (version === epoch.current) {
          setState(result.state);
          if (!result.state.running && !busy) void reload();
        }
      } catch (e) {
        if (version === epoch.current)
          setError(e instanceof Error ? e.message : "进度读取失败。");
      } finally {
        pending = false;
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [clientId, state.running, busy, reload]);
  async function command(action: () => Promise<{ knowledge: GeoKnowledge }>) {
    if (locked.current) return false;
    locked.current = true;
    setBusy(true);
    setError("");
    const version = epoch.current;
    try {
      const result = await action();
      if (version === epoch.current) {
        setKnowledge(result.knowledge);
        setStorageStatus("current_v2");
        setState({ phase: "complete", running: false });
      }
      return true;
    } catch (e) {
      if (version === epoch.current) {
        const code = e && typeof e === "object" && "code" in e && typeof e.code === "string" ? e.code : "";
        const message = e instanceof Error ? e.message : "知识库操作未完成。";
        setError(code ? `${message}（${code}）` : message);
        try {
          const latest = await knowledgeState(clientId);
          if (version === epoch.current) setState(latest.state);
        } catch {
          if (version === epoch.current)
            setState({ phase: "failed", running: false, ...(code ? { errorCode: code } : {}) });
        }
      }
      return false;
    } finally {
      if (version === epoch.current) {
        locked.current = false;
        setBusy(false);
      }
    }
  }
  async function promptCommand(action: () => Promise<void>) {
    if (locked.current) return false;
    locked.current = true;
    setBusy(true);
    setError("");
    try {
      await action();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "研究要求保存失败。");
      return false;
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  async function cancel() {
    try {
      await cancelKnowledge(clientId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "取消未完成。");
    }
  }
  async function download() {
    try {
      const result = await exportKnowledge(clientId);
      const url = URL.createObjectURL(
        new Blob([result.markdown], { type: "text/markdown;charset=utf-8" }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = "客户知识库.md";
      link.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "导出失败。");
    }
  }
  return {
    knowledge,
    storageStatus,
    promptSettings,
    state,
    loading,
    busy,
    error,
    reload,
    cancel,
    download,
    generate: (temporaryPrompt = "") => command(() => generateKnowledge(clientId, temporaryPrompt)),
    edit: (input: KnowledgeEdit) => command(() => editKnowledge(input)),
    confirmSourceType: (sourceId: string, targetType: "official_web" | "client_public") =>
      knowledge ? command(() => confirmKnowledgeSourceType({ clientId, revision: knowledge.revision, sourceId, targetType })) : Promise.resolve(false),
    resolveConflict: (conflictId: string, resolution: { claimId?: string; value?: string }) =>
      knowledge ? command(() => resolveKnowledgeConflict({ clientId, revision: knowledge.revision, conflictId, ...resolution })) : Promise.resolve(false),
    saveGlobalPrompt: (value: string) => promptCommand(async () => {
        const result = await saveGeoGlobalPrompt(value);
        setPromptSettings(current => current ? { ...current, ...result } : current);
      }),
    saveClientPrompt: (value: string) => promptCommand(async () => {
        await saveGeoClientPrompt(clientId, value);
        setPromptSettings(current => current ? { ...current, clientPrompt: value } : current);
      }),
    link: (ids: string[]) =>
      knowledge
        ? command(() =>
            linkKnowledgeQuestions(clientId, knowledge.revision, ids),
          )
        : Promise.resolve(false),
  };
}
