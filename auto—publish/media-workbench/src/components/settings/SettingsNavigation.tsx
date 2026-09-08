import React from "react";
import {
  Bot,
  Boxes,
  Database,
  FolderCog,
  Gauge,
  LayoutDashboard,
  Radio,
  UsersRound,
} from "lucide-react";

export type SettingsSection =
  | "overview"
  | "ai"
  | "media"
  | "hepan"
  | "platformAccounts"
  | "workspace"
  | "runtime"
  | "storage";

const ITEMS: Array<{
  id: SettingsSection;
  label: string;
  group?: string;
  icon: typeof LayoutDashboard;
}> = [
  { id: "overview", label: "概览", icon: LayoutDashboard },
  { id: "ai", label: "AI 生成", group: "服务配置", icon: Bot },
  { id: "media", label: "付费媒体", group: "服务配置", icon: Boxes },
  { id: "hepan", label: "蓝色河畔", group: "服务配置", icon: Radio },
  {
    id: "platformAccounts",
    label: "平台账号",
    group: "服务配置",
    icon: UsersRound,
  },
  { id: "workspace", label: "工作区", group: "系统", icon: FolderCog },
  { id: "runtime", label: "运行环境", group: "系统", icon: Gauge },
  { id: "storage", label: "存储与清理", group: "系统", icon: Database },
];

export default function SettingsNavigation({
  active,
  onChange,
}: {
  active: SettingsSection;
  onChange: (section: SettingsSection) => void;
}) {
  let lastGroup = "";
  return (
    <nav
      aria-label="设置分区"
      className="min-w-0 rounded-xl border border-slate-200 bg-white p-2 shadow-[0_1px_2px_rgba(15,23,42,0.03)] lg:sticky lg:top-0 lg:self-start"
    >
      {ITEMS.map((item) => {
        const Icon = item.icon;
        const showGroup = item.group && item.group !== lastGroup;
        if (item.group) lastGroup = item.group;
        const selected = active === item.id;
        return (
          <React.Fragment key={item.id}>
            {showGroup && (
              <div className="px-2.5 pb-1 pt-3 text-[9px] font-bold uppercase tracking-[0.13em] text-slate-400">
                {item.group}
              </div>
            )}
            <button
              type="button"
              aria-current={selected ? "page" : undefined}
              onClick={() => onChange(item.id)}
              className={`group flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs font-semibold transition-colors ${
                selected
                  ? "bg-blue-50 text-blue-700"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-800"
              }`}
            >
              <Icon
                className={`h-3.5 w-3.5 shrink-0 ${
                  selected
                    ? "text-blue-600"
                    : "text-slate-400 group-hover:text-slate-600"
                }`}
              />
              <span className="truncate">{item.label}</span>
            </button>
          </React.Fragment>
        );
      })}
    </nav>
  );
}
