import React, { useEffect, useState } from "react";
import {
  Database,
  ExternalLink,
  FolderOpen,
  Info,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import type { RuntimeCapability, RuntimeDiagnostics } from "../types/workspace";
import { getSettingsCommandState } from "../workspace-ui-logic.js";
import { mapRuntimeCapabilityState } from "../runtime-capability-state.cjs";
import AiProviderSettings from "./AiProviderSettings";
import WorkspaceSelectionPanel from "./WorkspaceSelectionPanel";
import SettingsNavigation, {
  SettingsSection,
} from "./settings/SettingsNavigation";
import SettingsOverview from "./settings/SettingsOverview";
import MediaProviderSettings from "./settings/MediaProviderSettings";
import HepanProviderSettings from "./settings/HepanProviderSettings";
import PlatformAccountSettings from "./settings/PlatformAccountSettings";
import { useWorkspaceFeature } from "../features/workspace/workspace-feature-context";
import { useSettingsFeature } from "../features/settings/settings-context";
import { Button, PageHeader, StatusBadge, Surface } from "./ui/primitives";

type StorageUsageCategory = {
  bytes: number;
  files: number;
  followedSymlinks?: number;
  skippedSymlinks?: number;
};
type StorageUsage = {
  logs: StorageUsageCategory;
  temporary: StorageUsageCategory;
  docxCache: StorageUsageCategory;
  profiles: StorageUsageCategory;
  active?: boolean;
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function stateLabel(state?: string): string {
  if (state === "ready") return "可用";
  if (state === "confirmation_required") return "等待确认";
  if (state === "relaunching") return "正在重启";
  if (state === "invalid") return "需要重新选择";
  return "尚未配置";
}

function capabilityTone(
  capability: RuntimeCapability,
): "neutral" | "info" | "success" | "warning" | "danger" {
  const tone = mapRuntimeCapabilityState(capability).tone;
  return tone === "ready"
    ? "success"
    : tone === "unavailable"
      ? "danger"
      : tone === "optional"
        ? "neutral"
        : "warning";
}

function WorkspaceSettings() {
  const { feature, snapshot } = useWorkspaceFeature();
  const current = snapshot.current.data;
  const loading = snapshot.current.query.loading;
  const [switchOpen, setSwitchOpen] = useState(false);
  const environmentManaged = current?.environmentManaged === true;
  const switchState = snapshot.selection.data || current;
  const commandState = getSettingsCommandState({
    loading: loading || snapshot.commands.openCurrent.busy,
    switchBusy:
      snapshot.commands.requestSwitch.busy ||
      snapshot.commands.confirmSelection.busy ||
      snapshot.commands.cancelSelection.busy,
    current,
    switchState,
  });
  const operationError =
    snapshot.current.query.error?.userMessage ||
    snapshot.commands.openCurrent.error?.userMessage ||
    snapshot.commands.requestSwitch.error?.userMessage;

  return (
    <div className="grid gap-3">
      <Surface className="p-4 sm:p-5">
        <div
          className="break-all rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 font-mono text-[11px] leading-5 text-slate-700"
          aria-label="当前工作区状态"
        >
          {loading ? "读取中…" : current?.label || "工作区未选择"}
        </div>

        <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-bold text-slate-800">
              <FolderOpen className="h-4 w-4 text-blue-500" />
              工作区
            </h3>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              业务数据、客户资料与本地运行文件都以当前工作区为边界。
            </p>
          </div>
          <StatusBadge
            tone={
              loading
                ? "neutral"
                : current?.state === "ready"
                  ? "success"
                  : current?.state === "invalid"
                    ? "danger"
                    : "warning"
            }
          >
            {loading ? "检查中…" : stateLabel(current?.state)}
          </StatusBadge>
        </div>

        {environmentManaged && (
          <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
            当前工作区由环境变量 AUTO_PUBLISH_WORKSPACE 控制，不能在此更换。
          </p>
        )}
        {operationError && (
          <p
            role="alert"
            className="mt-3 rounded-lg border border-rose-100 bg-rose-50 p-3 text-xs text-rose-700"
          >
            {operationError}
          </p>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            onClick={() => void feature.openCurrent()}
            disabled={commandState.openDisabled}
          >
            <ExternalLink className="h-3.5 w-3.5" />
            打开文件夹
          </Button>
          <Button
            variant="primary"
            onClick={() => setSwitchOpen(true)}
            disabled={commandState.switchDisabled}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            更换工作区
          </Button>
        </div>
      </Surface>

      {switchOpen && !environmentManaged && (
        <WorkspaceSelectionPanel
          mode="switch"
          title="更换工作区"
          description="主进程会先校验新目录，再重启应用。"
        />
      )}

      <section
        data-safety-note="Workspace switching does not copy, move, or delete the original data"
        className="flex gap-2 rounded-xl border border-blue-100 bg-blue-50/70 p-3 text-[11px] leading-5 text-blue-800"
      >
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        工作区切换不会复制、移动或删除原有业务数据。
      </section>
    </div>
  );
}

function RuntimeSettings() {
  const { feature, snapshot } = useSettingsFeature();
  const diagnostics = snapshot.runtime.data as RuntimeDiagnostics | null;
  const loading = snapshot.runtime.query.loading;
  const checking = snapshot.commands.runBrowserSelfCheck.busy;
  const error =
    snapshot.runtime.query.error?.userMessage ||
    snapshot.commands.runBrowserSelfCheck.error?.userMessage;
  const items: Array<[string, RuntimeCapability]> = diagnostics
    ? [
        ["Playwright Node", diagnostics.capabilities.playwrightNode],
        ["Playwright CLI", diagnostics.capabilities.playwrightCli],
        ["浏览器通道", diagnostics.capabilities.browserChannel],
        ["DOCX 解析", diagnostics.capabilities.docx],
        ["河畔 Python", diagnostics.capabilities.hepan],
      ]
    : [];

  return (
    <Surface className="grid gap-4 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-bold text-slate-800">
            <ShieldCheck className="h-4 w-4 text-blue-500" />
            运行环境
          </h3>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            运行时诊断只返回能力状态，不包含密钥或 Cookie。
          </p>
        </div>
        <Button
          onClick={() => void feature.runBrowserSelfCheck()}
          disabled={loading || checking}
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${checking ? "animate-spin" : ""}`}
          />
          {checking ? "检查中…" : "运行浏览器自检"}
        </Button>
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-lg border border-rose-100 bg-rose-50 p-3 text-xs text-rose-700"
        >
          {error}
        </p>
      )}

      <div className="grid gap-2 sm:grid-cols-2">
        {items.map(([label, item]) => {
          const state = mapRuntimeCapabilityState(item);
          return (
            <div
              key={label}
              className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 bg-slate-50/70 px-3 py-2.5"
            >
              <span className="text-xs font-medium text-slate-700">{label}</span>
              <StatusBadge tone={capabilityTone(item)}>{state.label}</StatusBadge>
            </div>
          );
        })}
      </div>

      {diagnostics?.buildInfo && (
        <p className="font-mono text-[10px] text-slate-400">
          版本 {diagnostics.buildInfo.version} · commit {diagnostics.buildInfo.commit} ·{" "}
          {diagnostics.buildInfo.dirty ? "dirty" : "clean"}
        </p>
      )}
      {diagnostics?.diagnosticSink && (
        <p role="status" className="text-[11px] text-slate-500">
          诊断记录：
          {diagnostics.diagnosticSink.status === "ready" ? "正常" : "部分不可用"}
          {diagnostics.diagnosticSink.fileFailureCount > 0 ||
          diagnostics.diagnosticSink.memoryFailureCount > 0
            ? ` · 已记录 ${diagnostics.diagnosticSink.fileFailureCount + diagnostics.diagnosticSink.memoryFailureCount} 次写入失败`
            : ""}
        </p>
      )}
    </Surface>
  );
}

function StorageSettings() {
  const { feature, snapshot } = useSettingsFeature();
  const usage = snapshot.storage.data as StorageUsage | null;
  const loading = snapshot.storage.query.loading;
  const cleaning = snapshot.commands.cleanStorageCaches.busy;
  const error =
    snapshot.storage.query.error?.userMessage ||
    snapshot.commands.cleanStorageCaches.error?.userMessage;
  const categories = [
    ["日志", usage?.logs.bytes || 0],
    ["临时文件", usage?.temporary.bytes || 0],
    ["DOCX 缓存", usage?.docxCache.bytes || 0],
    ["浏览器配置", usage?.profiles.bytes || 0],
  ] as const;

  return (
    <Surface className="grid gap-4 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-bold text-slate-800">
            <Database className="h-4 w-4 text-blue-500" />
            存储与清理
          </h3>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            仅清理过期日志、临时文件和 DOCX 缓存，不删除业务数据。
          </p>
        </div>
        <Button
          onClick={() => void feature.cleanStorageCaches()}
          disabled={loading || cleaning || usage?.active === true}
        >
          {cleaning ? "清理中…" : "清理缓存"}
        </Button>
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-lg border border-rose-100 bg-rose-50 p-3 text-xs text-rose-700"
        >
          {error}
        </p>
      )}

      <div className="grid gap-2 sm:grid-cols-2">
        {categories.map(([label, bytes]) => (
          <div
            key={label}
            className="rounded-lg border border-slate-100 bg-slate-50/70 px-3 py-3"
          >
            <span className="block text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400">
              {label}
            </span>
            <span className="mt-1 block font-mono text-sm font-bold text-slate-700">
              {loading ? "读取中…" : formatBytes(bytes)}
            </span>
          </div>
        ))}
      </div>
    </Surface>
  );
}

function SettingsViewContent() {
  const { feature } = useSettingsFeature();
  useEffect(() => {
    void feature.ensureLoaded();
  }, [feature]);
  const [active, setActive] = useState<SettingsSection>("overview");
  const content =
    active === "overview" ? (
      <SettingsOverview onSelect={setActive} />
    ) : active === "ai" ? (
      <AiProviderSettings />
    ) : active === "media" ? (
      <MediaProviderSettings />
    ) : active === "hepan" ? (
      <HepanProviderSettings />
    ) : active === "platformAccounts" ? (
      <PlatformAccountSettings />
    ) : active === "workspace" ? (
      <WorkspaceSettings />
    ) : active === "runtime" ? (
      <RuntimeSettings />
    ) : (
      <StorageSettings />
    );

  return (
    <div className="grid min-w-0 gap-4 pb-3">
      <PageHeader
        eyebrow="Application Settings"
        title="设置"
        description="管理服务配置、普通投稿平台账号、工作区和运行环境。"
      />
      <div className="grid min-w-0 gap-4 lg:grid-cols-[12.5rem_minmax(0,1fr)]">
        <SettingsNavigation active={active} onChange={setActive} />
        <main className="min-w-0">{content}</main>
      </div>
    </div>
  );
}

export default function SettingsView() {
  return <SettingsViewContent />;
}
