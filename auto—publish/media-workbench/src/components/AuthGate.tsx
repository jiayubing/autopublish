import React, { FormEvent, useState } from "react";
import { AuthProvider, useAuth } from "../auth-store";
// getAuthState is called by auth-store before any workspace component mounts.

function LoginView() {
  const auth = useAuth();
  const [loginName, setLoginName] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const initialError = auth.getState().errorCode ? "认证服务暂时不可达，请检查网络后重试" : "";

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError("");
    try { await auth.login(loginName, password); setPassword(""); }
    catch (value: unknown) { setError(value instanceof Error ? value.message : "登录失败，请重试"); }
    finally { setSubmitting(false); }
  }

  return (
    <main className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
      <section className="w-full max-w-sm rounded-2xl border border-slate-800 bg-slate-900 p-7 shadow-2xl">
        <h1 className="text-xl font-bold text-white">Auto Publish</h1>
        <p className="mt-2 text-sm text-slate-400">登录后才能使用工作区和投稿功能</p>
        <form onSubmit={submit} className="mt-6 space-y-4">
          <label className="block text-sm text-slate-300">登录名<input aria-label="登录名" autoComplete="username" value={loginName} onChange={(event) => setLoginName(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none" /></label>
          <label className="block text-sm text-slate-300">密码<input aria-label="密码" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none" /></label>
          {(error || initialError) && <p role="alert" className="rounded-lg border border-rose-900 bg-rose-950/50 p-3 text-xs text-rose-300">{error || initialError}</p>}
          <button type="submit" disabled={submitting || !loginName || !password} className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{submitting ? "验证中…" : "登录"}</button>
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
  return state.authenticated ? <>{children}</> : <LoginView />;
}

export default function AuthGate({ children }: { children: React.ReactNode }) {
  return <AuthProvider><AuthGateContent>{children}</AuthGateContent></AuthProvider>;
}
