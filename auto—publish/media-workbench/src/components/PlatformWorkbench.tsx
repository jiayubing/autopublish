import { RefreshCw } from "lucide-react";
import { useState } from "react";
import { usePlatformFeature } from "../features/platform/platform-feature-context";
import { useAttentionFeature } from "../features/attention/use-attention-feature";
import { useConfirmation } from "../confirmation";
import type { ContentWorkbenchFeature } from "../features/content/use-content-workbench-feature";
import type { ArticleAttentionItem } from "../types/publication";
import RegularQueueGroupsPanel from "./RegularQueueGroupsPanel";
import PaidMediaWorkbench from "./PaidMediaWorkbench";
import ArticleAttentionPanel from "./content/ArticleAttentionPanel";
import ArticleAttentionDetailDrawer from "./content/ArticleAttentionDetailDrawer";

type SubmissionCenterSection = "regular" | "paid" | "attention";

interface PlatformWorkbenchProps {
  content: ContentWorkbenchFeature;
  onOpenArticleLibrary: (intent?: {
    articleId?: string;
    clientId?: string;
  }) => void;
  onOpenOrders: () => void;
}

function attentionTargetLabel(
  item: ArticleAttentionItem,
  publicationTargetKey?: string | null,
): string {
  const targetKey = item.targetKey || publicationTargetKey || "";
  const account = /(?:^|:)account:(.+)$/.exec(targetKey)?.[1];
  return `${item.displayName || item.platformId || "未指定平台"} / ${account || "账号未记录"}`;
}

export default function PlatformWorkbench({
  content,
  onOpenArticleLibrary,
  onOpenOrders,
}: PlatformWorkbenchProps) {
  const { confirm } = useConfirmation();
  const { snapshot, feature } = usePlatformFeature();
  const clientId = content.snapshot.selectedClientId || "";
  const clientLabel =
    content.snapshot.clients.find((client) => client.id === clientId)?.name ||
    clientId ||
    "当前客户";
  const publicationRecords = content.snapshot.management.publicationRecords || [];
  const { snapshot: attentionSnapshot, feature: attentionFeature } =
    useAttentionFeature(clientId);
  const [section, setSection] = useState<SubmissionCenterSection>("regular");
  const [attentionDetail, setAttentionDetail] =
    useState<ArticleAttentionItem | null>(null);
  const [attentionError, setAttentionError] = useState("");
  const [actionError, setActionError] = useState("");
  const groups = snapshot.regularQueueGroupViews;
  const groupQuery = snapshot.regularQueueGroups.query;
  const commands = snapshot.commands;
  const residue = snapshot.residue;
  const residueBusy = residue.phase === "checking" || residue.phase === "cleaning";

  async function removePendingItem(
    item: (typeof groups)[number]["remaining"][number],
  ) {
    setActionError("");
    try {
      const title = item.articleSummary?.title || "标题不可用";
      const customerName = item.articleSummary?.customerName || "客户信息不可用";
      if (
        !(await confirm({
          title: "确认移除待执行队列项",
          message: `将移除“${title}”（客户：${customerName}）这一项尚未开始的普通平台投稿；文章随后恢复可编辑。`,
          confirmLabel: "确认移除",
          tone: "warning",
        }))
      )
        return;
      await feature.removePendingQueueItems([
        { articleRef: item.articleRef, itemId: item.itemId, batchId: item.batchId },
      ]);
    } catch {
      setActionError(
        commands.removePendingQueueItems.error?.userMessage ||
          "移除普通平台队列项失败。",
      );
    }
  }

  async function resolveAttentionAction(
    item: ArticleAttentionItem,
    action: string,
    orderId?: string,
  ) {
    setAttentionError("");
    try {
      const preview = await attentionFeature.previewAction({
        attentionId: item.attentionId,
        action,
        resolutionInput: orderId ? { orderId } : undefined,
      });
      if (!preview) return;
      const copy: Record<string, { title: string; confirmLabel: string }> = {
        "confirm-regular-accepted": {
          title: "确认远端已接受",
          confirmLabel: "确认已接受",
        },
        "confirm-regular-not-accepted": {
          title: "确认远端未接受",
          confirmLabel: "确认未接受",
        },
        "bind-paid-order-number": {
          title: "确认补录订单号",
          confirmLabel: "确认补录",
        },
        "confirm-paid-order-absent": {
          title: "确认服务商没有订单",
          confirmLabel: "确认没有订单",
        },
      };
      const actionCopy = copy[action] || {
        title: "确认处理需处理项",
        confirmLabel: action,
      };
      if (
        preview.requiresConfirmation &&
        !(await confirm({
          title: actionCopy.title,
          message:
            action === "confirm-paid-order-absent"
              ? "仅在已人工核对服务商且确认没有生成订单时继续。"
              : preview.message,
          confirmLabel: actionCopy.confirmLabel,
          tone: "warning",
        }))
      )
        return;
      await attentionFeature.executePreview(preview, { confirmed: true });
      setAttentionDetail(null);
    } catch (value) {
      setAttentionError(
        value instanceof Error ? value.message : "处理需处理项失败。",
      );
    }
  }

  function openAttentionTarget(item: ArticleAttentionItem) {
    if (item.kind === "paid_order_creation_uncertain" || item.kind === "order_status_anomaly") {
      setAttentionDetail(item);
      return;
    }
    if (item.articleId) {
      onOpenArticleLibrary({
        clientId: item.clientId || clientId || undefined,
        articleId: item.articleId,
      });
      return;
    }
    setAttentionDetail(item);
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden">
      <div className="shrink-0 rounded-md border border-slate-200 bg-white px-4 py-3">
        <h1 className="text-lg font-bold text-slate-800">投稿中心</h1>
        <p className="mt-1 text-xs text-slate-500">
          普通平台队列、已确认付费批次和需处理事项集中在此处执行。
        </p>
        <div className="mt-3 flex min-w-0 flex-wrap gap-2" role="tablist" aria-label="投稿中心分区">
          {(
            [
              ["regular", "普通平台队列"],
              ["paid", "已确认付费批次"],
              ["attention", "需处理事项"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={section === value}
              onClick={() => setSection(value)}
              className={`rounded-md px-3 py-2 text-xs font-semibold ${
                section === value
                  ? "bg-slate-900 text-white"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {label}
              {value === "attention" && attentionSnapshot.items.length > 0
                ? ` (${attentionSnapshot.items.length})`
                : ""}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {section === "regular" && (
          <div className="h-full p-1">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-slate-800">普通平台队列</h2>
                <p className="mt-1 text-xs text-slate-500">
                  文章库负责发起投稿；队列查看与操作集中在此处。
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={groupQuery.loading}
                  onClick={() => void feature.refreshRegularQueueGroups("manual")}
                  className="rounded border border-slate-300 px-3 py-2 text-xs disabled:opacity-40"
                >
                  <RefreshCw className={`mr-1 inline h-3.5 w-3.5 ${groupQuery.loading ? "animate-spin" : ""}`} />
                  {groupQuery.loading ? "刷新中…" : "刷新"}
                </button>
                <button
                  type="button"
                  disabled={commands.startAllGroups.busy}
                  onClick={() => void feature.startAllGroups()}
                  className="rounded bg-emerald-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
                >
                  开始全部
                </button>
                <button
                  type="button"
                  disabled={commands.pauseAllGroups.busy}
                  onClick={() => void feature.pauseAllGroups()}
                  className="rounded border border-amber-300 px-3 py-2 text-xs font-semibold text-amber-800 disabled:opacity-40"
                >
                  暂停全部
                </button>
              </div>
            </div>
            {groupQuery.error && (
              <p role="alert" className="mb-3 rounded border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
                {groupQuery.error.userMessage}
              </p>
            )}
            {(actionError || commands.removePendingQueueItems.error?.userMessage) && (
              <p role="alert" className="mb-3 rounded border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
                {actionError || commands.removePendingQueueItems.error?.userMessage}
              </p>
            )}
            <RegularQueueGroupsPanel
              groups={groups}
              loading={groupQuery.loading}
              startBusy={commands.startGroup.busy}
              pauseBusy={commands.pauseGroup.busy}
              removeBusy={commands.removePendingQueueItems.busy}
              onStart={(id) => void feature.startGroup(id)}
              onPause={(id) => void feature.pauseGroup(id)}
              onRemove={(item) => void removePendingItem(item)}
            />
            <section aria-labelledby="queue-residue-heading" className="mt-4 rounded border border-slate-200 bg-slate-50 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 id="queue-residue-heading" className="text-sm font-semibold text-slate-800">已删除文章队列残留</h3>
                  <p className="mt-1 text-xs text-slate-500">只检查并清理本地队列残留；不会创建投稿、重试远端请求或删除发布事实。</p>
                </div>
                <button type="button" disabled={residueBusy} onClick={() => void feature.inspectResidue()} className="rounded border border-slate-300 bg-white px-3 py-2 text-xs disabled:opacity-40">
                  {residue.phase === "checking" ? "检查中…" : "检查残留"}
                </button>
              </div>
              {residue.phase === "awaiting-confirmation" && (
                <div className="mt-3 flex flex-wrap items-center gap-2 rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
                  <span>可清理 {residue.cleanableCount} 项，另有 {residue.reportedCount} 项仅报告。</span>
                  <button type="button" disabled={commands.cleanupResidue.busy} onClick={() => void feature.cleanupResidue({ confirmed: true })} className="rounded border border-amber-300 bg-white px-2 py-1 font-semibold disabled:opacity-40">确认清理本地残留</button>
                </div>
              )}
              {residue.feedback && <p role={residue.feedback.kind === "error" ? "alert" : "status"} className={`mt-2 text-xs ${residue.feedback.kind === "error" ? "text-rose-700" : "text-emerald-700"}`}>{residue.feedback.text}</p>}
            </section>
          </div>
        )}

        {section === "paid" && <PaidMediaWorkbench content={content} />}

        {section === "attention" && (
          <div className="grid gap-3 p-1">
            {attentionError && <p role="alert" className="rounded border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">{attentionError}</p>}
            <ArticleAttentionPanel
              snapshot={attentionSnapshot}
              onRefresh={attentionFeature.refresh}
              onPreviewAction={attentionFeature.previewAction}
              onExecutePreview={attentionFeature.executePreview}
              getTargetLabel={(item) =>
                attentionTargetLabel(
                  item,
                  publicationRecords.find(
                    (record) => record.publicationId === item.publicationId,
                  )?.targetKey,
                )
              }
              clientLabel={clientLabel}
              onOpenPublication={openAttentionTarget}
              onOpenArticleLibrary={(item) =>
                onOpenArticleLibrary({
                  clientId: item.clientId || clientId || undefined,
                  articleId: item.articleId || undefined,
                })
              }
              onInspect={setAttentionDetail}
              onOpenArticle={openAttentionTarget}
              onAttentionAction={(item, action) => setAttentionDetail(item)}
            />
            <button
              type="button"
              className="justify-self-start rounded border border-slate-300 px-3 py-2 text-xs text-slate-700"
              onClick={onOpenOrders}
            >
              查看真实订单
            </button>
          </div>
        )}
      </div>
      <ArticleAttentionDetailDrawer
        item={attentionDetail}
        onClose={() => setAttentionDetail(null)}
        onResolveAttentionAction={resolveAttentionAction}
        resolutionBusy={
          attentionSnapshot.commands.preview.busy ||
          attentionSnapshot.commands.execute.busy
        }
        resolutionError={attentionError}
      />
    </div>
  );
}
