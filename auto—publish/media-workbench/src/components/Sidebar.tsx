import React, { useState } from "react";
import type { ViewMode } from "../types/view";
import {
  BookOpen,
  ClipboardList,
  Feather,
  FolderOpen,
  PenLine,
  RefreshCw,
  Send,
  Settings,
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
      className="flex h-screen w-60 shrink-0 select-none flex-col border-r text-slate-300"
      style={{
        background: "var(--app-sidebar)",
        borderColor: "var(--app-sidebar-border)",
      }}
    >
      <div
        className="app-sidebar-header flex items-center gap-3 border-b px-5 py-5"
        style={{ borderColor: "var(--app-sidebar-border)" }}
        data-sidebar-section="header"
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-lg shadow-blue-950/30">
          <Feather className="h-5 w-5" strokeWidth={2.1} />
        </div>
        <div className="sidebar-label min-w-0">
          <h1 className="truncate text-[15px] font-bold tracking-tight text-white">
            AutoPublish
          </h1>
          <span className="mt-0.5 block truncate text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-500">
            GEO Content Workbench
          </span>
        </div>
      </div>

      <nav
        className="app-sidebar-navigation flex-1 space-y-1 overflow-y-auto px-3 py-4"
        data-sidebar-section="navigation"
      >
        <div className="app-sidebar-navigation-label sidebar-label mb-2 px-2.5 text-[9px] font-bold uppercase tracking-[0.16em] text-slate-600">
          工作台
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
              className={`app-sidebar-navigation-item group relative flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors duration-150 ${
                isActive
                  ? "border-blue-400/15 bg-blue-500/12 text-white"
                  : "border-transparent text-slate-400 hover:bg-white/[0.045] hover:text-slate-200"
              }`}
            >
              <div className="app-sidebar-navigation-item-content flex min-w-0 items-center gap-3">
                <Icon
                  className={`h-[17px] w-[17px] shrink-0 ${
                    isActive
                      ? "text-blue-400"
                      : "text-slate-500 group-hover:text-slate-300"
                  }`}
                  strokeWidth={1.9}
                />
                <span className="sidebar-label truncate">{item.label}</span>
              </div>
              {badge !== undefined && badge > 0 && (
                <span
                  className={`sidebar-badge min-w-5 rounded-full px-1.5 py-0.5 text-center text-[10px] font-bold ${
                    isActive
                      ? "bg-blue-500/20 text-blue-200"
                      : "bg-slate-800 text-slate-400"
                  }`}
                  title={item.badgeTitle}
                >
                  {badge}
                </span>
              )}
              {isActive && (
                <motion.div
                  layoutId="active-nav-indicator"
                  className="absolute bottom-2 left-0 top-2 w-0.5 rounded-r bg-blue-400"
                  transition={{ duration: 0.16 }}
                />
              )}
            </button>
          );
        })}
      </nav>

      <div
        className="app-sidebar-footer border-t p-3"
        style={{ borderColor: "var(--app-sidebar-border)" }}
        data-sidebar-section="footer"
      >
        <div
          onClick={() => setShowWalletDetails((current) => !current)}
          className="app-sidebar-wallet group cursor-pointer rounded-xl border border-white/[0.06] bg-white/[0.035] p-3 transition-colors hover:bg-white/[0.055]"
        >
          <div className="mb-1 flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2 text-[11px] text-slate-400">
              <Wallet className="h-3.5 w-3.5 shrink-0 text-blue-400" />
              <span className="sidebar-label truncate font-medium">媒体余额</span>
            </div>
            <button
              id="checkBalanceBtn"
              onClick={(event) => {
                event.stopPropagation();
                onCheckBalance();
              }}
              disabled={isCheckingBalance}
              className="rounded-md p-1 text-slate-500 transition-colors hover:bg-white/[0.06] hover:text-blue-300 disabled:opacity-50"
              title="刷新余额"
              aria-label="刷新余额"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${
                  isCheckingBalance ? "animate-spin text-blue-400" : ""
                }`}
              />
            </button>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-[10px] font-semibold text-slate-500">¥</span>
            <span className="font-mono text-base font-bold tracking-tight text-slate-100">
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
              className="sidebar-label mt-2.5 border-t border-white/[0.06] pt-2 text-[10px] leading-4 text-slate-500"
            >
              余额来自媒体资源 read model；媒体费用确认后才会形成订单。
            </motion.div>
          )}
        </div>
        <div className="sidebar-label mt-3 px-1 text-[9px] font-medium uppercase tracking-[0.13em] text-slate-700">
          ETO—001 · Desktop
        </div>
      </div>
    </aside>
  );
}
