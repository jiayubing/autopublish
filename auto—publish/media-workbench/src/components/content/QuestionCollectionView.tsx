import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, MessageSquareText, Pencil, Save, Trash2 } from 'lucide-react';
import { collectDoubaoQuestion, createContentQuestion, deleteContentQuestion, getCachedDoubaoLoginState, getDoubaoLoginStatus, getDoubaoQueueState, listContentQuestions, listContentResearch, openDoubaoLogin, pauseDoubaoBatch, previewDoubaoBatch, rememberDoubaoLoginState, retryFailedDoubao, resumeDoubaoBatch, saveManualResearch, startPreparedDoubaoBatch, stopDoubaoBatch, subscribeDoubaoQueue, updateContentQuestion } from '../../electron-api';
import { ContentClient, ContentQuestion, ContentResearch, DoubaoBatchMode, DoubaoBatchPreview, DoubaoLoginState, DoubaoQueueState } from '../../types';
import { formatBeijingTime } from '../../time-format';
import CollapsibleSourceItem from './CollapsibleSourceItem';
import CollectionTaskBar from './CollectionTaskBar';
import ManualResearchEditorPanel from './ManualResearchEditorPanel';
import { createManualAnswerSession, manualAnswerDraftDirty, ManualAnswerDraft, ManualAnswerSession, sameManualAnswerSession } from '../../content-question-editor-session';

interface QuestionCollectionViewProps {
  clients: ContentClient[];
  clientId: string;
  refreshToken: number;
  onContentSourcesChanged: () => void;
  [key: string]: unknown;
}

export function toggleAllClientIds(clientIds: string[], selectedClientIds: string[]): string[] {
  const selected = new Set(selectedClientIds);
  const allSelected = clientIds.length > 0 && clientIds.every((id) => selected.has(id));
  return allSelected ? [] : [...clientIds];
}

export function getBatchSelectionState(clientIds: string[], selectedClientIds: string[]) {
  const selected = new Set(selectedClientIds);
  const selectedCount = clientIds.filter((id) => selected.has(id)).length;
  return {
    selectedCount,
    allSelected: clientIds.length > 0 && selectedCount === clientIds.length,
    indeterminate: selectedCount > 0 && selectedCount < clientIds.length,
  };
}

const emptyQueue: DoubaoQueueState = { status: 'idle', currentTaskId: null, completed: 0, total: 0, waitRemainingMs: 0, tasks: [] };

export default function QuestionCollectionView({ clients, clientId, refreshToken, onContentSourcesChanged }: QuestionCollectionViewProps) {
  const [questions, setQuestions] = useState<ContentQuestion[]>([]);
  const [research, setResearch] = useState<ContentResearch[]>([]);
  const [selectedClientIds, setSelectedClientIds] = useState<string[]>(clientId ? [clientId] : []);
  const [batchPreview, setBatchPreview] = useState<DoubaoBatchPreview | null>(null);
  const [questionDraftId, setQuestionDraftId] = useState<string | null>(null);
  const [questionDraftText, setQuestionDraftText] = useState('');
  const [manualAnswerSession, setManualAnswerSession] = useState<ManualAnswerSession | null>(null);
  const [manualDraft, setManualDraft] = useState<ManualAnswerDraft>({ answerText: '', referenceTitle: '', referenceUrl: '' });
  const [manualSaving, setManualSaving] = useState(false);
  const [login, setLogin] = useState<DoubaoLoginState>(() => getCachedDoubaoLoginState());
  const [queue, setQueue] = useState<DoubaoQueueState>(emptyQueue);
  const [error, setError] = useState('');
  const [collectionPending, setCollectionPending] = useState(false);
  const refreshPromise = useRef<Promise<void> | null>(null);
  const refreshClientId = useRef<string | null>(null);
  const previousQueueStatus = useRef<DoubaoQueueState['status']>('idle');
  const clientIdRef = useRef(clientId);
  const onContentSourcesChangedRef = useRef(onContentSourcesChanged);
  const loadSequence = useRef(0);
  const collectionPendingRef = useRef(false);
  const collectionTokenSequence = useRef(0);
  const pendingCollectionToken = useRef<string | null>(null);
  const refreshedCollectionToken = useRef<string | null>(null);
  const manualSessionRef = useRef<ManualAnswerSession | null>(null);
  const manualBaseDraftRef = useRef<ManualAnswerDraft>({ answerText: '', referenceTitle: '', referenceUrl: '' });
  const manualSourceRef = useRef<HTMLButtonElement | null>(null);
  const sessionTokenSequence = useRef(0);

  clientIdRef.current = clientId;
  onContentSourcesChangedRef.current = onContentSourcesChanged;
  manualSessionRef.current = manualAnswerSession;

  const researchById = useMemo(() => new Map(research.map((item) => [item.id, item])), [research]);
  const selectedQuestions = questions.filter((item) => item.enabled);
  const clientIds = clients.map((client) => client.id);
  const batchSelection = getBatchSelectionState(clientIds, selectedClientIds);
  const selectAllRef = useRef<HTMLInputElement>(null);
  const activeQueueStatus = (status: DoubaoQueueState['status']) => status === 'running' || status === 'paused' || status === 'stopping';
  const isCollecting = collectionPending || activeQueueStatus(queue.status);

  async function loadQuestions(targetClientId = clientIdRef.current, isCancelled = () => false) {
    if (!targetClientId) return;
    const sequence = ++loadSequence.current;
    try {
      const [nextQuestions, nextResearch] = await Promise.all([listContentQuestions(targetClientId), listContentResearch(targetClientId)]);
      if (isCancelled() || sequence !== loadSequence.current || clientIdRef.current !== targetClientId) return;
      setQuestions(nextQuestions); setResearch(nextResearch); setError('');
    } catch (value) {
      if (isCancelled() || sequence !== loadSequence.current || clientIdRef.current !== targetClientId) return;
      setError(value instanceof Error ? value.message : '无法加载问题与采集结果');
    }
  }

  function refreshAfterCollection() {
    const targetClientId = clientIdRef.current;
    if (!targetClientId) return Promise.resolve();
    if (refreshPromise.current && refreshClientId.current === targetClientId) return refreshPromise.current;
    const promise = (async () => {
      await loadQuestions(targetClientId);
      if (clientIdRef.current === targetClientId) onContentSourcesChangedRef.current();
    })();
    refreshPromise.current = promise;
    refreshClientId.current = targetClientId;
    promise.then(() => {
      if (refreshPromise.current === promise) { refreshPromise.current = null; refreshClientId.current = null; }
    }, () => {
      if (refreshPromise.current === promise) { refreshPromise.current = null; refreshClientId.current = null; }
    });
    return promise;
  }

  function tryBeginCollection() {
    if (collectionPendingRef.current || activeQueueStatus(queue.status)) return false;
    const token = `command:${++collectionTokenSequence.current}`;
    collectionPendingRef.current = true;
    pendingCollectionToken.current = token;
    setCollectionPending(true);
    return token;
  }

  function finishCollection() {
    collectionPendingRef.current = false;
    pendingCollectionToken.current = null;
    setCollectionPending(false);
  }

  function queueRunToken(state: DoubaoQueueState | undefined) {
    if (!state || !Array.isArray(state.tasks) || state.tasks.length === 0) return null;
    const taskIds = state.tasks.map((task) => task.id).filter(Boolean);
    return taskIds.length > 0 ? `queue:${taskIds.join('|')}` : null;
  }

  function refreshCollectionOnce(token: string) {
    if (refreshedCollectionToken.current === token) return Promise.resolve();
    refreshedCollectionToken.current = token;
    return refreshAfterCollection();
  }

  async function refreshSingleCollection(commandToken: string) {
    try {
      const state = await getDoubaoQueueState();
      await refreshCollectionOnce(queueRunToken(state) || commandToken);
    } catch (_) {
      await refreshCollectionOnce(commandToken);
    }
  }

  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = batchSelection.indeterminate;
  }, [batchSelection.indeterminate]);
  useEffect(() => {
    let cancelled = false;
    void loadQuestions(clientId, () => cancelled);
    return () => { cancelled = true; };
  }, [clientId, refreshToken]);
  useEffect(() => {
    manualSessionRef.current = null;
    setManualAnswerSession(null);
    setManualDraft({ answerText: '', referenceTitle: '', referenceUrl: '' });
    setManualSaving(false);
    manualBaseDraftRef.current = { answerText: '', referenceTitle: '', referenceUrl: '' };
    manualSourceRef.current = null;
    setQuestionDraftId(null);
    setQuestionDraftText('');
  }, [clientId]);
  useEffect(() => () => { manualSessionRef.current = null; }, []);
  useEffect(() => {
    let disposed = false;
    let queueEventReceived = false;
    const unsubscribe = subscribeDoubaoQueue((state) => {
      queueEventReceived = true;
      const wasActive = activeQueueStatus(previousQueueStatus.current);
      previousQueueStatus.current = state.status;
      if (!disposed) {
        setQueue(state);
        if (state.status === 'completed' && (wasActive || state.total === 0 || pendingCollectionToken.current)) {
          const token = queueRunToken(state) || pendingCollectionToken.current || `event:${++collectionTokenSequence.current}`;
          void refreshCollectionOnce(token);
        }
      }
    });
    async function initializeQueue() {
      try {
        const snapshot = await getDoubaoQueueState();
        if (!disposed && !queueEventReceived) {
          previousQueueStatus.current = snapshot.status;
          setQueue(snapshot);
        }
      } catch (value) {
        if (!disposed) setError(value instanceof Error ? value.message : '无法读取采集队列');
      }
    }
    void initializeQueue();
    return () => { disposed = true; unsubscribe(); };
  }, []);

  async function saveQuestion() {
    if (!clientId || !questionDraftText.trim()) return;
    try {
      if (questionDraftId) await updateContentQuestion({ clientId, questionId: questionDraftId, text: questionDraftText });
      else await createContentQuestion({ clientId, text: questionDraftText, enabled: true });
      setQuestionDraftText(''); setQuestionDraftId(null); await loadQuestions(); onContentSourcesChangedRef.current();
    } catch (value) { setError(value instanceof Error ? value.message : '保存问题失败'); }
  }

  async function toggleQuestion(question: ContentQuestion) {
    try { await updateContentQuestion({ clientId, questionId: question.id, enabled: !question.enabled }); await loadQuestions(); onContentSourcesChangedRef.current(); }
    catch (value) { setError(value instanceof Error ? value.message : '更新问题状态失败'); }
  }

  async function deleteQuestion(question: ContentQuestion) {
    if (!confirm('删除这个问题及其当前回答？删除当前回答，但不会修改已保存文章。')) return;
    try { await deleteContentQuestion({ clientId, questionId: question.id }); await loadQuestions(); onContentSourcesChangedRef.current(); }
    catch (value) { setError(value instanceof Error ? value.message : '删除问题失败'); }
  }

  async function collect(question: ContentQuestion, force: boolean) {
    const commandToken = tryBeginCollection();
    if (!commandToken) return;
    try {
      if (force && !confirm('明确重新采集会覆盖当前问题的回答，已保存文章不会被修改。继续吗？')) return;
      await collectDoubaoQuestion({ clientId, questionId: question.id, force });
      await refreshSingleCollection(commandToken);
    }
    catch (value) { setError(value instanceof Error ? value.message : '豆包采集失败'); }
    finally { finishCollection(); }
  }

  async function recollect(question: ContentQuestion) {
    const commandToken = tryBeginCollection();
    if (!commandToken) return;
    try {
      if (!confirm('明确重新采集会覆盖当前问题的回答，已保存文章不会被修改。继续吗？')) return;
      await collectDoubaoQuestion({ clientId, questionId: question.id, force: true });
      await refreshSingleCollection(commandToken);
    }
    catch (value) { setError(value instanceof Error ? value.message : '豆包重新采集失败'); }
    finally { finishCollection(); }
  }

  async function startBatch(mode: DoubaoBatchMode) {
    const commandToken = tryBeginCollection();
    if (!commandToken) return;
    try {
      if (!selectedClientIds.length) { setError('请先选择批次客户'); return; }
      const preview = await previewDoubaoBatch({ clientIds: selectedClientIds, mode });
      setBatchPreview(preview);
      if (!preview.taskCount) { setError('所选客户没有可采集的已启用问题'); return; }
      if (mode === 'recollect' && !confirm(`将重新采集 ${preview.clientCount} 个客户的 ${preview.taskCount} 个问题，覆盖模式只在新回答成功后替换旧回答。继续吗？`)) return;
      const state = await startPreparedDoubaoBatch(preview.tasks);
      const token = queueRunToken(state);
      if (token) await refreshCollectionOnce(token);
    } catch (value) { setError(value instanceof Error ? value.message : '无法开始批量采集'); }
    finally { finishCollection(); }
  }

  async function retryFailed() {
    const commandToken = tryBeginCollection();
    if (!commandToken) return;
    try {
      const state = await retryFailedDoubao();
      await refreshCollectionOnce(queueRunToken(state) || commandToken);
    } catch (value) { setError(value instanceof Error ? value.message : '重试失败任务失败'); }
    finally { finishCollection(); }
  }

  function openQuestionEditor(question: ContentQuestion) {
    setQuestionDraftId(question.id);
    setQuestionDraftText(question.text);
  }

  function closeManualAnswerSession(force = false) {
    if (!manualAnswerSession) return true;
    if (!force && manualAnswerDraftDirty(manualBaseDraftRef.current, manualDraft) && !window.confirm('人工回答有未保存修改，确认关闭并放弃这些修改吗？')) return false;
    manualSessionRef.current = null;
    setManualAnswerSession(null);
    setManualDraft({ answerText: '', referenceTitle: '', referenceUrl: '' });
    setManualSaving(false);
    manualBaseDraftRef.current = { answerText: '', referenceTitle: '', referenceUrl: '' };
    const source = manualSourceRef.current;
    manualSourceRef.current = null;
    source?.focus();
    requestAnimationFrame(() => source?.focus());
    return true;
  }

  function openManualAnswer(question: ContentQuestion, researchItem: ContentResearch | undefined, source: HTMLButtonElement) {
    if (manualAnswerSession && !closeManualAnswerSession()) return;
    const nextDraft: ManualAnswerDraft = {
      answerText: researchItem?.answerText || '',
      referenceTitle: researchItem?.references?.[0]?.title || '',
      referenceUrl: researchItem?.references?.[0]?.url || ''
    };
    const nextSession = createManualAnswerSession(clientId, question.id, `manual:${++sessionTokenSequence.current}`);
    manualSourceRef.current = source;
    manualBaseDraftRef.current = nextDraft;
    manualSessionRef.current = nextSession;
    setManualSaving(false);
    setManualDraft(nextDraft);
    setManualAnswerSession(nextSession);
    setError('');
  }

  async function saveManual() {
    const session = manualAnswerSession;
    if (!session || session.clientId !== clientId || !manualDraft.answerText.trim()) return;
    const references = manualDraft.referenceTitle.trim() && manualDraft.referenceUrl.trim() ? [{ title: manualDraft.referenceTitle.trim(), url: manualDraft.referenceUrl.trim() }] : [];
    setManualSaving(true);
    try {
      await saveManualResearch({ clientId: session.clientId, questionId: session.questionId, answerText: manualDraft.answerText, references });
      if (!sameManualAnswerSession(manualSessionRef.current, session)) return;
      await loadQuestions(session.clientId);
      if (!sameManualAnswerSession(manualSessionRef.current, session)) return;
      onContentSourcesChangedRef.current();
      closeManualAnswerSession(true);
    } catch (value) {
      if (sameManualAnswerSession(manualSessionRef.current, session)) setError(value instanceof Error ? value.message : '保存人工回答失败');
    } finally {
      if (sameManualAnswerSession(manualSessionRef.current, session)) setManualSaving(false);
    }
  }

  async function refreshLogin() {
    const previousLogin = login;
    setLogin({ status: 'checking' });
    try {
      const nextLogin = await getDoubaoLoginStatus();
      setLogin(nextLogin);
      rememberDoubaoLoginState(nextLogin);
    }
    catch (value) {
      if (value instanceof Error && 'code' in value && value.code === 'PLAYWRIGHT_SESSION_NOT_OPEN') {
        setLogin(previousLogin);
        setError('');
        return;
      }
      const errorText = value instanceof Error ? value.message : '无法读取登录状态';
      setLogin({ status: 'session_error', errorText });
      setError(errorText);
    }
  }
  async function loginNow() {
    setLogin({ status: 'checking' });
    try {
      const nextLogin = await openDoubaoLogin();
      setLogin(nextLogin);
      rememberDoubaoLoginState(nextLogin);
    }
    catch (value) {
      const errorText = value instanceof Error ? value.message : '无法打开豆包登录';
      setLogin({ status: 'session_error', errorText });
      setError(errorText);
    }
  }

  const manualQuestion = manualAnswerSession ? questions.find((item) => item.id === manualAnswerSession.questionId) : null;
  const manualClient = clients.find((item) => item.id === clientId);
  return <div className="content-panel flex h-full min-h-0 flex-col overflow-hidden">
    <div className="flex flex-wrap items-center justify-end gap-2 border-b border-slate-200 bg-white px-4 py-3">
      <div className="flex items-center gap-2 text-xs"><span className="text-slate-500">豆包登录：{login.status}</span><button type="button" onClick={refreshLogin} className="text-slate-500 underline">刷新</button><button type="button" onClick={loginNow} className="rounded-md bg-slate-900 px-3 py-2 text-white">打开登录</button></div>
    </div>
    <div className="flex min-h-0 flex-1">
      <div className="min-h-0 min-w-0 flex-1 space-y-4 overflow-y-auto p-4">
      <section className="rounded-md border border-slate-200 bg-white p-3">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div><h2 className="text-sm font-semibold">批次客户</h2><p className="mt-1 text-xs text-slate-500">批次客户独立于当前客户：已选 {batchSelection.selectedCount} 个</p></div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => { setSelectedClientIds(toggleAllClientIds(clientIds, selectedClientIds)); setBatchPreview(null); }} className="rounded border border-slate-300 px-2 py-1 text-xs">全选客户</button>
            <button type="button" onClick={() => { setSelectedClientIds([]); setBatchPreview(null); }} disabled={!batchSelection.selectedCount} className="rounded border border-slate-300 px-2 py-1 text-xs disabled:opacity-40">取消全选</button>
          </div>
        </div>
        <label className="mb-3 inline-flex items-center gap-2 text-xs font-semibold text-slate-700"><input ref={selectAllRef} type="checkbox" checked={batchSelection.allSelected} onChange={() => { setSelectedClientIds(toggleAllClientIds(clientIds, selectedClientIds)); setBatchPreview(null); }} />全选客户</label>
        <div className="flex flex-wrap gap-3">{clients.map((client) => <label key={client.id} className="flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={selectedClientIds.includes(client.id)} onChange={(event) => { setSelectedClientIds((current) => event.target.checked ? [...new Set([...current, client.id])] : current.filter((id) => id !== client.id)); setBatchPreview(null); }} />{client.name}</label>)}</div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" disabled={isCollecting || !batchSelection.selectedCount} onClick={() => void startBatch('missing')} className="collection-command-button rounded-md bg-blue-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">采集选中客户</button>
          <button type="button" disabled={isCollecting || !batchSelection.selectedCount} onClick={() => void startBatch('recollect')} className="collection-command-button rounded-md border border-rose-300 px-3 py-2 text-xs font-semibold text-rose-700 disabled:opacity-40">重新采集选中客户</button>
        </div>
        {batchPreview && <p className="mt-2 text-xs text-slate-500">预览：{batchPreview.clientCount} 个客户 · {batchPreview.taskCount} 个问题进入队列 · 跳过 {batchPreview.skippedExisting} 个已有回答 · 排除 {batchPreview.disabledQuestions} 个停用问题</p>}
      </section>
      <section className="rounded-md border border-slate-200 bg-white p-3">
        <div className="mb-3 flex items-center justify-between"><div><h2 className="text-sm font-semibold">问题与采集</h2>{questionDraftId && <p className="mt-1 text-xs text-blue-700">正在编辑：{questions.find((item) => item.id === questionDraftId)?.text || '问题'}</p>}</div><span className="text-xs text-slate-500">当前客户 · 启用问题 {selectedQuestions.length}</span></div>
        <div className="mb-3 flex gap-2"><input aria-label="问题草稿" value={questionDraftText} onChange={(event) => setQuestionDraftText(event.target.value)} placeholder="新增或编辑问题" className="h-9 min-w-0 flex-1 rounded-md border border-slate-300 px-2 text-sm" /><button type="button" onClick={() => void saveQuestion()} title="保存问题" className="task-icon-button"><Save className="h-4 w-4" /></button>{questionDraftId && <button type="button" onClick={() => { setQuestionDraftText(''); setQuestionDraftId(null); }} className="rounded border border-slate-300 px-2 text-xs text-slate-600">取消编辑</button>}</div>
        <div className="space-y-2">{questions.map((question) => {
          const item = researchById.get(question.id);
          const summary = item ? `${item.isAnswerComplete === false ? '未完成' : '已完成'} · ${item.answerText?.length || 0} 字 · ${item.collectionMethod} · ${formatBeijingTime(item.collectedAt || item.updatedAt)}` : '尚未采集';
          const actions = <><button type="button" onClick={() => openQuestionEditor(question)} title="编辑问题" className="task-icon-button"><Pencil className="h-4 w-4" /></button><button type="button" aria-label={`人工回答：${question.text}`} ref={(element) => { if (element && manualAnswerSession?.questionId === question.id) manualSourceRef.current = element; }} onClick={(event) => openManualAnswer(question, item, event.currentTarget)} title="人工回答" className="task-icon-button"><MessageSquareText className="h-4 w-4" /></button><button type="button" disabled={isCollecting} onClick={() => void collect(question, false)} title="单条采集" className="task-icon-button"><Check className="h-4 w-4" /></button><button type="button" disabled={isCollecting} onClick={() => void recollect(question)} title="明确重新采集" className="task-icon-button"><span className="text-xs">重采</span></button><button type="button" onClick={() => void deleteQuestion(question)} title="删除问题" className="task-icon-button text-rose-600"><Trash2 className="h-4 w-4" /></button></>;
          return <div key={question.id}><CollapsibleSourceItem id={question.id} title={question.text} summary={summary} selected={question.enabled} onSelectedChange={() => void toggleQuestion(question)} defaultExpanded={false} actions={actions}>
            {item ? <div className="grid gap-2"><div className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded bg-slate-50 p-2">{item.answerText}</div><div>{item.references.map((reference) => <a key={reference.url} href={reference.url} target="_blank" rel="noreferrer" className="mr-2 text-blue-600 underline">{reference.title}</a>)}</div></div> : <div className="text-slate-400">尚未采集回答</div>}
          </CollapsibleSourceItem></div>;
        })}</div>
      </section>
      {error && <div className="rounded-md border border-rose-100 bg-rose-50 p-2 text-xs text-rose-700">{error}</div>}
      </div>
      {manualAnswerSession && manualQuestion && <ManualResearchEditorPanel session={manualAnswerSession} draft={manualDraft} questionText={manualQuestion.text} clientName={manualClient?.name || clientId} saving={manualSaving} onDraftChange={setManualDraft} onSave={() => void saveManual()} onClose={() => { closeManualAnswerSession(); }} />}
    </div>
    <CollectionTaskBar queue={queue} busy={collectionPending} onPause={() => void pauseDoubaoBatch()} onResume={() => void resumeDoubaoBatch()} onStop={() => void stopDoubaoBatch()} onRetry={retryFailed} />
  </div>;
}
