import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronLeft, ChevronRight } from 'lucide-react';
import type { ContentClient, ContentCommandStaleResult, ContentMaterial, ContentResearch, ContentTemplate, ContentTemplateCatalog } from '../../types/content';
import type { GenerationBatch, GenerationBatchPreview, GenerationBatchSourceSelection, GenerationBatchState } from '../../types/generation';
import BaseCollapsibleSourceItem, { CollapsibleSourceItemProps } from './CollapsibleSourceItem';
import GenerationBatchDetail from './GenerationBatchDetail';
import { BATCH_GENERATION_STEPS, countGenerationTasks, formatGenerationPreflightError, GENERATION_BATCH_RISK_THRESHOLD, getMaterialId, groupTemplatesByPlatform, isExecutableSource, isUsableMaterial, isUsableResearch, preserveSelection, reconcileSourceSelection, sourceCharacterCount, templatePlatformDisplayName, templateScenarioLabel, templateSourceLabel, templateTitle, visibleGenerationTemplates } from '../../content-generation-ui-logic';
import { useGenerationFeature } from '../../features/generation/use-generation-feature';
import { useConfirmation } from '../../confirmation';
import { isContentCommandStaleResult } from '../../content-command-result';

interface BatchGenerationViewProps {
  clients: ContentClient[];
  currentClientId?: string;
  researchByClient: Record<string, ContentResearch[]>;
  templateCatalog?: ContentTemplateCatalog;
  commands: {
    retryMaterial: (input: Record<string, unknown>) => Promise<ContentMaterial | ContentCommandStaleResult>;
  };
  commandStates: { retryMaterial: { busy: boolean } };
  onViewBatchArticles?: (batchId: string, clientId?: string) => void;
}

type SourceState = Record<string, { materialIds: string[]; researchQueryIds: string[] }>;
type BatchViewMode = 'wizard' | 'monitoring';
const EMPTY_STATE: GenerationBatchState = { status: 'idle', state: 'idle', batchId: null };
const ACTIVE_BATCH_STATUSES = new Set(['running', 'pausing', 'stopping']);
const CollapsibleSourceItem = BaseCollapsibleSourceItem as React.ComponentType<CollapsibleSourceItemProps & React.Attributes>;
function materialForClient(client: ContentClient, overrides: Record<string, ContentMaterial> = {}): ContentMaterial[] {
  return (client.knowledgeFiles || []).map((item) => ({
    ...item,
    id: item.id || item.name,
    status: item.status || (item.content?.trim() ? 'ready' : 'error'),
    characterCount: item.characterCount ?? item.content?.length ?? 0,
  })).map((item) => overrides[getMaterialId(item)] || item);
}

function errorReason(code: string) {
  const labels: Record<string, string> = {
    CLIENT_MATERIAL_REQUIRED: '没有有效客户资料',
    CLIENT_MATERIAL_INVALID: '客户资料不可用',
    GEO_RESEARCH_REQUIRED: '没有有效 GEO 调研回答',
    GEO_RESEARCH_INVALID: 'GEO 调研回答不可用',
    GENERATION_CLIENT_NOT_FOUND: '客户不存在',
    GENERATION_TEMPLATE_NOT_FOUND: '写作模板不存在',
    GENERATION_TEMPLATE_INVALID: '写作模板不可用',
  };
  return labels[code] || code;
}

export default function BatchGenerationView({ clients, currentClientId, researchByClient, templateCatalog, commands, commandStates, onViewBatchArticles }: BatchGenerationViewProps) {
  const { confirm } = useConfirmation();
  const [viewMode, setViewMode] = useState<BatchViewMode>('wizard');
  const [step, setStep] = useState(0);
  const [selectedClientIds, setSelectedClientIds] = useState<string[]>([]);
  const [catalog, setCatalog] = useState<ContentTemplateCatalog>(templateCatalog || { revision: '', platforms: [], templates: [], diagnostics: [] });
  const [showBuiltinTemplates, setShowBuiltinTemplates] = useState(false);
  const [selectedTemplates, setSelectedTemplates] = useState<Array<{ platform: string; templateId: string }>>([]);
  const [sources, setSources] = useState<SourceState>({});
  const [previewResult, setPreviewResult] = useState<GenerationBatchPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const preflightErrorRef = useRef<HTMLDivElement | null>(null);
  const clientSelectionTouchedRef = useRef(false);
  const templateSelectionTouchedRef = useRef(false);
  const clientSelectionInitializedRef = useRef(false);
  const newBatchWizardRef = useRef(false);
  const generation = useGenerationFeature();
  const batch = generation.snapshot.batch as GenerationBatch | null;
  const batchState = (generation.snapshot.runtime || EMPTY_STATE) as GenerationBatchState;
  const generationCommands = generation.snapshot.commands;
  const hydrationError = generation.snapshot.hydration?.error?.userMessage;

  const clientMap = useMemo(() => new Map(clients.map((client) => [client.id, client])), [clients]);
  const templates = useMemo(() => visibleGenerationTemplates(catalog, showBuiltinTemplates), [catalog, showBuiltinTemplates]);
  const customTemplateCount = useMemo(() => catalog.templates.filter((item) => item.source === 'custom').length, [catalog.templates]);
  const templateGroups = useMemo(() => groupTemplatesByPlatform(templates), [templates]);
  const currentSources = useMemo<GenerationBatchSourceSelection[]>(() => selectedClientIds.map((clientId) => ({
    clientId,
    ...reconcileSourceSelection(
      materialForClient(clientMap.get(clientId) || { id: clientId, name: clientId, knowledgeFiles: [] }),
      researchByClient[clientId] || [],
      sources[clientId],
    ),
  })), [clientMap, researchByClient, selectedClientIds, sources]);
  const potentialTaskCount = countGenerationTasks(selectedClientIds.length, selectedTemplates.length);
  const executableClients = selectedClientIds.filter((clientId) => {
    const client = clientMap.get(clientId);
    const materials = materialForClient(client || { id: clientId, name: clientId, knowledgeFiles: [] });
    const research = researchByClient[clientId] || [];
    const source = sources[clientId];
    return isExecutableSource(materials, research, source);
  });
  const executableTaskCount = previewResult?.executableTaskCount ?? executableClients.length * selectedTemplates.length;
  const riskWarning = potentialTaskCount > GENERATION_BATCH_RISK_THRESHOLD;
  const batchRunning = Boolean(batch && ((batchState.batchId === batch.id && ACTIVE_BATCH_STATUSES.has(batchState.status || 'idle')) || batch.status === 'running'));

  useEffect(() => {
    if (!error) return;
    const element = preflightErrorRef.current;
    element?.scrollIntoView({ block: 'nearest' });
    element?.focus();
  }, [error]);

  useEffect(() => {
    clientSelectionInitializedRef.current = false;
  }, [clients]);

  useEffect(() => {
    const availableClientIds = clients.map((client) => client.id);
    setSelectedClientIds((current) => preserveSelection(current, availableClientIds, clientSelectionTouchedRef.current));
  }, [clients]);

  useEffect(() => {
    const nextCatalog = templateCatalog || { revision: '', platforms: [], templates: [], diagnostics: [] };
    setCatalog(nextCatalog);
    if (nextCatalog.diagnostics.length) setError(`模板目录有 ${nextCatalog.diagnostics.length} 项诊断，请检查模板文件。`);
    const availableTemplates = visibleGenerationTemplates(nextCatalog, showBuiltinTemplates).map((item) => ({ platform: item.platform, templateId: item.id }));
    setSelectedTemplates((current) => {
      const next = preserveSelection(current, availableTemplates, templateSelectionTouchedRef.current, (item) => `${item.platform}:${item.templateId}`);
      if (current.length > next.length && templateSelectionTouchedRef.current) setError('部分已选模板当前不可见或已删除，请检查“显示内置模板”或重新选择。');
      return next;
    });
  }, [templateCatalog, showBuiltinTemplates]);

  useEffect(() => {
    const nextResearch = researchByClient;
      setSources((current) => {
        const next = { ...current };
        clients.forEach((client) => {
          const defaultSource = {
            materialIds: materialForClient(client).filter(isUsableMaterial).map(getMaterialId),
            researchQueryIds: (nextResearch[client.id] || []).filter(isUsableResearch).map((item) => item.id),
          };
          next[client.id] = reconcileSourceSelection(materialForClient(client), nextResearch[client.id] || [], next[client.id] || defaultSource);
        });
        return next;
      });
      if (!clientSelectionTouchedRef.current && !clientSelectionInitializedRef.current) {
        clientSelectionInitializedRef.current = true;
        const currentClient = currentClientId ? clients.find((client) => client.id === currentClientId) : undefined;
        const currentSource = currentClient ? {
          materialIds: materialForClient(currentClient).filter(isUsableMaterial).map(getMaterialId),
          researchQueryIds: (nextResearch[currentClient.id] || []).filter(isUsableResearch).map((item) => item.id),
        } : null;
        if (currentClient && currentSource && isExecutableSource(materialForClient(currentClient), nextResearch[currentClient.id] || [], currentSource)) {
          setSelectedClientIds([currentClient.id]);
        }
      }
  }, [clients, currentClientId, researchByClient]);

  useEffect(() => {
    if (batch && !newBatchWizardRef.current) setViewMode('monitoring');
  }, [batch]);

  function toggleAllClients() {
    clientSelectionTouchedRef.current = true;
    setSelectedClientIds((current) => current.length === clients.length ? [] : clients.map((client) => client.id));
    setPreviewResult(null);
  }

  function toggleTemplate(template: ContentTemplate) {
    templateSelectionTouchedRef.current = true;
    setSelectedTemplates((current) => current.some((item) => item.platform === template.platform && item.templateId === template.id)
      ? current.filter((item) => !(item.platform === template.platform && item.templateId === template.id))
      : [...current, { platform: template.platform, templateId: template.id }]);
    setPreviewResult(null);
  }

  async function retryMaterialItem(clientId: string, materialId: string) {
    setError('');
    try {
      const result = await commands.retryMaterial({ clientId, materialId });
      if (isContentCommandStaleResult(result)) return;
    } catch (value) {
      setError(value instanceof Error ? value.message : '资料重试失败');
    } finally {}
  }

  function updateSource(clientId: string, field: 'materialIds' | 'researchQueryIds', id: string, selected: boolean) {
    setSources((current) => ({ ...current, [clientId]: { ...current[clientId], [field]: selected ? [...(current[clientId]?.[field] || []), id] : (current[clientId]?.[field] || []).filter((item) => item !== id) } }));
    setPreviewResult(null);
  }

  async function preview() {
    setLoading(true); setError('');
    try { setPreviewResult(await generation.previewBatch({ clientIds: selectedClientIds, templates: selectedTemplates, clientSources: currentSources, templateCatalogRevision: catalog.revision })); setStep(3); }
    catch (value) { setError(formatGenerationPreflightError(value, selectedTemplates)); }
    finally { setLoading(false); }
  }

  async function start() {
    if (!previewResult?.executableTaskCount || generationCommands.start.busy || !generation.snapshot.scope) return;
    if (riskWarning && !(await confirm({ title: '确认启动批量生成', message: `当前批量任务数为 ${potentialTaskCount}，可能产生较多 AI 调用费用。`, confirmLabel: '继续启动', tone: 'warning' }))) return;
    setLoading(true); setError('');
    try {
      const accepted = await generation.start({ clientIds: selectedClientIds, templates: selectedTemplates, clientSources: currentSources, templateCatalogRevision: catalog.revision });
      if (!accepted || 'ignored' in accepted) return;
      newBatchWizardRef.current = false;
      setViewMode('monitoring');
    } catch (value) { setError(value instanceof Error ? value.message : '无法启动批量生成'); }
    finally { setLoading(false); }
  }

  async function pause() {
    if (!batch) return;
    setViewMode('monitoring');
    setError('');
    try { await generation.pause({ batchId: batch.id }); }
    catch (value) { setError(value instanceof Error ? value.message : '批量任务暂停失败'); }
  }

  async function resume() {
    if (!batch) return;
    setError('');
    try { await generation.resume({ batchId: batch.id }); }
    catch (value) { setError(value instanceof Error ? value.message : '批量任务恢复失败'); }
  }

  async function stop() {
    if (!batch) return;
    setError('');
    try { await generation.stop({ batchId: batch.id }); }
    catch (value) { setError(value instanceof Error ? value.message : '批量任务停止失败'); }
  }

  async function continueIncomplete() {
    if (!batch) return;
    setError('');
    try { await generation.continue({ batchId: batch.id, confirmConfigChange: true }); }
    catch (value) { setError(value instanceof Error ? value.message : '批量任务继续失败'); }
  }

  async function confirmContinueIncomplete() {
    if (!(await confirm({ title: '继续未完成任务', message: 'AI 配置可能已变化，确认使用当前配置继续？', confirmLabel: '继续生成', tone: 'warning' }))) return;
    await continueIncomplete();
  }

  async function retryFailed() {
    if (!batch) return;
    setError('');
    try { await generation.retry({ batchId: batch.id }); }
    catch (value) { setError(value instanceof Error ? value.message : '批量任务重试失败'); }
  }

  function startNewBatch() {
    newBatchWizardRef.current = true;
    setPreviewResult(null);
    setError('');
    setStep(0);
    setSelectedClientIds([]);
    setSelectedTemplates([]);
    clientSelectionTouchedRef.current = false;
    templateSelectionTouchedRef.current = false;
    clientSelectionInitializedRef.current = false;
    setViewMode('wizard');
  }

  function clientReadiness(client: ContentClient) {
    const materials = materialForClient(client);
    const research = researchByClient[client.id] || [];
    if (!researchByClient[client.id]) return '来源加载中';
    if (!materials.some(isUsableMaterial)) return '缺少有效资料';
    if (!research.some(isUsableResearch)) return '缺少有效 GEO 调研';
    return '可生成';
  }

  const selectedCount = selectedClientIds.length;
  const allSelected = selectedCount > 0 && selectedCount === clients.length;
  const stepTitles = ['选择批次客户', '选择跨平台模板', '检查生成来源', '确认任务并启动'];

  return <div className="batch-generation-view flex h-full min-h-0 flex-col overflow-hidden" aria-label="四步批量生成" data-view-mode={viewMode} data-batch-running={batchRunning}>
    {viewMode === 'wizard' && <>
    <div className="batch-stepper shrink-0 border-b border-slate-200 bg-white px-4 py-3"><div className="grid grid-cols-4 gap-2">{BATCH_GENERATION_STEPS.map((id, index) => <button type="button" key={id} onClick={() => index <= step && setStep(index)} className={`batch-step ${index === step ? 'is-active' : ''} ${index < step ? 'is-complete' : ''}`}><span>{index < step ? <Check className="h-3.5 w-3.5" /> : index + 1}</span>{stepTitles[index]}</button>)}</div></div>
    </>}
    <div className="min-h-0 flex-1 overflow-y-auto p-4">
      {hydrationError && <div role="alert" aria-live="polite" className="mb-3 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">{hydrationError}</div>}
      {viewMode === 'wizard' && <>
      {step === 0 && <section className="rounded-md border border-slate-200 bg-white p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-sm font-semibold">选择批次客户</h2><p className="mt-1 text-xs text-slate-500">已选 {selectedCount} 个客户</p></div><div className="flex gap-2"><button type="button" onClick={toggleAllClients} className="rounded border border-slate-300 px-3 py-2 text-xs">全选客户</button><button type="button" onClick={() => { clientSelectionTouchedRef.current = true; setSelectedClientIds([]); setPreviewResult(null); }} disabled={!selectedCount} className="rounded border border-slate-300 px-3 py-2 text-xs disabled:opacity-40">取消全选</button></div></div>
        <label className="mb-3 flex items-center gap-2 text-xs font-semibold"><input type="checkbox" checked={allSelected} onChange={toggleAllClients} />全选客户</label>
        <div className="grid gap-3 sm:grid-cols-2">{clients.map((client) => {
          return <article key={client.id} className="rounded border border-slate-200 p-3 text-sm">
            <label className="flex items-center gap-2"><input type="checkbox" checked={selectedClientIds.includes(client.id)} onChange={(event) => { clientSelectionTouchedRef.current = true; setSelectedClientIds((current) => event.target.checked ? [...new Set([...current, client.id])] : current.filter((id) => id !== client.id)); }} /><span className="min-w-0 flex-1"><span className="block">{client.name}</span><span className={`block text-xs ${clientReadiness(client) === '可生成' ? 'text-emerald-600' : 'text-amber-700'}`}>{clientReadiness(client)}</span></span></label>
          </article>;
        })}</div>
      </section>}
      {step === 1 && <section className="rounded-md border border-slate-200 bg-white p-4"><div className="flex flex-wrap items-start justify-between gap-2"><div><h2 className="text-sm font-semibold">选择跨平台写作模板</h2><p className="mt-1 text-xs text-slate-500">模板按平台分组，已选 {selectedTemplates.length} 个 · 潜在 AI 调用数：{potentialTaskCount}</p></div>{customTemplateCount > 0 && <label className="inline-flex items-center gap-1 text-xs text-slate-500"><input type="checkbox" aria-label="显示内置模板" checked={showBuiltinTemplates} onChange={(event) => setShowBuiltinTemplates(event.target.checked)} />显示内置模板</label>}</div>{riskWarning && <div role="status" className="mt-3 rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">潜在任务数超过 {GENERATION_BATCH_RISK_THRESHOLD}，可能增加 AI 调用费用，请确认客户和模板选择。</div>}<div className="mt-4 grid gap-4 md:grid-cols-3">{(Object.entries(templateGroups) as Array<[string, ContentTemplate[]]>).map(([platform, platformTemplates]) => <div key={platform} className="rounded border border-slate-200 p-3"><h3 className="text-xs font-semibold text-slate-700">{templatePlatformDisplayName(catalog, platform)}</h3><div className="mt-2 grid gap-2">{platformTemplates.map((template) => <label key={template.id} className="flex items-start gap-2 text-xs text-slate-600"><input type="checkbox" checked={selectedTemplates.some((item) => item.platform === platform && item.templateId === template.id)} onChange={() => toggleTemplate(template)} /><span><span className="block font-medium">{templateTitle(template)} · {templateSourceLabel(template)}</span>{templateScenarioLabel(template) && <span className="text-slate-400">{templateScenarioLabel(template)}</span>}</span></label>)}</div></div>)}</div></section>}
      {step === 2 && <section className="grid gap-3"><div className="rounded border border-slate-200 bg-white p-3 text-xs text-slate-600">潜在 AI 调用数：{selectedCount} × {selectedTemplates.length} = {potentialTaskCount}{riskWarning && <span className="ml-2 text-amber-700">· 费用风险：超过 {GENERATION_BATCH_RISK_THRESHOLD} 个任务</span>}</div>{selectedClientIds.map((clientId) => { const client = clientMap.get(clientId); const materials = materialForClient(client || { id: clientId, name: clientId, knowledgeFiles: [] }); const research = researchByClient[clientId] || []; const source = sources[clientId] || { materialIds: [], researchQueryIds: [] }; const selectedMaterials = materials.filter((item) => source.materialIds.includes(getMaterialId(item)) && isUsableMaterial(item)); const selectedResearch = research.filter((item) => source.researchQueryIds.includes(item.id) && isUsableResearch(item)); const reason = !selectedMaterials.length ? '没有有效客户资料' : !selectedResearch.length ? '没有有效 GEO 调研回答' : ''; return <article key={clientId} className="rounded-md border border-slate-200 bg-white p-4"><div className="flex flex-wrap items-start justify-between gap-2"><div><h2 className="text-sm font-semibold">{client?.name || clientId}</h2><p className="mt-1 text-xs text-slate-500">预计输入字符数 {sourceCharacterCount(selectedMaterials, selectedResearch)}</p></div><span className={`text-xs font-semibold ${reason ? 'text-rose-600' : 'text-emerald-600'}`}>{reason || '可生成'}</span></div><div className="mt-3 grid gap-2">{materials.map((item) => <CollapsibleSourceItem key={getMaterialId(item)} id={`${clientId}-${getMaterialId(item)}`} title={item.name} summary={`${item.extension || '资料'} · ${item.characterCount || 0} 字${item.status === 'error' ? ' · 错误' : item.status === 'converting' ? ' · 转换中' : ''}`} selected={source.materialIds.includes(getMaterialId(item)) && isUsableMaterial(item)} disabled={!isUsableMaterial(item)} onSelectedChange={(selected) => updateSource(clientId, 'materialIds', getMaterialId(item), selected)} actions={item.extension?.toLowerCase() === '.docx' && (item.status === 'error' || item.status === 'converting') ? <button type="button" onClick={(event) => { event.stopPropagation(); void retryMaterialItem(clientId, getMaterialId(item)); }} disabled={commandStates.retryMaterial.busy} className="rounded border border-blue-300 px-2 py-1 text-xs text-blue-700 disabled:opacity-40">{commandStates.retryMaterial.busy ? '重试中…' : '重试转换'}</button> : undefined} defaultExpanded={false}>{item.content || '资料转换失败，请重试。'}</CollapsibleSourceItem>)}{research.map((item) => <CollapsibleSourceItem key={item.id} id={`${clientId}-${item.id}`} title={item.question || item.id} summary={`${item.answerText?.length || 0} 字 · GEO 调研回答${item.isAnswerComplete === false ? ' · 未完成' : ''}`} selected={isUsableResearch(item) && source.researchQueryIds.includes(item.id)} disabled={!isUsableResearch(item)} onSelectedChange={(selected) => isUsableResearch(item) && updateSource(clientId, 'researchQueryIds', item.id, selected)} defaultExpanded={false}>{item.answerText || '没有回答内容'}</CollapsibleSourceItem>)}</div></article>; })}</section>}
      {step === 3 && <section className="rounded-md border border-slate-200 bg-white p-4"><h2 className="text-sm font-semibold">确认任务并启动</h2><p className="mt-1 text-xs text-slate-500">客户数 × 模板数 = AI 调用任务数</p><div className="mt-4 grid gap-2 sm:grid-cols-3"><div className="rounded bg-slate-50 p-3 text-sm">{selectedCount} × {selectedTemplates.length} = {previewResult?.taskCount ?? potentialTaskCount}</div><div className="rounded bg-emerald-50 p-3 text-sm text-emerald-700">可执行任务数：{executableTaskCount}</div><div className="rounded bg-rose-50 p-3 text-sm text-rose-700">排除客户/任务：{previewResult?.excludedClients.length ?? Math.max(0, selectedCount - executableClients.length)} / {previewResult?.excludedTaskCount ?? Math.max(0, potentialTaskCount - executableTaskCount)}</div></div>{riskWarning && <div className="mt-3 rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">费用风险提示：任务数较多，启动前请再次确认。</div>}{previewResult?.excludedClients.length ? <div className="mt-4 rounded border border-rose-100 bg-rose-50 p-3 text-xs text-rose-700"><p className="font-semibold">被排除客户与原因</p>{previewResult.excludedClients.map((item) => <p key={item.clientId} className="mt-1">{clientMap.get(item.clientId)?.name || item.clientId}：{item.codes.map(errorReason).join('、')}</p>)}</div> : <p className="mt-4 text-xs text-emerald-700">没有被排除的客户。</p>}<button type="button" onClick={() => void start()} disabled={loading || !previewResult?.executableTaskCount} className="mt-4 h-10 w-full rounded-md bg-blue-600 text-sm font-semibold text-white disabled:opacity-40">{loading ? '启动中…' : '确认并启动批量生成'}</button></section>}
      </>}
      {viewMode === 'monitoring' && batch && <div className="generation-batch-control-area">
         <GenerationBatchDetail batch={batch} state={batchState} busy={{ pause: generationCommands.pause.busy, resume: generationCommands.resume.busy, continue: generationCommands.continue.busy, stop: generationCommands.stop.busy, retry: generationCommands.retry.busy }} onPause={() => void pause()} onResume={() => void resume()} onContinue={() => void confirmContinueIncomplete()} onStop={() => void stop()} onRetry={() => void retryFailed()} onPreviewCancelPending={generation.previewCancelPending} onCancelPending={generation.cancelPending} onStartNew={startNewBatch} onViewBatchArticles={onViewBatchArticles} />
        {error && <div role="alert" aria-live="polite" className="mt-3 rounded-md border border-rose-100 bg-rose-50 p-2 text-xs text-rose-700">{error}</div>}
      </div>}
      {viewMode === 'wizard' && error && <div ref={preflightErrorRef} tabIndex={-1} role="alert" aria-live="assertive" className="mt-3 rounded-md border border-rose-100 bg-rose-50 p-2 text-xs text-rose-700">{error}</div>}
    </div>
    {viewMode === 'wizard' && <div className="flex shrink-0 items-center justify-between border-t border-slate-200 bg-white px-4 py-3"><button type="button" onClick={() => setStep((current) => Math.max(0, current - 1))} disabled={step === 0} className="inline-flex items-center gap-1 rounded border border-slate-300 px-3 py-2 text-xs disabled:opacity-40"><ChevronLeft className="h-3.5 w-3.5" />上一步</button><button type="button" onClick={() => { if (step === 2) void preview(); else setStep((current) => Math.min(3, current + 1)); }} disabled={loading || (step === 0 && !selectedCount) || (step === 1 && !selectedTemplates.length) || (step === 2 && !selectedClientIds.length)} className="inline-flex items-center gap-1 rounded bg-slate-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">{step === 2 ? (loading ? '预览中…' : '检查并确认') : '下一步'}<ChevronRight className="h-3.5 w-3.5" /></button></div>}
  </div>;
}
