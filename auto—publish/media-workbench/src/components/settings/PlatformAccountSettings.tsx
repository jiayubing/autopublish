import React, { useEffect, useMemo, useState } from "react";
import { useConfirmation } from "../../confirmation";
import { usePlatformFeature } from "../../features/platform/platform-feature-context";

export default function PlatformAccountSettings() {
  const { confirm } = useConfirmation();
  const { snapshot, feature } = usePlatformFeature();
  const platforms = snapshot.queue.platforms;
  const profiles = snapshot.accountProfiles.items;
  const [platformId, setPlatformId] = useState("");
  const [selectedProfileId, setSelectedProfileId] = useState("");
  const [draftName, setDraftName] = useState("机构主账号");

  useEffect(() => {
    void feature.refreshQueue("settings-platform-accounts").catch(() => undefined);
    void feature
      .refreshAccountProfiles("settings-platform-accounts")
      .catch(() => undefined);
    feature.clearAccountProfileFeedback();
    return () => feature.clearAccountProfileFeedback();
  }, [feature]);

  useEffect(() => {
    if (
      platformId &&
      platforms.some((platform) => platform.id === platformId)
    )
      return;
    setPlatformId(platforms[0]?.id || "");
  }, [platformId, platforms]);

  const target = useMemo(
    () => platforms.find((platform) => platform.id === platformId) || null,
    [platformId, platforms],
  );
  const candidates = useMemo(
    () => profiles.filter((profile) => profile.platformId === platformId),
    [platformId, profiles],
  );

  useEffect(() => {
    if (
      selectedProfileId &&
      candidates.some(
        (profile) => profile.accountProfileId === selectedProfileId,
      )
    )
      return;
    setSelectedProfileId(candidates[0]?.accountProfileId || "");
  }, [candidates, selectedProfileId]);

  const selected =
    candidates.find(
      (profile) => profile.accountProfileId === selectedProfileId,
    ) || null;
  const login = target ? snapshot.loginByPlatformId[target.id] : undefined;
  const createBusy = snapshot.commands.confirmAccountProfile.busy;
  const bindBusy = snapshot.commands.bindAccountProfile.busy;
  const deleteBusy = snapshot.commands.deleteAccountProfile.busy;
  const queueLoading = snapshot.queue.loading;
  const profileLoading = snapshot.accountProfiles.query.loading;
  const error =
    snapshot.commands.confirmAccountProfile.error?.userMessage ||
    snapshot.commands.bindAccountProfile.error?.userMessage ||
    snapshot.commands.deleteAccountProfile.error?.userMessage ||
    snapshot.accountProfiles.query.error?.userMessage ||
    snapshot.queue.error ||
    "";

  async function createProfile() {
    if (!target || !draftName.trim()) return;
    try {
      const profile = await feature.confirmAccountProfile({
        platformId: target.id,
        displayName: draftName.trim(),
      });
      if (profile?.accountProfileId)
        setSelectedProfileId(profile.accountProfileId);
    } catch (_) {
      // Platform feature owns the visible safe error snapshot.
    }
  }

  async function bindSelected() {
    if (!selectedProfileId) return;
    try {
      await feature.bindAccountProfile(selectedProfileId);
    } catch (_) {
      // Platform feature owns the visible safe error snapshot.
    }
  }

  async function deleteSelected() {
    if (!selected) return;
    const accepted = await confirm({
      title: "删除账号档案",
      message: `将删除“${selected.displayName}”这个平台账号档案及本机账号绑定。已有发布、订单和审计记录不会删除；若该档案仍有投稿队列或活动发布目标，系统会拒绝删除。`,
      confirmLabel: "删除档案",
      tone: "danger",
    });
    if (!accepted) return;
    try {
      const deletedId = await feature.deleteAccountProfile(
        selected.accountProfileId,
      );
      if (deletedId === selected.accountProfileId) setSelectedProfileId("");
    } catch (_) {
      // Platform feature owns the visible safe error snapshot.
    }
  }

  if (!platforms.length && !queueLoading) {
    return (
      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <h3 className="text-base font-semibold text-slate-800">平台账号</h3>
        <p className="mt-2 text-sm text-slate-500">
          当前没有可维护的普通投稿平台。
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-5">
      <div>
        <h3 className="text-base font-semibold text-slate-800">平台账号</h3>
        <p className="mt-1 text-sm leading-6 text-slate-500">
          在这里统一维护普通投稿平台的登录和账号绑定。发起投稿时只选择已绑定账号，不再承担登录维护。
        </p>
      </div>

      <label className="grid max-w-md gap-1 text-sm text-slate-600">
        投稿平台
        <select
          aria-label="平台账号投稿平台"
          value={platformId}
          onChange={(event) => {
            setPlatformId(event.target.value);
            setSelectedProfileId("");
          }}
          disabled={queueLoading}
          className="h-10 rounded border border-slate-300 bg-white px-3"
        >
          {platforms.map((platform) => (
            <option key={platform.id} value={platform.id}>
              {platform.displayName || platform.id}
            </option>
          ))}
        </select>
      </label>

      {target && (
        <>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-slate-800">
                  {target.displayName || target.id}
                </p>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  {target.loginAvailable
                    ? "先在平台完成登录并检查登录状态，再创建或绑定账号档案。"
                    : "该平台不使用浏览器登录；账号身份由对应服务配置验证。请先完成该平台的服务配置，再创建或绑定账号档案。"}
                </p>
              </div>
              {target.loginAvailable && (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={snapshot.commands.openLogin.busy || login?.busy}
                    onClick={() => void feature.openLogin(target.id)}
                    className="rounded border border-slate-300 bg-white px-3 py-2 text-xs font-semibold disabled:opacity-40"
                  >
                    打开登录页
                  </button>
                  <button
                    type="button"
                    disabled={snapshot.commands.checkLogin.busy || login?.busy}
                    onClick={() => void feature.checkLogin(target.id)}
                    className="rounded border border-slate-300 bg-white px-3 py-2 text-xs font-semibold disabled:opacity-40"
                  >
                    检查登录
                  </button>
                </div>
              )}
            </div>
            {target.loginAvailable && login?.message && (
              <p
                role="status"
                className={`mt-3 text-xs ${
                  login.authenticated === false
                    ? "text-amber-700"
                    : "text-slate-600"
                }`}
              >
                {login.message}
              </p>
            )}
          </div>

          <div className="grid gap-3 rounded-lg border border-slate-200 p-4">
            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end">
              <label className="grid gap-1 text-xs text-slate-600">
                已有账号档案
                <select
                  aria-label="已有平台账号档案"
                  value={selectedProfileId}
                  onChange={(event) =>
                    setSelectedProfileId(event.target.value)
                  }
                  disabled={profileLoading || !candidates.length}
                  className="h-9 min-w-0 rounded border border-slate-300 bg-white px-2"
                >
                  {!candidates.length && (
                    <option value="">尚无账号档案</option>
                  )}
                  {candidates.map((profile) => (
                    <option
                      key={profile.accountProfileId}
                      value={profile.accountProfileId}
                    >
                      {profile.displayName} ·{" "}
                      {profile.bindingStatus === "bound" ? "已绑定" : "未绑定"}
                    </option>
                  ))}
                </select>
              </label>

              <label className="grid gap-1 text-xs text-slate-600">
                新账号档案名称
                <input
                  aria-label="新平台账号档案名称"
                  value={draftName}
                  onChange={(event) => setDraftName(event.target.value)}
                  maxLength={128}
                  placeholder="例如：机构主账号"
                  className="h-9 min-w-0 rounded border border-slate-300 px-2"
                />
              </label>

              <button
                type="button"
                disabled={createBusy || !draftName.trim()}
                onClick={() => void createProfile()}
                className="h-9 rounded bg-blue-600 px-3 text-xs font-semibold text-white disabled:opacity-40"
              >
                {createBusy ? "创建中…" : "创建并绑定"}
              </button>
            </div>

            {selected && (
              <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
                <span
                  className={`rounded px-2 py-1 text-xs ${
                    selected.bindingStatus === "bound"
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-amber-50 text-amber-700"
                  }`}
                >
                  {selected.bindingStatus === "bound"
                    ? "已绑定远端账号"
                    : "未绑定远端账号"}
                </span>
                <span className="text-xs text-slate-500">
                  {selected.displayName}
                </span>
                {selected.bindingStatus !== "bound" && (
                  <button
                    type="button"
                    disabled={bindBusy || deleteBusy}
                    onClick={() => void bindSelected()}
                    className="rounded border border-amber-300 px-2 py-1 text-xs font-semibold text-amber-700 disabled:opacity-40"
                  >
                    {bindBusy ? "绑定中…" : "绑定当前账号"}
                  </button>
                )}
                <button
                  type="button"
                  disabled={deleteBusy || bindBusy}
                  onClick={() => void deleteSelected()}
                  className="rounded border border-rose-200 px-2 py-1 text-xs font-semibold text-rose-700 disabled:opacity-40"
                >
                  {deleteBusy ? "删除中…" : "删除档案"}
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {error && (
        <p
          role="alert"
          className="rounded border border-rose-100 bg-rose-50 p-3 text-sm text-rose-700"
        >
          {error}
        </p>
      )}
    </section>
  );
}
