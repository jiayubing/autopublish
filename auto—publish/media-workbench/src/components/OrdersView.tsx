import React, { useState } from "react";
import type { OrderAnomalyPreparation } from "../bridge/media";
import type { RealOrder } from "../types/media";
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  ClipboardList,
  Clock,
  ExternalLink,
  Globe,
  RefreshCw,
  Search,
  XCircle,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { formatBeijingTime } from "../time-format";
import {
  ORDER_FILTERS,
  projectOrderList,
} from "../features/media/order-list-projection.js";
import type { OrderActionSession } from "./use-order-action-session";
import { Button, PageHeader, StatusBadge } from "./ui/primitives";

interface OrdersViewProps {
  orders: RealOrder[];
  onSyncOrder: (orderNid: string) => Promise<unknown>;
  onSyncAllOrders: () => Promise<unknown>;
  onPrepareAnomaly: (orderNid: string) => Promise<unknown>;
  onResolveAnomaly: (
    orderNid: string,
    action:
      | "resumeOrderTracking"
      | "confirmOrderPublished"
      | "confirmOrderNotPublished",
  ) => Promise<unknown>;
  orderActions: OrderActionSession;
  syncingOrderNid?: string | null;
  syncingAll?: boolean;
  orderActionsBusy?: boolean;
  syncFailures?: Array<{ orderNid: string; errorCode: string | null }>;
  anomalyPreparations?: Record<string, OrderAnomalyPreparation>;
  errorMessage?: string | null;
}

const ENTRY_DELAYS = [0, 0.025, 0.05, 0.075, 0.1, 0.125] as const;

type StatusTone = "neutral" | "info" | "success" | "warning" | "danger";

const STATUS_MAP: Record<
  string,
  {
    label: string;
    tone: StatusTone;
    color: string;
    icon: React.ReactNode;
  }
> = {
  "0": {
    label: "待安排",
    tone: "info",
    color: "text-blue-400",
    icon: <Clock className="h-3 w-3" />,
  },
  "1": {
    label: "已安排",
    tone: "warning",
    color: "text-amber-400",
    icon: <RefreshCw className="h-3 w-3 animate-spin" />,
  },
  "2": {
    label: "已发布",
    tone: "success",
    color: "text-emerald-400",
    icon: <CheckCircle2 className="h-3 w-3" />,
  },
  "4": {
    label: "已退稿",
    tone: "danger",
    color: "text-rose-400",
    icon: <AlertTriangle className="h-3 w-3" />,
  },
  "9": {
    label: "售后中",
    tone: "warning",
    color: "text-violet-400",
    icon: <AlertTriangle className="h-3 w-3" />,
  },
  cancelled: {
    label: "已取消",
    tone: "neutral",
    color: "text-slate-400",
    icon: <XCircle className="h-3 w-3" />,
  },
};

function getStatusInfo(statusCode: string) {
  return (
    STATUS_MAP[statusCode] || {
      label: statusCode ? `状态:${statusCode}` : "未知",
      tone: "neutral" as const,
      color: "text-slate-400",
      icon: <AlertTriangle className="h-3 w-3" />,
    }
  );
}

export default function OrdersView({
  orders,
  onSyncOrder,
  onSyncAllOrders,
  onPrepareAnomaly,
  onResolveAnomaly,
  orderActions,
  syncingOrderNid = null,
  syncingAll = false,
  orderActionsBusy = false,
  syncFailures = [],
  anomalyPreparations = {},
  errorMessage = null,
}: OrdersViewProps) {
  const [activeTab, setActiveTab] = useState<string>("0");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedOrderNid, setExpandedOrderNid] = useState<string | null>(null);
  const actionSnapshot = orderActions.snapshot;
  const actionIntents = orderActions.intents;

  const orderList = projectOrderList(orders, {
    status: activeTab,
    search: searchQuery,
  });
  const filteredOrders = orderList.items;

  async function handleSync(orderNid: string) {
    if (!orderNid) return;
    await onSyncOrder(orderNid);
  }

  return (
    <div className="grid min-h-0 gap-3 pb-3">
      <PageHeader
        eyebrow="Paid Media Orders"
        title="订单"
        description="只管理已经形成的真实付费订单、供应商状态同步和需要人工核对的订单异常。"
        actions={
          <Button
            disabled={syncingAll || orderActionsBusy}
            onClick={() => void onSyncAllOrders()}
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${syncingAll ? "animate-spin" : ""}`}
            />
            {syncingAll ? "正在刷新…" : "刷新全部"}
          </Button>
        }
      />

      {errorMessage && (
        <div
          role="alert"
          className="rounded-xl border border-rose-100 bg-rose-50 px-3 py-2.5 text-xs text-rose-700"
        >
          {errorMessage}
        </div>
      )}
      {syncFailures.length > 0 && (
        <div
          role="status"
          className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800"
        >
          {syncFailures.map((failure) => failure.orderNid).join("、")} 刷新失败；已保留原订单事实。
        </div>
      )}

      <div className="flex min-w-0 flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,0.03)] md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 flex-wrap gap-1">
          {ORDER_FILTERS.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition-colors ${
                  active
                    ? "bg-slate-800 text-white"
                    : "text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                }`}
              >
                {tab.label}
                <span className={`ml-1 ${active ? "text-slate-300" : "text-slate-400"}`}>
                  {orderList.counts[tab.id] || 0}
                </span>
              </button>
            );
          })}
        </div>
        <div className="relative w-full md:w-72">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="搜索文章标题、订单编号…"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            className="ui-field h-9 pl-8"
          />
        </div>
      </div>

      <div className="grid gap-2.5">
        {filteredOrders.length === 0 && (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white/80 p-12 text-center">
            <ClipboardList className="mx-auto mb-3 h-7 w-7 text-slate-300" />
            <p className="text-sm font-semibold text-slate-500">暂无真实订单</p>
            <p className="mt-1 text-[11px] text-slate-400">
              只有确认投稿后形成的真实订单会出现在这里。
            </p>
          </div>
        )}

        <AnimatePresence>
          {filteredOrders.map((order, index) => {
            const statusInfo = getStatusInfo(order.statusCode);
            const isExpanded = expandedOrderNid === order.orderNid;
            const isSyncing = syncingOrderNid === order.orderNid;
            const cancellationPreparation =
              actionSnapshot.cancellationPreparations[order.orderNid];
            const cancellationResolution =
              actionSnapshot.cancellationResolutions[order.orderNid];

            return (
              <motion.article
                key={order.orderNid || `order-${index}`}
                initial={{ opacity: 0, y: 3 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -3 }}
                transition={{
                  duration: 0.12,
                  delay: ENTRY_DELAYS[Math.min(index, ENTRY_DELAYS.length - 1)],
                }}
                className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.03)]"
              >
                <div className="flex flex-col gap-3 px-4 py-3.5 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <h3 className="min-w-0 truncate text-[13px] font-bold text-slate-800">
                        {order.title || "(无标题)"}
                      </h3>
                      <StatusBadge tone={statusInfo.tone}>
                        {statusInfo.icon}
                        {statusInfo.label}
                      </StatusBadge>
                    </div>

                    <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500">
                      {order.resourceName && (
                        <span className="flex items-center gap-1">
                          <Globe className="h-3 w-3" />
                          <span className="font-medium text-slate-700">
                            {order.resourceName}
                          </span>
                        </span>
                      )}
                      {order.submittedAt && (
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          提交 {formatBeijingTime(order.submittedAt)}
                        </span>
                      )}
                      {order.publishedAt && (
                        <span className="flex items-center gap-1 text-emerald-600">
                          <CheckCircle2 className="h-3 w-3" />
                          发布 {formatBeijingTime(order.publishedAt)}
                        </span>
                      )}
                    </div>

                    {order.delayNotice && (
                      <p className="mt-2 text-[11px] leading-5 text-amber-700">
                        订单仍在服务商处理中；耗时较长仅表示延迟，不代表失败。
                      </p>
                    )}

                    {order.anomaly && (
                      <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50/75 p-3 text-[11px] leading-5 text-amber-900">
                        <p className="font-bold">订单状态需要人工核对</p>
                        <p>当前事实已冻结，页面不会根据供应商原始响应自行推断。</p>
                        {!anomalyPreparations[order.orderNid] ||
                        anomalyPreparations[order.orderNid].allowedActions.length === 0 ? (
                          <Button
                            size="sm"
                            className="mt-2"
                            disabled={orderActionsBusy}
                            onClick={() => void onPrepareAnomaly(order.orderNid)}
                          >
                            {anomalyPreparations[order.orderNid]
                              ? "重新核对可用证据"
                              : "核对可用证据"}
                          </Button>
                        ) : (
                          <div className="mt-2">
                            <p>
                              证据结论：{anomalyPreparations[order.orderNid].classification}
                            </p>
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {anomalyPreparations[order.orderNid].allowedActions.map(
                                (action) => (
                                  <Button
                                    key={action}
                                    size="sm"
                                    disabled={orderActionsBusy}
                                    onClick={() =>
                                      void onResolveAnomaly(
                                        order.orderNid,
                                        action as
                                          | "resumeOrderTracking"
                                          | "confirmOrderPublished"
                                          | "confirmOrderNotPublished",
                                      )
                                    }
                                  >
                                    {action === "resumeOrderTracking"
                                      ? "恢复订单跟踪"
                                      : action === "confirmOrderPublished"
                                        ? "确认已发布"
                                        : "确认未发布"}
                                  </Button>
                                ),
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {order.cancellation?.manualResolutionRequired &&
                      order.cancellation.cancellationAttemptId && (
                        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50/75 p-3 text-[11px] leading-5 text-amber-900">
                          <p className="font-bold">取消结果不确定，订单继续冻结</p>
                          {!cancellationResolution ? (
                            <Button
                              size="sm"
                              className="mt-2"
                              disabled={orderActionsBusy}
                              onClick={() =>
                                void actionIntents.prepareCancellationResolution(
                                  order.orderNid,
                                  order.cancellation.cancellationAttemptId,
                                )
                              }
                            >
                              核对取消结果
                            </Button>
                          ) : cancellationResolution.classification === "inconclusive" ? (
                            <p className="mt-1">证据不足；不提供收口或重试操作。</p>
                          ) : (
                            <Button
                              size="sm"
                              className="mt-2"
                              disabled={orderActionsBusy}
                              onClick={() =>
                                void actionIntents.resolveCancellation(order.orderNid)
                              }
                            >
                              {cancellationResolution.classification === "verified_cancelled"
                                ? "确认已取消"
                                : "确认取消未生效"}
                            </Button>
                          )}
                        </div>
                      )}
                  </div>

                  <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 lg:justify-end">
                    <div className="min-w-20">
                      <span className="block text-[9px] font-semibold uppercase tracking-[0.08em] text-slate-400">
                        投稿报价
                      </span>
                      <span className="mt-0.5 block font-mono text-sm font-bold text-slate-800">
                        {order.price ? `¥${order.price}` : "未记录"}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {order.cancellation?.actionLabel &&
                        (cancellationPreparation ? (
                          <Button
                            variant="danger"
                            size="sm"
                            disabled={orderActionsBusy}
                            onClick={() => void actionIntents.cancel(order.orderNid)}
                          >
                            确认{order.cancellation.actionLabel}
                          </Button>
                        ) : (
                          <Button
                            variant="danger"
                            size="sm"
                            disabled={orderActionsBusy}
                            onClick={() =>
                              void actionIntents.prepareCancellation(order.orderNid)
                            }
                          >
                            {order.cancellation.actionLabel}
                            {order.cancellation.riskCode ? "（可能被拒绝）" : ""}
                          </Button>
                        ))}
                      <Button
                        size="sm"
                        onClick={() =>
                          setExpandedOrderNid(isExpanded ? null : order.orderNid)
                        }
                      >
                        <ClipboardList className="h-3.5 w-3.5" />
                        {isExpanded ? "收起详情" : "订单详情"}
                      </Button>
                      <Button
                        size="sm"
                        disabled={!order.orderNid || isSyncing || orderActionsBusy}
                        onClick={() => void handleSync(order.orderNid)}
                      >
                        <RefreshCw
                          className={`h-3.5 w-3.5 ${isSyncing ? "animate-spin" : ""}`}
                        />
                        同步
                      </Button>
                    </div>
                  </div>
                </div>

                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="border-t border-slate-100 bg-slate-50/55 px-4 py-3.5">
                        <div className="grid gap-x-8 gap-y-2 rounded-lg border border-slate-200 bg-white p-3 font-mono text-[10.5px] text-slate-600 sm:grid-cols-2">
                          <div className="flex justify-between gap-4">
                            <span className="text-slate-400">订单编号</span>
                            <span className="truncate text-slate-700">{order.orderNid || "-"}</span>
                          </div>
                          <div className="flex justify-between gap-4">
                            <span className="text-slate-400">状态码</span>
                            <span className={statusInfo.color}>
                              {order.statusCode} ({statusInfo.label})
                            </span>
                          </div>
                          <div className="flex justify-between gap-4">
                            <span className="text-slate-400">费用</span>
                            <span>{order.price ? `¥${order.price}` : "未记录"}</span>
                          </div>
                          <div className="flex justify-between gap-4">
                            <span className="text-slate-400">提交时间</span>
                            <span>
                              {order.submittedAt
                                ? formatBeijingTime(order.submittedAt)
                                : "-"}
                            </span>
                          </div>
                          <div className="flex justify-between gap-4">
                            <span className="text-slate-400">发布时间</span>
                            <span className="text-emerald-600">
                              {order.publishedAt
                                ? formatBeijingTime(order.publishedAt)
                                : "-"}
                            </span>
                          </div>
                          {order.hasPublishedUrl && (
                            <div className="sm:col-span-2">
                              <button
                                type="button"
                                disabled={actionSnapshot.openingOrderNid === order.orderNid}
                                onClick={() =>
                                  void actionIntents.openPublishedUrl(order.orderNid)
                                }
                                className="inline-flex items-center gap-1.5 font-sans text-[11px] font-semibold text-blue-600 hover:text-blue-700 disabled:opacity-50"
                              >
                                <ExternalLink className="h-3 w-3" />
                                {actionSnapshot.openingOrderNid === order.orderNid
                                  ? "正在打开…"
                                  : "打开发布链接"}
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.article>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
