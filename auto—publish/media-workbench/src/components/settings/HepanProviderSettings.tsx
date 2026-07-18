import React, { useEffect, useState } from 'react';
import { clearPlatformSettings, getPlatformSettingsStatus, savePlatformSettings, testPlatformSettings } from '../../electron-api';
import type { HepanProviderStatus } from '../../types';

const EMPTY: HepanProviderStatus = {
  source: 'application',
  configured: false,
  pythonConfigured: false,
  cookieConfigured: false,
  categoryId: 121,
  vendorConfigured: false,
  siteOrigin: 'https://www.hepan.com',
  lastTest: null,
};

function message(error: unknown): string {
  const code = error && typeof error === 'object' && 'code' in error
    ? String((error as { code?: unknown }).code || '')
    : '';
  return ({
    PLATFORM_CONFIG_INVALID: '配置无效，请检查 Python 路径、Cookie、栏目 ID 或 vendor 目录。',
    PLATFORM_CONFIG_BUSY: '蓝色河畔投稿运行中，暂时不能修改配置。',
    PLATFORM_CONFIG_ENV_OVERRIDE: '配置由环境变量覆盖，当前页面只能查看。',
    HEPAN_PYTHON_UNAVAILABLE: 'Python 不可用，请检查可执行文件。',
    HEPAN_DEPENDENCY_MISSING: 'Python 依赖缺失，请检查 vendor 目录或系统环境。',
    HEPAN_LOGIN_INVALID: 'Cookie 登录检查失败，请更新 Cookie。',
  } as Record<string, string>)[code] || '蓝色河畔配置操作失败。';
}

type HepanPatch = {
  pythonPath?: string;
  cookie?: string;
  categoryId: number;
  vendorDir?: string;
  clearVendorDir?: true;
};

export default function HepanProviderSettings() {
  const [status, setStatus] = useState<HepanProviderStatus>(EMPTY);
  const [pythonPath, setPythonPath] = useState('');
  const [cookie, setCookie] = useState('');
  const [categoryId, setCategoryId] = useState(121);
  const [vendorDir, setVendorDir] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = async () => {
    try {
      const next = await getPlatformSettingsStatus<HepanProviderStatus>('hepan');
      setStatus(next);
      setCategoryId(next.categoryId || 121);
    } catch (value) {
      setError(message(value));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  function draft(): HepanPatch {
    const patch: HepanPatch = { categoryId: Number(categoryId) };
    if (pythonPath.trim()) patch.pythonPath = pythonPath.trim();
    if (cookie.trim()) patch.cookie = cookie;
    if (vendorDir.trim()) patch.vendorDir = vendorDir.trim();
    return patch;
  }

  function validate(): boolean {
    if (!Number.isInteger(categoryId) || categoryId < 1) {
      setError('栏目 ID 必须是大于 0 的整数。');
      return false;
    }
    if (!pythonPath.trim() && !status.pythonConfigured) {
      setError('请输入 Python 可执行文件路径。');
      return false;
    }
    if (!cookie.trim() && !status.cookieConfigured) {
      setError('请输入河畔 Cookie。');
      return false;
    }
    return true;
  }

  async function save() {
    setError('');
    setNotice('');
    if (!validate()) return;
    setBusy(true);
    try {
      await savePlatformSettings('hepan', draft());
      setPythonPath('');
      setCookie('');
      setVendorDir('');
      await load();
      setNotice('蓝色河畔配置已保存，未填写的字段保持原值。');
    } catch (value) {
      setError(message(value));
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    setError('');
    setNotice('');
    if (!validate()) return;
    if (typeof window !== 'undefined' && !window.confirm('测试会检查 Python、依赖和 Cookie 登录，不会发布文章。是否继续？')) return;
    setBusy(true);
    try {
      await testPlatformSettings('hepan', draft());
      setPythonPath('');
      setCookie('');
      setVendorDir('');
      setNotice('Python、依赖和登录检查成功；测试输入未保存。');
      await load();
    } catch (value) {
      setError(message(value));
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function clearVendor() {
    if (status.source === 'environment' || busy || !status.vendorConfigured) return;
    if (typeof window !== 'undefined' && !window.confirm('清除自定义 vendor 目录并恢复使用系统环境？')) return;
    if (typeof window !== 'undefined' && !window.confirm('再次确认：只清除 vendor 目录，Python、Cookie 和栏目 ID 不会改变。')) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await savePlatformSettings('hepan', { categoryId: Number(categoryId), clearVendorDir: true });
      setVendorDir('');
      await load();
      setNotice('已清除自定义 vendor 目录，后续测试将使用系统环境。');
    } catch (value) {
      setError(message(value));
    } finally {
      setBusy(false);
    }
  }

  async function clear() {
    setError('');
    setNotice('');
    if (typeof window !== 'undefined' && !window.confirm('清除蓝色河畔全部应用配置后将无法投稿。是否继续？')) return;
    setBusy(true);
    try {
      await clearPlatformSettings('hepan');
      setStatus(EMPTY);
      setPythonPath('');
      setCookie('');
      setVendorDir('');
      setCategoryId(121);
      setNotice('蓝色河畔配置已清除。');
    } catch (value) {
      setError(message(value));
    } finally {
      setBusy(false);
    }
  }

  const readOnly = status.source === 'environment';
  const disabled = busy || loading || readOnly;

  return <section aria-labelledby="hepan-provider-settings-title" className="min-w-0 space-y-4 rounded-lg border border-slate-200 bg-white p-5">
    <div>
      <h3 id="hepan-provider-settings-title" className="text-base font-semibold text-slate-800">蓝色河畔</h3>
      <p className="mt-1 text-sm text-slate-500">应用级发文运行环境。Cookie 加密保存，只在测试或任务期间解密。</p>
    </div>
    <div className="min-w-0 rounded-md border border-blue-100 bg-blue-50 p-3 text-xs text-blue-900">站点：{status.siteOrigin} · 配置来源：{readOnly ? '环境变量覆盖（只读）' : '应用级加密存储'}</div>
    <div className="grid min-w-0 gap-3">
      <label className="grid min-w-0 gap-1 text-sm font-medium text-slate-700">Python 可执行文件
        <input aria-label="Python 可执行文件" value={pythonPath} onChange={(event) => setPythonPath(event.target.value)} placeholder={status.pythonConfigured ? '已配置（留空保留）' : 'C:\\Python312\\python.exe'} disabled={disabled} className="min-w-0 rounded-md border border-slate-300 px-3 py-2 text-sm" />
      </label>
      <label className="grid min-w-0 gap-1 text-sm font-medium text-slate-700">河畔 Cookie
        <input aria-label="河畔 Cookie" type="password" value={cookie} onChange={(event) => setCookie(event.target.value)} placeholder={status.cookieConfigured ? '已配置（留空保留）' : '请输入 Cookie'} autoComplete="new-password" disabled={disabled} className="min-w-0 rounded-md border border-slate-300 px-3 py-2 text-sm" />
      </label>
    </div>
    <details className="min-w-0 rounded-md border border-slate-200 p-3">
      <summary className="cursor-pointer text-sm font-medium text-slate-700">高级配置</summary>
      <div className="mt-3 grid min-w-0 gap-3 sm:grid-cols-[12rem_minmax(0,1fr)]">
        <label className="grid min-w-0 gap-1 text-sm text-slate-600">栏目 ID
          <input aria-label="栏目 ID" type="number" min={1} step={1} value={categoryId} onChange={(event) => setCategoryId(Number(event.target.value))} disabled={disabled} className="min-w-0 rounded-md border border-slate-300 px-3 py-2 text-sm" />
        </label>
        <div className="min-w-0">
          <label className="grid min-w-0 gap-1 text-sm text-slate-600">Python vendor/依赖目录
            <input aria-label="Python vendor/依赖目录" value={vendorDir} onChange={(event) => setVendorDir(event.target.value)} placeholder={status.vendorConfigured ? '已配置（留空保留）' : '留空表示使用系统环境'} disabled={disabled} className="min-w-0 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
          </label>
          {status.vendorConfigured && <button type="button" onClick={() => void clearVendor()} disabled={disabled} className="mt-2 rounded border border-amber-300 px-2 py-1 text-xs text-amber-700 disabled:opacity-40">清除自定义目录并恢复系统环境</button>}
        </div>
      </div>
    </details>
    <p className="text-xs text-slate-500">Python：{status.pythonConfigured ? '已配置' : '未配置'} · Cookie：{status.cookieConfigured ? '已配置' : '未配置'} · vendor：{status.vendorConfigured ? '已配置' : '系统环境'} · 最近测试：{status.lastTest ? (status.lastTest.ok ? '成功' : '失败') : '尚未测试'}</p>
    {error && <p role="alert" aria-live="assertive" className="text-sm text-rose-700">{error}</p>}
    {notice && <p role="status" aria-live="polite" className="text-sm text-emerald-700">{notice}</p>}
    <div className="flex min-w-0 flex-wrap gap-2">
      <button type="button" onClick={() => void save()} disabled={disabled} className="rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">保存配置</button>
      <button type="button" onClick={() => void test()} disabled={disabled} className="rounded-md border border-slate-300 px-3 py-2 text-sm disabled:opacity-50">测试登录</button>
      <button type="button" onClick={() => void clear()} disabled={disabled} className="rounded-md border border-rose-300 px-3 py-2 text-sm text-rose-700 disabled:opacity-50">清除配置</button>
    </div>
  </section>;
}
