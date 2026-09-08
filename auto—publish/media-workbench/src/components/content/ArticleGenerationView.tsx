import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { RotateCcw, Sparkles } from 'lucide-react';
import type { ContentClient, ContentCommandStaleResult, ContentMaterial, ContentResearch, ContentTemplate, ContentTemplateCatalog } from '../../types/content';
import type { ClientGenerationOperation } from '../../types/client-generation';
import { templateScenarioLabel, templateSourceLabel, templateTitle, visibleGenerationTemplates } from '../../content-generation-ui-logic';
import BaseCollapsibleSourceItem, { CollapsibleSourceItemProps } from './CollapsibleSourceItem';
import BatchGenerationView from './BatchGenerationView';
import type { ClientGrouping } from './ClientSelector';
import { isContentCommandStaleResult } from '../../content-command-result';

interface ArticleGenerationViewProps {
  clientId: string;
  client?: ContentClient;
  clients?: ContentClient[];
  grouping?: ClientGrouping;
  research: ContentResearch[];
  researchByClient: Record<string, ContentResearch[]>;
  getClientDetails?: (clientId: string) => Promise<{ client: ContentClient; research: ContentResearch[] }>;
  templateCatalog?: ContentTemplateCatalog;
  selectedArticle?: unknown;
  onArticleChange?: (article: null) => void;
  commands: {
    retryMaterial: (input: Record<string, unknown>) => Promise<ContentMaterial | ContentCommandStaleResult>;
    saveArticle?: (input: Record<string, unknown>) => Promise<unknown>;
    getArticleEditor?: (input: { clientId: string; articleId: string }) => Promise<unknown>;
  };
  commandStates: { retryMaterial: { busy: boolean }; saveArticle?: { busy: boolean } };
  generationFeature: {
    getSnapshot: () => { command: { busy: boolean }; operation?: ClientGenerationOperation | null };
    subscribe: (listener: () => void) => () => void;
    start?: (input: Record<string, unknown>) => Promise<unknown>;
    generate: (input: Record<string, unknown>) => Promise<unknown>;
    retry?: (operationId: string) => Promise<unknown>;
  };
  generationMode?: 'client' | 'batch';
  onViewBatchArticles?: (batchId: string, clientId?: string, articleId?: string) => void;
}

type SubmissionChoice = { id: string; displayName: string };
const CollapsibleSourceItem = BaseCollapsibleSourceItem as React.ComponentType<CollapsibleSourceItemProps & React.Attributes>;

function toMaterials(client?: ContentClient): ContentMaterial[] {
  return (client?.knowledgeFiles || []).map((item) => ({
    ...item,
    id: item.id || item.name,
    status: item.status || (item.content?.trim() ? 'ready' : 'error'),
    characterCount: item.characterCount ?? item.content?.length ?? 0,
  }));
}

function statusLabel(status: string) {
  if (status === 'pending') return '排队中';
  if (status === 'running') return '生成中';
  if (status === 'succeeded') return '已完成';
  if (status === 'failed') return '失败';
  return status;
}

function statusClass(status: string) {
  if (status === 'succeeded') return 'text-emerald-700';
  if (status === 'failed') return 'text-rose-700';
  if (status === 'running') return 'text-blue-700';
  return 'text-slate-500';
}

export default function ArticleGenerationView({
  clientId,
  client,
  clients = [],
  grouping,
  research,
  researchByClient,
  getClientDetails,
  templateCatalog,
  commands,
  commandStates,
  generationFeature,
  generationMode = 'client',
  onViewBatchArticles,
}: ArticleGenerationViewProps) {
  if (generationMode === 'batch') {
    return <div className="min-h-0 flex-1"><BatchGenerationView clients={clients} grouping={grouping} currentClientId={clientId} researchByClient={researchByClient} getClientDetails={getClientDetails} templateCatalog={templateCatalog} commands={{ retryMaterial: commands.retryMaterial }} commandStates={commandStates} onViewBatchArticles={onViewBatchArticles} /></div>;
  }

  const [materialItems, setMaterialItems] = useState<ContentMaterial[]>([]);
  const [materialIds, setMaterialIds] = useState<string[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [platform, setPlatform] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [showBuiltinTemplates, setShowBuiltinTemplates] = useState(false);
  const [articleCount, setArticleCount] = useState(1);
  const [concurrency, setConcurrency] = useState(2);
  const [error, setError] = useState('');
  const materialSelectionTouchedRef = useRef(false);
  const researchSelectionTouchedRef = useRef(false);
  const generationSnapshot = useSyncExternalStore(generationFeature.subscribe, generationFeature.getSnapshot, generationFeature.getSnapshot);
  const operation = generationSnapshot.operation || null;
  const commandBusy = generationSnapshot.command.busy;

  const materials = materialItems;
  const validMaterials = useMemo(() => materials.filter((item) => item.status !== 'error' && item.status !== 'converting' && Boolean(item.content?.trim())), [materials]);
  const validResearch = useMemo(() => research.filter((item) => Boolean(item.answerText?.trim()) && item.isAnswerComplete !== false), [research]);
  const totalAnswerCharacters = useMemo(() => selectedIds.reduce((total, id) => total + (research.find((item) => item.id === id)?.answerText?.length || 0), 0), [research, selectedIds]);
  const totalMaterialCharacters = useMemo(() => materialIds.reduce((total, id) => total + (materials.find((item) => (item.id || item.name) === id)?.content?.length || 0), 0), [materials, materialIds]);
  const catalog = templateCatalog || { revision: '', platforms: [], templates: [], diagnostics: [] };
  const visibleTemplates = useMemo(() => visibleGenerationTemplates(catalog, showBuiltinTemplates), [catalog, showBuiltinTemplates]);
  const customTemplateCount = useMemo(() => catalog.templates.filter((item) => item.source === 'custom').length, [catalog.templates]);
  const visiblePlatformIds = useMemo(() => new Set(visibleTemplates.map((item) => item.platform)), [visibleTemplates]);
  const templatePlatforms: SubmissionChoice[] = useMemo(() => catalog.platforms.filter((item) => visiblePlatformIds.has(item.id)).map((item) => ({ id: item.id, displayName: item.displayName || item.id })), [catalog.platforms, visiblePlatformIds]);
  const platformTemplates: ContentTemplate[] = useMemo(() => visibleTemplates.filter((item) => item.platform === platform), [visibleTemplates, platform]);

  useEffect(() => {
    setMaterialItems(toMaterials(client));
  }, [client]);

  useEffect(() => {
    materialSelectionTouchedRef.current = false;
    researchSelectionTouchedRef.current = false;
    setMaterialIds([]);
    setSelectedIds([]);
    setError('');
  }, [clientId]);

  useEffect(() => {
    setMaterialIds((current) => materialSelectionTouchedRef.current ? current : validMaterials.map((item) => item.id || item.name));
  }, [validMaterials]);
  useEffect(() => {
    setSelectedIds((current) => researchSelectionTouchedRef.current ? current : validResearch.map((item) => item.id));
  }, [validResearch]);

  useEffect(() => {
    if (platform && visiblePlatformIds.has(platform)) return;
    setPlatform(templatePlatforms[0]?.id || '');
  }, [platform, templatePlatforms, visiblePlatformIds]);

  useEffect(() => {
    if (templateId && platformTemplates.some((item) => item.id === templateId)) return;
    setTemplateId(platformTemplates[0]?.id || '');
  }, [platformTemplates, templateId]);

  function setMaterialSelection(next: React.SetStateAction<string[]>) {
    materialSelectionTouchedRef.current = true;
    setMaterialIds(next);
  }
  function setResearchSelection(next: React.SetStateAction<string[]>) {
    researchSelectionTouchedRef.current = true;
    setSelectedIds(next);
  }

  async function retryMaterialItem(materialId: string) {
    setError('');
    try {
      const next = await commands.retryMaterial({ clientId, materialId });
      if (isContentCommandStaleResult(next)) return;
      setMaterialItems((current) => current.map((item) => (item.id || item.name) === materialId ? toMaterials({ id: clientId, name: clientId, knowledgeFiles: [next] })[0] : item));
    } catch (value) {
      setError(value instanceof Error ? value.message : '资料重试失败');
    }
  }

  async function startGeneration() {
    if (!clientId || !materialIds.length || !selectedIds.length || !templateId || commandBusy || operation?.status === 'running') return;
    setError('');
    try {
      const start = generationFeature.start || generationFeature.generate;
      await start({
        clientId,
        materialIds,
        researchQueryIds: selectedIds,
        platform,
        templateId,
        articleCount,
        concurrency,
        templateCatalogRevision: catalog.revision,
      });
    } catch (value) {
      setError(value instanceof Error ? value.message : '客户生成任务启动失败');
    }
  }

  async function retryFailed() {
    if (!operation || !generationFeature.retry || operation.status === 'running') return;
    setError('');
    try {
      await generationFeature.retry(operation.operationId);
    } catch (value) {
      setError(value instanceof Error ? value.message : '失败任务重试失败');
    }
  }

  const finishedCount = operation ? operation.counts.succeeded + operation.counts.failed : 0;
  const progress = operation && operation.counts.total ? Math.round((finishedCount / operation.counts.total) * 100) : 0;
  const currentClientName = client?.name || clientId || '当前客户';

  return <div className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto p-4">
    <section className="rounded-md border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">{currentClientName} · 客户生成</h2>
          <p className="mt-1 text-xs text-slate-500">资料 {materialIds.length} 份 · 回答 {selectedIds.length} 条 · 预计输入字符数 {totalMaterialCharacters + totalAnswerCharacters}</p>
          {!clientId && <p className="mt-1 text-xs text-amber-700">当前工作区还没有客户，请先准备客户资料。</p>}
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <label className="text-xs text-slate-500">写作模板平台</label>
          <select aria-label="写作模板平台" value={platform} onChange={(event) => { setPlatform(event.target.value); setTemplateId(''); }} className="h-9 min-w-0 rounded-md border border-slate-300 bg-white px-2 text-xs">{templatePlatforms.map((item) => <option key={item.id} value={item.id}>{item.displayName}</option>)}</select>
          <label className="text-xs text-slate-500">写作模板</label>
          <select aria-label="写作模板" value={templateId} onChange={(event) => setTemplateId(event.target.value)} className="h-9 min-w-0 rounded-md border border-slate-300 bg-white px-2 text-xs">{platformTemplates.map((item) => <option key={item.id} value={item.id}>{templateTitle(item)}{templateScenarioLabel(item) ? ` · ${templateScenarioLabel(item)}` : ''} · {templateSourceLabel(item)}</option>)}</select>
          {customTemplateCount > 0 && <label className="inline-flex items-center gap-1 text-xs text-slate-500"><input type="checkbox" aria-label="显示内置模板" checked={showBuiltinTemplates} onChange={(event) => setShowBuiltinTemplates(event.target.checked)} />显示内置模板</label>}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setMaterialSelection(validMaterials.map((item) => item.id || item.name))} className="rounded border border-slate-300 px-2 py-1 text-xs">全选资料</button>
        <button type="button" onClick={() => setMaterialSelection([])} className="rounded border border-slate-300 px-2 py-1 text-xs">取消资料全选</button>
        <button type="button" onClick={() => setResearchSelection(validResearch.map((item) => item.id))} className="rounded border border-slate-300 px-2 py-1 text-xs">全选回答</button>
        <button type="button" onClick={() => setResearchSelection([])} className="rounded border border-slate-300 px-2 py-1 text-xs">取消回答全选</button>
        <label className="ml-auto inline-flex items-center gap-2 text-xs text-slate-600">本次生成 <input aria-label="本次生成篇数" type="number" min={1} max={100} value={articleCount} disabled={operation?.status === 'running'} onChange={(event) => setArticleCount(Math.max(1, Math.min(100, Number(event.target.value) || 1)))} className="h-8 w-16 rounded border border-slate-300 px-2" /> 篇</label>
        <label className="inline-flex items-center gap-2 text-xs text-slate-600">并发 <select aria-label="客户生成并发数" value={concurrency} disabled={operation?.status === 'running'} onChange={(event) => setConcurrency(Number(event.target.value))} className="h-8 rounded border border-slate-300 bg-white px-2">{[1, 2, 3, 4].map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
      </div>
      <p className="mt-2 text-xs text-slate-400">并发只限制当前客户；所有客户和批量生成共用全局 AI 执行上限。</p>
      <div className="mt-3 grid gap-2">{materials.map((item) => <CollapsibleSourceItem key={item.id || item.name} id={`material-${item.id || item.name}`} title={item.name} summary={`${item.extension || '资料'} · ${item.characterCount || 0} 字${item.status === 'error' ? ' · 错误' : ''}`} selected={materialIds.includes(item.id || item.name)} onSelectedChange={(selected) => setMaterialSelection((current) => selected ? [...new Set([...current, item.id || item.name])] : current.filter((value) => value !== (item.id || item.name)))} defaultExpanded={false} actions={<button type="button" onClick={() => void retryMaterialItem(item.id || item.name)} disabled={commandStates.retryMaterial.busy} title="预览或刷新资料" className="text-xs text-slate-500 underline disabled:opacity-40">{item.status === 'error' ? (commandStates.retryMaterial.busy ? '重试中…' : '重试') : '预览'}</button>}>{item.content || '资料转换失败，请点击重试。'}</CollapsibleSourceItem>)}{validResearch.map((item) => <CollapsibleSourceItem key={item.id} id={`research-${item.id}`} title={item.question || item.id} summary={`${item.answerText?.length || 0} 字 · GEO 调研回答`} selected={selectedIds.includes(item.id)} onSelectedChange={(selected) => setResearchSelection((current) => selected ? [...new Set([...current, item.id])] : current.filter((value) => value !== item.id))} defaultExpanded={false} actions={<span className="text-xs text-slate-400">预览</span>}>{item.answerText}</CollapsibleSourceItem>)}</div>
      <button type="button" onClick={() => void startGeneration()} disabled={!materialIds.length || !selectedIds.length || !clientId || !templateId || commandBusy || operation?.status === 'running'} className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-blue-600 text-sm font-semibold text-white disabled:opacity-40"><Sparkles className="h-4 w-4" />{commandBusy ? '启动中…' : operation?.status === 'running' ? `正在生成 ${operation.counts.succeeded}/${operation.counts.total}` : `生成 ${articleCount} 篇文章`}</button>
    </section>

    {operation && <section className="rounded-md border border-slate-200 bg-white p-4" aria-label="客户生成任务进度">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h2 className="text-sm font-semibold">任务进度</h2><p className="mt-1 text-xs text-slate-500">并发 {operation.concurrency} · 已处理 {finishedCount}/{operation.counts.total} · {operation.status === 'running' ? '后台生成中，可切换到其他客户继续操作' : '本次任务已结束'}</p></div>
        {operation.counts.failed > 0 && operation.status !== 'running' && <button type="button" onClick={() => void retryFailed()} className="inline-flex items-center gap-1 rounded border border-slate-300 px-2 py-1 text-xs text-slate-700"><RotateCcw className="h-3.5 w-3.5" />重试失败 {operation.counts.failed} 篇</button>}
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded bg-slate-100"><div className="h-full bg-blue-600 transition-all" style={{ width: `${progress}%` }} /></div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-5">
        <div className="rounded border border-slate-200 p-2">总数 <strong>{operation.counts.total}</strong></div>
        <div className="rounded border border-slate-200 p-2">生成中 <strong>{operation.counts.running}</strong></div>
        <div className="rounded border border-slate-200 p-2">排队 <strong>{operation.counts.pending}</strong></div>
        <div className="rounded border border-slate-200 p-2">已完成 <strong>{operation.counts.succeeded}</strong></div>
        <div className="rounded border border-slate-200 p-2">失败 <strong>{operation.counts.failed}</strong></div>
      </div>
      <div className="mt-3 divide-y divide-slate-100 rounded border border-slate-200">{operation.tasks.map((task) => <div key={task.index} className="flex items-center justify-between gap-3 px-3 py-2 text-xs"><div className="min-w-0"><span className="font-medium">第 {task.index + 1} 篇</span>{task.articleTitle && <span className="ml-2 text-slate-600">{task.articleTitle}</span>}{task.error && <span className="ml-2 text-rose-600">{task.error.code}</span>}</div><span className={`shrink-0 font-medium ${statusClass(task.status)}`}>{statusLabel(task.status)}</span></div>)}</div>
      <p className="mt-3 text-xs text-slate-500">成功文章已保存到文章库；这里仅显示任务进度，不再承载正文预览和编辑。</p>
    </section>}
    {error && <div role="alert" className="rounded-md border border-rose-100 bg-rose-50 p-2 text-xs text-rose-700">{error}</div>}
  </div>;
}
