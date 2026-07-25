import React, { useEffect, useMemo, useState } from 'react';
import { confirmAccountProfile, listAccountProfiles } from '../../bridge/account-profile';
import type { AccountProfile, ContentSubmissionPlatform } from '../../types';

interface AccountProfileSelectorProps {
  platforms: ContentSubmissionPlatform[];
  targetPlatformIds: string[];
  value: Record<string, string>;
  onChange: (value: Record<string, string>) => void;
}

export default function AccountProfileSelector({ platforms, targetPlatformIds, value, onChange }: AccountProfileSelectorProps) {
  const [profiles, setProfiles] = useState<AccountProfile[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busyPlatformId, setBusyPlatformId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const targets = useMemo(() => platforms.filter((platform) => targetPlatformIds.includes(platform.id)), [platforms, targetPlatformIds]);

  useEffect(() => {
    if (!targetPlatformIds.length) return;
    let active = true;
    listAccountProfiles().then((items) => { if (active) setProfiles(items); }).catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : '读取平台账号档案失败'); });
    return () => { active = false; };
  }, [targetPlatformIds.length]);

  useEffect(() => {
    const next: Record<string, string> = {};
    let changed = false;
    targets.forEach((platform) => {
      const candidates = profiles.filter((profile) => profile.platformId === platform.id);
      const current = value[platform.id];
      if (current && candidates.some((profile) => profile.accountProfileId === current)) next[platform.id] = current;
      else if (candidates.length === 1) { next[platform.id] = candidates[0].accountProfileId; changed = true; }
      else if (current) changed = true;
    });
    if (Object.keys(value).some((platformId) => !targetPlatformIds.includes(platformId))) changed = true;
    if (changed) onChange(next);
  }, [profiles, targets, targetPlatformIds, value, onChange]);

  async function confirm(platformId: string) {
    const displayName = (drafts[platformId] || '').trim();
    if (!displayName) { setError('请填写当前登录账号的名称'); return; }
    setBusyPlatformId(platformId); setError('');
    try {
      const profile = await confirmAccountProfile({ platformId, displayName });
      setProfiles((current) => [...current, profile]);
      onChange({ ...value, [platformId]: profile.accountProfileId });
      setDrafts((current) => ({ ...current, [platformId]: '' }));
    } catch (reason) { setError(reason instanceof Error ? reason.message : '确认平台账号档案失败'); }
    finally { setBusyPlatformId(null); }
  }

  if (!targets.length) return null;
  return <div className="grid w-full gap-2 border-t border-slate-200 pt-2">
    <p className="text-xs text-slate-500">为每个平台选择已确认的登录账号；换号时请新建档案，旧队列不会自动改投。</p>
    {targets.map((platform) => {
      const candidates = profiles.filter((profile) => profile.platformId === platform.id);
      return <div key={platform.id} className="grid min-w-0 gap-2 rounded border border-slate-200 bg-white p-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
        <label className="grid gap-1 text-xs text-slate-600">{platform.displayName || platform.id}账号档案
          <select aria-label={`${platform.displayName || platform.id}账号档案`} value={value[platform.id] || ''} onChange={(event) => onChange({ ...value, [platform.id]: event.target.value })} className="h-9 min-w-0 rounded border border-slate-300 px-2">
            <option value="">请选择账号档案</option>
            {candidates.map((profile) => <option key={profile.accountProfileId} value={profile.accountProfileId}>{profile.displayName}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-xs text-slate-600">确认新的当前登录账号
          <input aria-label={`${platform.displayName || platform.id}新账号名称`} value={drafts[platform.id] || ''} onChange={(event) => setDrafts((current) => ({ ...current, [platform.id]: event.target.value }))} placeholder="例如：机构主账号" maxLength={128} className="h-9 min-w-0 rounded border border-slate-300 px-2" />
        </label>
        <button type="button" disabled={busyPlatformId === platform.id || !(drafts[platform.id] || '').trim()} onClick={() => void confirm(platform.id)} className="h-9 rounded border border-blue-300 px-3 text-xs text-blue-700 disabled:opacity-40">{busyPlatformId === platform.id ? '确认中…' : '确认账号'}</button>
      </div>;
    })}
    {error && <div role="alert" className="rounded border border-rose-100 bg-rose-50 p-2 text-xs text-rose-700">{error}</div>}
  </div>;
}
