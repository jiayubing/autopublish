import React from "react";
import {
  AlertCircle,
  CheckCircle,
  Clock,
  FileText,
  Loader2,
  Send,
  X,
  XCircle,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import type { PlatformArticle, PlatformTarget } from "../types/platform";
import {
  archiveErrorText,
  articleSelectionKey,
  type PlatformSubmissionResult,
} from "./platform-workbench-model";

export type PlatformSubmissionOverlaysProps = {
  isConfirming: boolean;
  showResult: boolean;
  selectedArticleList: PlatformArticle[];
  selectedPlatformList: PlatformTarget[];
  selectedPlatformIds: ReadonlySet<string>;
  taskCount: number;
  selectedHepan: boolean;
  hepanArticleCount: number;
  autoTrashRequested: boolean;
  taskBusy: boolean;
  isSubmitting: boolean;
  canSubmit: boolean;
  submitResult: PlatformSubmissionResult | null;
  terminalResult: PlatformSubmissionResult | null;
  onSetConfirming: (value: boolean) => void;
  onSetAutoTrashRequested: (value: boolean) => void;
  onSubmit: () => void | Promise<void>;
  onDismissResult: () => void;
  onOpenArticleManagement?: () => void;
};

export default function PlatformSubmissionOverlays({
  isConfirming,
  showResult,
  selectedArticleList,
  selectedPlatformList,
  selectedPlatformIds,
  taskCount,
  selectedHepan,
  hepanArticleCount,
  autoTrashRequested,
  taskBusy,
  isSubmitting,
  canSubmit,
  submitResult,
  terminalResult,
  onSetConfirming,
  onSetAutoTrashRequested,
  onSubmit,
  onDismissResult,
  onOpenArticleManagement,
}: PlatformSubmissionOverlaysProps) {
  const trashReasonText = submitResult?.trashSummary?.reasonCodes?.length
    ? `原因：${submitResult.trashSummary.reasonCodes.join("、")}`
    : "";
  const resultOk = terminalResult?.ok ?? 0;
  const resultFail = terminalResult?.fail ?? 0;
  const resultSkipped = terminalResult?.skipped ?? 0;

  return (
    <>
      <AnimatePresence>
        {isConfirming && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.15 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden"
            >
              <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                <h3 className="text-base font-bold text-slate-800 flex items-center space-x-2">
                  <AlertCircle className="w-5 h-5 text-amber-500" />
                  <span>确认发布任务</span>
                </h3>
                <button
                  onClick={() => onSetConfirming(false)}
                  disabled={taskBusy}
                  className="p-1 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  <X className="w-4.5 h-4.5 text-slate-400" />
                </button>
              </div>

              <div className="px-6 py-4 space-y-4">
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                    已选文章 ({selectedArticleList.length})
                  </p>
                  <div className="max-h-32 overflow-y-auto space-y-1">
                    {selectedArticleList.map((article) => (
                      <div
                        key={articleSelectionKey(article)}
                        className="flex items-center space-x-2 text-xs text-slate-600 py-1"
                      >
                        <FileText className="w-3 h-3 text-slate-400 shrink-0" />
                        <span className="truncate">
                          {article.title || article.filename}
                        </span>
                      </div>
                    ))}
                  </div>
                  {selectedArticleList.length === 0 && (
                    <p className="text-xs text-red-500">请先选择至少一篇文章</p>
                  )}
                </div>

                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                    目标平台 ({selectedPlatformIds.size})
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedPlatformList.map((platform) => (
                      <span
                        key={platform.id}
                        className="px-2 py-0.5 bg-emerald-50 text-emerald-700 text-xs font-medium rounded-full border border-emerald-200"
                      >
                        {platform.displayName}
                      </span>
                    ))}
                  </div>
                  {selectedPlatformIds.size === 0 && (
                    <p className="text-xs text-red-500">
                      请先选择至少一个目标平台
                    </p>
                  )}
                </div>

                <div className="p-3 rounded-lg bg-indigo-50 border border-indigo-100">
                  <p className="text-sm font-bold text-indigo-700">
                    共 {taskCount} 个发布任务
                  </p>
                  {selectedHepan && (
                    <p className="mt-1 text-xs text-indigo-700">
                      河畔文章：{hepanArticleCount} 篇 ·
                      投稿间隔由配置中心控制，实际等待以运行进度为准。
                    </p>
                  )}
                </div>

                <label className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
                  <input
                    type="checkbox"
                    checked={autoTrashRequested}
                    onChange={(event) =>
                      onSetAutoTrashRequested(event.target.checked)
                    }
                    disabled={taskBusy}
                    className="mt-0.5"
                  />
                  <span>
                    <strong>全部目标发布成功后自动移入回收站</strong>
                    <span className="mt-1 block text-slate-500">
                      默认关闭；远端已发布内容不会撤回，发布记录和标题快照会保留。失败、待确认或本地归档失败时不会自动回收。
                    </span>
                  </span>
                </label>

                {!canSubmit && (
                  <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 flex items-start space-x-2">
                    <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-700">
                      请确保已选择文章和目标平台后再提交
                    </p>
                  </div>
                )}
              </div>

              <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex justify-end space-x-2">
                <button
                  onClick={() => onSetConfirming(false)}
                  disabled={taskBusy}
                  className="px-4 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-semibold rounded-lg shadow-2xs transition-all active:scale-95 disabled:opacity-50"
                >
                  取消
                </button>
                <button
                  onClick={() => void onSubmit()}
                  disabled={!canSubmit || taskBusy || isSubmitting}
                  className="flex items-center space-x-1.5 px-4.5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 text-white disabled:text-slate-400 text-xs font-bold rounded-lg shadow-sm transition-all active:scale-95 disabled:pointer-events-none"
                >
                  {taskBusy || isSubmitting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>提交中...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-3.5 h-3.5" />
                      <span>确认提交</span>
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showResult && submitResult && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.15 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden"
            >
              <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                <h3 className="text-base font-bold text-slate-800 flex items-center space-x-2">
                  <CheckCircle className="w-5 h-5 text-emerald-500" />
                  <span>提交结果</span>
                </h3>
                <button
                  onClick={onDismissResult}
                  className="p-1 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  <X className="w-4.5 h-4.5 text-slate-400" />
                </button>
              </div>

              <div className="px-6 py-4">
                <div className="grid grid-cols-3 gap-3 mb-4">
                  <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-center">
                    <p className="text-2xl font-bold text-emerald-600">
                      {resultOk}
                    </p>
                    <p className="text-xs text-emerald-600 font-medium">成功</p>
                  </div>
                  <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-center">
                    <p className="text-2xl font-bold text-red-500">
                      {resultFail}
                    </p>
                    <p className="text-xs text-red-500 font-medium">失败</p>
                  </div>
                  <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-center">
                    <p className="text-2xl font-bold text-amber-500">
                      {resultSkipped}
                    </p>
                    <p className="text-xs text-amber-500 font-medium">跳过</p>
                  </div>
                </div>
                {submitResult.archiveSummary?.failed &&
                  submitResult.archiveSummary.failed > 0 && (
                    <div
                      role="status"
                      className="mb-4 rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800"
                    >
                      远端已发布，本地归档待处理：
                      {submitResult.archiveSummary.failed}{" "}
                      项。队列中的这些文章已禁止再次远端投稿。
                    </div>
                  )}
                {submitResult.trashDisposition === "offer_trash" && (
                  <div
                    role="status"
                    className="mb-4 rounded border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800"
                  >
                    已发布 {submitResult.trashSummary?.offeredCount || resultOk}{" "}
                    篇，可移入回收站。
                    <button
                      type="button"
                      onClick={onOpenArticleManagement}
                      className="ml-2 rounded border border-emerald-300 px-2 py-1 font-semibold"
                    >
                      打开文章管理
                    </button>
                  </div>
                )}
                {submitResult.trashDisposition === "auto_trash_blocked" && (
                  <div
                    role="alert"
                    className="mb-4 rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800"
                  >
                    自动回收未执行：存在失败、待确认、活动投稿或本地归档待处理项。远端已发布结果保持不变，可稍后从文章管理手动回收。
                    {trashReasonText && (
                      <span className="mt-1 block">{trashReasonText}</span>
                    )}
                  </div>
                )}
                {submitResult.trashDisposition === "auto_trash_requested" && (
                  <div
                    role="status"
                    className="mb-4 rounded border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800"
                  >
                    已发布目标全部满足条件，文章本地副本已按确认策略移入回收站；发布记录继续保留。
                    {(submitResult.trashSummary?.recoveryCount || 0) > 0 && (
                      <span className="mt-1 block">
                        部分回收已进入恢复事务，系统会继续刷新处理状态。
                      </span>
                    )}
                  </div>
                )}

                <div className="max-h-60 overflow-y-auto space-y-1.5">
                  {(terminalResult?.results || []).map((result, index) => (
                    <div
                      key={index}
                      className={`flex items-center space-x-2.5 p-2.5 rounded-lg text-xs ${
                        result.status === "success"
                          ? "bg-emerald-50/60"
                          : result.status === "failed"
                            ? "bg-red-50/60"
                            : "bg-slate-50/60"
                      }`}
                    >
                      {result.status === "success" ? (
                        <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
                      ) : result.status === "failed" ? (
                        <XCircle className="w-4 h-4 text-red-500 shrink-0" />
                      ) : (
                        <Clock className="w-4 h-4 text-slate-400 shrink-0" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-slate-700 truncate">
                          {result.task.filename}
                        </p>
                        <p className="text-slate-400">
                          → {result.task.targetPlatformId}
                          {result.errorCode && (
                            <span className="text-red-500 ml-1">
                              - {result.errorCode}
                            </span>
                          )}
                          {result.archiveErrorCode && (
                            <span className="text-amber-600 ml-1">
                              - 远端成功，本地归档待处理：
                              {archiveErrorText(result.archiveErrorCode)}
                            </span>
                          )}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex justify-end">
                <button
                  onClick={onDismissResult}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded-lg shadow-sm transition-all active:scale-95"
                >
                  关闭
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
