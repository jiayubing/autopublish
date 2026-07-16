import React, { useState } from 'react';
import { RealOrder } from '../types';
import { syncOrder } from '../electron-api';
import { 
  ClipboardList, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  Clock, 
  Search,
  RefreshCw,
  Trash2,
  Calendar,
  Globe,
  ExternalLink
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { formatBeijingTime } from '../time-format';

interface OrdersViewProps {
  orders: RealOrder[];
  onClearOrders: () => void;
}

const STATUS_MAP: Record<string, { label: string; color: string; bg: string; border: string; icon: React.ReactNode }> = {
  '0': { label: '待安排', color: 'text-slate-600', bg: 'bg-slate-50', border: 'border-slate-200', icon: <Clock className="w-3.5 h-3.5" /> },
  '1': { label: '已安排', color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200', icon: <Clock className="w-3.5 h-3.5 animate-pulse" /> },
  '2': { label: '已发布', color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200', icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
  '4': { label: '已退稿', color: 'text-rose-600', bg: 'bg-rose-50', border: 'border-rose-200', icon: <XCircle className="w-3.5 h-3.5" /> },
  '9': { label: '售后中', color: 'text-purple-600', bg: 'bg-purple-50', border: 'border-purple-200', icon: <AlertTriangle className="w-3.5 h-3.5" /> },
};

function getStatusInfo(statusCode: string) {
  return STATUS_MAP[statusCode] || { label: statusCode ? `状态:${statusCode}` : '未知', color: 'text-slate-400', bg: 'bg-slate-50', border: 'border-slate-200', icon: <AlertTriangle className="w-3.5 h-3.5" /> };
}

export default function OrdersView({
  orders,
  onClearOrders
}: OrdersViewProps) {
  const [activeTab, setActiveTab] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedOrderNid, setExpandedOrderNid] = useState<string | null>(null);
  const [syncingIds, setSyncingIds] = useState<Set<string>>(new Set());

  const filteredOrders = orders.filter(order => {
    const matchesTab = activeTab === 'all' || order.statusCode === activeTab;
    const matchesSearch = 
      order.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
      order.filename.toLowerCase().includes(searchQuery.toLowerCase()) ||
      order.orderNid.toLowerCase().includes(searchQuery.toLowerCase()) ||
      order.resourceName.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesTab && matchesSearch;
  });

  const handleSync = async (orderNid: string) => {
    if (!orderNid) return;
    setSyncingIds(prev => new Set(prev).add(orderNid));
    try {
      await syncOrder(orderNid);
    } catch (e) {
      console.error('syncOrder failed:', e);
    } finally {
      setSyncingIds(prev => {
        const next = new Set(prev);
        next.delete(orderNid);
        return next;
      });
    }
  };

  const tabs = [
    { id: 'all', label: '全部记录' },
    { id: '2', label: '已发布' },
    { id: '1', label: '已安排' },
    { id: '0', label: '待安排' },
    { id: '4', label: '已退稿' },
    { id: '9', label: '售后中' },
  ];

  return (
    <div className="space-y-6">
      {/* Top action block */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-800">分发队列与订单追踪</h2>
          <p className="text-xs text-slate-500 mt-1">查看自媒体平台 API 提交状态反馈、下发凭证与资金清算明细</p>
        </div>

        {orders.length > 0 && (
          <button
            onClick={onClearOrders}
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-rose-50 hover:bg-rose-100/80 text-rose-600 hover:text-rose-700 text-xs font-semibold rounded-lg border border-rose-100 transition-all self-start sm:self-auto"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>清空记录</span>
          </button>
        )}
      </div>

      {/* Orders Filter Toolbar */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center space-x-2 flex-wrap gap-y-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                activeTab === tab.id
                  ? 'bg-blue-600 border-blue-600 text-white shadow-sm'
                  : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-600'
              }`}
            >
              {tab.label}
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
            <p className="text-sm font-medium text-slate-500">暂无订单记录</p>
            <p className="text-[11px] text-slate-400 mt-1">提交分发任务后，订单将自动出现在这里。</p>
          </div>
        )}

        <AnimatePresence>
          {filteredOrders.map((order, index) => {
            const statusInfo = getStatusInfo(order.statusCode);
            const isExpanded = expandedOrderNid === order.orderNid;
            const isSyncing = syncingIds.has(order.orderNid);

            return (
              <motion.div
                key={order.orderNid || `order-${index}`}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.12, delay: index * 0.03 }}
                className="bg-white border border-slate-200/80 rounded-2xl shadow-sm overflow-hidden"
              >
                {/* Header row */}
                <div className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-2.5 mb-1.5">
                      <h3 className="text-sm font-bold text-slate-800 truncate">{order.title || order.filename || '(无标题)'}</h3>
                      <span className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${statusInfo.bg} ${statusInfo.color} ${statusInfo.border}`}>
                        {statusInfo.icon}
                        <span>{statusInfo.label}</span>
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500">
                      {order.resourceName && (
                        <span className="flex items-center space-x-1">
                          <Globe className="w-3 h-3" />
                          <span className="font-medium text-slate-700">{order.resourceName}</span>
                        </span>
                      )}
                      {order.submittedAt && (
                        <span className="flex items-center space-x-1">
                          <Calendar className="w-3 h-3" />
                          <span>提交: {formatBeijingTime(order.submittedAt)}</span>
                        </span>
                      )}
                      {order.publishedAt && (
                        <span className="flex items-center space-x-1 text-emerald-600">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>发布: {formatBeijingTime(order.publishedAt)}</span>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions and price */}
                  <div className="flex items-center gap-x-4 gap-y-2 flex-wrap">
                    {order.price && (
                      <div>
                        <span className="text-[10px] text-slate-400 block">费用</span>
                        <span className="font-bold text-slate-800 font-mono text-sm">¥{order.price}</span>
                      </div>
                    )}
                    {order.filename && (
                      <div>
                        <span className="text-[10px] text-slate-400 block">源文件</span>
                        <span className="font-mono text-[11px] font-semibold text-slate-600">{order.filename}</span>
                      </div>
                    )}
                    <div className="flex items-center space-x-1.5">
                      <button
                        onClick={() => setExpandedOrderNid(isExpanded ? null : order.orderNid)}
                        className="flex items-center space-x-1 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg border border-slate-200/60 transition-all text-xs"
                      >
                        <ClipboardList className="w-3.5 h-3.5" />
                        <span>{isExpanded ? '收起详情' : '订单详情'}</span>
                      </button>
                      <button
                        onClick={() => handleSync(order.orderNid)}
                        disabled={!order.orderNid || isSyncing}
                        className="flex items-center space-x-1 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 font-semibold rounded-lg border border-blue-200/60 transition-all disabled:opacity-50 text-xs"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
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
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="px-4 pb-4 border-t border-slate-100 pt-4">
                        <div className="bg-slate-950 rounded-xl p-4 border border-slate-800 font-mono text-[10.5px] leading-relaxed text-slate-300 space-y-1.5">
                          <div className="flex items-center space-x-2 border-b border-slate-800 pb-2 mb-2">
                            <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                            <span className="text-slate-500 uppercase font-bold tracking-wider text-[9px]">订单详情控制台</span>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
                            <div className="flex justify-between">
                              <span className="text-slate-500">订单编号:</span>
                              <span className="text-slate-300">{order.orderNid || '-'}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-500">资源ID:</span>
                              <span className="text-slate-300">{order.resourceId || '-'}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-500">状态码:</span>
                              <span className={statusInfo.color}>{order.statusCode} ({statusInfo.label})</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-500">费用:</span>
                              <span className="text-slate-300">¥{order.price || '0'}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-500">提交时间:</span>
                              <span className="text-slate-300">{order.submittedAt ? formatBeijingTime(order.submittedAt) : '-'}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-500">发布时间:</span>
                              <span className="text-emerald-400">{order.publishedAt ? formatBeijingTime(order.publishedAt) : '-'}</span>
                            </div>
                          </div>
                          {order.orderUrl && (
                            <div className="pt-2 border-t border-slate-800 mt-2">
                              <a
                                href={order.orderUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center space-x-1.5 text-blue-400 hover:text-blue-300 transition-colors"
                              >
                                <ExternalLink className="w-3 h-3" />
                                <span className="truncate">{order.orderUrl}</span>
                              </a>
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
