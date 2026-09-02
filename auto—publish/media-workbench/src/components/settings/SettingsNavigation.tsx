import React from 'react';

export type SettingsSection = 'overview' | 'ai' | 'media' | 'hepan' | 'platformAccounts' | 'workspace' | 'runtime' | 'storage';

const ITEMS: Array<{ id: SettingsSection; label: string; group?: string }> = [
  { id: 'overview', label: '概览' },
  { id: 'ai', label: 'AI 生成', group: '服务配置' },
  { id: 'media', label: '付费媒体', group: '服务配置' },
  { id: 'hepan', label: '蓝色河畔', group: '服务配置' },
  { id: 'platformAccounts', label: '平台账号', group: '服务配置' },
  { id: 'workspace', label: '工作区', group: '系统' },
  { id: 'runtime', label: '运行环境', group: '系统' },
  { id: 'storage', label: '存储与清理', group: '系统' },
];

export default function SettingsNavigation({ active, onChange }: { active: SettingsSection; onChange: (section: SettingsSection) => void }) {
  let lastGroup = '';
  return <nav aria-label="设置分区" className="min-w-0 rounded-lg border border-slate-200 bg-white p-2 lg:sticky lg:top-0 lg:self-start">
    {ITEMS.map((item) => {
      const showGroup = item.group && item.group !== lastGroup;
      if (item.group) lastGroup = item.group;
      return <React.Fragment key={item.id}>
        {showGroup && <div className="px-3 pb-1 pt-3 text-[11px] font-semibold text-slate-400">{item.group}</div>}
        <button type="button" aria-current={active === item.id ? 'page' : undefined} onClick={() => onChange(item.id)} className={`w-full rounded-md px-3 py-2 text-left text-sm ${active === item.id ? 'bg-blue-50 font-semibold text-blue-700' : 'text-slate-600 hover:bg-slate-50'}`}>{item.label}</button>
      </React.Fragment>;
    })}
  </nav>;
}
