import React, { useEffect, useState } from "react";
import type { MediaProviderStatus } from "../../types";
import { useConfirmation } from "../../confirmation";
import { useSettingsFeature } from "../../features/settings/settings-context";

const EMPTY: MediaProviderStatus = {
  source: "application",
  configured: false,
  baseUrl: "",
  timeoutMs: 0,
  allowInsecure: false,
  transport: "disabled",
  apiKeyMask: "",
  lastTest: null,
};

export default function MediaProviderSettings() {
  const { confirm } = useConfirmation();
  const { feature, snapshot } = useSettingsFeature();
  const status = (snapshot.media.data || EMPTY) as MediaProviderStatus;
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState(EMPTY.baseUrl);
  const [timeoutMs, setTimeoutMs] = useState(EMPTY.timeoutMs);
  const [allowInsecure, setAllowInsecure] = useState(false);
  const [localError, setLocalError] = useState("");
  const loading = snapshot.media.query.loading;
  const saving = snapshot.commands.saveMedia.busy;
  const testing = snapshot.commands.testMedia.busy;
  const clearing = snapshot.commands.clearMedia.busy;
  const operationBusy = saving || testing || clearing;
  const error =
    localError ||
    snapshot.media.query.error?.userMessage ||
    snapshot.commands.saveMedia.error?.userMessage ||
    snapshot.commands.testMedia.error?.userMessage ||
    snapshot.commands.clearMedia.error?.userMessage;
  const notice = snapshot.commands.saveMedia.result
    ? "付费媒体配置已保存，下一次操作立即生效。"
    : snapshot.commands.testMedia.result
      ? "连接测试成功。"
      : snapshot.commands.clearMedia.result
        ? "付费媒体配置已清除。"
        : "";

  useEffect(() => {
    if (!snapshot.media.data) return;
    setBaseUrl(status.baseUrl || EMPTY.baseUrl);
    setTimeoutMs(status.timeoutMs || EMPTY.timeoutMs);
    setAllowInsecure(status.allowInsecure);
    setApiKey("");
  }, [snapshot.media.data, status]);

  const draft = () => ({
    apiKey,
    baseUrl: baseUrl.trim(),
    timeoutMs: Number(timeoutMs),
    allowInsecure,
  });
  const validate = () => {
    if (!apiKey.trim() && !status.configured) {
      setLocalError("请输入 API Key。");
      return false;
    }
    return true;
  };
  const save = async () => {
    setLocalError("");
    if (validate()) await feature.saveMedia(draft());
  };
  const test = async () => {
    setLocalError("");
    if (!validate()) return;
    if (
      !(await confirm({
        title: "测试付费媒体连接",
        message: "测试只读取余额，不会投稿或创建订单。",
        confirmLabel: "开始测试",
        tone: "default",
      }))
    )
      return;
    await feature.testMedia(draft());
  };
  const clear = async () => {
    setLocalError("");
    if (
      !(await confirm({
        title: "清除付费媒体配置",
        message: "清除后缓存仍可查看，但联网操作会提示未配置。",
        confirmLabel: "清除配置",
        tone: "danger",
      }))
    )
      return;
    await feature.clearMedia();
  };
  const readOnly = status.source === "environment";

  return (
    <section
      aria-labelledby="media-provider-settings-title"
      className="space-y-4 rounded-lg border border-slate-200 bg-white p-5"
    >
      <div>
        <h3
          id="media-provider-settings-title"
          className="text-base font-semibold text-slate-800"
        >
          付费媒体
        </h3>
        <p className="mt-1 text-sm text-slate-500">
          应用级 API 配置。API Key 使用加密存储，页面只显示脱敏结果。
        </p>
      </div>
      <div className="rounded-md border border-blue-100 bg-blue-50 p-3 text-xs text-blue-900">
         配置来源：{readOnly ? "环境变量覆盖（只读）" : "应用级加密存储"}
         <span> · 安全状态：{status.transport}</span>
         {status.configured && ` · ${status.apiKeyMask}`}
      </div>
      <label className="grid gap-1 text-sm font-medium text-slate-700">
        API Key
        <input
          type="password"
          aria-label="付费媒体 API Key"
          autoComplete="new-password"
          value={apiKey}
          onChange={(event) => setApiKey(event.target.value)}
          placeholder={
            status.configured
              ? `${status.apiKeyMask}（留空保留已有 Key）`
              : "请输入 API Key"
          }
          disabled={operationBusy || loading || readOnly}
          className="min-w-0 rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </label>
      <details className="rounded-md border border-slate-200 p-3">
        <summary className="cursor-pointer text-sm font-medium text-slate-700">
          高级配置
        </summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_12rem]">
          <label className="grid min-w-0 gap-1 text-sm text-slate-600">
            API Base URL
            <input
              value={baseUrl}
              onChange={(event) => {
                setBaseUrl(event.target.value);
                setAllowInsecure(false);
              }}
              disabled={operationBusy || loading || readOnly}
              className="min-w-0 rounded-md border border-slate-300 px-3 py-2 text-xs"
            />
          </label>
          <label className="grid gap-1 text-sm text-slate-600">
            请求超时（毫秒）
            <input
              type="number"
              min={1000}
              max={300000}
              value={timeoutMs}
              onChange={(event) => setTimeoutMs(Number(event.target.value))}
              disabled={operationBusy || loading || readOnly}
              className="min-w-0 rounded-md border border-slate-300 px-3 py-2 text-xs"
            />
          </label>
        </div>
        <label className="mt-3 flex items-start gap-2 text-xs text-slate-600">
          <input
            type="checkbox"
            checked={allowInsecure}
            onChange={(event) => setAllowInsecure(event.target.checked)}
            disabled={operationBusy || loading || readOnly}
          />
          允许批准的 HTTP 地址（连接未加密，API Key 存在传输风险）
        </label>
      </details>
      {status.transport === "insecure" && (
        <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
          当前地址使用 HTTP，连接未加密。服务器支持 HTTPS 时请优先切换。
        </p>
      )}
      {status.transport === "invalid" && (
        <p className="rounded-md border border-rose-200 bg-rose-50 p-3 text-xs leading-5 text-rose-900">
          当前 endpoint 无效或尚未完成针对该地址的风险确认，联网操作已禁用。
        </p>
      )}
      <p className="text-xs text-slate-500">
        最近测试：
        {status.lastTest ? (status.lastTest.ok ? "成功" : "失败") : "尚未测试"}
      </p>
      {error && (
        <p role="alert" aria-live="polite" className="text-sm text-rose-700">
          {error}
        </p>
      )}
      {notice && (
        <p
          role="status"
          aria-live="polite"
          className="text-sm text-emerald-700"
        >
          {notice}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void save()}
          disabled={operationBusy || loading || readOnly}
          className="rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {saving ? "保存中…" : "保存配置"}
        </button>
        <button
          type="button"
          onClick={() => void test()}
          disabled={operationBusy || loading || readOnly}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm disabled:opacity-50"
        >
          {testing ? "测试中…" : "测试连接"}
        </button>
        <button
          type="button"
          onClick={() => void clear()}
          disabled={operationBusy || loading || readOnly}
          className="rounded-md border border-rose-300 px-3 py-2 text-sm text-rose-700 disabled:opacity-50"
        >
          {clearing ? "清除中…" : "清除配置"}
        </button>
      </div>
    </section>
  );
}
