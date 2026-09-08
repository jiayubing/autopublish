import React from "react";
import { ArrowUpRight, CheckCircle2, Circle } from "lucide-react";
import type {
  AiProviderStatus,
  HepanProviderStatus,
  LegacyProviderSettingsStatus,
  MediaProviderStatus,
} from "../../types/settings";
import type { SettingsSection } from "./SettingsNavigation";
import { useConfirmation } from "../../confirmation";
import { useSettingsFeature } from "../../features/settings/settings-context";
import { usePlatformFeature } from "../../features/platform/platform-feature-context";
import { Button, StatusBadge } from "../ui/primitives";

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
  uid: 0,
  uidConfigured: false,
  passwordConfigured: false,
  apiUrl: "https://www.hepan.com/geoapi/api.php",
  lastTest: null,
};

export default function SettingsOverview({
  onSelect,
}: {
  onSelect: (section: SettingsSection) => void;
}) {
  const { confirm } = useConfirmation();
  const { feature, snapshot } = useSettingsFeature();
  const { snapshot: platformSnapshot } = usePlatformFeature();
  const ai = (snapshot.ai.data || EMPTY_AI) as AiProviderStatus;
  const media = (snapshot.media.data || EMPTY_MEDIA) as MediaProviderStatus;
  const hepan = (snapshot.hepan.data || EMPTY_HEPAN) as HepanProviderStatus;
  const legacy = snapshot.legacy.data as LegacyProviderSettingsStatus | null;
  const boundPlatformAccounts = platformSnapshot.accountProfiles.items.filter(
    (profile) => profile.bindingStatus === "bound",
  ).length;
  const legacyBusy = snapshot.commands.importLegacy.busy;
  const error =
    snapshot.ai.query.error?.userMessage ||
    snapshot.media.query.error?.userMessage ||
    snapshot.hepan.query.error?.userMessage ||
    snapshot.commands.importLegacy.error?.userMessage;
  const legacyNotice = snapshot.commands.importLegacy.result
    ? "旧媒体配置已处理。"
    : "";

  const importLegacy = async () => {
    if (
      !(await confirm({
        title: "导入旧配置",
        message: "将发现的旧媒体 Key 加密导入应用配置。",
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
      detail: media.apiKeyMask
        ? `${media.transport} · ${media.apiKeyMask}`
        : media.transport,
      configured: media.configured,
    },
    {
      id: "hepan",
      title: "蓝色河畔",
      detail: hepan.configured
        ? `已配置 · UID ${hepan.uid}`
        : "尚未配置",
      configured: hepan.configured,
    },
    {
      id: "platformAccounts",
      title: "平台账号",
      detail: boundPlatformAccounts
        ? `已绑定 ${boundPlatformAccounts} 个账号档案`
        : "尚未绑定普通投稿账号",
      configured: boundPlatformAccounts > 0,
    },
  ];

  return (
    <section aria-labelledby="settings-overview-title" className="grid gap-4">
      <div>
        <h3
          id="settings-overview-title"
          className="text-sm font-bold text-slate-800"
        >
          服务配置概览
        </h3>
        <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">
          服务密钥与普通投稿账号分开维护；平台登录与账号绑定统一从“平台账号”进入。
        </p>
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-xl border border-rose-100 bg-rose-50 px-3 py-2.5 text-xs text-rose-700"
        >
          {error}
        </p>
      )}

      {legacy?.discover.importable && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-4 text-xs leading-5 text-amber-900">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-bold">发现可导入的旧配置</p>
              <p className="mt-1">旧媒体 Key 会在你确认后导入并加密保存。</p>
            </div>
            <Button
              size="sm"
              onClick={() => void importLegacy()}
              disabled={legacyBusy}
            >
              {legacyBusy ? "处理中…" : "确认导入旧配置"}
            </Button>
          </div>
        </div>
      )}

      {legacyNotice && (
        <p role="status" className="text-xs font-medium text-emerald-700">
          {legacyNotice}
        </p>
      )}

      <div className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-4">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect(item.id)}
            className="group min-w-0 rounded-xl border border-slate-200 bg-white p-4 text-left shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition-colors hover:border-blue-200 hover:bg-blue-50/20"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <span className="block truncate text-[13px] font-bold text-slate-800">
                  {item.title}
                </span>
                <p className="mt-2 min-h-8 break-words text-[11px] leading-4 text-slate-500">
                  {item.detail}
                </p>
              </div>
              {item.configured ? (
                <CheckCircle2
                  className="h-4 w-4 shrink-0 text-emerald-500"
                  aria-label="已配置"
                />
              ) : (
                <Circle
                  className="h-4 w-4 shrink-0 text-slate-300"
                  aria-label="未配置"
                />
              )}
            </div>
            <div className="mt-3 flex items-center justify-between gap-2">
              <StatusBadge tone={item.configured ? "success" : "neutral"}>
                {item.configured ? "已配置" : "未配置"}
              </StatusBadge>
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 group-hover:text-blue-700">
                管理
                <ArrowUpRight className="h-3 w-3" />
              </span>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}
