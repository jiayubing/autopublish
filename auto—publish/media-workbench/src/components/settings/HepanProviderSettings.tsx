import React, { useEffect, useState } from "react";
import type { HepanProviderStatus } from "../../types/settings";
import { useConfirmation } from "../../confirmation";
import { formatBeijingTime } from "../../time-format";
import { useSettingsFeature } from "../../features/settings/settings-context";

const EMPTY: HepanProviderStatus = {
  source: "application",
  configured: false,
  uid: 0,
  uidConfigured: false,
  passwordConfigured: false,
  apiUrl: "https://www.hepan.com/geoapi/api.php",
  lastTest: null,
};

function checkedAt(value: string): string {
  return `${formatBeijingTime(value)}（北京时间）`;
}

type HepanPatch = {
  uid?: number;
  password?: string;
};

export default function HepanProviderSettings() {
  const { confirm } = useConfirmation();
  const { feature, snapshot } = useSettingsFeature();
  const status = (snapshot.hepan.data || EMPTY) as HepanProviderStatus;
  const [uid, setUid] = useState(0);
  const [password, setPassword] = useState("");
  const [localError, setLocalError] = useState("");
  const loading = snapshot.hepan.query.loading;
  const saving = snapshot.commands.saveHepan.busy;
  const testing = snapshot.commands.testHepan.busy;
  const clearing = snapshot.commands.clearHepan.busy;
  const operationBusy = saving || testing || clearing;
  const error =
    localError ||
    snapshot.hepan.query.error?.userMessage ||
    snapshot.commands.saveHepan.error?.userMessage ||
    snapshot.commands.testHepan.error?.userMessage ||
    snapshot.commands.clearHepan.error?.userMessage;
  const notice = snapshot.commands.saveHepan.result
    ? "蓝色河畔 GEO API 配置已保存。"
    : snapshot.commands.testHepan.result
      ? "账号、套餐和剩余额度检查成功；测试输入未保存。"
      : snapshot.commands.clearHepan.result
        ? "蓝色河畔配置已清除。"
        : "";

  useEffect(() => {
    if (!snapshot.hepan.data) return;
    setUid(Number.isInteger(status.uid) ? status.uid : 0);
    setPassword("");
  }, [snapshot.hepan.data, status.uid]);

  function draft(): HepanPatch {
    const patch: HepanPatch = {};
    if (Number.isInteger(uid) && uid > 0) patch.uid = uid;
    if (password) patch.password = password;
    return patch;
  }

  function validate(): boolean {
    if (!Number.isInteger(uid) || uid < 1) {
      setLocalError("请输入有效的蓝色河畔用户 ID。");
      return false;
    }
    if (!password && !status.passwordConfigured) {
      setLocalError("请输入蓝色河畔登录密码。");
      return false;
    }
    return true;
  }

  async function save() {
    setLocalError("");
    if (!validate()) return;
    await feature.saveHepan(draft());
  }

  async function test() {
    setLocalError("");
    if (!validate()) return;
    if (
      !(await confirm({
        title: "测试蓝色河畔 GEO API",
        message:
          "测试只会查询账户状态、套餐和剩余额度，不会发布文章或消耗发帖额度。",
        confirmLabel: "开始测试",
        tone: "default",
      }))
    )
      return;
    await feature.testHepan(draft());
  }

  async function clear() {
    setLocalError("");
    if (
      !(await confirm({
        title: "清除蓝色河畔配置",
        message: "清除后将删除应用级 UID 和加密保存的登录密码。",
        confirmLabel: "清除配置",
        tone: "danger",
      }))
    )
      return;
    await feature.clearHepan();
  }

  const readOnly = status.source === "environment";
  const disabled = operationBusy || loading || readOnly;

  return (
    <section
      aria-labelledby="hepan-provider-settings-title"
      className="min-w-0 space-y-4 rounded-lg border border-slate-200 bg-white p-5"
    >
      <div>
        <h3 id="hepan-provider-settings-title" className="text-base font-semibold text-slate-800">
          蓝色河畔 GEO API
        </h3>
        <p className="mt-1 text-sm text-slate-500">
          使用蓝色河畔官方 GEO 发帖 API。登录密码加密保存；测试只查询账户状态，不会发布文章。
        </p>
      </div>
      <div className="min-w-0 rounded-md border border-blue-100 bg-blue-50 p-3 text-xs text-blue-900">
        API：{status.apiUrl} · 配置来源：{readOnly ? "环境变量覆盖（只读）" : "应用级加密存储"}
      </div>
      <div className="grid min-w-0 gap-3">
        <label className="grid min-w-0 gap-1 text-sm font-medium text-slate-700">
          用户 ID（UID）
          <input
            aria-label="蓝色河畔用户 ID"
            type="number"
            min={1}
            step={1}
            value={uid || ""}
            onChange={(event) => setUid(Number(event.target.value))}
            placeholder="例如 12345"
            disabled={disabled}
            className="min-w-0 rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="grid min-w-0 gap-1 text-sm font-medium text-slate-700">
          登录密码
          <input
            aria-label="蓝色河畔登录密码"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder={status.passwordConfigured ? "已配置（留空保留）" : "请输入登录密码"}
            autoComplete="new-password"
            disabled={disabled}
            className="min-w-0 rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
      </div>
      <p className="text-xs text-slate-500">
        UID：{status.uidConfigured ? "已配置" : "未配置"} · 密码：
        {status.passwordConfigured ? "已配置" : "未配置"} · 最近测试：
        {status.lastTest ? (status.lastTest.ok ? "成功" : "失败") : "尚未测试"}
      </p>
      {status.lastTest && (
        <div className="grid gap-1 text-xs text-slate-600" aria-label="蓝色河畔 GEO API 检查结果">
          <p>检查时间：{checkedAt(status.lastTest.testedAt)}</p>
          {status.lastTest.account && (
            <p>账号：{status.lastTest.account.displayName}（UID {status.lastTest.account.uid}）</p>
          )}
          {status.lastTest.planName && <p>套餐：{status.lastTest.planName}</p>}
          {status.lastTest.postLimit !== undefined && (
            <p>
              本期额度：{status.lastTest.postLimit} · 已使用：{status.lastTest.usedCount ?? "-"} · 剩余：
              {status.lastTest.remainingCount ?? "-"}
            </p>
          )}
          <p>检查代码：{status.lastTest.code}</p>
        </div>
      )}
      <p className="text-xs text-slate-500">
        当前第一阶段只发布文字。图片仍保留本地选图能力，后续通过公网 HTTPS 图片地址接入蓝色河畔 BBCode。
      </p>
      {error && <p role="alert" aria-live="assertive" className="text-sm text-rose-700">{error}</p>}
      {notice && <p role="status" aria-live="polite" className="text-sm text-emerald-700">{notice}</p>}
      <div className="flex min-w-0 flex-wrap gap-2">
        <button type="button" onClick={() => void save()} disabled={disabled} className="rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">
          保存配置
        </button>
        <button type="button" onClick={() => void test()} disabled={disabled} className="rounded-md border border-slate-300 px-3 py-2 text-sm disabled:opacity-50">
          测试账户
        </button>
        <button type="button" onClick={() => void clear()} disabled={disabled} className="rounded-md border border-rose-300 px-3 py-2 text-sm text-rose-700 disabled:opacity-50">
          清除配置
        </button>
      </div>
    </section>
  );
}
