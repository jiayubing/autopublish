import React, { useEffect, useMemo, useState } from "react";
import { LoaderCircle, RefreshCw } from "lucide-react";
import type { ContentWorkbenchFeature } from "../features/content/use-content-workbench-feature";
import type { GeneratedContentArticle } from "../types/generation";
import type { MediaResource } from "../types/media";
import type {
  PaidMediaExecutionBatch,
  PaidMediaPreflight,
} from "../types/publication";

export interface PaidMediaPoolSnapshot {
  items: MediaResource[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasPrev: boolean;
  hasNext: boolean;
  loading: boolean;
  error?: { userMessage?: string } | null;
  loadPage: (page: number) => void | Promise<unknown>;
}

export interface PaidMediaWorkbenchProps {
  content: ContentWorkbenchFeature;
  paidMediaPool: PaidMediaPoolSnapshot;
}

function messageOf(value: unknown, fallback: string): string {
  return value instanceof Error && value.message ? value.message : fallback;
}

function articleKey(article: GeneratedContentArticle): string {
  return `${article.clientId}:${article.id}`;
}

function belongsToClient(
  article: GeneratedContentArticle,
  clientId: string,
): boolean {
  return article.clientId === clientId && article.status !== "trashed";
}

export default function PaidMediaWorkbench({
  content,
  paidMediaPool,
}: PaidMediaWorkbenchProps) {
  const {
    clients,
    selectedClientId: clientId,
    management,
    managementQuery,
    paidMediaExecution,
    query,
    scope,
  } = content.snapshot;
  const clientName = clients.find((client) => client.id === clientId)?.name;
  const [selectedArticleKeys, setSelectedArticleKeys] = useState<Set<string>>(
    () => new Set(),
  );
  const [mediaResourceId, setMediaResourceId] = useState("");
  const [preflight, setPreflight] = useState<PaidMediaPreflight | null>(null);
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState(false);
  const articles = useMemo(
    () =>
      (management.articles || []).filter((article) =>
        belongsToClient(article, clientId),
      ),
    [clientId, management.articles],
  );
  const selectedArticles = useMemo(
    () => articles.filter((article) => selectedArticleKeys.has(articleKey(article))),
    [articles, selectedArticleKeys],
  );
  const availableResources = Array.isArray(paidMediaPool.items)
    ? paidMediaPool.items
    : [];
  const commandStates = content.snapshot.commands;
  const executionBatches: PaidMediaExecutionBatch[] =
    paidMediaExecution.items || [];

  useEffect(() => {
    setSelectedArticleKeys(new Set());
    setMediaResourceId("");
    setPreflight(null);
    setActionError("");
  }, [clientId]);

  useEffect(() => {
    setPreflight(null);
  }, [mediaResourceId, selectedArticleKeys]);

  const toggleArticle = (article: GeneratedContentArticle) => {
    setSelectedArticleKeys((current) => {
      const next = new Set(current);
      const key = articleKey(article);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const runPreflight = async () => {
    if (!selectedArticles.length || !mediaResourceId || busy) return;
    setBusy(true);
    setActionError("");
    try {
      const result = await content.commands.previewPaidMediaPreflight({
        articleRefs: selectedArticles.map((article) => ({
          clientId,
          articleId: article.id,
        })),
        mediaResourceId,
      });
      if (!result?.stale) setPreflight(result);
    } catch (value) {
      setActionError(messageOf(value, "费用预检失败，请重新选择后重试。"));
    } finally {
      setBusy(false);
    }
  };

  const confirmPreflight = async () => {
    if (!preflight?.canConfirm || busy) return;
    setBusy(true);
    setActionError("");
    try {
      const result = await content.commands.confirmPaidMediaBatch({
        confirmationToken: preflight.confirmationToken,
      });
      if (!result?.stale) {
        setSelectedArticleKeys(new Set());
        setMediaResourceId("");
        setPreflight(null);
        await content.refreshPaidMediaBatches("paid-confirmed");
        await content.refreshManagement("paid-confirmed");
      }
    } catch (value) {
      setActionError(messageOf(value, "费用确认失败，请重新预检。"));
      setPreflight(null);
    } finally {
      setBusy(false);
    }
  };

  const startBatch = async (batchId: string) => {
    if (commandStates.startPaidMediaBatch?.busy) return;
    try {
      await content.commands.startPaidMediaBatch({ batchId });
      await content.refreshPaidMediaBatches("paid-started");
    } catch (value) {
      setActionError(messageOf(value, "启动付费投稿批次失败。"));
    }
  };

  const pauseBatch = async (batchId: string) => {
    if (commandStates.pausePaidMediaBatch?.busy) return;
    try {
      await content.commands.pausePaidMediaBatch({ batchId });
      await content.refreshPaidMediaBatches("paid-paused");
    } catch (value) {
      setActionError(messageOf(value, "暂停付费投稿批次失败。"));
    }
  };

  const loading = !scope || (query.loading && clients.length === 0);
  if (loading)
    return (
      <div className="flex h-full items-center justify-center text-slate-500">
        <LoaderCircle className="mr-2 h-5 w-5 animate-spin" />
        加载客户与付费媒体
      </div>
    );

  return (
    <div
      data-testid="paid-media-workbench"
      className="flex h-full min-h-0 flex-col gap-3 overflow-hidden"
    >
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-md border border-slate-200 bg-white px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-slate-800">付费媒体投稿</h2>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            选择文章和收藏媒体；只有费用预检通过并确认后，才会创建付费投稿批次。
          </p>
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <label className="text-xs text-slate-500" htmlFor="paid-media-client">
            当前客户
          </label>
          <select
            id="paid-media-client"
            aria-label="当前客户（付费媒体投稿）"
            value={clientId}
            onChange={(event) => void content.selectClient(event.target.value)}
            disabled={query.loading || clients.length === 0}
            className="h-9 min-w-32 rounded-md border border-slate-300 bg-white px-2 text-sm"
          >
            <option value="">暂无客户</option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void content.refresh("manual")}
            disabled={query.loading}
            aria-label="刷新付费媒体"
            className="inline-flex h-9 items-center gap-1 rounded-md border border-slate-300 px-2 text-xs text-slate-600 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${query.loading ? "animate-spin" : ""}`} />
            {query.loading ? "刷新中…" : "刷新"}
          </button>
        </div>
      </div>
      {(query.error || managementQuery.error || paidMediaPool.error || actionError) && (
        <div role="alert" className="rounded border border-rose-100 bg-rose-50 p-2 text-xs text-rose-700">
          {actionError || query.error?.userMessage || managementQuery.error?.userMessage || paidMediaPool.error?.userMessage}
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto rounded-md border border-slate-200 bg-white p-4">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.8fr)]">
          <section aria-label="选择投稿文章" className="min-w-0">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-800">
                选择文章（{clientName || clientId || "暂无客户"}）
              </h3>
              <button
                type="button"
                className="text-xs text-slate-500 underline"
                onClick={() =>
                  setSelectedArticleKeys(
                    new Set(articles.map((article) => articleKey(article))),
                  )
                }
              >
                全选
              </button>
            </div>
            <div className="max-h-72 space-y-1 overflow-y-auto rounded border border-slate-200 p-2">
              {articles.length === 0 && (
                <p className="p-3 text-xs text-slate-500">当前客户没有可发起投稿的文章。</p>
              )}
              {articles.map((article) => {
                const key = articleKey(article);
                return (
                  <label key={key} className="flex cursor-pointer items-center gap-2 rounded px-2 py-2 text-xs hover:bg-slate-50">
                    <input
                      type="checkbox"
                      checked={selectedArticleKeys.has(key)}
                      onChange={() => toggleArticle(article)}
                    />
                    <span className="min-w-0 truncate">{article.title || article.id}</span>
                  </label>
                );
              })}
            </div>
          </section>
          <section aria-label="选择媒体资源" className="min-w-0">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-800">选择收藏媒体</h3>
              <span className="text-xs text-slate-500">{paidMediaPool.total || 0} 个资源</span>
            </div>
            <div className="max-h-72 space-y-1 overflow-y-auto rounded border border-slate-200 p-2">
              {availableResources.length === 0 && (
                <p className="p-3 text-xs text-slate-500">暂无收藏媒体资源。</p>
              )}
              {availableResources.map((resource) => (
                <button
                  type="button"
                  key={resource.resourceId}
                  onClick={() => setMediaResourceId(resource.resourceId)}
                  className={`block w-full rounded px-2 py-2 text-left text-xs ${mediaResourceId === resource.resourceId ? "bg-blue-50 text-blue-700 ring-1 ring-blue-300" : "hover:bg-slate-50"}`}
                >
                  <span className="block truncate font-medium">{resource.name || resource.resourceId}</span>
                  <span className="block truncate text-slate-500">{resource.resourceId}</span>
                </button>
              ))}
            </div>
            <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
              <button type="button" disabled={!paidMediaPool.hasPrev || paidMediaPool.loading} onClick={() => void paidMediaPool.loadPage(paidMediaPool.page - 1)}>
                上一页
              </button>
              <span>{paidMediaPool.page || 1} / {paidMediaPool.totalPages || 1}</span>
              <button type="button" disabled={!paidMediaPool.hasNext || paidMediaPool.loading} onClick={() => void paidMediaPool.loadPage(paidMediaPool.page + 1)}>
                下一页
              </button>
            </div>
          </section>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
          <span className="text-xs text-slate-500">
            已选 {selectedArticles.length} 篇文章{mediaResourceId ? `，媒体 ${mediaResourceId}` : ""}
          </span>
          <button
            type="button"
            onClick={() => void runPreflight()}
            disabled={busy || !selectedArticles.length || !mediaResourceId || commandStates.previewPaidMediaPreflight?.busy}
            className="rounded bg-blue-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
          >
            费用预检
          </button>
          {preflight && (
            <button
              type="button"
              onClick={() => void confirmPreflight()}
              disabled={busy || !preflight.canConfirm || commandStates.confirmPaidMediaBatch?.busy}
              className="rounded bg-amber-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
            >
              确认费用并创建批次
            </button>
          )}
        </div>
        {preflight && (
          <div className="mt-3 rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            <div>预检状态：{preflight.status === "ready" ? "可确认" : "存在阻塞"}</div>
            <div className="mt-1">报价：{typeof preflight.quotedPrice === "number" ? `¥${preflight.quotedPrice.toFixed(2)}` : "未提供"}，合计：{typeof preflight.estimatedTotal === "number" ? `¥${preflight.estimatedTotal.toFixed(2)}` : "未提供"}</div>
            {preflight.blockers.length > 0 && <div className="mt-1">阻塞：{preflight.blockers.join("、")}</div>}
          </div>
        )}
        <section aria-label="已确认付费批次" className="mt-6 border-t border-slate-100 pt-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-800">已确认付费批次</h3>
            <button type="button" className="text-xs text-slate-500 underline" onClick={() => void content.refreshPaidMediaBatches("paid-manual")}>刷新批次</button>
          </div>
          {executionBatches.length === 0 ? (
            <p className="text-xs text-slate-500">确认费用后，批次会显示在这里。</p>
          ) : (
            <div className="space-y-2">
              {executionBatches.map((batch) => (
                <div key={batch.batchId} className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-200 px-3 py-2 text-xs">
                  <span>{batch.batchId} · {batch.status} · {batch.items?.length || 0} 篇</span>
                  <span className="flex gap-2">
                    <button type="button" onClick={() => void startBatch(batch.batchId)} className="text-blue-700 underline">启动</button>
                    <button type="button" onClick={() => void pauseBatch(batch.batchId)} className="text-slate-600 underline">暂停</button>
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
