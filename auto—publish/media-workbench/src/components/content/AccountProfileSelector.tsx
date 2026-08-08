import React, { useEffect, useMemo, useState } from 'react';
import type { ContentSubmissionPlatform } from '../../types/publication';
import { usePlatformFeature } from '../../features/platform/platform-feature-context';

interface AccountProfileSelectorProps {
  platforms: ContentSubmissionPlatform[];
  platformId: string;
  value: string;
  onChange: (value: string) => void;
}

interface AccountProfileConfirmationInput {
  feature: {
    confirmAccountProfile(input: { platformId: string; displayName: string }): Promise<{ accountProfileId?: string } | undefined>;
  };
  platformId: string;
  displayName: string;
  onChange: (value: string) => void;
}

export async function confirmAccountProfileSelection({ feature, platformId, displayName, onChange }: AccountProfileConfirmationInput): Promise<boolean> {
  try {
    const profile = await feature.confirmAccountProfile({ platformId, displayName });
    if (!profile?.accountProfileId) return false;
    onChange(profile.accountProfileId);
    return true;
  } catch (_) {
    // The platform feature owns the visible SafeOperationalError snapshot.
    return false;
  }
}

export default function AccountProfileSelector({ platforms, platformId, value, onChange }: AccountProfileSelectorProps) {
  const { snapshot, feature } = usePlatformFeature();
  const profiles = snapshot.accountProfiles.items;
  const [draft, setDraft] = useState('');
  const target = useMemo(() => platforms.find((platform) => platform.id === platformId) || null, [platforms, platformId]);

  useEffect(() => {
    if (!target) {
      if (value) onChange('');
      return;
    }
    const candidates = profiles.filter((profile) => profile.platformId === target.id);
    if (value && candidates.some((profile) => profile.accountProfileId === value)) return;
    if (candidates.length === 1) {
      onChange(candidates[0].accountProfileId);
      return;
    }
    if (value) onChange('');
  }, [profiles, target, value, onChange]);

  async function confirm() {
    const displayName = draft.trim();
    if (!displayName) return;
    const accepted = await confirmAccountProfileSelection({ feature, platformId, displayName, onChange });
    if (accepted) setDraft('');
  }

  if (!target) return null;
  const busy = snapshot.commands.confirmAccountProfile.busy;
  const error = snapshot.commands.confirmAccountProfile.error?.userMessage || snapshot.accountProfiles.query.error?.userMessage;
  const candidates = profiles.filter((profile) => profile.platformId === target.id);
  const login = snapshot.loginByPlatformId[target.id];
  return <div className="grid w-full gap-2 border-t border-slate-200 pt-2">
    <p className="text-xs text-slate-500">为当前投稿平台选择一个已确认的账号；换号时请新建档案，旧队列不会自动改投。</p>
    <div className="grid min-w-0 gap-2 rounded border border-slate-200 bg-white p-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
      <label className="grid gap-1 text-xs text-slate-600">{target.displayName || target.id}账号档案
        <select aria-label={`${target.displayName || target.id}账号档案`} value={value || ''} onChange={(event) => onChange(event.target.value)} className="h-9 min-w-0 rounded border border-slate-300 px-2">
          <option value="">请选择账号档案</option>
          {candidates.map((profile) => <option key={profile.accountProfileId} value={profile.accountProfileId}>{profile.displayName}</option>)}
        </select>
      </label>
      <label className="grid gap-1 text-xs text-slate-600">确认新的当前登录账号
        <input aria-label={`${target.displayName || target.id}新账号名称`} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="例如：机构主账号" maxLength={128} className="h-9 min-w-0 rounded border border-slate-300 px-2" />
      </label>
      <div className="flex flex-wrap gap-1">
        <button type="button" disabled={snapshot.commands.openLogin.busy || login?.busy} onClick={() => void feature.openLogin(target.id)} className="h-9 rounded border border-slate-300 px-2 text-xs disabled:opacity-40">打开登录页</button>
        <button type="button" disabled={snapshot.commands.checkLogin.busy || login?.busy} onClick={() => void feature.checkLogin(target.id)} className="h-9 rounded border border-slate-300 px-2 text-xs disabled:opacity-40">检查登录</button>
        <button type="button" disabled={busy || !draft.trim()} onClick={() => void confirm()} className="h-9 rounded border border-blue-300 px-3 text-xs text-blue-700 disabled:opacity-40">{busy ? '确认中…' : '确认账号'}</button>
      </div>
      {login?.message && <p className="text-xs text-slate-500 sm:col-span-3">{login.message}</p>}
    </div>
    {error && <div role="alert" className="rounded border border-rose-100 bg-rose-50 p-2 text-xs text-rose-700">{error}</div>}
  </div>;
}
