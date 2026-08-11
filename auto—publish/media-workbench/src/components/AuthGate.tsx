import React, { FormEvent, useState } from "react";
import { AuthProvider, useAuth } from "../auth-store";
import authContract from "../../../src/contracts/auth-contract.json";
import { reportRuntimeDiagnostic } from "../features/workspace/runtime-diagnostic-sink";
// getAuthState is called by auth-store before any workspace component mounts.

const AUTH_ERROR_MESSAGES: Record<string, string> = authContract.messages;

function LoginView() {
  const auth = useAuth();
  const [loginName, setLoginName] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const authSnapshot = auth.getSnapshot();
  const authState = authSnapshot.state;
  const [changingPassword, setChangingPassword] = useState(authState.errorCode === "AUTH_PASSWORD_CHANGE_REQUIRED");
  const command = changingPassword ? authSnapshot.commands.changePassword : authSnapshot.commands.login;
  const initialError = authState.errorCode && !changingPassword ? (AUTH_ERROR_MESSAGES[authState.errorCode] || "认证服务暂时不可用，请稍后重试") : "";
  const visibleError = error || command.error?.userMessage || authSnapshot.query.error?.userMessage || initialError;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (command.busy) return;
    setError("");
    try {
      if (changingPassword) {
        if (newPassword.length < 6 || newPassword !== confirmPassword) {
          setError("新密码至少需要 6 个字符，且两次输入必须一致");
          return;
        }
        await auth.changePassword(loginName || authState.pendingLoginName || "", password, newPassword);
        setPassword(""); setNewPassword(""); setConfirmPassword("");
      } else {
        await auth.login(loginName, password);
        setPassword("");
      }
    } catch (value: unknown) {
      const code = value && typeof value === "object" && "code" in value ? String((value as { code?: unknown }).code || "") : "";
      if (code === "AUTH_PASSWORD_CHANGE_REQUIRED") setChangingPassword(true);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
      <section className="w-full max-w-sm rounded-2xl border border-slate-800 bg-slate-900 p-7 shadow-2xl">
        <h1 className="text-2xl font-bold text-white">ETO—001</h1>
        <p className="text-xs text-slate-300">Auto Publish</p>
        <p className="mt-2 text-sm text-slate-400">登录后才能使用工作区和投稿功能</p>
        <form onSubmit={submit} className="mt-6 space-y-4">
          <label className="block text-sm text-slate-300">登录名<input aria-label="登录名" autoComplete="username" value={loginName} onChange={(event) => setLoginName(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none" /></label>
          <label className="block text-sm text-slate-300">{changingPassword ? "临时密码" : "密码"}<input aria-label={changingPassword ? "临时密码" : "密码"} type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none" /></label>
          {changingPassword && <>
            <p className="rounded-lg border border-amber-900 bg-amber-950/40 p-3 text-xs text-amber-200">这是管理员设置的一次性密码，请先设置新的登录密码。</p>
            <label className="block text-sm text-slate-300">新密码<input aria-label="新密码" type="password" autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none" /></label>
            <label className="block text-sm text-slate-300">确认新密码<input aria-label="确认新密码" type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none" /></label>
          </>}
          {visibleError && <p role="alert" className="rounded-lg border border-rose-900 bg-rose-950/50 p-3 text-xs text-rose-300">{visibleError}</p>}
          <button type="submit" disabled={command.busy || !loginName || !password || (changingPassword && (!newPassword || !confirmPassword))} className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{command.busy ? "验证中…" : changingPassword ? "设置密码并登录" : "登录"}</button>
          {changingPassword && <button type="button" onClick={() => { setChangingPassword(false); setError(""); }} className="w-full text-xs text-slate-400">返回普通登录</button>}
        </form>
        <p className="mt-5 text-[11px] text-slate-500">认证服务：auth.jiayubing.xyz（固定安全连接）</p>
      </section>
    </main>
  );
}

function AuthGateContent({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  const authSnapshot = auth.getSnapshot();
  const state = authSnapshot.state;
  if (authSnapshot.query.loading && !state.authenticated) return <div className="min-h-screen flex items-center justify-center text-slate-600">正在验证登录状态…</div>;
  const recoverable = state.sessionStatus === "recovering" && Boolean(state.user);
  if (!state.authenticated && !recoverable) return <LoginView />;
  const entitlement = state.entitlements.find((item) => item.product === "AutoPublish");
  const expiry = entitlement?.expiresAt ? new Date(entitlement.expiresAt).toLocaleDateString("zh-CN") : "永久";
  const device = state.device;
  const logoutCommand = authSnapshot.commands.logout;
  return <div className="flex h-screen min-h-0 flex-col overflow-hidden">
    <div aria-label="授权状态" className="shrink-0 border-b border-slate-200 bg-white px-4 py-1.5 text-[11px] text-slate-600">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <span>授权：{expiry} · 设备：{device?.deviceCount ?? 0}/{device?.maxDevices ?? "-"}</span>
        <div className="flex flex-wrap items-center gap-3">
          {state.sessionStatus === "recovering" && <span role="status" className="text-amber-800">授权连接恢复中：{state.errorCode ? (AUTH_ERROR_MESSAGES[state.errorCode] || state.errorCode) : "网络恢复后将自动续期，无需重新登录"}</span>}
          {logoutCommand.error && <span role="alert" className="text-rose-700">{logoutCommand.error.userMessage}</span>}
          <button type="button" onClick={() => { void auth.logout().catch(() => { reportRuntimeDiagnostic("AUTH_LOGOUT_FAILED", "workspace-invalidation"); }); }} disabled={logoutCommand.busy} className="rounded border border-slate-300 px-2 py-1 text-[11px] text-slate-600 disabled:opacity-50">{logoutCommand.busy ? "退出中…" : "退出登录"}</button>
        </div>
      </div>
    </div>
    <div className="min-h-0 flex-1">{children}</div>
  </div>;
}

export default function AuthGate({ children }: { children: React.ReactNode }) {
  return <AuthProvider><AuthGateContent>{children}</AuthGateContent></AuthProvider>;
}
