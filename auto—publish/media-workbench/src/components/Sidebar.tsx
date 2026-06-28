import React, { useState } from 'react';
import { ViewMode } from '../types';
import { 
  Files, 
  FolderOpen, 
  ClipboardList, 
  Settings, 
  Wallet, 
  RefreshCw, 
  Sparkles, 
  Activity,
  CheckCircle,
  TrendingUp
} from 'lucide-react';
import { motion } from 'motion/react';

interface SidebarProps {
  currentView: ViewMode;
  onViewChange: (view: ViewMode) => void;
  balance: number;
  onCheckBalance: () => void;
  isCheckingBalance: boolean;
  totalArticles: number;
  totalResources: number;
  totalOrders: number;
}

export default function Sidebar({
  currentView,
  onViewChange,
  balance,
  onCheckBalance,
  isCheckingBalance,
  totalArticles,
  totalResources,
  totalOrders
}: SidebarProps) {
  const [showWalletDetails, setShowWalletDetails] = useState(false);

  const menuItems = [
    { id: 'workbench' as ViewMode, label: '稿件与工作台', icon: Files, badge: totalArticles },
    { id: 'resources' as ViewMode, label: '媒体资源库', icon: FolderOpen, badge: totalResources },
    { id: 'orders' as ViewMode, label: '投稿订单记录', icon: ClipboardList, badge: totalOrders },
    { id: 'settings' as ViewMode, label: '配置中心', icon: Settings },
  ];

  return (
    <aside id="app-sidebar" className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col h-screen text-slate-300 select-none">
      {/* Brand Header */}
      <div className="p-6 border-b border-slate-800 flex items-center space-x-3">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center text-white shadow-lg shadow-blue-500/30">
          <Sparkles className="w-5 h-5" />
        </div>
        <div>
          <h1 className="font-bold text-slate-100 text-base leading-tight tracking-tight">Auto Publish</h1>
          <span className="text-[10px] text-slate-400 tracking-wider font-semibold uppercase">智能媒体分发台</span>
        </div>
      </div>

      {/* Navigation List */}
      <nav className="flex-1 p-4 space-y-1.5 overflow-y-auto">
        <div className="px-3 mb-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest">主导航</div>
        
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentView === item.id;

          return (
            <button
              key={item.id}
              id={`nav-item-${item.id}`}
              onClick={() => onViewChange(item.id)}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 relative group ${
                isActive 
                  ? 'bg-blue-600/10 text-blue-400 border border-blue-500/20 font-semibold' 
                  : 'hover:bg-slate-800/60 text-slate-400 hover:text-slate-200 border border-transparent'
              }`}
            >
              <div className="flex items-center space-x-3">
                <Icon className={`w-4.5 h-4.5 transition-transform duration-200 group-hover:scale-110 ${isActive ? 'text-blue-400' : 'text-slate-400'}`} />
                <span>{item.label}</span>
              </div>
              {item.badge !== undefined && (
                <span className={`text-xs px-2 py-0.5 rounded-full font-semibold transition-all ${
                  isActive 
                    ? 'bg-blue-500/20 text-blue-300' 
                    : 'bg-slate-800 text-slate-500 group-hover:bg-slate-700/80 group-hover:text-slate-300'
                }`}>
                  {item.badge}
                </span>
              )}
              {isActive && (
                <motion.div 
                  layoutId="active-nav-indicator"
                  className="absolute left-0 top-1/4 bottom-1/4 w-1 bg-blue-500 rounded-r"
                />
              )}
            </button>
          );
        })}

        {/* Dynamic Status Dashboard */}
        <div className="pt-6">
          <div className="px-3 mb-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest">服务运行监控</div>
          <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500 flex items-center"><Activity className="w-3.5 h-3.5 mr-1.5 text-emerald-500" /> API服务通道</span>
              <span className="text-emerald-400 font-semibold flex items-center">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse mr-1.5"></span>
                正常连接
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500 flex items-center"><CheckCircle className="w-3.5 h-3.5 mr-1.5 text-indigo-500" /> 本地热文件夹</span>
              <span className="text-slate-300 font-mono">input/media</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500 flex items-center"><TrendingUp className="w-3.5 h-3.5 mr-1.5 text-blue-500" /> 分发成功率</span>
              <span className="text-slate-200 font-bold">98.4%</span>
            </div>
          </div>
        </div>
      </nav>

      {/* Account Balance Widget */}
      <div className="p-4 border-t border-slate-800 bg-slate-950/50">
        <div 
          onClick={() => setShowWalletDetails(!showWalletDetails)}
          className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center space-x-2 text-xs text-slate-400 group-hover:text-slate-200">
              <Wallet className="w-4 h-4 text-indigo-400" />
              <span className="font-medium">我的资金账户</span>
            </div>
            <button 
              id="checkBalanceBtn"
              onClick={(e) => {
                e.stopPropagation();
                onCheckBalance();
              }}
              disabled={isCheckingBalance}
              className="p-1 rounded-md text-slate-500 hover:text-blue-400 hover:bg-slate-800 disabled:opacity-50 transition-colors"
              title="刷新余额"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isCheckingBalance ? 'animate-spin text-blue-400' : ''}`} />
            </button>
          </div>
          
          <div className="flex items-baseline space-x-1">
            <span className="text-xs text-slate-500 font-semibold">¥</span>
            <span className="text-lg font-bold text-slate-100 tracking-tight font-mono">
              {isCheckingBalance ? '...' : balance.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>

          {showWalletDetails && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="mt-2.5 pt-2 border-t border-slate-800 space-y-1.5 text-[11px] text-slate-400"
            >
              <div className="flex justify-between">
                <span>预估赠送余额</span>
                <span className="font-mono">¥200.00</span>
              </div>
              <div className="flex justify-between">
                <span>可用授信额度</span>
                <span className="font-mono text-indigo-400 font-semibold">无上限</span>
              </div>
              <p className="text-[10px] text-slate-500 mt-1 leading-normal">
                充值与发票请联系财务，或在配置中心绑定支付通道。
              </p>
            </motion.div>
          )}
        </div>
        
        {/* Soft watermark */}
        <div className="mt-3 text-center text-[10px] text-slate-600 font-medium">
          Auto Publish Desktop Console
        </div>
      </div>
    </aside>
  );
}
