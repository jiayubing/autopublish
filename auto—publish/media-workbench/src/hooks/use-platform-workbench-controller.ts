import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { pausePlatformSubmit, stopPlatformSubmit, submitPlatformSelection } from '../bridge/platform';
import type { PlatformArticle, PlatformSubmitResult, PlatformTarget, PlatformTaskSnapshot } from '../types';

const selectionKey = (article: PlatformArticle) => `${article.sourcePlatformId}\u0000${article.filename}`;
const selectable = (article: PlatformArticle) => article.sourceArticleState !== 'trashed' && !article.archiveError;

/** Renderer-only interaction state.  Domain eligibility remains in the main process. */
export function usePlatformWorkbenchController({ queue, platforms, platformState, refreshQueue, onError }: {
  queue: PlatformArticle[];
  platforms: PlatformTarget[];
  platformState: PlatformTaskSnapshot;
  refreshQueue: (reason?: string) => Promise<unknown>;
  onError: (message: string) => void;
}) {
  const [selectedArticles, setSelectedArticles] = useState<Set<string>>(new Set());
  const [selectedPlatformIds, setSelectedPlatformIds] = useState<Set<string>>(new Set());
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [isConfirming, setIsConfirming] = useState(false);
  const [autoTrashRequested, setAutoTrashRequested] = useState(() => {
    try { return window.localStorage.getItem('auto-publish:auto-trash-after-publish') === 'true'; } catch (_) { return false; }
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [submitResult, setSubmitResult] = useState<PlatformSubmitResult | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [submitStatus, setSubmitStatus] = useState('');
  const activeRequestRef = useRef(0);
  const hasObservedRunningRef = useRef(false);
  const terminalQueueRevisionRef = useRef<number | null>(null);

  useEffect(() => { try { window.localStorage.setItem('auto-publish:auto-trash-after-publish', String(autoTrashRequested)); } catch (_) {} }, [autoTrashRequested]);
  useEffect(() => setSelectedArticles((current) => new Set([...current].filter((key) => queue.some((article) => selectionKey(article) === key && selectable(article))))), [queue]);

  const taskIsActive = platformState.isPlatformRunning || ['running', 'waiting-interval', 'stopping'].includes(platformState.phase);
  const taskBusy = isSubmitting || taskIsActive;
  const selectedArticleList = useMemo(() => queue.filter((article) => selectable(article) && selectedArticles.has(selectionKey(article))), [queue, selectedArticles]);
  const selectedPlatformList = useMemo(() => platforms.filter((platform) => selectedPlatformIds.has(platform.id)), [platforms, selectedPlatformIds]);
  const canSubmit = selectedArticleList.length > 0 && selectedPlatformIds.size > 0;

  useEffect(() => {
    const phase = platformState.phase || platformState.status || '';
    const waiting = phase === 'waiting-interval' || phase === 'waiting_interval';
    const running = phase === 'running' || waiting || phase === 'stopping' || platformState.isPlatformRunning === true;
    if (running) hasObservedRunningRef.current = true;
    if (waiting) setSubmitStatus('等待下一篇河畔文章…');
    else if (phase === 'running') setSubmitStatus('正在投稿…');
    else if (phase === 'stopping') setSubmitStatus('正在停止投稿…');
    else if (['completed', 'idle', 'failed', 'stopped', 'interrupted'].includes(phase) && !running) {
      if (!isSubmitting) setSubmitStatus('');
      const revision = platformState.queueRevision;
      if (hasObservedRunningRef.current && typeof revision === 'number' && Number.isFinite(revision) && terminalQueueRevisionRef.current !== revision) {
        terminalQueueRevisionRef.current = revision;
        hasObservedRunningRef.current = false;
        void refreshQueue('submit-terminal').catch(() => {});
      }
    }
  }, [isSubmitting, platformState, refreshQueue]);

  const toggleArticle = useCallback((key: string) => {
    const article = queue.find((item) => selectionKey(item) === key);
    if (!article || !selectable(article)) return;
    setSelectedArticles((current) => { const next = new Set(current); next.has(key) ? next.delete(key) : next.add(key); return next; });
  }, [queue]);
  const toggleSelectAllInGroup = useCallback((articles: PlatformArticle[]) => {
    const candidates = articles.filter(selectable); if (!candidates.length) return;
    setSelectedArticles((current) => { const next = new Set(current); const all = candidates.every((article) => next.has(selectionKey(article))); candidates.forEach((article) => all ? next.delete(selectionKey(article)) : next.add(selectionKey(article))); return next; });
  }, []);
  const toggleAll = useCallback(() => { const candidates = queue.filter(selectable); setSelectedArticles((current) => candidates.length && candidates.every((article) => current.has(selectionKey(article))) ? new Set() : new Set(candidates.map(selectionKey))); }, [queue]);
  const togglePlatform = useCallback((id: string) => setSelectedPlatformIds((current) => { const next = new Set(current); next.has(id) ? next.delete(id) : next.add(id); return next; }), []);
  const toggleGroupCollapse = useCallback((id: string) => setCollapsedGroups((current) => { const next = new Set(current); next.has(id) ? next.delete(id) : next.add(id); return next; }), []);
  const pause = useCallback(async () => { setSubmitStatus('已暂停 — 正在关闭浏览器...'); try { await pausePlatformSubmit(platformState.runId); } finally { setSubmitStatus(''); } }, [platformState.runId]);
  const stop = useCallback(async () => { setIsStopping(true); try { await stopPlatformSubmit(platformState.runId); } finally { setIsStopping(false); } }, [platformState.runId]);
  const submit = useCallback(async () => {
    if (!canSubmit || taskBusy) return;
    const requestId = ++activeRequestRef.current;
    setIsConfirming(false); setIsSubmitting(true); setSubmitStatus(`正在提交 ${selectedArticleList.length * selectedPlatformIds.size} 个任务，请稍候...`);
    try {
      const result = await submitPlatformSelection({ submissions: selectedArticleList.map((article) => ({ sourcePlatformId: article.sourcePlatformId, filename: article.filename, targetPlatformIds: [...selectedPlatformIds] })), autoTrash: autoTrashRequested });
      if (requestId !== activeRequestRef.current) return;
      setSubmitResult(result); setShowResult(true); setSubmitStatus('');
    } catch (error) {
      if (requestId === activeRequestRef.current) { setSubmitStatus(''); onError(error instanceof Error ? error.message : 'Submission failed'); }
    } finally {
      if (requestId === activeRequestRef.current) { setIsSubmitting(false); setIsStopping(false); }
      void refreshQueue('submit-terminal').catch(() => {});
    }
  }, [autoTrashRequested, canSubmit, onError, refreshQueue, selectedArticleList, selectedPlatformIds, taskBusy]);
  const dismissResult = useCallback(() => { setShowResult(false); setSubmitResult(null); setSubmitStatus(''); }, []);

  return { selectedArticles, selectedPlatformIds, collapsedGroups, isConfirming, setIsConfirming, autoTrashRequested, setAutoTrashRequested, isSubmitting, isStopping, submitResult, showResult, submitStatus, taskIsActive, taskBusy, selectedArticleList, selectedPlatformList, canSubmit, toggleArticle, toggleSelectAllInGroup, toggleAll, togglePlatform, toggleGroupCollapse, pause, stop, submit, dismissResult, selectionKey, selectable };
}
