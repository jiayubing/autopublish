import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, KeyRound, Save, ShieldCheck, TestTube2, Trash2 } from 'lucide-react';
import {
  clearAiProviderConfig,
  getAiProviderStatus,
  saveAiProviderConfig,
  testAiProviderConnection,
} from '../bridge/settings';
import { getGenerationBatchState, subscribeGenerationBatchState } from '../bridge/content';
import {
  AiProviderConfigInput,
  AiProviderStatus,
  AiProviderTestResult,
  GenerationBatchState,
} from '../types';
import { formatBeijingTime } from '../time-format';

const DEFAULT_TIMEOUT_MS = 60000;
const GENERATION_BATCH_STATE_EVENT = 'content:generation-batch-state';
const EMPTY_STATUS: AiProviderStatus = {
  source: 'application',
  configured: false,
  baseUrl: '',
  model: '',
  timeoutMs: DEFAULT_TIMEOUT_MS,
  hasApiKey: false,
  apiKeyMask: '',
  lastTest: null,
};

export function validateAiProviderBaseUrl(value: string): string | null {
  const input = value.trim();
  if (!input) return '请输入 Base URL。';
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return 'Base URL 必须是完整 URL。';
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  const localHost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && localHost)) {
    return 'Base URL 只允许 HTTPS，或 localhost 的 HTTP。';
  }
  if (url.username || url.password || url.search || url.hash) {
    return 'Base URL 不应包含账号、密码、查询参数或片段。';
  }
  const pathname = url.pathname.replace(/\/+$/, '');
  if (/\/chat\/completions$/i.test(pathname)) {
    return '请填写到 /v1，不要填写 /chat/completions。';
  }
  if (!/(^|\/)v1$/i.test(pathname)) {
    return 'Base URL 必须填写到 /v1。';
  }
  return null;
}

export function isGenerationBatchBusy(state: GenerationBatchState | null | undefined): boolean {
  return Boolean(
    state?.isBatchRunning ||
    state?.isStopPending ||
    state?.state === 'running' ||
    state?.state === 'stopping' ||
    state?.status === 'running' ||
    state?.status === 'stopping',
  );
}

function safeErrorMessage(error: unknown): string {
  const code = error && typeof error === 'object' && 'code' in error
    ? String((error as { code?: unknown }).code || '')
    : '';
  const messages: Record<string, string> = {
    AI_CONFIG_INVALID: 'AI 配置无效，请检查 Base URL、模型和超时时间。',
    AI_CONFIG_BUSY: '生成批次正在运行或停止，暂时不能修改 AI 配置。',
    AI_CONFIG_ENV_OVERRIDE: 'AI 配置由环境变量控制，当前页面为只读。',
    AI_CONFIG_NOT_SET: '尚未配置 AI 提供方。',
    AI_CONNECTION_FAILED: '连接测试失败，请检查地址、密钥和模型。',
  };
  return messages[code] || 'AI 配置操作失败，请检查配置后重试。';
}

function initialForm(status: AiProviderStatus): AiProviderConfigInput {
  return {
    baseUrl: status.baseUrl,
    apiKey: '',
    model: status.model,
    timeoutMs: status.timeoutMs || DEFAULT_TIMEOUT_MS,
  };
}

function formatTestResult(result: AiProviderTestResult | null): string {
  if (!result) return '尚未测试连接。';
  const time = result.testedAt ? formatBeijingTime(result.testedAt) : '刚刚';
  return result.ok ? `最近测试成功：${time}` : `最近测试失败：${time}`;
}

export default function AiProviderSettings() {
  const [status, setStatus] = useState<AiProviderStatus>(EMPTY_STATUS);
  const [form, setForm] = useState<AiProviderConfigInput>(initialForm(EMPTY_STATUS));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getAiProviderStatus()
      .then((nextStatus) => {
        if (!active) return;
        setStatus(nextStatus);
        setForm(initialForm(nextStatus));
      })
      .catch((requestError: unknown) => {
        if (active) setError(safeErrorMessage(requestError));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    getGenerationBatchState()
      .then((batchState) => {
        if (active) setBusy(isGenerationBatchBusy(batchState));
      })
      .catch(() => {
        // A missing or unavailable generation-state channel must not hide AI settings.
      });
    const unsubscribe = subscribeGenerationBatchState((batchState) => {
      if (active) setBusy(isGenerationBatchBusy(batchState));
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const environmentOverride = status.source === 'environment';
  const validateForm = (): boolean => {
    const urlError = validateAiProviderBaseUrl(form.baseUrl);
    if (urlError) {
      setError(urlError);
      return false;
    }
    if (!form.model.trim()) {
      setError('请输入模型名称。');
      return false;
    }
    if (!Number.isInteger(Number(form.timeoutMs)) || Number(form.timeoutMs) < 1000 || Number(form.timeoutMs) > 10 * 60 * 1000) {
      setError('超时时间应为 1000 到 600000 毫秒。');
      return false;
    }
    if (!form.apiKey.trim() && !status.hasApiKey) {
      setError('请输入 API Key。');
      return false;
    }
    return true;
  };

  const currentInput = (): AiProviderConfigInput => ({
    baseUrl: form.baseUrl.trim(),
    apiKey: form.apiKey,
    model: form.model.trim(),
    timeoutMs: Number(form.timeoutMs),
  });

  const handleSave = async () => {
    setError(null);
    setNotice(null);
    if (!validateForm()) return;
    setSaving(true);
    try {
      const nextStatus = await saveAiProviderConfig(currentInput());
      setStatus(nextStatus);
      setForm(initialForm(nextStatus));
      setNotice('AI 配置已保存，将供下一次生成使用。');
    } catch (saveError) {
      setError(safeErrorMessage(saveError));
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setError(null);
    setNotice(null);
    if (!validateForm()) return;
    const confirmed = typeof window === 'undefined' || typeof window.confirm !== 'function'
      || window.confirm('测试连接会发送最小 completion，可能产生少量费用。是否继续？');
    if (!confirmed) return;
    setTesting(true);
    try {
      const result = await testAiProviderConnection(currentInput());
      setStatus((current) => ({ ...current, lastTest: result }));
      setNotice('连接测试成功；测试回答不会被保存。');
    } catch (testError) {
      try {
        const nextStatus = await getAiProviderStatus();
        setStatus(nextStatus);
      } catch (_) {
        // Keep the original rejected test error when the status refresh is unavailable.
      }
      setError(safeErrorMessage(testError));
    } finally {
      setTesting(false);
    }
  };

  const handleClear = async () => {
    setError(null);
    setNotice(null);
    const confirmed = typeof window === 'undefined' || typeof window.confirm !== 'function'
      || window.confirm('清除后将删除应用级 AI 配置和测试状态。是否继续？');
    if (!confirmed) return;
    setClearing(true);
    try {
      await clearAiProviderConfig();
      setStatus(EMPTY_STATUS);
      setForm(initialForm(EMPTY_STATUS));
      setNotice('应用级 AI 配置已清除。');
    } catch (clearError) {
      setError(safeErrorMessage(clearError));
    } finally {
      setClearing(false);
    }
  };

  return (
    <section className="ai-provider-settings rounded-lg border border-slate-200 bg-white p-5 space-y-4" aria-labelledby="ai-provider-settings-title" aria-busy={loading || busy} data-generation-batch-state-event={GENERATION_BATCH_STATE_EVENT}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 id="ai-provider-settings-title" className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <ShieldCheck className="h-4 w-4" /> AI 提供方
          </h2>
          <p className="mt-1 text-xs leading-5 text-slate-500">应用级配置，所有工作区共用。API Key 只在输入框中短暂输入，不会从状态接口回填。</p>
        </div>
        <KeyRound className="h-5 w-5 shrink-0 text-slate-400" aria-hidden="true" />
      </div>

      <div className={`rounded-md border p-3 text-xs leading-5 ${environmentOverride ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-blue-100 bg-blue-50 text-blue-900'}`}>
        配置来源：{environmentOverride ? '环境变量覆盖（只读）' : '应用级配置'}
        {environmentOverride && '。请移除 AI_* 环境变量并重启应用后再编辑。'}
      </div>

      <div className="grid gap-4">
        <label className="grid gap-1 text-xs font-medium text-slate-700">
          OpenAI 兼容 Base URL
          <input
            className="ai-provider-url min-w-0 rounded-md border border-slate-300 px-3 py-2 font-mono text-xs text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50"
            value={form.baseUrl}
            onChange={(event) => setForm((current) => ({ ...current, baseUrl: event.target.value }))}
            placeholder="https://provider.example/v1"
            readOnly={environmentOverride}
            disabled={busy || loading}
            aria-label="AI Base URL"
          />
          <span className="font-normal text-slate-500">只允许 HTTPS 或 localhost HTTP，填写到 /v1，不要填写 /chat/completions。</span>
        </label>

        <label className="grid gap-1 text-xs font-medium text-slate-700">
          API Key
          <input
            className="rounded-md border border-slate-300 px-3 py-2 font-mono text-xs text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50"
            type="password"
            value={form.apiKey}
            onChange={(event) => setForm((current) => ({ ...current, apiKey: event.target.value }))}
            placeholder={status.hasApiKey ? `${status.apiKeyMask}（留空以保留已有 Key）` : '输入 API Key'}
            autoComplete="new-password"
            readOnly={environmentOverride}
            disabled={busy || loading}
            aria-label="AI API Key"
          />
        </label>

        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_12rem]">
          <label className="grid gap-1 text-xs font-medium text-slate-700">
            模型名称
            <input
              className="min-w-0 rounded-md border border-slate-300 px-3 py-2 text-xs text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50"
              value={form.model}
              onChange={(event) => setForm((current) => ({ ...current, model: event.target.value }))}
              placeholder="model-a"
              readOnly={environmentOverride}
              disabled={busy || loading}
              aria-label="AI model"
            />
          </label>
          <label className="grid gap-1 text-xs font-medium text-slate-700">
            超时时间（毫秒）
            <input
              className="min-w-0 rounded-md border border-slate-300 px-3 py-2 font-mono text-xs text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50"
              type="number"
              min={1000}
              max={600000}
              step={1000}
              value={form.timeoutMs}
              onChange={(event) => setForm((current) => ({ ...current, timeoutMs: Number(event.target.value) }))}
              readOnly={environmentOverride}
              disabled={busy || loading}
              aria-label="AI timeout"
            />
          </label>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
        <span className="inline-flex items-center gap-1"><KeyRound className="h-3.5 w-3.5" />{status.configured ? `已配置 ${status.apiKeyMask || ''}` : '尚未配置 API Key'}</span>
        <span aria-hidden="true">·</span>
        <span>{formatTestResult(status.lastTest)}</span>
      </div>

      <p className="flex gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <span>测试连接会发送最小 completion，可能产生少量费用；测试失败不会覆盖当前已生效配置。</span>
      </p>

      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {notice && <p className="flex items-center gap-1 text-sm text-emerald-700"><CheckCircle2 className="h-4 w-4" />{notice}</p>}

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => void handleSave()} disabled={busy || loading || saving || testing || clearing || environmentOverride} className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">
          <Save className="h-3.5 w-3.5" />{saving ? '保存中…' : '保存配置'}
        </button>
        <button type="button" onClick={() => void handleTest()} disabled={busy || loading || saving || testing || clearing || environmentOverride} className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50">
          <TestTube2 className="h-3.5 w-3.5" />{testing ? '测试中…' : '测试连接'}
        </button>
        <button type="button" onClick={() => void handleClear()} disabled={busy || loading || saving || testing || clearing || environmentOverride} className="inline-flex items-center gap-2 rounded-md border border-rose-300 px-3 py-2 text-xs font-semibold text-rose-700 disabled:cursor-not-allowed disabled:opacity-50">
          <Trash2 className="h-3.5 w-3.5" />{clearing ? '清除中…' : '清除配置'}
        </button>
      </div>
    </section>
  );
}
