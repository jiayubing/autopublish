import React, { useEffect, useState } from "react";
import type { HepanProviderStatus } from "../../types/settings";
import { useConfirmation } from "../../confirmation";
import { formatBeijingTime } from "../../time-format";
import { useSettingsFeature } from "../../features/settings/settings-context";

const EMPTY: HepanProviderStatus = {
  source: "application",
  configured: false,
  pythonConfigured: false,
  cookieConfigured: false,
  categoryId: 0,
  vendorConfigured: false,
  siteOrigin: "",
  publishIntervalSeconds: 0,
  lastTest: null,
};

function checkedAt(value: string): string {
  return `${formatBeijingTime(value)}（北京时间）`;
}

type HepanPatch = {
  pythonPath?: string;
  cookie?: string;
  categoryId: number;
  vendorDir?: string;
  clearVendorDir?: true;
  publishIntervalSeconds: number;
};

export default function HepanProviderSettings() {
  const { confirm } = useConfirmation();
  const { feature, snapshot } = useSettingsFeature();
  const status = (snapshot.hepan.data || EMPTY) as HepanProviderStatus;
  const [pythonPath, setPythonPath] = useState("");
  const [cookie, setCookie] = useState("");
  const [categoryId, setCategoryId] = useState(EMPTY.categoryId);
  const [vendorDir, setVendorDir] = useState("");
  const [publishIntervalSeconds, setPublishIntervalSeconds] = useState(
    EMPTY.publishIntervalSeconds,
  );
  const [localError, setLocalError] = useState("");
  const loading = snapshot.hepan.query.loading;
  const saving = snapshot.commands.saveHepan.busy;
  const testing = snapshot.commands.testHepan.busy;
  const clearingVendor = snapshot.commands.clearHepanVendor.busy;
  const clearing = snapshot.commands.clearHepan.busy;
  const operationBusy = saving || testing || clearingVendor || clearing;
  const error =
    localError ||
    snapshot.hepan.query.error?.userMessage ||
    snapshot.commands.saveHepan.error?.userMessage ||
    snapshot.commands.testHepan.error?.userMessage ||
    snapshot.commands.clearHepanVendor.error?.userMessage ||
    snapshot.commands.clearHepan.error?.userMessage;
  const notice = snapshot.commands.saveHepan.result
    ? "蓝色河畔配置已保存，未填写的字段保持原值。"
    : snapshot.commands.testHepan.result
      ? "Python、依赖和登录检查成功；测试输入未保存。"
      : snapshot.commands.clearHepanVendor.result
        ? "已清除自定义 vendor 目录，后续测试将使用系统环境。"
        : snapshot.commands.clearHepan.result
          ? "蓝色河畔配置已清除。"
          : "";

  useEffect(() => {
    if (!snapshot.hepan.data) return;
    setCategoryId(
      Number.isInteger(status.categoryId)
        ? status.categoryId
        : EMPTY.categoryId,
    );
    setPublishIntervalSeconds(
      Number.isInteger(status.publishIntervalSeconds)
        ? status.publishIntervalSeconds
        : EMPTY.publishIntervalSeconds,
    );
    setPythonPath("");
    setCookie("");
    setVendorDir("");
  }, [snapshot.hepan.data, status]);

  function draft(): HepanPatch {
    const patch: HepanPatch = {
      categoryId: Number(categoryId),
      publishIntervalSeconds: Number(publishIntervalSeconds),
    };
    if (pythonPath.trim()) patch.pythonPath = pythonPath.trim();
    if (cookie.trim()) patch.cookie = cookie;
    if (vendorDir.trim()) patch.vendorDir = vendorDir.trim();
    return patch;
  }

  function testDraft(): Omit<HepanPatch, "publishIntervalSeconds"> {
    const value = draft();
    const { publishIntervalSeconds: _interval, ...withoutInterval } = value;
    return withoutInterval;
  }

  function validate(): boolean {
    if (!Number.isInteger(categoryId) || categoryId < 1) {
      setLocalError("栏目 ID 必须是大于 0 的整数。");
      return false;
    }
    if (
      !Number.isInteger(publishIntervalSeconds) ||
      publishIntervalSeconds < 0 ||
      publishIntervalSeconds > 3600
    ) {
      setLocalError("发布间隔必须是 0–3600 秒的整数。");
      return false;
    }
    if (!pythonPath.trim() && !status.pythonConfigured) {
      setLocalError("请输入 Python 可执行文件路径。");
      return false;
    }
    if (!cookie.trim() && !status.cookieConfigured) {
      setLocalError("请输入河畔 Cookie。");
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
        title: "测试蓝色河畔登录",
        message:
          "测试只检查 Python、依赖、Cookie 身份和栏目权限，不会发布文章、上传图片或创建记录。",
        confirmLabel: "开始测试",
        tone: "default",
      }))
    )
      return;
    await feature.testHepan(testDraft());
  }

  async function clearVendor() {
    if (
      status.source === "environment" ||
      operationBusy ||
      !status.vendorConfigured
    )
      return;
    if (
      !(await confirm({
        title: "清除自定义依赖目录",
        message:
          "只清除 vendor 目录并恢复使用系统环境，Python、Cookie 和栏目 ID 不会改变。",
        confirmLabel: "清除目录",
        tone: "danger",
      }))
    )
      return;
    setLocalError("");
    await feature.clearHepanVendor({
      categoryId: Number(categoryId),
      clearVendorDir: true,
    });
  }

  async function clear() {
    setLocalError("");
    if (
      !(await confirm({
        title: "清除蓝色河畔配置",
        message: "清除后将删除应用级河畔配置，投稿前需要重新配置。",
        confirmLabel: "清除配置",
        tone: "danger",
      }))
    )
      return;
    await feature.clearHepan();
  }

  const readOnly = status.source === "environment";
  const disabled = operationBusy || loading || readOnly;
  const vendorLabel = status.vendorConfigured
    ? "自定义目录"
    : status.bundledVendorAvailable
      ? "内置依赖"
      : "系统环境";

  return (
    <section
      aria-labelledby="hepan-provider-settings-title"
      className="min-w-0 space-y-4 rounded-lg border border-slate-200 bg-white p-5"
    >
      <div>
        <h3
          id="hepan-provider-settings-title"
          className="text-base font-semibold text-slate-800"
        >
          蓝色河畔
        </h3>
        <p className="mt-1 text-sm text-slate-500">
          应用级发文运行环境。Cookie
          加密保存，只在测试或任务期间解密；测试不会发布文章。
        </p>
      </div>
      <div className="min-w-0 rounded-md border border-blue-100 bg-blue-50 p-3 text-xs text-blue-900">
        站点：{status.siteOrigin} · 配置来源：
        {readOnly ? "环境变量覆盖（只读）" : "应用级加密存储"}
      </div>
      <div className="grid min-w-0 gap-3">
        <label className="grid min-w-0 gap-1 text-sm font-medium text-slate-700">
          Python 可执行文件
          <input
            aria-label="Python 可执行文件"
            value={pythonPath}
            onChange={(event) => setPythonPath(event.target.value)}
            placeholder={
              status.pythonConfigured
                ? "已配置（留空保留）"
                : "C:\\Python312\\python.exe"
            }
            disabled={disabled}
            className="min-w-0 rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
        <div className="grid min-w-0 gap-2 rounded-md border border-slate-200 p-3">
          <label className="grid min-w-0 gap-1 text-sm font-medium text-slate-700">
            发布间隔（秒）
            <input
              aria-label="发布间隔（秒）"
              type="number"
              min={0}
              max={3600}
              step={1}
              value={publishIntervalSeconds}
              onChange={(event) =>
                setPublishIntervalSeconds(Number(event.target.value))
              }
              disabled={disabled}
              className="min-w-0 rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="grid min-w-0 gap-1 text-xs text-slate-600">
            常用预设
            <select
              aria-label="河畔发布间隔预设"
              value={
                [10, 30, 60].includes(publishIntervalSeconds)
                  ? String(publishIntervalSeconds)
                  : "custom"
              }
              onChange={(event) => {
                if (event.target.value !== "custom")
                  setPublishIntervalSeconds(Number(event.target.value));
              }}
              disabled={disabled}
              className="min-w-0 rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="10">10 秒</option>
              <option value="30">30 秒</option>
              <option value="60">60 秒</option>
              <option value="custom">自定义</option>
            </select>
          </label>
          {publishIntervalSeconds === 0 && (
            <p className="rounded border border-amber-200 bg-amber-50 p-2 text-xs leading-5 text-amber-800">
              0
              秒不会增加等待，但可能触发河畔频率限制，请确认账号和远端策略允许。
            </p>
          )}
          <p className="text-xs text-slate-500">
            范围 0–3600 秒；默认 30 秒。测试登录不会按此间隔等待或投稿。
          </p>
        </div>
        <label className="grid min-w-0 gap-1 text-sm font-medium text-slate-700">
          河畔 Cookie
          <input
            aria-label="河畔 Cookie"
            type="password"
            value={cookie}
            onChange={(event) => setCookie(event.target.value)}
            placeholder={
              status.cookieConfigured ? "已配置（留空保留）" : "请输入 Cookie"
            }
            autoComplete="new-password"
            disabled={disabled}
            className="min-w-0 rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
      </div>
      <details className="min-w-0 rounded-md border border-slate-200 p-3">
        <summary className="cursor-pointer text-sm font-medium text-slate-700">
          高级配置
        </summary>
        <div className="mt-3 grid min-w-0 gap-3 sm:grid-cols-[12rem_minmax(0,1fr)]">
          <label className="grid min-w-0 gap-1 text-sm text-slate-600">
            栏目 ID
            <input
              aria-label="栏目 ID"
              type="number"
              min={1}
              step={1}
              value={categoryId}
              onChange={(event) => setCategoryId(Number(event.target.value))}
              disabled={disabled}
              className="min-w-0 rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <div className="min-w-0">
            <label className="grid min-w-0 gap-1 text-sm text-slate-600">
              Python vendor/依赖目录
              <input
                aria-label="Python vendor/依赖目录"
                value={vendorDir}
                onChange={(event) => setVendorDir(event.target.value)}
                placeholder={
                  status.vendorConfigured
                    ? "已配置（留空保留）"
                    : status.bundledVendorAvailable
                      ? "留空表示使用内置依赖"
                      : "留空表示使用系统环境"
                }
                disabled={disabled}
                className="min-w-0 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
            {status.vendorConfigured && (
              <button
                type="button"
                onClick={() => void clearVendor()}
                disabled={disabled}
                className="mt-2 rounded border border-amber-300 px-2 py-1 text-xs text-amber-700 disabled:opacity-40"
              >
                清除自定义目录并恢复系统环境
              </button>
            )}
          </div>
        </div>
      </details>
      <p className="text-xs text-slate-500">
        Python：{status.pythonConfigured ? "已配置" : "未配置"} · Cookie：
        {status.cookieConfigured ? "已配置" : "未配置"} · vendor：{vendorLabel}{" "}
        · 最近测试：
        {status.lastTest ? (status.lastTest.ok ? "成功" : "失败") : "尚未测试"}
      </p>
      {status.lastTest && (
        <div
          className="grid gap-1 text-xs text-slate-600"
          aria-label="蓝色河畔检查结果"
        >
          <p>检查时间：{checkedAt(status.lastTest.testedAt)}</p>
          <p>
            Python：{status.lastTest.ok ? "可用" : "未确认"} · 依赖：
            {status.lastTest.ok ? "可用" : "未确认"}
          </p>
          <p>
            登录身份：{status.lastTest.authenticated ? "有效" : "未确认"} ·
            栏目权限：{status.lastTest.publishAccess ? "栏目可发文" : "未通过"}{" "}
            · 图片上传：
            {status.lastTest.uploadContext === "available"
              ? "兼容"
              : status.lastTest.uploadContext === "changed"
                ? "页面结构变化"
                : "未检查"}
          </p>
          {status.lastTest.account ? (
            <p>
              登录账号：{status.lastTest.account.displayName}（UID{" "}
              {status.lastTest.account.uid}）
            </p>
          ) : status.lastTest.ok && status.lastTest.authenticated ? (
            <p>登录有效，账号名称未识别</p>
          ) : null}
          {status.lastTest.warnings?.includes(
            "HEPAN_UPLOAD_CONTEXT_CHANGED",
          ) && (
            <p role="status" className="text-amber-700">
              登录和栏目检查已通过，但图片上传上下文发生变化；这不是 Cookie
              身份失败。
            </p>
          )}
          <p>检查代码：{status.lastTest.code}</p>
        </div>
      )}
      {error && (
        <p role="alert" aria-live="assertive" className="text-sm text-rose-700">
          {error}
        </p>
      )}
      {notice && (
        <p
          role="status"
          aria-live="polite"
          className="text-sm text-emerald-700"
        >
          {notice}
        </p>
      )}
      <div className="flex min-w-0 flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void save()}
          disabled={disabled}
          className="rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          保存配置
        </button>
        <button
          type="button"
          onClick={() => void test()}
          disabled={disabled}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm disabled:opacity-50"
        >
          测试登录
        </button>
        <button
          type="button"
          onClick={() => void clear()}
          disabled={disabled}
          className="rounded-md border border-rose-300 px-3 py-2 text-sm text-rose-700 disabled:opacity-50"
        >
          清除配置
        </button>
      </div>
    </section>
  );
}
