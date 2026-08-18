import React, { useState } from "react";
import type { ViewMode } from "../types/view";
import {
  BookOpen,
  ClipboardList,
  FolderOpen,
  PenLine,
  RefreshCw,
  Send,
  Settings,
  Sparkles,
  Wallet,
} from "lucide-react";
import { motion } from "motion/react";

export interface NavigationBadges {
  articleLibrary: number;
  submissionCenter: number;
  orders: number;
}

interface SidebarNavigationItem {
  id: ViewMode;
  label: string;
  icon: typeof PenLine;
  badgeKey?: keyof NavigationBadges;
  badgeTitle?: string;
}

const NAVIGATION_ITEMS: readonly SidebarNavigationItem[] = [
  { id: "content-production", label: "内容生产", icon: PenLine },
  {
    id: "article-library",
    label: "文章库",
    icon: BookOpen,
    badgeKey: "articleLibrary",
    badgeTitle: "当前客户待投稿文章数",
  },
  {
    id: "submission-center",
    label: "投稿中心",
    icon: Send,
    badgeKey: "submissionCenter",
    badgeTitle: "待执行投稿与需处理事项",
  },
  {
    id: "orders",
    label: "订单",
    icon: ClipboardList,
    badgeKey: "orders",
    badgeTitle: "真实订单数",
  },
  { id: "resources", label: "媒体资源", icon: FolderOpen },
  { id: "settings", label: "设置", icon: Settings },
];

interface SidebarProps {
  currentView: ViewMode;
  onViewChange: (view: ViewMode) => void;
  balance: number;
  onCheckBalance: () => void;
  isCheckingBalance: boolean;
  badges: NavigationBadges;
}

export default function Sidebar({
  currentView,
  onViewChange,
  balance,
  onCheckBalance,
  isCheckingBalance,
  badges,
}: SidebarProps) {
  const [showWalletDetails, setShowWalletDetails] = useState(false);

  return (
    <aside
      id="app-sidebar"
      className="w-64 shrink-0 bg-slate-900 border-r border-slate-800 flex flex-col h-screen text-slate-300 select-none"
    >
      <div
        className="app-sidebar-header p-6 border-b border-slate-800 flex items-center space-x-3"
        data-sidebar-section="header"
      >
        <div className="w-9 h-9 shrink-0 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center text-white shadow-lg shadow-blue-500/30">
          <Sparkles className="w-5 h-5" />
        </div>
        <div className="sidebar-label min-w-0">
          <h1 className="font-bold text-slate-100 text-lg leading-tight">ETO—001</h1>
          <span className="text-[10px] text-slate-400 font-semibold uppercase">Auto Publish</span>
        </div>
      </div>

      <nav
        className="app-sidebar-navigation flex-1 p-4 space-y-1.5 overflow-y-auto"
        data-sidebar-section="navigation"
      >
        <div className="app-sidebar-navigation-label sidebar-label px-3 mb-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
          主导航
        </div>
        {NAVIGATION_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = currentView === item.id;
          const badge = item.badgeKey ? badges[item.badgeKey] : undefined;
          return (
            <button
              key={item.id}
              id={`nav-item-${item.id}`}
              data-sidebar-navigation-item="true"
              data-view-mode={item.id}
              onClick={() => onViewChange(item.id)}
              aria-label={item.label}
              aria-current={isActive ? "page" : undefined}
              className={`app-sidebar-navigation-item w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 relative group ${
                isActive
                  ? "bg-blue-600/10 text-blue-400 border border-blue-500/20 font-semibold"
                  : "hover:bg-slate-800/60 text-slate-400 hover:text-slate-200 border border-transparent"
              }`}
            >
              <div className="app-sidebar-navigation-item-content flex min-w-0 items-center space-x-3">
                <Icon
                  className={`w-4.5 h-4.5 shrink-0 transition-transform duration-200 group-hover:scale-110 ${
                    isActive ? "text-blue-400" : "text-slate-400"
                  }`}
                />
                <span className="sidebar-label truncate">{item.label}</span>
              </div>
              {badge !== undefined && badge > 0 && (
                <span
                  className={`sidebar-badge text-xs px-2 py-0.5 rounded-full font-semibold transition-all ${
                    isActive
                      ? "bg-blue-500/20 text-blue-300"
                      : "bg-slate-800 text-slate-500 group-hover:bg-slate-700/80 group-hover:text-slate-300"
                  }`}
                  title={item.badgeTitle}
                >
                  {badge}
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
      </nav>

      <div
        className="app-sidebar-footer p-4 border-t border-slate-800 bg-slate-950/50"
        data-sidebar-section="footer"
      >
        <div
          onClick={() => setShowWalletDetails((current) => !current)}
          className="app-sidebar-wallet p-3.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center space-x-2 text-xs text-slate-400 group-hover:text-slate-200">
              <Wallet className="w-4 h-4 text-indigo-400" />
              <span className="sidebar-label font-medium">媒体余额</span>
            </div>
            <button
              id="checkBalanceBtn"
              onClick={(event) => {
                event.stopPropagation();
                onCheckBalance();
              }}
              disabled={isCheckingBalance}
              className="p-1 rounded-md text-slate-500 hover:text-blue-400 hover:bg-slate-800 disabled:opacity-50 transition-colors"
              title="刷新余额"
              aria-label="刷新余额"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isCheckingBalance ? "animate-spin text-blue-400" : ""}`} />
            </button>
          </div>
          <div className="flex items-baseline space-x-1">
            <span className="text-xs text-slate-500 font-semibold">¥</span>
            <span className="text-lg font-bold text-slate-100 tracking-tight font-mono">
              {isCheckingBalance
                ? "..."
                : balance.toLocaleString("zh-CN", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
            </span>
          </div>
          {showWalletDetails && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              className="sidebar-label mt-2.5 pt-2 border-t border-slate-800 text-[11px] text-slate-400"
            >
              余额来自媒体资源 read model；媒体费用确认后才会形成订单。
            </motion.div>
          )}
        </div>
        <div className="sidebar-label mt-3 text-center text-[10px] text-slate-600 font-medium">ETO—001</div>
      </div>
    </aside>
  );
}
