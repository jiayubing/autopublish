import { useCallback, useEffect, useRef, useState } from "react";
import {
  loadKnowledge,
  knowledgeState,
  generateKnowledge,
  cancelKnowledge,
  editKnowledge,
  exportKnowledge,
  linkKnowledgeQuestions,
} from "../../bridge/geo-knowledge";
import type {
  GeoKnowledge,
  KnowledgeState,
  KnowledgeEdit,
} from "../../types/geo-knowledge";

export function useGeoKnowledge(clientId: string) {
  const [knowledge, setKnowledge] = useState<GeoKnowledge | null>(null);
  const [state, setState] = useState<KnowledgeState>({
    phase: "idle",
    running: false,
  });
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
      const result = await loadKnowledge(clientId);
      if (version === epoch.current) {
        setKnowledge(result.knowledge);
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
        setState({ phase: "complete", running: false });
      }
      return true;
    } catch (e) {
      if (version === epoch.current) {
        setError(e instanceof Error ? e.message : "知识库操作未完成。");
        setState({ phase: "failed", running: false });
      }
      return false;
    } finally {
      if (version === epoch.current) {
        locked.current = false;
        setBusy(false);
      }
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
    state,
    loading,
    busy,
    error,
    reload,
    cancel,
    download,
    generate: () => command(() => generateKnowledge(clientId)),
    edit: (input: KnowledgeEdit) => command(() => editKnowledge(input)),
    link: (ids: string[]) =>
      knowledge
        ? command(() =>
            linkKnowledgeQuestions(clientId, knowledge.revision, ids),
          )
        : Promise.resolve(false),
  };
}
