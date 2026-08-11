import React, { useState } from "react";
import { ExternalLink, FolderOpen, Info, RefreshCw } from "lucide-react";
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
import { useWorkspaceFeature } from "../features/workspace/workspace-feature-context";
import { useSettingsFeature } from "../features/settings/settings-context";

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
function capabilityClass(capability: RuntimeCapability): string {
  const tone = mapRuntimeCapabilityState(capability).tone;
  return tone === "ready"
    ? "text-emerald-700"
    : tone === "unavailable"
      ? "text-rose-700"
      : tone === "optional"
        ? "text-slate-500"
        : "text-amber-700";
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
    <div className="space-y-4">
      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <h3 className="flex items-center gap-2 text-base font-semibold text-slate-800">
          <FolderOpen className="h-4 w-4" />
          工作区
        </h3>
        <div
          className="mt-4 break-all rounded-md bg-slate-50 p-3 font-mono text-xs text-slate-700"
          aria-label="当前工作区状态"
        >
          {loading ? "读取中…" : current?.label || "未选择工作区"}
        </div>
        <p className="mt-3 text-xs text-slate-600">
          校验状态：
          {loading ? "检查中…" : stateLabel(current?.state)}
        </p>
        {environmentManaged && (
          <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            当前工作区由环境变量 AUTO_PUBLISH_WORKSPACE 控制，不能在此更换。
          </p>
        )}
        {operationError && (
          <p role="alert" className="mt-3 text-sm text-rose-700">
            {operationError}
          </p>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void feature.openCurrent()}
            disabled={commandState.openDisabled}
            className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm disabled:opacity-50"
          >
            <ExternalLink className="h-4 w-4" />
            打开文件夹
          </button>
          <button
            type="button"
            onClick={() => setSwitchOpen(true)}
            disabled={commandState.switchDisabled}
            className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            <RefreshCw className="h-4 w-4" />
            更换工作区
          </button>
        </div>
      </section>
      {switchOpen && !environmentManaged && (
        <WorkspaceSelectionPanel
          mode="switch"
          title="更换工作区"
          description="主进程会先校验新目录，再重启应用。"
        />
      )}
      <section
        data-safety-note="Workspace switching does not copy, move, or delete the original data"
        className="flex gap-2 rounded-lg border border-blue-100 bg-blue-50 p-4 text-xs leading-5 text-blue-800"
      >
        <Info className="h-4 w-4 shrink-0" />
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
    <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-slate-800">运行环境</h3>
          <p className="mt-1 text-sm text-slate-500">
            运行时诊断只返回能力状态，不包含密钥或 Cookie。
          </p>
        </div>
        <button
          type="button"
          onClick={() => void feature.runBrowserSelfCheck()}
          disabled={loading || checking}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm disabled:opacity-50"
        >
          {checking ? "检查中…" : "运行浏览器自检"}
        </button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-rose-700">
          {error}
        </p>
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        {items.map(([label, item]) => {
          const state = mapRuntimeCapabilityState(item);
          return (
            <div
              key={label}
              className="flex items-center justify-between rounded border border-slate-100 bg-slate-50 px-3 py-2 text-sm"
            >
              <span>{label}</span>
              <span className={capabilityClass(item)}>{state.label}</span>
            </div>
          );
        })}
      </div>
      {diagnostics?.buildInfo && (
        <p className="text-xs text-slate-500">
          版本 {diagnostics.buildInfo.version} · commit{" "}
          {diagnostics.buildInfo.commit} ·{" "}
          {diagnostics.buildInfo.dirty ? "dirty" : "clean"}
        </p>
      )}
      {diagnostics?.diagnosticSink && (
        <p role="status" className="text-xs text-slate-500">
          诊断记录：{diagnostics.diagnosticSink.status === "ready" ? "正常" : "部分不可用"}
          {diagnostics.diagnosticSink.fileFailureCount > 0 || diagnostics.diagnosticSink.memoryFailureCount > 0
            ? ` · 已记录 ${diagnostics.diagnosticSink.fileFailureCount + diagnostics.diagnosticSink.memoryFailureCount} 次写入失败`
            : ""}
        </p>
      )}
    </section>
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
  return (
    <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-slate-800">存储与清理</h3>
          <p className="mt-1 text-sm text-slate-500">
            仅清理过期日志、临时文件和 DOCX 缓存，不删除业务数据。
          </p>
        </div>
        <button
          type="button"
          onClick={() => void feature.cleanStorageCaches()}
          disabled={loading || cleaning || usage?.active === true}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm disabled:opacity-50"
        >
          {cleaning ? "清理中…" : "清理缓存"}
        </button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-rose-700">
          {error}
        </p>
      )}
      <div className="grid grid-cols-2 gap-3 text-sm text-slate-600">
        <div>
          日志：{loading ? "读取中…" : formatBytes(usage?.logs.bytes || 0)}
        </div>
        <div>
          临时文件：
          {loading ? "读取中…" : formatBytes(usage?.temporary.bytes || 0)}
        </div>
        <div>
          DOCX 缓存：
          {loading ? "读取中…" : formatBytes(usage?.docxCache.bytes || 0)}
        </div>
        <div>
          浏览器配置：
          {loading ? "读取中…" : formatBytes(usage?.profiles.bytes || 0)}
        </div>
      </div>
    </section>
  );
}

function SettingsViewContent() {
  useSettingsFeature();
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
    ) : active === "workspace" ? (
      <WorkspaceSettings />
    ) : active === "runtime" ? (
      <RuntimeSettings />
    ) : (
      <StorageSettings />
    );
  return (
    <div className="min-w-0 max-w-6xl space-y-5">
      <div>
        <h2 className="text-xl font-bold text-slate-800">配置中心</h2>
        <p className="mt-1 text-sm text-slate-500">
          管理服务账号、工作区和运行环境。账号配置与内容工作区相互独立。
        </p>
      </div>
      <div className="grid min-w-0 gap-5 lg:grid-cols-[13rem_minmax(0,1fr)]">
        <SettingsNavigation active={active} onChange={setActive} />
        <main className="min-w-0">{content}</main>
      </div>
    </div>
  );
}

export default function SettingsView() {
  return <SettingsViewContent />;
}
