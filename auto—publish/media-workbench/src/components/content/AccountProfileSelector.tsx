import React, { useEffect, useMemo } from "react";
import type { ContentSubmissionPlatform } from "../../types/publication";
import { usePlatformFeature } from "../../features/platform/platform-feature-context";

interface AccountProfileSelectorProps {
  platforms: ContentSubmissionPlatform[];
  platformId: string;
  value: string;
  onChange: (value: string) => void;
}

export default function AccountProfileSelector({
  platforms,
  platformId,
  value,
  onChange,
}: AccountProfileSelectorProps) {
  const { snapshot } = usePlatformFeature();
  const profiles = snapshot.accountProfiles.items;
  const target = useMemo(
    () => platforms.find((platform) => platform.id === platformId) || null,
    [platforms, platformId],
  );
  const boundCandidates = useMemo(
    () =>
      profiles.filter(
        (profile) =>
          profile.platformId === platformId &&
          profile.bindingStatus === "bound",
      ),
    [platformId, profiles],
  );
  const unboundCount = profiles.filter(
    (profile) =>
      profile.platformId === platformId && profile.bindingStatus !== "bound",
  ).length;


  useEffect(() => {
    if (!target) {
      if (value) onChange("");
      return;
    }
    if (
      value &&
      boundCandidates.some((profile) => profile.accountProfileId === value)
    )
      return;
    if (boundCandidates.length === 1) {
      onChange(boundCandidates[0].accountProfileId);
      return;
    }
    if (value) onChange("");
  }, [boundCandidates, onChange, target, value]);

  if (!target) return null;

  const selected =
    boundCandidates.find((profile) => profile.accountProfileId === value) ||
    null;
  const loading = snapshot.accountProfiles.query.loading;
  const error = snapshot.accountProfiles.query.error?.userMessage || "";

  if (loading && !profiles.length) {
    return (
      <div className="rounded border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
        正在读取投稿账号…
      </div>
    );
  }

  if (!boundCandidates.length) {
    return (
      <div className="rounded border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800">
        <p className="font-semibold">
          {target.displayName || target.id} 尚无可用的已绑定账号
        </p>
        <p className="mt-1">
          请前往“设置 → 平台账号”完成登录或账号绑定后再投稿。
          {unboundCount
            ? ` 当前已有 ${unboundCount} 个未绑定档案。`
            : ""}
        </p>
        {error && <p className="mt-1 text-rose-700">{error}</p>}
      </div>
    );
  }

  if (boundCandidates.length === 1) {
    const profile = boundCandidates[0];
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs">
        <span className="text-slate-600">投稿账号</span>
        <span className="font-semibold text-emerald-700">
          {profile.displayName} · 已绑定
        </span>
      </div>
    );
  }

  return (
    <label className="grid gap-1 text-xs text-slate-600">
      投稿账号
      <select
        aria-label={`${target.displayName || target.id}投稿账号`}
        value={selected?.accountProfileId || ""}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 min-w-0 rounded border border-slate-300 bg-white px-2 text-sm"
      >
        <option value="">请选择账号</option>
        {boundCandidates.map((profile) => (
          <option key={profile.accountProfileId} value={profile.accountProfileId}>
            {profile.displayName}
          </option>
        ))}
      </select>
      <span className="text-[11px] text-slate-400">
        登录和账号绑定请在“设置 → 平台账号”维护。
      </span>
    </label>
  );
}
