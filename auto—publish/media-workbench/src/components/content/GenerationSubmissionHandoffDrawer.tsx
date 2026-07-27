import React, { useEffect, useMemo, useState } from 'react';
import { ContentSubmissionPlatform, GenerationBatch, GenerationSubmissionHandoffPreview, GenerationSubmissionHandoffResult } from '../../types';
import AccountProfileSelector from './AccountProfileSelector';
import { useGenerationFeature } from '../../features/generation/use-generation-feature';

interface GenerationSubmissionHandoffDrawerProps {
  batch: GenerationBatch;
  onClose: () => void;
  onCommitted?: (result: GenerationSubmissionHandoffResult) => void;
  onOpenOtherPlatform?: () => void;
}

export default function GenerationSubmissionHandoffDrawer({ batch, onClose, onCommitted, onOpenOtherPlatform }: GenerationSubmissionHandoffDrawerProps) {
  const generation = useGenerationFeature();
  const { listSubmissionPlatforms, previewSubmissionHandoff, commitSubmissionHandoff } = generation;
  const [platforms, setPlatforms] = useState<ContentSubmissionPlatform[]>([]);
  const [targetPlatformIds, setTargetPlatformIds] = useState<string[]>([]);
  const [accountProfiles, setAccountProfiles] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<GenerationSubmissionHandoffPreview | null>(null);
  const [result, setResult] = useState<GenerationSubmissionHandoffResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    listSubmissionPlatforms().then((items) => { if (active) setPlatforms(items.filter((item) => item.contentQueueImport)); }).catch((value) => { if (active) setError(value instanceof Error ? value.message : '无法加载投稿目标'); });
    return () => { active = false; };
  }, [listSubmissionPlatforms]);

  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    }
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  const successCount = useMemo(() => batch.tasks.filter((task) => task.status === 'succeeded' && task.articleId).length, [batch.tasks]);
  const clientCount = new Set(batch.tasks.filter((task) => task.status === 'succeeded' && task.articleId).map((task) => task.clientId)).size;

  async function inspect() {
    if (!targetPlatformIds.length) { setError('请先选择投稿目标'); return; }
    setBusy(true); setError(''); setResult(null);
    try { setPreview(await previewSubmissionHandoff({ generationBatchId: batch.id, targetPlatformIds, accountProfiles })); }
    catch (value) { setError(value instanceof Error ? value.message : '投稿交接预检失败'); }
    finally { setBusy(false); }
  }

  async function commit() {
    if (!preview) return;
    setBusy(true); setError('');
    try {
      const next = await commitSubmissionHandoff({ generationBatchId: batch.id, targetPlatformIds, accountProfiles, previewToken: preview.previewToken, confirmed: true });
      setResult(next);
      onCommitted?.(next);
    } catch (value) { setError(value instanceof Error ? value.message : '投稿交接失败'); }
    finally { setBusy(false); }
  }

  return <div className="fixed inset-0 z-[100] flex justify-end bg-slate-900/30" role="dialog" aria-modal="true" aria-labelledby="generation-submission-handoff-title">
    <section className="flex h-full w-full max-w-2xl flex-col overflow-hidden bg-white shadow-xl">
      <div className="flex shrink-0 items-start gap-3 border-b border-slate-200 px-5 py-4"><div className="min-w-0 flex-1"><h2 id="generation-submission-handoff-title" className="text-base font-semibold text-slate-800">生成批次投稿交接</h2><p className="mt-1 text-xs leading-5 text-slate-500">只创建本地投稿队列，不自动执行远端发布。</p></div><button type="button" onClick={onClose} aria-label="关闭生成批次投稿交接" className="rounded px-2 py-1 text-lg text-slate-400 hover:bg-slate-100">×</button></div>
      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        {!result && <>
          <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4"><div className="rounded bg-slate-50 p-3">成功文章：<strong>{successCount}</strong></div><div className="rounded bg-slate-50 p-3">涉及客户：<strong>{clientCount}</strong></div><div className="rounded bg-slate-50 p-3">已选目标：<strong>{targetPlatformIds.length}</strong></div><div className="rounded bg-slate-50 p-3">组合任务：<strong>{successCount * targetPlatformIds.length}</strong></div></div>
          <div className="mt-5 rounded border border-slate-200 p-3"><h3 className="text-sm font-semibold">选择投稿目标</h3><div className="mt-3 grid gap-2 sm:grid-cols-2">{platforms.map((platform) => <label key={platform.id} className="flex items-center gap-2 rounded border border-slate-200 p-2 text-xs text-slate-700"><input type="checkbox" checked={targetPlatformIds.includes(platform.id)} onChange={(event) => { setTargetPlatformIds((current) => event.target.checked ? [...new Set([...current, platform.id])] : current.filter((id) => id !== platform.id)); setPreview(null); }} />{platform.displayName || platform.id}</label>)}{!platforms.length && <p className="text-xs text-slate-500">没有可用的投稿目标。</p>}</div></div>
          <div className="mt-3"><AccountProfileSelector platforms={platforms} targetPlatformIds={targetPlatformIds} value={accountProfiles} onChange={(next) => { setAccountProfiles(next); setPreview(null); }} /></div>
          {preview && <div className="mt-5 rounded border border-blue-100 bg-blue-50 p-3 text-sm text-blue-900"><h3 className="font-semibold">预检结果</h3><div className="mt-2 grid gap-1 text-xs sm:grid-cols-2"><span>可新增：{preview.queueableTaskCount}</span><span>已存在跳过：{preview.idempotentCount}</span><span>已发布阻断：{preview.blockedPublishedCount}</span><span>待确认阻断：{preview.blockedUncertainCount}</span><span>内容/身份冲突：{preview.conflictCount}</span><span>不可投稿文章：{preview.blockedContentCount + preview.unavailableArticleCount}</span></div>{preview.invalidArticles.length > 0 && <div className="mt-3 rounded border border-rose-200 bg-white p-2 text-xs text-rose-700">异常文章默认不进入队列：{preview.invalidArticles.map((item) => `${item.articleId || item.taskId} · ${item.reasonCode}`).join('；')}</div>}</div>}
        </>}
        {result && <div className="grid gap-3"><div className="rounded border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900"><h3 className="font-semibold">投稿队列交接完成</h3><p className="mt-2">新增 {result.createdCount} 项 · 已存在跳过 {result.idempotentCount} 项 · 阻断 {result.blockedCount} 项</p></div>{result.clientGroups.map((group) => <div key={group.clientId} className="rounded border border-slate-200 p-3 text-xs text-slate-700">客户 {group.clientId} · {group.articleCount} 篇 · 新增 {group.queueableTaskCount} · 跳过 {group.idempotentCount}</div>)}{result.failedClientGroups.length > 0 && <div className="rounded border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700"><p className="font-semibold">失败客户组</p>{result.failedClientGroups.map((group) => <p key={group.clientId} className="mt-1">{group.clientId} · {group.code}</p>)}</div>}</div>}
        {error && <div role="alert" className="mt-4 rounded border border-rose-100 bg-rose-50 p-2 text-xs text-rose-700">{error}</div>}
      </div>
      <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-slate-200 px-5 py-3"><button type="button" onClick={onClose} className="rounded border border-slate-300 px-3 py-2 text-xs">关闭 / 返回客户列表</button>{result?.failedClientGroups.length ? <button type="button" onClick={() => void commit()} disabled={busy} className="rounded bg-amber-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">重试未完成客户</button> : !preview ? <button type="button" onClick={() => void inspect()} disabled={busy || !targetPlatformIds.length || targetPlatformIds.some((platformId) => !accountProfiles[platformId])} className="rounded bg-blue-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">{busy ? '检查中…' : '检查并确认'}</button> : <button type="button" onClick={() => void commit()} disabled={busy || (!preview.queueableTaskCount && !preview.idempotentCount)} className="rounded bg-blue-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">{busy ? '交接中…' : '一次确认并加入投稿队列'}</button>}{result && onOpenOtherPlatform && <button type="button" onClick={onOpenOtherPlatform} className="rounded border border-blue-300 px-3 py-2 text-xs text-blue-700">打开其他平台投稿</button>}</div>
    </section>
  </div>;
}
