import React from "react";
import { LoaderCircle, RefreshCw } from "lucide-react";
import type { ContentWorkbenchFeature } from "../features/content/use-content-workbench-feature";
import PaidSubmissionStagingPanel, {
  type PaidMediaPoolSnapshot,
} from "./content/PaidSubmissionStagingPanel";

export interface PaidMediaWorkbenchProps {
  content: ContentWorkbenchFeature;
  paidMediaPool: PaidMediaPoolSnapshot;
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
    paidStaging,
    paidMediaExecution,
    query,
    scope,
  } = content.snapshot;
  const clientName = clients.find((client) => client.id === clientId)?.name;
  const loading = !scope || (query.loading && clients.length === 0);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-slate-500">
        <LoaderCircle className="mr-2 h-5 w-5 animate-spin" />
        加载客户与付费媒体投稿队列
      </div>
    );
  }

  return (
    <div
      data-testid="paid-media-workbench"
      className="flex h-full min-h-0 flex-col gap-3 overflow-hidden"
    >
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-md border border-slate-200 bg-white px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-slate-800">付费媒体投稿</h2>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            从文章管理加入队列后，在此选择收藏媒体、预检费用并管理暂停批次。
          </p>
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <label className="text-xs text-slate-500" htmlFor="paid-media-client">
            当前客户（付费媒体投稿）
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
            aria-label="刷新付费媒体投稿"
            className="inline-flex h-9 items-center gap-1 rounded-md border border-slate-300 px-2 text-xs text-slate-600 disabled:opacity-50"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${query.loading ? "animate-spin" : ""}`}
            />
            {query.loading ? "刷新中…" : "刷新付费投稿"}
          </button>
        </div>
      </div>
      {query.error && (
        <div role="alert" className="rounded border border-rose-100 bg-rose-50 p-2 text-xs text-rose-700">
          {query.error.userMessage}
        </div>
      )}
      {managementQuery.error && (
        <div role="alert" className="rounded border border-rose-100 bg-rose-50 p-2 text-xs text-rose-700">
          {managementQuery.error.userMessage}
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <PaidSubmissionStagingPanel
          currentClientId={clientId}
          currentClientName={clientName}
          items={paidStaging.items}
          articles={management.articles}
          query={paidStaging.query}
          removeCommand={content.snapshot.commands.removePaidSubmissionStaging}
          setMediaCommand={
            content.snapshot.commands.setPaidSubmissionStagingMedia
          }
          preflightCommand={
            content.snapshot.commands.previewPaidMediaPreflight
          }
          confirmCommand={content.snapshot.commands.confirmPaidMediaBatch}
          startCommand={content.snapshot.commands.startPaidMediaBatch}
          pauseCommand={content.snapshot.commands.pausePaidMediaBatch}
          onRemove={(articleRef) =>
            content.commands.removePaidSubmissionStaging({
              articleRefs: [articleRef],
            })
          }
          paidMediaPool={paidMediaPool}
          paidMediaBatches={paidMediaExecution.items}
          paidMediaBatchesQuery={paidMediaExecution.query}
          onPreflight={(input) =>
            content.commands.previewPaidMediaPreflight(input)
          }
          onConfirm={(input) => content.commands.confirmPaidMediaBatch(input)}
          onStart={(input) => content.commands.startPaidMediaBatch(input)}
          onPause={(input) => content.commands.pausePaidMediaBatch(input)}
          onRefreshPaidMediaBatches={() =>
            content.refreshPaidMediaBatches("paid-manual")
          }
          onSetMedia={(articleRefs, mediaResourceId) =>
            content.commands.setPaidSubmissionStagingMedia({
              articleRefs,
              mediaResourceId,
            })
          }
        />
      </div>
    </div>
  );
}
