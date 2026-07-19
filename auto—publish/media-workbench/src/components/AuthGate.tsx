import React, { FormEvent, useState } from "react";
import { AuthProvider, useAuth } from "../auth-store";
// getAuthState is called by auth-store before any workspace component mounts.

const AUTH_ERROR_MESSAGES: Record<string, string> = {
  AUTH_ACCOUNT_DISABLED: "账号已禁用",
  AUTH_ACCOUNT_LOCKED: "登录失败次数过多，请稍后重试",
  AUTH_LICENSE_EXPIRED: "AutoPublish 授权已到期，请联系管理员续期",
  AUTH_NOT_ENTITLED: "当前账号没有 AutoPublish 使用授权",
  AUTH_DEVICE_LIMIT_REACHED: "设备名额已用满，请联系管理员释放旧设备",
  AUTH_DEVICE_REVOKED: "当前设备已被撤销，请联系管理员重新授权",
  AUTH_RATE_LIMITED: "请求过于频繁，请稍后重试",
  AUTH_SERVICE_UNAVAILABLE: "认证服务暂时不可达，请检查网络后重试",
};

function LoginView() {
  const auth = useAuth();
  const [loginName, setLoginName] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const authState = auth.getState();
  const [changingPassword, setChangingPassword] = useState(authState.errorCode === "AUTH_PASSWORD_CHANGE_REQUIRED");
  const initialError = authState.errorCode && !changingPassword ? (AUTH_ERROR_MESSAGES[authState.errorCode] || "认证服务暂时不可用，请稍后重试") : "";

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
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
      setError(value instanceof Error ? value.message : "登录失败，请重试");
    }
    finally { setSubmitting(false); }
  }

  return (
    <main className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
      <section className="w-full max-w-sm rounded-2xl border border-slate-800 bg-slate-900 p-7 shadow-2xl">
        <h1 className="text-xl font-bold text-white">Auto Publish</h1>
        <p className="mt-2 text-sm text-slate-400">登录后才能使用工作区和投稿功能</p>
        <form onSubmit={submit} className="mt-6 space-y-4">
          <label className="block text-sm text-slate-300">登录名<input aria-label="登录名" autoComplete="username" value={loginName} onChange={(event) => setLoginName(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none" /></label>
          <label className="block text-sm text-slate-300">{changingPassword ? "临时密码" : "密码"}<input aria-label={changingPassword ? "临时密码" : "密码"} type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none" /></label>
          {changingPassword && <>
            <p className="rounded-lg border border-amber-900 bg-amber-950/40 p-3 text-xs text-amber-200">这是管理员设置的一次性密码，请先设置新的登录密码。</p>
            <label className="block text-sm text-slate-300">新密码<input aria-label="新密码" type="password" autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none" /></label>
            <label className="block text-sm text-slate-300">确认新密码<input aria-label="确认新密码" type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none" /></label>
          </>}
          {(error || initialError) && <p role="alert" className="rounded-lg border border-rose-900 bg-rose-950/50 p-3 text-xs text-rose-300">{error || initialError}</p>}
          <button type="submit" disabled={submitting || !loginName || !password || (changingPassword && (!newPassword || !confirmPassword))} className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{submitting ? "验证中…" : changingPassword ? "设置密码并登录" : "登录"}</button>
          {changingPassword && <button type="button" onClick={() => { setChangingPassword(false); setError(""); }} className="w-full text-xs text-slate-400">返回普通登录</button>}
        </form>
        <p className="mt-5 text-[11px] text-slate-500">认证服务：auth.jiayubing.xyz（固定安全连接）</p>
      </section>
    </main>
  );
}

function AuthGateContent({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  const state = auth.getState();
  if (!state || (!state.authenticated && state.errorCode === undefined)) return <div className="min-h-screen flex items-center justify-center text-slate-600">正在验证登录状态…</div>;
  if (!state.authenticated) return <LoginView />;
  const entitlement = state.entitlements.find((item) => item.product === "AutoPublish");
  const expiry = entitlement?.expiresAt ? new Date(entitlement.expiresAt).toLocaleDateString("zh-CN") : "永久";
  const device = state.device;
  return <>
    <div aria-label="授权状态" className="pointer-events-none fixed right-4 top-3 z-50 rounded-lg border border-slate-200 bg-white/90 px-3 py-1.5 text-[11px] text-slate-600 shadow-sm backdrop-blur">
      授权：{expiry} · 设备：{device?.deviceCount ?? 0}/{device?.maxDevices ?? "-"}
    </div>
    {children}
  </>;
}

export default function AuthGate({ children }: { children: React.ReactNode }) {
  return <AuthProvider><AuthGateContent>{children}</AuthGateContent></AuthProvider>;
}
