import React, { useState } from 'react';
import { Order, OrderStatus } from '../types';
import { 
  ClipboardList, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  Clock, 
  Terminal, 
  Search,
  ArrowRight,
  Eye,
  Trash2,
  Calendar
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface OrdersViewProps {
  orders: Order[];
  onClearOrders: () => void;
}

export default function OrdersView({
  orders,
  onClearOrders
}: OrdersViewProps) {
  const [activeTab, setActiveTab] = useState<OrderStatus | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedOrderIdForLogs, setSelectedOrderIdForLogs] = useState<string | null>(null);

  // Filter orders based on tabs & search
  const filteredOrders = orders.filter(order => {
    const matchesTab = activeTab === 'all' || order.status === activeTab;
    const matchesSearch = order.id.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          order.articleTitle.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          order.filename.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesTab && matchesSearch;
  });

  const getStatusBadge = (status: OrderStatus) => {
    switch (status) {
      case 'success':
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-full text-xs font-semibold">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>发布成功</span>
          </span>
        );
      case 'partial':
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-1 bg-amber-50 text-amber-700 border border-amber-100 rounded-full text-xs font-semibold">
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>局部异常</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-1 bg-rose-50 text-rose-700 border border-rose-100 rounded-full text-xs font-semibold">
            <XCircle className="w-3.5 h-3.5" />
            <span>发布失败</span>
          </span>
        );
    }
  };

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
      <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Status filtering */}
        <div className="flex items-center space-x-2">
          {(['all', 'success', 'partial', 'failed'] as const).map((tab) => {
            let label = '全部记录';
            if (tab === 'success') label = '成功完成';
            if (tab === 'partial') label = '部分异常';
            if (tab === 'failed') label = '完全失败';

            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                  activeTab === tab
                    ? 'bg-blue-600 border-blue-600 text-white shadow-2xs'
                    : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-600'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>

        {/* Search input */}
        <div className="relative flex items-center w-full md:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3" />
          <input
            type="text"
            placeholder="搜索文章标题、订单编号..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-slate-50 focus:bg-white text-xs text-slate-700 placeholder-slate-400 border border-slate-200 rounded-lg outline-hidden focus:border-blue-500 transition-all"
          />
        </div>
      </div>

      {/* Orders list view */}
      <div className="space-y-4">
        {filteredOrders.length === 0 ? (
          <div className="bg-white border border-slate-200/60 rounded-2xl py-16 px-4 text-center flex flex-col items-center justify-center shadow-2xs">
            <ClipboardList className="w-12 h-12 text-slate-300 mb-3 animate-pulse" />
            <p className="text-sm font-bold text-slate-700">暂无符合条件的投稿记录</p>
            <p className="text-xs text-slate-400 mt-1 max-w-xs leading-relaxed">
              尚未启动投稿。请在主工作台选择要发布的稿件并点击顶部的【预检并提交】。
            </p>
          </div>
        ) : (
          filteredOrders.map((order) => {
            const isLogsOpen = selectedOrderIdForLogs === order.id;

            return (
              <div
                key={order.id}
                className="bg-white border border-slate-200/80 rounded-2xl shadow-2xs overflow-hidden transition-all hover:border-slate-300"
              >
                {/* Header overview row */}
                <div className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50/30">
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-bold text-slate-500">
                        {order.id}
                      </span>
                      <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded font-mono font-bold flex items-center">
                        <Clock className="w-3 h-3 mr-1" />
                        {order.createdAt}
                      </span>
                      {getStatusBadge(order.status)}
                    </div>
                    
                    <h3 className="text-xs font-bold text-slate-800 truncate">
                      {order.articleTitle}
                    </h3>
                  </div>

                  {/* Pricing and platform counts details */}
                  <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-slate-500 md:text-right">
                    <div>
                      <span className="text-[10px] text-slate-400 block">清算费用</span>
                      <span className="font-bold text-slate-800 font-mono text-sm">¥{order.totalFee.toFixed(2)}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block">伴生媒体</span>
                      <span className="font-bold text-slate-800">{order.mediaCount} 个</span>
                    </div>
                    <button
                      onClick={() => setSelectedOrderIdForLogs(isLogsOpen ? null : order.id)}
                      className="flex items-center space-x-1 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg border border-slate-200/60 transition-all self-start md:self-center"
                    >
                      <Terminal className="w-3.5 h-3.5" />
                      <span>{isLogsOpen ? '收起控制台' : '云网关日志'}</span>
                    </button>
                  </div>
                </div>

                {/* Body: list of platforms and status */}
                <div className="p-5 border-t border-slate-100">
                  <div className="flex flex-wrap gap-2.5">
                    {order.platforms.map((platform) => (
                      <div
                        key={platform.name}
                        className={`inline-flex items-center space-x-2 px-3 py-1.5 rounded-xl border text-xs font-medium ${
                          platform.status === 'success'
                            ? 'bg-emerald-50/50 border-emerald-100 text-emerald-800'
                            : platform.status === 'pending'
                            ? 'bg-amber-50/50 border-amber-100 text-amber-800'
                            : 'bg-rose-50/50 border-rose-100 text-rose-800'
                        }`}
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-current"></span>
                        <span className="font-semibold">{platform.name}</span>
                        {platform.status === 'success' ? (
                          <span className="text-[10px] font-bold text-emerald-600 bg-emerald-100/50 px-1 py-0.2 rounded">发布完毕</span>
                        ) : platform.status === 'pending' ? (
                          <span className="text-[10px] font-bold text-amber-600 bg-amber-100/50 px-1 py-0.2 rounded">处理中</span>
                        ) : (
                          <span className="text-[10px] font-bold text-rose-600 bg-rose-100/50 px-1 py-0.2 rounded" title={platform.error}>发布失败</span>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Expandable cloud gateway logs console */}
                  <AnimatePresence>
                    {isLogsOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden mt-4 pt-4 border-t border-slate-100"
                      >
                        <div className="bg-slate-950 rounded-xl p-4 border border-slate-800 font-mono text-[10.5px] leading-relaxed text-slate-300 space-y-1 overflow-y-auto max-h-[200px] select-text">
                          <div className="flex items-center space-x-2 border-b border-slate-800 pb-2 mb-2">
                            <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping"></span>
                            <span className="text-slate-500 uppercase font-bold tracking-wider text-[9px]">API 通讯详情控制台</span>
                          </div>
                          {order.logs.map((log, index) => (
                            <div key={index}>
                              {log.includes('成功') || log.includes('正常') ? (
                                <span className="text-emerald-400">{log}</span>
                              ) : log.includes('退回') || log.includes('失败') || log.includes('异常') ? (
                                <span className="text-rose-400">{log}</span>
                              ) : (
                                <span>{log}</span>
                              )}
                            </div>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
