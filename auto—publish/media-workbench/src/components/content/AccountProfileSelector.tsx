import React, { useEffect, useMemo, useState } from 'react';
import type { ContentSubmissionPlatform } from '../../types/publication';
import { usePlatformFeature } from '../../features/platform/platform-feature-context';
import { useConfirmation } from '../../confirmation';

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
  const { confirm } = useConfirmation();
  const { snapshot, feature } = usePlatformFeature();
  const profiles = snapshot.accountProfiles.items;
  const [draft, setDraft] = useState('');
  const target = useMemo(() => platforms.find((platform) => platform.id === platformId) || null, [platforms, platformId]);

  useEffect(() => {
    feature.clearAccountProfileFeedback();
    return () => feature.clearAccountProfileFeedback();
  }, [feature]);

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

  async function createProfile() {
    const displayName = draft.trim();
    if (!displayName) return;
    const accepted = await confirmAccountProfileSelection({ feature, platformId, displayName, onChange });
    if (accepted) setDraft('');
  }

  async function bindSelected() {
    if (!value) return;
    try {
      await feature.bindAccountProfile(value);
    } catch (_) {
      // The platform feature owns the visible SafeOperationalError snapshot.
    }
  }

  async function deleteSelected() {
    if (!value) return;
    const selected = profiles.find((profile) => profile.accountProfileId === value);
    if (!selected) return;
    const accepted = await confirm({
      title: '删除账号档案',
      message: `将删除“${selected.displayName}”这个平台账号档案及本机账号绑定。已有发布、订单和审计记录不会删除；若该档案仍有投稿队列或活动发布目标，系统会拒绝删除。`,
      confirmLabel: '删除档案',
      tone: 'danger',
    });
    if (!accepted) return;
    try {
      const deletedId = await feature.deleteAccountProfile(value);
      if (deletedId === value) onChange('');
    } catch (_) {
      // The platform feature owns the visible SafeOperationalError snapshot.
    }
  }

  if (!target) return null;
  const createBusy = snapshot.commands.confirmAccountProfile.busy;
  const bindBusy = snapshot.commands.bindAccountProfile.busy;
  const deleteBusy = snapshot.commands.deleteAccountProfile.busy;
  const error = snapshot.commands.confirmAccountProfile.error?.userMessage
    || snapshot.commands.bindAccountProfile.error?.userMessage
    || snapshot.commands.deleteAccountProfile.error?.userMessage
    || snapshot.accountProfiles.query.error?.userMessage;
  const candidates = profiles.filter((profile) => profile.platformId === target.id);
  const selected = candidates.find((profile) => profile.accountProfileId === value) || null;
  const login = snapshot.loginByPlatformId[target.id];
  return <div className="grid w-full gap-2 border-t border-slate-200 pt-2">
    <p className="text-xs text-slate-500">账号档案会显式绑定当前平台登录身份。新建或绑定前先登录并执行“检查登录”；投稿时只核验已有绑定，不会自动创建或改绑账号。</p>
    <div className="grid min-w-0 gap-2 rounded border border-slate-200 bg-white p-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
      <label className="grid gap-1 text-xs text-slate-600">{target.displayName || target.id}账号档案
        <select aria-label={`${target.displayName || target.id}账号档案`} value={value || ''} onChange={(event) => onChange(event.target.value)} className="h-9 min-w-0 rounded border border-slate-300 px-2">
          <option value="">请选择账号档案</option>
          {candidates.map((profile) => <option key={profile.accountProfileId} value={profile.accountProfileId}>{profile.displayName} · {profile.bindingStatus === 'bound' ? '已绑定' : '未绑定'}</option>)}
        </select>
      </label>
      <label className="grid gap-1 text-xs text-slate-600">新账号档案名称
        <input aria-label={`${target.displayName || target.id}新账号名称`} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="例如：机构主账号" maxLength={128} className="h-9 min-w-0 rounded border border-slate-300 px-2" />
      </label>
      <div className="flex flex-wrap gap-1">
        <button type="button" disabled={snapshot.commands.openLogin.busy || login?.busy} onClick={() => void feature.openLogin(target.id)} className="h-9 rounded border border-slate-300 px-2 text-xs disabled:opacity-40">打开登录页</button>
        <button type="button" disabled={snapshot.commands.checkLogin.busy || login?.busy} onClick={() => void feature.checkLogin(target.id)} className="h-9 rounded border border-slate-300 px-2 text-xs disabled:opacity-40">检查登录</button>
        <button type="button" disabled={createBusy || !draft.trim()} onClick={() => void createProfile()} className="h-9 rounded border border-blue-300 px-3 text-xs text-blue-700 disabled:opacity-40">{createBusy ? '创建中…' : '创建并绑定'}</button>
      </div>
      {selected && <div className="flex flex-wrap items-center gap-2 sm:col-span-3">
        <span className={`rounded px-2 py-1 text-xs ${selected.bindingStatus === 'bound' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{selected.bindingStatus === 'bound' ? '已绑定远端账号' : '未绑定远端账号'}</span>
        {selected.bindingStatus !== 'bound' && <span className="text-xs text-amber-700">未绑定档案不能加入投稿队列。</span>}
        {selected.bindingStatus !== 'bound' && <button type="button" disabled={bindBusy || deleteBusy} onClick={() => void bindSelected()} className="h-8 rounded border border-amber-300 px-2 text-xs text-amber-700 disabled:opacity-40">{bindBusy ? '绑定中…' : '绑定当前账号'}</button>}
        <button type="button" disabled={deleteBusy || bindBusy} onClick={() => void deleteSelected()} className="h-8 rounded border border-rose-200 px-2 text-xs text-rose-700 disabled:opacity-40">{deleteBusy ? '删除中…' : '删除档案'}</button>
      </div>}
      {login?.message && <p className="text-xs text-slate-500 sm:col-span-3">{login.message}</p>}
    </div>
    {error && <div role="alert" className="rounded border border-rose-100 bg-rose-50 p-2 text-xs text-rose-700">{error}</div>}
  </div>;
}
