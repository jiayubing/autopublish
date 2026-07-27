import React, { useEffect, useMemo, useState } from 'react';
import type { ContentSubmissionPlatform } from '../../types';
import { usePlatformFeature } from '../../features/platform/platform-feature-context';

interface AccountProfileSelectorProps {
  platforms: ContentSubmissionPlatform[];
  targetPlatformIds: string[];
  value: Record<string, string>;
  onChange: (value: Record<string, string>) => void;
}

interface AccountProfileConfirmationInput {
  feature: {
    confirmAccountProfile(input: { platformId: string; displayName: string }): Promise<{ accountProfileId?: string } | undefined>;
  };
  platformId: string;
  displayName: string;
  value: Record<string, string>;
  onChange: (value: Record<string, string>) => void;
}

export async function confirmAccountProfileSelection({ feature, platformId, displayName, value, onChange }: AccountProfileConfirmationInput): Promise<boolean> {
  try {
    const profile = await feature.confirmAccountProfile({ platformId, displayName });
    if (!profile?.accountProfileId) return false;
    onChange({ ...value, [platformId]: profile.accountProfileId });
    return true;
  } catch (_) {
    // The platform feature owns the visible SafeOperationalError snapshot.
    return false;
  }
}

export default function AccountProfileSelector({ platforms, targetPlatformIds, value, onChange }: AccountProfileSelectorProps) {
  const { snapshot, feature } = usePlatformFeature();
  const profiles = snapshot.accountProfiles.items;
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const targets = useMemo(() => platforms.filter((platform) => targetPlatformIds.includes(platform.id)), [platforms, targetPlatformIds]);

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
    if (!displayName) return;
    const accepted = await confirmAccountProfileSelection({ feature, platformId, displayName, value, onChange });
    if (accepted) setDrafts((current) => ({ ...current, [platformId]: '' }));
  }

  if (!targets.length) return null;
  const busy = snapshot.commands.confirmAccountProfile.busy;
  const error = snapshot.commands.confirmAccountProfile.error?.userMessage || snapshot.accountProfiles.query.error?.userMessage;
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
        <button type="button" disabled={busy || !(drafts[platform.id] || '').trim()} onClick={() => void confirm(platform.id)} className="h-9 rounded border border-blue-300 px-3 text-xs text-blue-700 disabled:opacity-40">{busy ? '确认中…' : '确认账号'}</button>
      </div>;
    })}
    {error && <div role="alert" className="rounded border border-rose-100 bg-rose-50 p-2 text-xs text-rose-700">{error}</div>}
  </div>;
}
