import React, { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import type { ClientGrouping } from "./ClientSelector";
import ClientGroupBatchSelector from "./ClientGroupBatchSelector";
import type {
  ContentClient,
  ContentCommandStaleResult,
  ContentMaterial,
  ContentResearch,
  ContentTemplate,
  ContentTemplateCatalog,
} from "../../types/content";
import type { KnowledgeQuestionWorkflow } from "../../types/geo-knowledge";
import type {
  GenerationBatch,
  GenerationBatchPreview,
  GenerationBatchState,
} from "../../types/generation";
import { getKnowledgeQuestionWorkflow } from "../../bridge/geo-knowledge";
import {
  BATCH_GENERATION_STEPS,
  GENERATION_BATCH_RISK_THRESHOLD,
  groupTemplatesByPlatform,
  preserveSelection,
  templatePlatformDisplayName,
  templateScenarioLabel,
  templateSourceLabel,
  templateTitle,
  visibleGenerationTemplates,
} from "../../content-generation-ui-logic";
import { useGenerationFeature } from "../../features/generation/use-generation-feature";
import { useConfirmation } from "../../confirmation";
import GenerationBatchDetail from "./GenerationBatchDetail";
import BatchRegularSubmissionDialog from "./BatchRegularSubmissionDialog";

interface BatchGenerationViewProps {
  initialClientIds?: string[];
  clients: ContentClient[];
  grouping?: ClientGrouping;
  currentClientId?: string;
  researchByClient: Record<string, ContentResearch[]>;
  getClientDetails?: (
    clientId: string,
  ) => Promise<{ client: ContentClient; research: ContentResearch[] }>;
  templateCatalog?: ContentTemplateCatalog;
  commands: {
    retryMaterial: (
      input: Record<string, unknown>,
    ) => Promise<ContentMaterial | ContentCommandStaleResult>;
  };
  commandStates: { retryMaterial: { busy: boolean } };
  onViewBatchArticles?: (
    batchId: string,
    clientId?: string,
    articleId?: string,
  ) => void;
}

type SelectedQuestion = { clientId: string; geoQuestionId: string };
const EMPTY_STATE: GenerationBatchState = {
  status: "idle",
  state: "idle",
  batchId: null,
};
const ACTIVE = new Set(["running", "pausing"]);
const questionKey = (value: SelectedQuestion) =>
  `${value.clientId}\0${value.geoQuestionId}`;

export default function BatchGenerationView({
  initialClientIds,
  clients,
  grouping,
  currentClientId,
  templateCatalog,
  onViewBatchArticles,
}: BatchGenerationViewProps) {
  const { confirm } = useConfirmation();
  const generation = useGenerationFeature();
  const [viewMode, setViewMode] = useState<"wizard" | "monitoring">("wizard");
  const [step, setStep] = useState(0);
  const [selectedClientIds, setSelectedClientIds] = useState<string[]>([]);
  const [workflows, setWorkflows] = useState<
    Record<string, KnowledgeQuestionWorkflow>
  >({});
  const [selectedQuestionKeys, setSelectedQuestionKeys] = useState<string[]>(
    [],
  );
  const [selectedTemplates, setSelectedTemplates] = useState<
    Array<{ platform: string; templateId: string }>
  >([]);
  const [concurrency, setConcurrency] = useState(2);
  const [previewResult, setPreviewResult] =
    useState<GenerationBatchPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [workflowLoading, setWorkflowLoading] = useState(false);
  const [error, setError] = useState("");
  const [showBuiltinTemplates, setShowBuiltinTemplates] = useState(false);
  const [batchSubmissionOpen, setBatchSubmissionOpen] = useState(false);
  const [batchSubmissionFeedback, setBatchSubmissionFeedback] = useState("");
  const selectionTouched = useRef(Boolean(initialClientIds));
  const initialApplied = useRef(false);
  const workflowRequest = useRef(0);
  const newBatchWizard = useRef(Boolean(initialClientIds));

  const catalog = templateCatalog || {
    revision: "",
    platforms: [],
    templates: [],
    diagnostics: [],
  };
  const templates = useMemo(
    () => visibleGenerationTemplates(catalog, showBuiltinTemplates),
    [catalog, showBuiltinTemplates],
  );
  const templateGroups = useMemo(
    () => groupTemplatesByPlatform(templates),
    [templates],
  );
  const clientMap = useMemo(
    () => new Map(clients.map((client) => [client.id, client])),
    [clients],
  );
  const clientNames = useMemo(
    () =>
      Object.fromEntries(
        clients.map((client) => [client.id, client.name || client.id]),
      ),
    [clients],
  );
  const readyQuestions = useMemo(
    () =>
      selectedClientIds.flatMap((clientId) =>
        (workflows[clientId]?.items || [])
          .filter((item) => item.generation.ready)
          .map((item) => ({ clientId, geoQuestionId: item.id, item })),
      ),
    [selectedClientIds, workflows],
  );
  const selectedQuestions = useMemo<SelectedQuestion[]>(
    () =>
      readyQuestions
        .filter((question) =>
          selectedQuestionKeys.includes(questionKey(question)),
        )
        .map(({ clientId, geoQuestionId }) => ({ clientId, geoQuestionId })),
    [readyQuestions, selectedQuestionKeys],
  );
  const potentialTaskCount =
    selectedQuestions.length * selectedTemplates.length;
  const riskWarning = potentialTaskCount > GENERATION_BATCH_RISK_THRESHOLD;
  const batch = generation.snapshot.batch as GenerationBatch | null;
  const batchState = (generation.snapshot.runtime ||
    EMPTY_STATE) as GenerationBatchState;
  const generationCommands = generation.snapshot.commands;
  const batchRunning = Boolean(
    batch &&
    ((batchState.batchId === batch.id &&
      ACTIVE.has(batchState.status || "idle")) ||
      batch.status === "running"),
  );

  useEffect(() => {
    const available = clients.map((client) => client.id);
    if (initialClientIds && !initialApplied.current) {
      if (!available.length) return;
      initialApplied.current = true;
      setSelectedClientIds(
        [...new Set(initialClientIds)].filter((id) => available.includes(id)),
      );
      return;
    }
    setSelectedClientIds((current) => {
      const kept = preserveSelection(
        current,
        available,
        selectionTouched.current,
      );
      if (
        !selectionTouched.current &&
        !kept.length &&
        currentClientId &&
        available.includes(currentClientId)
      )
        return [currentClientId];
      return kept;
    });
  }, [clients, currentClientId, initialClientIds]);

  useEffect(() => {
    if (!selectedClientIds.length) {
      setWorkflows({});
      setSelectedQuestionKeys([]);
      return;
    }
    const request = ++workflowRequest.current;
    setWorkflowLoading(true);
    setError("");
    void Promise.all(
      selectedClientIds.map(
        async (clientId) =>
          [clientId, await getKnowledgeQuestionWorkflow(clientId)] as const,
      ),
    )
      .then((entries) => {
        if (request !== workflowRequest.current) return;
        const next = Object.fromEntries(entries);
        setWorkflows(next);
        const ready = entries.flatMap(([clientId, workflow]) =>
          workflow.items
            .filter((item) => item.generation.ready)
            .map((item) => questionKey({ clientId, geoQuestionId: item.id })),
        );
        setSelectedQuestionKeys((current) =>
          current
            .filter((key) => ready.includes(key))
            .concat(ready.filter((key) => !current.includes(key))),
        );
      })
      .catch((value) => {
        if (request === workflowRequest.current)
          setError(
            value instanceof Error ? value.message : "无法读取可生成问题",
          );
      })
      .finally(() => {
        if (request === workflowRequest.current) setWorkflowLoading(false);
      });
    return () => {
      workflowRequest.current += 1;
    };
  }, [selectedClientIds]);

  useEffect(() => {
    if (batch && !newBatchWizard.current) setViewMode("monitoring");
  }, [batch]);

  function toggleQuestion(clientId: string, geoQuestionId: string) {
    const key = questionKey({ clientId, geoQuestionId });
    setSelectedQuestionKeys((current) =>
      current.includes(key)
        ? current.filter((item) => item !== key)
        : [...current, key],
    );
    setPreviewResult(null);
  }

  function toggleTemplate(template: ContentTemplate) {
    setSelectedTemplates((current) =>
      current.some(
        (item) =>
          item.platform === template.platform &&
          item.templateId === template.id,
      )
        ? current.filter(
            (item) =>
              !(
                item.platform === template.platform &&
                item.templateId === template.id
              ),
          )
        : [
            ...current,
            { platform: template.platform, templateId: template.id },
          ],
    );
    setPreviewResult(null);
  }

  async function preview() {
    if (!selectedQuestions.length || !selectedTemplates.length) {
      setError("请至少选择一个可生成问题和一个模板。");
      return;
    }
    setLoading(true);
    setError("");
    try {
      setPreviewResult(
        await generation.previewBatch({
          selectedQuestions,
          templates: selectedTemplates,
          templateCatalogRevision: catalog.revision,
          concurrency,
        }),
      );
      setStep(3);
    } catch (value) {
      setError(value instanceof Error ? value.message : "生成前检查失败");
    } finally {
      setLoading(false);
    }
  }

  async function start() {
    if (
      !previewResult?.executableTaskCount ||
      batchRunning ||
      generationCommands.start.busy
    )
      return;
    if (
      riskWarning &&
      !(await confirm({
        title: "确认启动批量生成",
        message: `当前有 ${potentialTaskCount} 个问题 × 模板任务，可能产生较多 AI 调用费用。`,
        confirmLabel: "继续启动",
        tone: "warning",
      }))
    )
      return;
    setLoading(true);
    setError("");
    try {
      const accepted = await generation.start({
        selectedQuestions,
        templates: selectedTemplates,
        templateCatalogRevision: catalog.revision,
        concurrency,
      });
      if (!accepted || "ignored" in accepted) return;
      newBatchWizard.current = false;
      setViewMode("monitoring");
    } catch (value) {
      setError(value instanceof Error ? value.message : "无法启动批量生成");
    } finally {
      setLoading(false);
    }
  }

  async function pause() {
    if (batch)
      try {
        await generation.pause({ batchId: batch.id });
      } catch (value) {
        setError(value instanceof Error ? value.message : "暂停失败");
      }
  }
  async function resume() {
    if (batch)
      try {
        await generation.resume({ batchId: batch.id });
      } catch (value) {
        setError(value instanceof Error ? value.message : "继续失败");
      }
  }
  async function checkUncertain() {
    if (batch)
      try {
        await generation.checkUncertain({ batchId: batch.id });
      } catch (value) {
        setError(value instanceof Error ? value.message : "检查生成结果失败");
      }
  }
  async function abandon() {
    if (
      !batch ||
      !(await confirm({
        title: "结束当前批次",
        message: "将保留已生成文章和全部结果证据，并取消尚未开始的任务。",
        confirmLabel: "结束批次",
        tone: "danger",
      }))
    )
      return;
    try {
      await generation.abandon({ batchId: batch.id, confirmed: true });
    } catch (value) {
      setError(value instanceof Error ? value.message : "结束失败");
    }
  }

  function startNewBatch() {
    newBatchWizard.current = true;
    setViewMode("wizard");
    setStep(0);
    setPreviewResult(null);
    setSelectedClientIds([]);
    setSelectedQuestionKeys([]);
    setSelectedTemplates([]);
    setError("");
    setBatchSubmissionOpen(false);
    selectionTouched.current = false;
  }

  const stepTitles = [
    "选择客户",
    "选择跨平台模板",
    "选择可生成问题",
    "确认并启动",
  ];
  return (
    <div
      className="batch-generation-view flex h-full min-h-0 flex-col overflow-hidden"
      aria-label="四步批量生成"
      data-view-mode={viewMode}
      data-batch-running={batchRunning}
    >
      {viewMode === "wizard" && (
        <div className="batch-stepper shrink-0 border-b border-slate-200 bg-white px-4 py-3">
          <div className="grid grid-cols-4 gap-2">
            {BATCH_GENERATION_STEPS.map((id, index) => (
              <button
                type="button"
                key={id}
                onClick={() => index <= step && setStep(index)}
                className={`batch-step ${index === step ? "is-active" : ""} ${index < step ? "is-complete" : ""}`}
              >
                <span>
                  {index < step ? <Check className="h-3.5 w-3.5" /> : index + 1}
                </span>
                {stepTitles[index]}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {viewMode === "wizard" && step === 0 && (
          <section className="rounded-md border border-slate-200 bg-white p-4">
            <h2 className="mb-3 text-sm font-semibold">选择客户</h2>
            <ClientGroupBatchSelector
              clients={clients}
              selectedIds={selectedClientIds}
              grouping={grouping}
              onChange={(ids) => {
                selectionTouched.current = true;
                setSelectedClientIds(ids);
                setPreviewResult(null);
              }}
              disabled={loading}
              describeClient={(client) =>
                workflows[client.id]
                  ? `${workflows[client.id].items.filter((item) => item.generation.ready).length} 个可生成问题`
                  : "待读取"
              }
            />
          </section>
        )}
        {viewMode === "wizard" && step === 2 && (
          <section className="grid gap-3">
            {workflowLoading && (
              <p role="status" className="text-xs text-slate-500">
                正在读取问题状态…
              </p>
            )}
            {selectedClientIds.map((clientId) => (
              <article
                key={clientId}
                className="rounded border border-slate-200 bg-white p-4"
              >
                <h2 className="text-sm font-semibold">
                  {clientMap.get(clientId)?.name || clientId}
                </h2>
                <div className="mt-3 grid gap-2">
                  {(workflows[clientId]?.items || []).map((item) => (
                    <label
                      key={item.id}
                      className={`flex items-start gap-2 rounded border p-2 text-xs ${item.generation.ready ? "border-slate-200" : "border-slate-100 bg-slate-50 text-slate-400"}`}
                    >
                      <input
                        type="checkbox"
                        disabled={!item.generation.ready}
                        checked={selectedQuestionKeys.includes(
                          questionKey({ clientId, geoQuestionId: item.id }),
                        )}
                        onChange={() => toggleQuestion(clientId, item.id)}
                      />
                      <span>
                        <span className="block font-medium">{item.name}</span>
                        <span>
                          {item.generation.ready
                            ? `可生成 · 已有文章 ${item.articles.total}`
                            : item.generation.code}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              </article>
            ))}
            <button
              type="button"
              onClick={() => void preview()}
              disabled={loading || !selectedQuestions.length || !selectedTemplates.length}
              className="mt-4 rounded bg-slate-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
            >
              {loading ? "检查中…" : "检查并确认"}
            </button>
          </section>
        )}
        {viewMode === "wizard" && step === 1 && (
          <section className="rounded border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold">选择跨平台写作模板</h2>
                <p className="mt-1 text-xs text-slate-500">
                  已选 {selectedQuestions.length} 个问题 ·{" "}
                  {selectedTemplates.length} 个模板 · 预计 {potentialTaskCount}{" "}
                  次 AI 调用
                </p>
              </div>
              <label className="text-xs text-slate-500">
                <input
                  type="checkbox"
                  checked={showBuiltinTemplates}
                  onChange={(event) =>
                    setShowBuiltinTemplates(event.target.checked)
                  }
                />{" "}
                显示内置模板
              </label>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              {(
                Object.entries(templateGroups) as Array<
                  [string, ContentTemplate[]]
                >
              ).map(([platform, values]) => (
                <div
                  key={platform}
                  className="rounded border border-slate-200 p-3"
                >
                  <h3 className="text-xs font-semibold">
                    {templatePlatformDisplayName(catalog, platform)}
                  </h3>
                  <div className="mt-2 grid gap-2">
                    {values.map((template) => (
                      <label
                        key={template.id}
                        className="flex items-start gap-2 text-xs"
                      >
                        <input
                          type="checkbox"
                          checked={selectedTemplates.some(
                            (item) =>
                              item.platform === platform &&
                              item.templateId === template.id,
                          )}
                          onChange={() => toggleTemplate(template)}
                        />
                        <span>
                          {templateTitle(template)} ·{" "}
                          {templateSourceLabel(template)}
                          {templateScenarioLabel(template) && (
                            <small className="block text-slate-400">
                              {templateScenarioLabel(template)}
                            </small>
                          )}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <label className="mt-4 flex items-center gap-2 text-xs">
              生成并发数
              <select
                aria-label="生成并发数"
                value={concurrency}
                onChange={(event) => {
                  setConcurrency(Number(event.target.value));
                  setPreviewResult(null);
                }}
                className="rounded border px-2 py-1"
              >
                {[1, 2, 3, 4].map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
          </section>
        )}
        {viewMode === "wizard" && step === 3 && (
          <section className="rounded border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-semibold">确认任务并启动</h2>
            <p className="mt-2 text-sm">
              {selectedQuestions.length} 个问题 × {selectedTemplates.length}{" "}
              个模板 = {previewResult?.taskCount ?? potentialTaskCount} 个任务
            </p>
            {riskWarning && (
              <p className="mt-2 rounded bg-amber-50 p-2 text-xs text-amber-800">
                任务数较多，可能增加 AI 调用费用。
              </p>
            )}
            <button
              type="button"
              onClick={() => void start()}
              disabled={
                loading || batchRunning || !previewResult?.executableTaskCount
              }
              className="mt-4 h-10 w-full rounded bg-blue-600 text-sm font-semibold text-white disabled:opacity-40"
            >
              {loading ? "启动中…" : "确认并启动批量生成"}
            </button>
          </section>
        )}
        {viewMode === "monitoring" && batch && (
          <div className="generation-batch-control-area">
            <GenerationBatchDetail
              batch={batch}
              state={batchState}
              busy={{
                pause: generationCommands.pause.busy,
                resume: generationCommands.resume.busy,
                abandon: generationCommands.abandon.busy,
                checkUncertain: generationCommands.checkUncertain.busy,
              }}
              clientNames={clientNames}
              onPause={() => void pause()}
              onResume={() => void resume()}
              onAbandon={() => void abandon()}
              onCheckUncertain={() => void checkUncertain()}
              onPreviewCancelPending={generation.previewCancelPending}
              onCancelPending={generation.cancelPending}
              onStartNew={startNewBatch}
              onViewBatchArticles={onViewBatchArticles}
              onBulkSubmit={() => setBatchSubmissionOpen(true)}
            />
            {batchSubmissionFeedback && (
              <p role="status" className="mt-3 text-xs text-emerald-700">
                {batchSubmissionFeedback}
              </p>
            )}
          </div>
        )}
        {error && (
          <div
            role="alert"
            className="mt-3 rounded border border-rose-100 bg-rose-50 p-2 text-xs text-rose-700"
          >
            {error}
          </div>
        )}
      </div>
      {viewMode === "wizard" && step < 2 && (
        <div className="flex items-center justify-between border-t bg-white px-4 py-3">
          <button
            type="button"
            onClick={() => setStep((value) => Math.max(0, value - 1))}
            disabled={step === 0}
            className="inline-flex items-center gap-1 rounded border px-3 py-2 text-xs disabled:opacity-40"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            上一步
          </button>
          <button
            type="button"
            onClick={() => setStep((value) => value + 1)}
            disabled={
              (step === 0 && !selectedClientIds.length) ||
              (step === 1 && !selectedTemplates.length) ||
              workflowLoading
            }
            className="inline-flex items-center gap-1 rounded bg-slate-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
          >
            下一步
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
      {batch && (
        <BatchRegularSubmissionDialog
          open={batchSubmissionOpen}
          batch={batch}
          clients={clients}
          onClose={() => setBatchSubmissionOpen(false)}
          onCommitted={(summary) =>
            setBatchSubmissionFeedback(
              `已批量处理 ${summary.clientCount} 个客户：新增投稿 ${summary.admittedCount} 项。`,
            )
          }
        />
      )}
    </div>
  );
}
