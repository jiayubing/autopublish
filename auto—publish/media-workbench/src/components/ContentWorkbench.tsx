import React, { useCallback, useEffect, useRef, useState } from 'react';
import { LoaderCircle, RefreshCw } from 'lucide-react';
import { copyContentArticleVersion, listContentClients, listContentTemplateCatalog } from '../electron-api';
import { ContentClient, ContentTemplateCatalog, GeneratedContentArticle } from '../types';
import ArticleGenerationView from './content/ArticleGenerationView';
import GeneratedArticleEditorPanel from './content/GeneratedArticleEditorPanel';
import GeneratedArticlesView from './content/GeneratedArticlesView';
import QuestionCollectionView from './content/QuestionCollectionView';
import { type ArticleWorkflowStage } from '../article-workflow';
import ArticleStageTabs from './content/ArticleStageTabs';
import { ArticleAttentionProvider } from '../article-attention-store';

type RefreshState = 'idle' | 'refreshing' | 'success' | 'error';

interface ContentWorkbenchProps {
  attentionIntent?: { attentionId?: string; clientId?: string } | null;
  onAttentionIntentConsumed?: () => void;
}

export default function ContentWorkbench({ attentionIntent, onAttentionIntentConsumed }: ContentWorkbenchProps) {
  const [clients, setClients] = useState<ContentClient[]>([]);
  const [templateCatalog, setTemplateCatalog] = useState<ContentTemplateCatalog>({ revision: '', platforms: [], templates: [], diagnostics: [] });
  const [clientId, setClientId] = useState('');
  const [article, setArticle] = useState<GeneratedContentArticle | null>(null);
  const [historyEditingArticle, setHistoryEditingArticle] = useState<GeneratedContentArticle | null>(null);
  const [historyEditingPublished, setHistoryEditingPublished] = useState(false);
  const [tab, setTab] = useState<'questions' | 'generate' | 'history'>('questions');
  const [articleStageFilter, setArticleStageFilter] = useState<ArticleWorkflowStage | 'all'>('all');
  const [workspaceRefreshToken, setWorkspaceRefreshToken] = useState(0);
  const [articleRefreshToken, setArticleRefreshToken] = useState(0);
  const [batchRefreshToken, setBatchRefreshToken] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshState, setRefreshState] = useState<RefreshState>('idle');
  const [error, setError] = useState('');
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshRequestIdRef = useRef(0);
  const mountedRef = useRef(true);
  const historyDirtyRef = useRef(false);
  const historySourceRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!attentionIntent) return;
    setTab('history');
    setArticleStageFilter('failed');
    if (attentionIntent.clientId) setClientId(attentionIntent.clientId);
    onAttentionIntentConsumed?.();
  }, [attentionIntent, onAttentionIntentConsumed]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
    mountedRef.current = false;
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    };
  }, []);

  useEffect(() => {
    function guardWindowClose(event: BeforeUnloadEvent) {
      if (!historyDirtyRef.current) return;
      event.preventDefault();
      event.returnValue = '';
    }
    window.addEventListener('beforeunload', guardWindowClose);
    return () => window.removeEventListener('beforeunload', guardWindowClose);
  }, []);

  async function refreshWorkspaceSources(initial = false) {
    const requestId = ++refreshRequestIdRef.current;
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    if (!mountedRef.current) return;
    setRefreshState('refreshing');
    setError('');
    try {
      const [items, catalog] = await Promise.all([listContentClients(), listContentTemplateCatalog()]);
      if (!mountedRef.current || requestId !== refreshRequestIdRef.current) return;
      setClients(items);
      setTemplateCatalog(catalog);
      setClientId((current) => items.some((item) => item.id === current) ? current : (items[0]?.id || ''));
      setArticle((current) => current && items.some((item) => item.id === current.clientId) ? current : null);
      setWorkspaceRefreshToken((value) => value + 1);
      if (initial) {
        setRefreshState('idle');
      } else {
        setRefreshState('success');
        refreshTimerRef.current = setTimeout(() => {
          refreshTimerRef.current = null;
          if (mountedRef.current && requestId === refreshRequestIdRef.current) setRefreshState('idle');
        }, 2500);
      }
    } catch (value) {
      if (!mountedRef.current || requestId !== refreshRequestIdRef.current) return;
      setRefreshState('error');
      setError(value instanceof Error ? value.message : '无法加载客户');
    } finally {
      if (initial && mountedRef.current && requestId === refreshRequestIdRef.current) setLoading(false);
    }
  }

  function refreshArticles() { setArticleRefreshToken((value) => value + 1); }
  function refreshBatchState() { setBatchRefreshToken((value) => value + 1); }

  useEffect(() => { void refreshWorkspaceSources(true); }, []);

  const confirmHistoryLeave = useCallback(() => {
    if (!historyEditingArticle || !historyDirtyRef.current) return true;
    return window.confirm('历史文章有未保存修改，确认离开并放弃这些修改吗？');
  }, [historyEditingArticle]);

  function closeHistoryEditor(skipGuard = false) {
    if (!skipGuard && !confirmHistoryLeave()) return;
    const source = historySourceRef.current;
    historySourceRef.current = null;
    historyDirtyRef.current = false;
    setHistoryEditingArticle(null);
    source?.focus();
    requestAnimationFrame(() => source?.focus());
  }

  function openHistoryEditor(nextArticle: GeneratedContentArticle, source?: HTMLElement | null, published = false) {
    if (historyEditingArticle && historyEditingArticle.id !== nextArticle.id && !confirmHistoryLeave()) return;
    historySourceRef.current = source || null;
    setHistoryEditingPublished(published);
    setHistoryEditingArticle(nextArticle);
  }

  async function copyHistoryVersion() {
    if (!historyEditingArticle || !historyEditingPublished) return;
    if (!window.confirm(`确认复制“${historyEditingArticle.title}”为新版本？原文章和发布记录不会修改。`)) return;
    if (!window.confirm('再次确认：新版本会生成新的 articleId，必须重新审核和投稿。')) return;
    try {
      const copied = await copyContentArticleVersion({ clientId, sourceArticleId: historyEditingArticle.id });
      setHistoryEditingPublished(false);
      setHistoryEditingArticle(copied);
      historyDirtyRef.current = false;
      refreshArticles();
    } catch (value) {
      setError(value instanceof Error ? value.message : '复制文章新版本失败');
    }
  }

  function handleClientChange(nextClientId: string) {
    if (nextClientId === clientId) return;
    if (!confirmHistoryLeave()) return;
    closeHistoryEditor(true);
    setClientId(nextClientId);
    setArticle(null);
  }

  function changeTab(nextTab: 'questions' | 'generate' | 'history') {
    if (nextTab === tab) return;
    if (!confirmHistoryLeave()) return;
    closeHistoryEditor(true);
    setTab(nextTab);
  }

  if (loading) return <div className="flex h-full items-center justify-center text-slate-500"><LoaderCircle className="mr-2 h-5 w-5 animate-spin" />加载客户资料与模板目录</div>;
  return <div className="content-workbench flex h-full min-h-0 flex-col overflow-hidden">
    <div className="flex shrink-0 items-center gap-2 border-b border-slate-200 bg-white px-4 py-3">
      {(['questions', 'generate', 'history'] as const).map((id) => <button id={id} type="button" key={id} aria-label={id === 'history' ? '历史文章' : undefined} onClick={() => changeTab(id)} className={`rounded-md px-3 py-2 text-xs font-semibold ${tab === id ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-100'}`}>{id === 'questions' ? '问题与采集' : id === 'generate' ? '文章生成' : '文章管理'}</button>)}
      <div className="ml-auto flex items-center gap-2"><label className="text-xs text-slate-500">当前客户（单篇/问题/历史）</label><select aria-label="当前客户（单篇/问题/历史）" value={clientId} onChange={(event) => handleClientChange(event.target.value)} className="h-9 min-w-32 rounded-md border border-slate-300 bg-white px-2 text-sm"><option value="">暂无客户</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select><button type="button" onClick={() => void refreshWorkspaceSources()} disabled={refreshState === 'refreshing'} className="inline-flex h-9 items-center gap-1 rounded-md border border-slate-300 px-2 text-xs text-slate-600 disabled:opacity-50" aria-label="刷新客户与模板" title="刷新客户与模板"><RefreshCw className={`h-3.5 w-3.5 ${refreshState === 'refreshing' ? 'animate-spin' : ''}`} />{refreshState === 'refreshing' ? '刷新中…' : '刷新客户与模板'}</button></div>
    </div>
    {refreshState === 'success' && <div role="status" aria-live="polite" className="mx-3 mt-3 rounded border border-emerald-100 bg-emerald-50 p-2 text-xs text-emerald-700">客户与模板已刷新。</div>}
    {error && <div role="alert" aria-live="assertive" className="m-3 rounded border border-rose-100 bg-rose-50 p-2 text-xs text-rose-700">{error}</div>}
    <div className="min-h-0 flex-1">
      {tab === 'questions' && <QuestionCollectionView clients={clients} clientId={clientId} refreshToken={workspaceRefreshToken} onClientChange={handleClientChange} onRefresh={() => void refreshWorkspaceSources()} />}
      {tab === 'generate' && <ArticleGenerationView client={clients.find((item) => item.id === clientId)} clients={clients} clientId={clientId} refreshToken={workspaceRefreshToken} batchRefreshToken={batchRefreshToken} templateCatalog={templateCatalog} selectedArticle={article} onArticleChange={setArticle} onRefreshArticles={refreshArticles} onRefreshBatchState={refreshBatchState} />}
      {tab === 'history' && <ArticleAttentionProvider clientId={clientId}><div className="flex h-full min-h-0 min-w-0 flex-col gap-3 p-3"><ArticleStageTabs value={articleStageFilter} onChange={setArticleStageFilter} /><div className="flex min-h-0 min-w-0 flex-1 gap-3"><div className="min-h-0 min-w-0 flex-1"><GeneratedArticlesView clientId={clientId} refreshToken={articleRefreshToken} stageFilter={articleStageFilter} selectedAttentionId={attentionIntent?.attentionId} onArticleSelect={openHistoryEditor} onRefreshArticles={refreshArticles} onStageFilterChange={setArticleStageFilter} /></div>{historyEditingArticle && <GeneratedArticleEditorPanel article={historyEditingArticle} published={historyEditingPublished} onSaved={(saved) => { setHistoryEditingArticle(saved); refreshArticles(); }} onClose={() => closeHistoryEditor(true)} onCopyVersion={() => void copyHistoryVersion()} onDirtyChange={(dirty) => { historyDirtyRef.current = dirty; }} />}</div></div></ArticleAttentionProvider>}
    </div>
  </div>;
}
