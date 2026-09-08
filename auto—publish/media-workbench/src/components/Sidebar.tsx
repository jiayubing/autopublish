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
    badgeTitle: "当前客户待完善文章数",
  },
  {
    id: "submission-center",
    label: "投稿中心",
    icon: Send,
    badgeKey: "submissionCenter",
    badgeTitle: "需人工处理的投稿事项",
  },
  {
    id: "orders",
    label: "订单",
    icon: ClipboardList,
    badgeKey: "orders",
    badgeTitle: "异常或需人工核对的订单",
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
      className="w-[236px] shrink-0 border-r border-slate-800/80 bg-[linear-gradient(180deg,#172235_0%,#111827_55%,#0d1524_100%)] text-slate-300 shadow-[8px_0_30px_rgba(15,23,42,0.08)] flex h-screen flex-col select-none"
    >
      <div
        className="app-sidebar-header flex items-center gap-3 border-b border-white/6 px-5 py-5"
        data-sidebar-section="header"
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-500 text-white shadow-lg shadow-blue-500/20 ring-1 ring-white/10">
          <Sparkles className="h-5 w-5" />
        </div>
        <div className="sidebar-label min-w-0">
          <h1 className="truncate text-[17px] font-bold tracking-tight text-white">
            AutoPublish
          </h1>
          <span className="mt-0.5 block text-[10px] font-medium tracking-wide text-slate-400">
            GEO 内容工作台
          </span>
        </div>
      </div>

      <nav
        className="app-sidebar-navigation flex-1 space-y-1 overflow-y-auto px-3 py-4"
        data-sidebar-section="navigation"
      >
        <div className="app-sidebar-navigation-label sidebar-label mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
          工作区
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
              className={`app-sidebar-navigation-item group relative flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-sm font-medium transition-all duration-150 ${
                isActive
                  ? "border-blue-400/20 bg-blue-500/14 text-white shadow-[0_8px_20px_rgba(37,99,235,0.08)]"
                  : "border-transparent text-slate-400 hover:bg-white/5 hover:text-slate-100"
              }`}
            >
              <div className="app-sidebar-navigation-item-content flex min-w-0 items-center gap-3">
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors ${
                    isActive
                      ? "bg-blue-500/16 text-blue-300"
                      : "bg-white/[0.03] text-slate-400 group-hover:bg-white/[0.06] group-hover:text-slate-200"
                  }`}
                >
                  <Icon className="h-[17px] w-[17px]" />
                </span>
                <span className="sidebar-label truncate">{item.label}</span>
              </div>
              {badge !== undefined && badge > 0 && (
                <span
                  className={`sidebar-badge min-w-6 rounded-full px-1.5 py-0.5 text-center text-[10px] font-bold ${
                    isActive
                      ? "bg-blue-400/20 text-blue-200"
                      : "bg-slate-700/70 text-slate-300"
                  }`}
                  title={item.badgeTitle}
                >
                  {badge}
                </span>
              )}
              {isActive && (
                <motion.div
                  layoutId="active-nav-indicator"
                  className="absolute bottom-2 left-0 top-2 w-[3px] rounded-r-full bg-blue-400"
                />
              )}
            </button>
          );
        })}
      </nav>

      <div
        className="app-sidebar-footer border-t border-white/6 p-3"
        data-sidebar-section="footer"
      >
        <div
          onClick={() => setShowWalletDetails((current) => !current)}
          className="app-sidebar-wallet cursor-pointer rounded-xl border border-white/[0.07] bg-white/[0.035] p-3 transition-colors hover:bg-white/[0.055]"
        >
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-400/10 text-indigo-300">
                <Wallet className="h-3.5 w-3.5" />
              </span>
              <span className="sidebar-label font-medium">媒体余额</span>
            </div>
            <button
              id="checkBalanceBtn"
              onClick={(event) => {
                event.stopPropagation();
                onCheckBalance();
              }}
              disabled={isCheckingBalance}
              className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-white/5 hover:text-blue-300 disabled:opacity-50"
              title="刷新余额"
              aria-label="刷新余额"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${
                  isCheckingBalance ? "animate-spin text-blue-300" : ""
                }`}
              />
            </button>
          </div>
          <div className="flex items-baseline gap-1 px-1">
            <span className="text-[11px] font-semibold text-slate-500">¥</span>
            <span className="font-mono text-lg font-bold tracking-tight text-white">
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
              className="sidebar-label mt-2.5 border-t border-white/[0.06] pt-2.5 text-[11px] leading-5 text-slate-400"
            >
              余额来自媒体资源 read model；媒体费用确认后才会形成订单。
            </motion.div>
          )}
        </div>
        <div className="sidebar-label mt-3 px-1 text-[10px] text-slate-600">
          AutoPublish · Local Workspace
        </div>
      </div>
    </aside>
  );
}
