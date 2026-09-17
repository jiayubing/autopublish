import { useEffect, useRef, useState } from "react";
import { getPlatformQueue } from "../../bridge/platform";
import { listAccountProfiles } from "../../bridge/account-profile";
import {
  admitRegularQueueItems,
  previewRegularQueueAdmission,
} from "../../bridge/content";
import type { AccountProfile, PlatformTarget } from "../../types/platform";
import type {
  ArticleAttentionItem,
  RegularQueueAdmissionResult,
} from "../../types/publication";
import { useWorkspaceRuntimeIdentity } from "../workspace/workspace-coordinator-context";

export function useAttentionRetarget(
  items: ArticleAttentionItem[],
  onCommitted: () => void,
) {
  const runtime = useWorkspaceRuntimeIdentity().workspaceRuntimeId;
  const currentRuntime = useRef(runtime);
  currentRuntime.current = runtime;
  const initialRuntime = useRef(runtime);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const [targets, setTargets] = useState<PlatformTarget[]>([]);
  const [unavailableTargets, setUnavailableTargets] = useState<Array<{ id: string; displayName: string; reason: string }>>([]);
  const [profiles, setProfiles] = useState<AccountProfile[]>([]);
  const [platformId, setPlatformId] = useState("");
  const [accountProfileId, setAccountProfileId] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [reload, setReload] = useState(0);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<RegularQueueAdmissionResult | null>(
    null,
  );
  const [attempted, setAttempted] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError(false);
    setPlatformId("");
    setAccountProfileId("");
    Promise.all([getPlatformQueue(), listAccountProfiles()])
      .then(([queue, accounts]) => {
        if (!active) return;
        const bound = accounts.filter(
          (account) => account.bindingStatus === "bound",
        );
        setProfiles(bound);
        setUnavailableTargets(queue.platforms.flatMap((target) => {
          const reasons = [];
          if (items.some((item) => item.platformId === target.id)) reasons.push("所选文章包含该平台的失败项，请按原平台分批选择");
          if (target.queueConfigured === false) reasons.push("平台配置未完成，请在设置中配置");
          if (target.queueConfigured === undefined) reasons.push("无法确认平台配置，请完全退出软件后重新启动");
          if (!bound.some((account) => account.platformId === target.id)) reasons.push("当前内容库没有该平台的已绑定账号，请在设置中绑定");
          return reasons.length ? [{ id: target.id, displayName: target.displayName, reason: reasons.join("；") }] : [];
        }));
        setTargets(
          queue.platforms.filter(
            (target) =>
              target.queueConfigured === true &&
              !items.some((item) => item.platformId === target.id) &&
              bound.some((account) => account.platformId === target.id),
          ),
        );
      })
      .catch(() => {
        if (active) setLoadError(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [items, reload]);

  async function submit() {
    if (lock.current || attempted || !platformId || !accountProfileId) return;
    lock.current = true;
    setBusy(true);
    setError("");
    let mutationStarted = false;
    try {
      if (!runtime || runtime !== initialRuntime.current) {
        setError("内容库已变化，请关闭后重新选择。");
        return;
      }
      const input = {
        articleRefs: items.map((item) => ({
          clientId: item.clientId!,
          articleId: item.articleId!,
        })),
        retargetFrom: items.map((item) => ({
          attentionId: item.attentionId,
          articleRef: { clientId: item.clientId!, articleId: item.articleId! },
        })),
        platformId,
        accountProfileId,
        autoStart: false,
      };
      const preview = await previewRegularQueueAdmission(input);
      if (!mounted.current || currentRuntime.current !== initialRuntime.current)
        return;
      if (preview.queueableCount !== items.length) {
        setError(
          "部分文章状态已变化或目标不可用。请关闭弹窗并刷新后重新选择，本次未入队。",
        );
        return;
      }
      mutationStarted = true;
      setAttempted(true);
      const outcome = await admitRegularQueueItems(input);
      if (!mounted.current || currentRuntime.current !== initialRuntime.current)
        return;
      setResult(outcome);
      onCommitted();
    } catch {
      setError(
        mutationStarted
          ? "入队结果暂时无法确认。请关闭后刷新需处理和普通平台队列核对，不要直接重复提交。"
          : "无法检查投稿，请核对平台账号配置并刷新后重试。本次未入队。",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  return {
    targets,
    unavailableTargets,
    profiles,
    platformId,
    setPlatformId,
    accountProfileId,
    setAccountProfileId,
    loading,
    loadError,
    retryLoad: () => setReload((value) => value + 1),
    busy,
    error,
    result,
    attempted,
    submit,
  };
}
