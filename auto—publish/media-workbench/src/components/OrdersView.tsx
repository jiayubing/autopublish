import React, { useState } from "react";
import type { OrderAnomalyPreparation } from "../bridge/media";
import type { RealOrder } from "../types/media";
import {
  ClipboardList,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  Search,
  RefreshCw,
  Calendar,
  Globe,
  ExternalLink,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { formatBeijingTime } from "../time-format";
import {
  ORDER_FILTERS,
  projectOrderList,
} from "../features/media/order-list-projection.js";
import type { OrderActionSession } from "./use-order-action-session";

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

const ENTRY_DELAYS = [0, 0.03, 0.06, 0.09, 0.12, 0.15] as const;

const STATUS_MAP: Record<
  string,
  {
    label: string;
    color: string;
    bg: string;
    border: string;
    icon: React.ReactNode;
  }
> = {
  "0": {
    label: "待安排",
    color: "text-slate-600",
    bg: "bg-blue-50",
    border: "border-blue-200",
    icon: <Clock className="w-3.5 h-3.5" />,
  },
  "1": {
    label: "已安排",
    color: "text-amber-600",
    bg: "bg-amber-50",
    border: "border-amber-200",
    icon: <RefreshCw className="w-3.5 h-3.5 animate-spin" />,
  },
  "2": {
    label: "已发布",
    color: "text-emerald-600",
    bg: "bg-emerald-50",
    border: "border-emerald-200",
    icon: <CheckCircle2 className="w-3.5 h-3.5" />,
  },
  "4": {
    label: "已退稿",
    color: "text-rose-600",
    bg: "bg-rose-50",
    border: "border-rose-200",
    icon: <AlertTriangle className="w-3.5 h-3.5" />,
  },
  "9": {
    label: "售后中",
    color: "text-purple-600",
    bg: "bg-purple-50",
    border: "border-purple-200",
    icon: <AlertTriangle className="w-3.5 h-3.5" />,
  },
  cancelled: {
    label: "已取消",
    color: "text-slate-600",
    bg: "bg-slate-100",
    border: "border-slate-300",
    icon: <XCircle className="w-3.5 h-3.5" />,
  },
};

function getStatusInfo(statusCode: string) {
  return (
    STATUS_MAP[statusCode] || {
      label: statusCode ? `状态:${statusCode}` : "未知",
      color: "text-slate-400",
      bg: "bg-slate-50",
      border: "border-slate-200",
      icon: <AlertTriangle className="w-3.5 h-3.5" />,
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

  const handleSync = async (orderNid: string) => {
    if (!orderNid) return;
    await onSyncOrder(orderNid);
  };

  const tabs = ORDER_FILTERS;

  return (
    <div className="space-y-6">
      {/* Top action block */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-800">订单</h2>
          <p className="text-xs text-slate-500 mt-1">
            这里只处理已经形成的真实订单及其状态核对。
          </p>
        </div>
        <button
          type="button"
          disabled={syncingAll || orderActionsBusy}
          onClick={() => void onSyncAllOrders()}
          className="inline-flex items-center justify-center space-x-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 disabled:opacity-50"
        >
          <RefreshCw
            className={`h-4 w-4 ${syncingAll ? "animate-spin" : ""}`}
          />
          <span>{syncingAll ? "正在刷新…" : "刷新全部"}</span>
        </button>
      </div>

      {errorMessage && (
        <div
          role="alert"
          className="rounded-lg border border-rose-100 bg-rose-50 px-3 py-2 text-xs text-rose-700"
        >
          {errorMessage}
        </div>
      )}
      {syncFailures.length > 0 && (
        <div
          role="status"
          className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800"
        >
          {syncFailures.map((failure) => failure.orderNid).join("、")}{" "}
          刷新失败；已保留原订单事实。
        </div>
      )}
      {/* Orders Filter Toolbar */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center space-x-2 flex-wrap gap-y-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                activeTab === tab.id
                  ? "bg-blue-600 border-blue-600 text-white shadow-sm"
                  : "bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-600"
              }`}
            >
              {tab.label}（{orderList.counts[tab.id] || 0}）
            </button>
          ))}
        </div>

        <div className="relative flex items-center w-full md:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3" />
          <input
            type="text"
            placeholder="搜索文章标题、订单编号..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-slate-50 focus:bg-white text-xs text-slate-700 placeholder-slate-400 border border-slate-200 rounded-lg outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition-all"
          />
        </div>
      </div>

      {/* Orders List */}
      <div className="space-y-3">
        {filteredOrders.length === 0 && (
          <div className="bg-white border border-slate-200/80 rounded-2xl p-12 text-center">
            <ClipboardList className="w-8 h-8 text-slate-300 mx-auto mb-3" />
            <p className="text-sm font-medium text-slate-500">暂无真实订单</p>
            <p className="text-[11px] text-slate-400 mt-1">
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
              <motion.div
                key={order.orderNid || `order-${index}`}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{
                  duration: 0.12,
                  delay: ENTRY_DELAYS[Math.min(index, ENTRY_DELAYS.length - 1)],
                }}
                className="bg-white border border-slate-200/80 rounded-2xl shadow-sm overflow-hidden"
              >
                {/* Header row */}
                <div className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-2.5 mb-1.5">
                      <h3 className="text-sm font-bold text-slate-800 truncate">
                        {order.title || "(无标题)"}
                      </h3>
                      <span
                        className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${statusInfo.bg} ${statusInfo.color} ${statusInfo.border}`}
                      >
                        {statusInfo.icon}
                        <span>{statusInfo.label}</span>
                      </span>
                    </div>
                    {order.delayNotice && (
                      <p className="mt-2 text-[11px] text-amber-700">
                        订单仍在服务商处理中；耗时较长仅表示延迟，不代表失败。
                      </p>
                    )}
                    {order.anomaly && (
                      <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                        <p className="font-semibold">订单状态需要人工核对</p>
                        <p className="mt-1">
                          当前事实已冻结，页面不会根据供应商原始响应自行推断。
                        </p>
                        {!anomalyPreparations[order.orderNid] ||
                        anomalyPreparations[order.orderNid].allowedActions
                          .length === 0 ? (
                          <button
                            type="button"
                            disabled={orderActionsBusy}
                            className="mt-2 rounded border border-amber-300 bg-white px-2 py-1 font-semibold"
                            onClick={() =>
                              void onPrepareAnomaly(order.orderNid)
                            }
                          >
                            {anomalyPreparations[order.orderNid]
                              ? "重新核对可用证据"
                              : "核对可用证据"}
                          </button>
                        ) : (
                          <div className="mt-2 space-y-2">
                            <p>
                              证据结论：
                              {
                                anomalyPreparations[order.orderNid]
                                  .classification
                              }
                            </p>
                            {anomalyPreparations[
                              order.orderNid
                            ].allowedActions.map((action) => (
                              <button
                                key={action}
                                type="button"
                                disabled={orderActionsBusy}
                                className="mr-2 rounded border border-amber-300 bg-white px-2 py-1 font-semibold"
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
                              </button>
                            ))}
                            {anomalyPreparations[order.orderNid].allowedActions
                              .length === 0 && <p>证据不足，订单继续冻结。</p>}
                          </div>
                        )}
                      </div>
                    )}
                    {order.cancellation?.manualResolutionRequired &&
                      order.cancellation.cancellationAttemptId && (
                        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                          <p className="font-semibold">
                            取消结果不确定，订单继续冻结
                          </p>
                          {!cancellationResolution ? (
                            <button
                              type="button"
                              disabled={orderActionsBusy}
                              className="mt-2 rounded border border-amber-300 bg-white px-2 py-1 font-semibold"
                              onClick={() =>
                                void actionIntents.prepareCancellationResolution(
                                  order.orderNid,
                                  order.cancellation.cancellationAttemptId,
                                )
                              }
                            >
                              核对取消结果
                            </button>
                          ) : cancellationResolution.classification ===
                            "inconclusive" ? (
                            <p className="mt-2">
                              证据不足；不提供收口或重试操作。
                            </p>
                          ) : (
                            <button
                              type="button"
                              disabled={orderActionsBusy}
                              className="mt-2 rounded border border-amber-300 bg-white px-2 py-1 font-semibold"
                              onClick={() =>
                                void actionIntents.resolveCancellation(
                                  order.orderNid,
                                )
                              }
                            >
                              {cancellationResolution.classification ===
                              "verified_cancelled"
                                ? "确认已取消"
                                : "确认取消未生效"}
                            </button>
                          )}
                        </div>
                      )}
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500">
                      {order.resourceName && (
                        <span className="flex items-center space-x-1">
                          <Globe className="w-3 h-3" />
                          <span className="font-medium text-slate-700">
                            {order.resourceName}
                          </span>
                        </span>
                      )}
                      {order.submittedAt && (
                        <span className="flex items-center space-x-1">
                          <Calendar className="w-3 h-3" />
                          <span>
                            提交: {formatBeijingTime(order.submittedAt)}
                          </span>
                        </span>
                      )}
                      {order.publishedAt && (
                        <span className="flex items-center space-x-1 text-emerald-600">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>
                            发布: {formatBeijingTime(order.publishedAt)}
                          </span>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions and price */}
                  <div className="flex items-center gap-x-4 gap-y-2 flex-wrap">
                    <div>
                      <span className="text-[10px] text-slate-400 block">
                        投稿报价
                      </span>
                      <span className="font-bold text-slate-800 font-mono text-sm">
                        {order.price ? `¥${order.price}` : "未记录"}
                      </span>
                    </div>
                    <div className="flex items-center space-x-1.5">
                      {order.cancellation?.actionLabel &&
                        (cancellationPreparation ? (
                          <button
                            type="button"
                            disabled={orderActionsBusy}
                            onClick={() =>
                              void actionIntents.cancel(order.orderNid)
                            }
                            className="px-3 py-1.5 bg-rose-50 text-rose-700 font-semibold rounded-lg border border-rose-200 text-xs"
                          >
                            确认{order.cancellation.actionLabel}
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={orderActionsBusy}
                            onClick={() =>
                              void actionIntents.prepareCancellation(
                                order.orderNid,
                              )
                            }
                            className="px-3 py-1.5 bg-rose-50 text-rose-700 font-semibold rounded-lg border border-rose-200 text-xs"
                          >
                            {order.cancellation.actionLabel}
                            {order.cancellation.riskCode
                              ? "（可能被拒绝）"
                              : ""}
                          </button>
                        ))}
                      <button
                        onClick={() =>
                          setExpandedOrderNid(
                            isExpanded ? null : order.orderNid,
                          )
                        }
                        className="flex items-center space-x-1 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg border border-slate-200/60 transition-all text-xs"
                      >
                        <ClipboardList className="w-3.5 h-3.5" />
                        <span>{isExpanded ? "收起详情" : "订单详情"}</span>
                      </button>
                      <button
                        onClick={() => handleSync(order.orderNid)}
                        disabled={
                          !order.orderNid || isSyncing || orderActionsBusy
                        }
                        className="flex items-center space-x-1 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 font-semibold rounded-lg border border-blue-200/60 transition-all disabled:opacity-50 text-xs"
                      >
                        <RefreshCw
                          className={`w-3.5 h-3.5 ${isSyncing ? "animate-spin" : ""}`}
                        />
                        <span>同步</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Expandable order details */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="px-4 pb-4 border-t border-slate-100 pt-4">
                        <div className="bg-slate-950 rounded-xl p-4 border border-slate-800 font-mono text-[10.5px] leading-relaxed text-slate-300 space-y-1.5">
                          <div className="flex items-center space-x-2 border-b border-slate-800 pb-2 mb-2">
                            <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                            <span className="text-slate-500 uppercase font-bold tracking-wider text-[9px]">
                              订单详情控制台
                            </span>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
                            <div className="flex justify-between">
                              <span className="text-slate-500">订单编号:</span>
                              <span className="text-slate-300">
                                {order.orderNid || "-"}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-500">状态码:</span>
                              <span className={statusInfo.color}>
                                {order.statusCode} ({statusInfo.label})
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-500">费用:</span>
                              <span className="text-slate-300">
                                {order.price ? `¥${order.price}` : "未记录"}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-500">提交时间:</span>
                              <span className="text-slate-300">
                                {order.submittedAt
                                  ? formatBeijingTime(order.submittedAt)
                                  : "-"}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-500">发布时间:</span>
                              <span className="text-emerald-400">
                                {order.publishedAt
                                  ? formatBeijingTime(order.publishedAt)
                                  : "-"}
                              </span>
                            </div>
                          </div>
                          {order.hasPublishedUrl && (
                            <div className="pt-2 border-t border-slate-800 mt-2">
                              <button
                                type="button"
                                disabled={
                                  actionSnapshot.openingOrderNid ===
                                  order.orderNid
                                }
                                onClick={() =>
                                  void actionIntents.openPublishedUrl(
                                    order.orderNid,
                                  )
                                }
                                className="flex items-center space-x-1.5 text-blue-400 hover:text-blue-300 transition-colors disabled:opacity-50"
                              >
                                <ExternalLink className="w-3 h-3" />
                                <span>
                                  {actionSnapshot.openingOrderNid ===
                                  order.orderNid
                                    ? "正在打开…"
                                    : "打开发布链接"}
                                </span>
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
