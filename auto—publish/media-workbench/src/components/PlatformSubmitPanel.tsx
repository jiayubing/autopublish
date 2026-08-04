import React from "react";
import {
  CheckSquare,
  Clock,
  Loader2,
  LogIn,
  Pause,
  Send,
  ShieldCheck,
  Square,
  XCircle,
} from "lucide-react";
import type { PlatformTaskSnapshot, PlatformTarget } from "../types/platform";
import type { PlatformLoginStates } from "./platform-workbench-model";

export type PlatformSubmitPanelProps = {
  platforms: PlatformTarget[];
  selectedPlatformIds: ReadonlySet<string>;
  loginStates: PlatformLoginStates;
  selectedArticleCount: number;
  queueLength: number;
  taskCount: number;
  platformState: PlatformTaskSnapshot;
  submitStatus: string;
  taskBusy: boolean;
  isSubmitting: boolean;
  isPausing: boolean;
  isStopping: boolean;
  canSubmit: boolean;
  onTogglePlatform: (platformId: string) => void;
  onOpenLogin: (platformId: string) => void | Promise<void>;
  onCheckLogin: (platformId: string) => void | Promise<void>;
  onPause: () => void | Promise<void>;
  onStop: () => void | Promise<void>;
  onOpenConfirmation: () => void;
};

export default function PlatformSubmitPanel({
  platforms,
  selectedPlatformIds,
  loginStates,
  selectedArticleCount,
  queueLength,
  taskCount,
  platformState,
  submitStatus,
  taskBusy,
  isSubmitting,
  isPausing,
  isStopping,
  canSubmit,
  onTogglePlatform,
  onOpenLogin,
  onCheckLogin,
  onPause,
  onStop,
  onOpenConfirmation,
}: PlatformSubmitPanelProps) {
  const selectedPlatformList = platforms.filter((platform) =>
    selectedPlatformIds.has(platform.id),
  );
  const platformPhase = platformState.phase || platformState.status || "";
  const isWaitingInterval =
    platformPhase === "waiting-interval" ||
    platformPhase === "waiting_interval";
  const waitingSeconds = Math.max(
    0,
    Math.ceil((platformState.waitRemainingMs || 0) / 1000),
  );
  const nextTaskLabel =
    platformState.nextTask?.filename ||
    platformState.task?.filename ||
    "下一篇";
  const selectedHepan = selectedPlatformIds.has("hepan");
  const hepanArticleCount = selectedHepan ? selectedArticleCount : 0;

  return (
    <>
      <div className="lg:col-span-5 flex flex-col min-h-0">
        <h3 className="text-sm font-semibold text-slate-600 flex items-center space-x-1.5 mb-2.5">
          <Send className="w-4 h-4" />
          <span>目标平台</span>
          <span className="text-xs font-normal text-slate-400 ml-1">
            ({selectedPlatformIds.size} 已选)
          </span>
        </h3>

        <div className="flex-1 rounded-xl border border-slate-200 bg-white shadow-sm p-4 overflow-y-auto">
          {platforms.length === 0 ? (
            <div className="flex items-center justify-center h-24 text-slate-400 text-sm">
              暂无可用目标平台
            </div>
          ) : (
            <div className="space-y-2">
              {platforms.map((platform) => {
                const loginState = loginStates[platform.id];
                return (
                  <div
                    key={platform.id}
                    className={`overflow-hidden rounded-lg border transition-all ${
                      selectedPlatformIds.has(platform.id)
                        ? "border-blue-300 bg-blue-50/60 shadow-sm"
                        : "border-slate-200 bg-white"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => onTogglePlatform(platform.id)}
                      className="flex w-full items-center justify-between p-3 text-left hover:bg-slate-50"
                    >
                      <div className="flex items-center space-x-3">
                        {selectedPlatformIds.has(platform.id) ? (
                          <CheckSquare className="w-4.5 h-4.5 text-blue-500" />
                        ) : (
                          <Square className="w-4.5 h-4.5 text-slate-300" />
                        )}
                        <div>
                          <p className="text-sm font-semibold text-slate-700">
                            {platform.displayName}
                          </p>
                          <p className="text-xs text-slate-400">投稿目标</p>
                        </div>
                      </div>
                    </button>
                    {platform.loginAvailable && (
                      <div className="border-t border-slate-200 px-3 py-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => void onOpenLogin(platform.id)}
                            disabled={taskBusy || loginState?.busy}
                            className="flex items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                          >
                            <LogIn className="h-3.5 w-3.5" />
                            <span>打开登录</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => void onCheckLogin(platform.id)}
                            disabled={taskBusy || loginState?.busy}
                            className="flex items-center gap-1 rounded border border-blue-300 bg-blue-50 px-2.5 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-50"
                          >
                            {loginState?.busy ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <ShieldCheck className="h-3.5 w-3.5" />
                            )}
                            <span>检查登录</span>
                          </button>
                        </div>
                        {loginState?.message && (
                          <p
                            role={
                              loginState.authenticated === false
                                ? "alert"
                                : "status"
                            }
                            className={`mt-2 text-xs ${
                              loginState.authenticated === true
                                ? "text-emerald-700"
                                : loginState.authenticated === false
                                  ? "text-amber-700"
                                  : "text-slate-500"
                            }`}
                          >
                            {loginState.message}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <div className="mt-4 p-3 rounded-lg bg-slate-50 border border-slate-200/80">
            <p className="text-xs text-slate-500 mb-1">任务预览</p>
            <p className="text-sm font-semibold text-slate-700">
              已选{" "}
              <span className="text-blue-600 font-bold">
                {selectedArticleCount}
              </span>{" "}
              篇文章 ×{" "}
              <span className="text-emerald-600 font-bold">
                {selectedPlatformIds.size}
              </span>{" "}
              个平台 ={" "}
              <span className="text-indigo-600 font-bold text-base">
                {taskCount}
              </span>{" "}
              个任务
            </p>
          </div>
        </div>
      </div>

      {(submitStatus || taskBusy) && (
        <div className="lg:col-span-12 mt-3 px-4 py-2.5 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            {isWaitingInterval ? (
              <Clock className="w-4 h-4 text-blue-500 shrink-0" />
            ) : (
              <Loader2 className="w-4 h-4 animate-spin text-blue-500 shrink-0" />
            )}
            <span>
              {isWaitingInterval
                ? `等待下一篇河畔文章：${waitingSeconds} 秒（${nextTaskLabel}）`
                : submitStatus || "正在投稿…"}
            </span>
          </div>
          <div className="flex items-center space-x-1.5">
            <button
              onClick={() => void onPause()}
              disabled={isPausing}
              className="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 disabled:bg-amber-300 text-white text-xs font-bold rounded-md shadow-sm transition-all active:scale-95 flex items-center space-x-1"
            >
              <Pause className="w-3 h-3" />
              <span>{isPausing ? "暂停中..." : "暂停"}</span>
            </button>
            <button
              onClick={() => void onStop()}
              disabled={isStopping}
              className="px-2.5 py-1 bg-red-500 hover:bg-red-600 disabled:bg-red-300 text-white text-xs font-bold rounded-md shadow-sm transition-all active:scale-95 flex items-center space-x-1"
            >
              <XCircle className="w-3 h-3" />
              <span>{isStopping ? "停止中..." : "取消"}</span>
            </button>
          </div>
        </div>
      )}

      <div className="lg:col-span-12 mt-4 pt-3 border-t border-slate-200 flex items-center justify-between">
        <div className="text-xs text-slate-500">
          {queueLength > 0
            ? `共 ${queueLength} 篇文章待处理，已选 ${selectedArticleCount} 篇`
            : "队列为空"}
        </div>
        <button
          onClick={onOpenConfirmation}
          disabled={!canSubmit || taskBusy || isSubmitting}
          className="flex items-center space-x-1.5 px-5 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 disabled:from-slate-300 disabled:to-slate-300 text-white text-sm font-bold rounded-lg shadow-sm transition-all active:scale-95 disabled:pointer-events-none disabled:shadow-none"
        >
          <Send className="w-4 h-4" />
          <span>
            {taskBusy || isSubmitting
              ? "提交中..."
              : `确认提交 (${taskCount} 任务)`}
          </span>
        </button>
      </div>
    </>
  );
}
