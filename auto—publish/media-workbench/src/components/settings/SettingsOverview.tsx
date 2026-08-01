import React from "react";
import type {
  AiProviderStatus,
  HepanProviderStatus,
  LegacyProviderSettingsStatus,
  MediaProviderStatus,
} from "../../types";
import type { SettingsSection } from "./SettingsNavigation";
import { useConfirmation } from "../../confirmation";
import { useSettingsFeature } from "../../features/settings/settings-context";

const EMPTY_AI: AiProviderStatus = {
  source: "application",
  configured: false,
  baseUrl: "",
  model: "",
  timeoutMs: 60000,
  hasApiKey: false,
  apiKeyMask: "",
  lastTest: null,
};
const EMPTY_MEDIA: MediaProviderStatus = {
  source: "application",
  configured: false,
  baseUrl: "",
  timeoutMs: 0,
  allowInsecure: false,
  transport: "disabled",
  apiKeyMask: "",
  lastTest: null,
};
const EMPTY_HEPAN: HepanProviderStatus = {
  source: "application",
  configured: false,
  pythonConfigured: false,
  cookieConfigured: false,
  categoryId: 0,
  vendorConfigured: false,
  bundledVendorAvailable: false,
  siteOrigin: "",
  publishIntervalSeconds: 0,
  lastTest: null,
};

export default function SettingsOverview({
  onSelect,
}: {
  onSelect: (section: SettingsSection) => void;
}) {
  const { confirm } = useConfirmation();
  const { feature, snapshot } = useSettingsFeature();
  const ai = (snapshot.ai.data || EMPTY_AI) as AiProviderStatus;
  const media = (snapshot.media.data || EMPTY_MEDIA) as MediaProviderStatus;
  const hepan = (snapshot.hepan.data || EMPTY_HEPAN) as HepanProviderStatus;
  const legacy = snapshot.legacy.data as LegacyProviderSettingsStatus | null;
  const legacyBusy = snapshot.commands.importLegacy.busy;
  const error =
    snapshot.ai.query.error?.userMessage ||
    snapshot.media.query.error?.userMessage ||
    snapshot.hepan.query.error?.userMessage ||
    snapshot.legacy.query.error?.userMessage ||
    snapshot.commands.importLegacy.error?.userMessage;
  const legacyNotice = snapshot.commands.importLegacy.result
    ? "旧配置已处理。请按提示手工清理旧 Cookie 文件。"
    : "";

  const importLegacy = async () => {
    if (
      !(await confirm({
        title: "导入旧配置",
        message:
          "将发现的旧媒体 Key 或河畔 Cookie 加密导入应用配置，不会自动删除旧 Cookie 文件。",
        confirmLabel: "导入配置",
        tone: "warning",
      }))
    )
      return;
    await feature.importLegacy();
  };

  const items: Array<{
    id: SettingsSection;
    title: string;
    detail: string;
    configured: boolean;
  }> = [
    {
      id: "ai",
      title: "AI 生成",
      detail: ai.configured ? `已配置 · ${ai.model || "默认模型"}` : "尚未配置",
      configured: ai.configured,
    },
    {
      id: "media",
      title: "付费媒体",
      detail: media.apiKeyMask ? `${media.transport} · ${media.apiKeyMask}` : media.transport,
      configured: media.configured,
    },
    {
      id: "hepan",
      title: "蓝色河畔",
      detail: hepan.configured
        ? `已配置 · 栏目 ${hepan.categoryId}`
        : "尚未配置",
      configured: hepan.configured,
    },
  ];

  return (
    <section aria-labelledby="settings-overview-title" className="space-y-4">
      <div>
        <h3
          id="settings-overview-title"
          className="text-base font-semibold text-slate-800"
        >
          服务配置概览
        </h3>
        <p className="mt-1 text-sm text-slate-500">
          账号密钥属于应用级配置，与当前工作区分离。
        </p>
      </div>
      {error && (
        <p role="alert" className="text-sm text-rose-700">
          {error}
        </p>
      )}
      {legacy?.discover.importable && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-semibold">发现可导入的旧配置</p>
          <p className="mt-1">
            旧媒体 Key 或河畔 Cookie
            路径只会在你确认后导入并加密保存，不会在页面显示秘密，也不会自动删除旧
            Cookie 文件。
          </p>
          <button
            type="button"
            onClick={() => void importLegacy()}
            disabled={legacyBusy}
            className="mt-3 rounded-md border border-amber-400 px-3 py-2 text-sm font-semibold disabled:opacity-50"
          >
            {legacyBusy ? "处理中…" : "确认导入旧配置"}
          </button>
        </div>
      )}
      {legacyNotice && (
        <p role="status" className="text-sm text-emerald-700">
          {legacyNotice}
        </p>
      )}
      <div className="grid gap-3 md:grid-cols-3">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect(item.id)}
            className="min-w-0 rounded-lg border border-slate-200 bg-white p-4 text-left shadow-sm hover:border-blue-300"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-slate-700">{item.title}</span>
              <span
                className={`h-2.5 w-2.5 rounded-full ${item.configured ? "bg-emerald-500" : "bg-slate-300"}`}
                aria-label={item.configured ? "已配置" : "未配置"}
              />
            </div>
            <p className="mt-3 break-words text-sm text-slate-500">
              {item.detail}
            </p>
            <span className="mt-4 inline-block text-xs font-semibold text-blue-700">
              管理配置 →
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
