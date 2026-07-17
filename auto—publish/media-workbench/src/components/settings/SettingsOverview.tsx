import React, { useEffect, useState } from 'react';
import { getAiProviderStatus, getLegacyPlatformSettingsStatus, getPlatformSettingsStatus, importLegacyPlatformSettings } from '../../electron-api';
import type { AiProviderStatus, HepanProviderStatus, LegacyProviderSettingsStatus, MediaProviderStatus } from '../../types';
import type { SettingsSection } from './SettingsNavigation';

const EMPTY_AI: AiProviderStatus = { source: 'application', configured: false, baseUrl: '', model: '', timeoutMs: 60000, hasApiKey: false, apiKeyMask: '', lastTest: null };
const EMPTY_MEDIA: MediaProviderStatus = { source: 'application', configured: false, baseUrl: '', timeoutMs: 30000, allowInsecure: false, transport: '未配置', apiKeyMask: '', lastTest: null };
const EMPTY_HEPAN: HepanProviderStatus = { source: 'application', configured: false, pythonConfigured: false, cookieConfigured: false, categoryId: 121, vendorConfigured: false, siteOrigin: 'https://www.hepan.com', lastTest: null };

export default function SettingsOverview({ onSelect }: { onSelect: (section: SettingsSection) => void }) {
  const [ai, setAi] = useState(EMPTY_AI);
  const [media, setMedia] = useState(EMPTY_MEDIA);
  const [hepan, setHepan] = useState(EMPTY_HEPAN);
  const [legacy, setLegacy] = useState<LegacyProviderSettingsStatus | null>(null);
  const [error, setError] = useState('');
  const [legacyBusy, setLegacyBusy] = useState(false);
  const [legacyNotice, setLegacyNotice] = useState('');

  const load = async () => {
    const [nextAi, nextMedia, nextHepan, nextLegacy] = await Promise.all([
      getAiProviderStatus(),
      getPlatformSettingsStatus<MediaProviderStatus>('media'),
      getPlatformSettingsStatus<HepanProviderStatus>('hepan'),
      getLegacyPlatformSettingsStatus()
    ]);
    setAi(nextAi); setMedia(nextMedia); setHepan(nextHepan); setLegacy(nextLegacy);
  };

  useEffect(() => {
    let active = true;
    load().catch(() => { if (active) setError('无法加载服务配置状态，请稍后重试。'); });
    return () => { active = false; };
  }, []);

  const importLegacy = async () => {
    if (typeof window !== 'undefined' && !window.confirm('将把发现的旧媒体 Key 或河畔 Cookie 加密导入应用配置；不会自动删除旧 Cookie 文件。是否继续？')) return;
    setLegacyBusy(true); setError(''); setLegacyNotice('');
    try { await importLegacyPlatformSettings(); await load(); setLegacyNotice('旧配置已处理。请按提示手工清理旧 Cookie 文件。'); }
    catch (value) { setError(value instanceof Error ? value.message : '旧配置导入失败。'); }
    finally { setLegacyBusy(false); }
  };

  const items: Array<{ id: SettingsSection; title: string; detail: string; configured: boolean }> = [
    { id: 'ai', title: 'AI 生成', detail: ai.configured ? `已配置 · ${ai.model || '默认模型'}` : '尚未配置', configured: ai.configured },
    { id: 'media', title: '付费媒体', detail: media.configured ? `已配置 · ${media.transport}` : '尚未配置', configured: media.configured },
    { id: 'hepan', title: '蓝色河畔', detail: hepan.configured ? `已配置 · 栏目 ${hepan.categoryId}` : '尚未配置', configured: hepan.configured },
  ];

  return <section aria-labelledby="settings-overview-title" className="space-y-4">
    <div><h3 id="settings-overview-title" className="text-base font-semibold text-slate-800">服务配置概览</h3><p className="mt-1 text-sm text-slate-500">账号密钥属于应用级配置，与当前工作区分离。</p></div>
    {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
    {legacy?.discover.importable && <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><p className="font-semibold">发现可导入的旧配置</p><p className="mt-1">旧媒体 Key 或河畔 Cookie 路径只会在你确认后导入并加密保存，不会在页面显示秘密，也不会自动删除旧 Cookie 文件。</p><button type="button" onClick={() => void importLegacy()} disabled={legacyBusy} className="mt-3 rounded-md border border-amber-400 px-3 py-2 text-sm font-semibold disabled:opacity-50">{legacyBusy ? '处理中…' : '确认导入旧配置'}</button></div>}
    {legacyNotice && <p role="status" className="text-sm text-emerald-700">{legacyNotice}</p>}
    <div className="grid gap-3 md:grid-cols-3">{items.map((item) => <button key={item.id} type="button" onClick={() => onSelect(item.id)} className="min-w-0 rounded-lg border border-slate-200 bg-white p-4 text-left shadow-sm hover:border-blue-300"><div className="flex items-center justify-between gap-2"><span className="font-semibold text-slate-700">{item.title}</span><span className={`h-2.5 w-2.5 rounded-full ${item.configured ? 'bg-emerald-500' : 'bg-slate-300'}`} aria-label={item.configured ? '已配置' : '未配置'} /></div><p className="mt-3 break-words text-sm text-slate-500">{item.detail}</p><span className="mt-4 inline-block text-xs font-semibold text-blue-700">管理配置 →</span></button>)}</div>
  </section>;
}
