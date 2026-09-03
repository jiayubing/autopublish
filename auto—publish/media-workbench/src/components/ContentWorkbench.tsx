import React, { useCallback, useEffect, useRef, useState } from "react";
import { LoaderCircle, RefreshCw } from "lucide-react";
import type { ContentClient, ContentTemplateCatalog, LiejuPublicationProfile } from "../types/content";
import type { GeneratedContentArticle } from "../types/generation";
import type { ArticleEditorSnapshot } from "../bridge/content";
import ArticleGenerationView from "./content/ArticleGenerationView";
import GeneratedArticleEditorPanel from "./content/GeneratedArticleEditorPanel";
import GeneratedArticlesView from "./content/GeneratedArticlesView";
import QuestionCollectionView from "./content/QuestionCollectionView";
import { type ArticleWorkflowFilter } from "../article-workflow";
import ArticleLibraryFilters from "./content/ArticleLibraryFilters";
import { useConfirmation, useConfirmationScope } from "../confirmation";
import type { ContentWorkbenchFeature } from "../features/content/use-content-workbench-feature";
import { reportRuntimeDiagnostic } from "../features/workspace/runtime-diagnostic-sink";
import type { FavoriteMediaPage } from "./content/GeneratedArticlesView.types";
import type { ArticleLibraryNavigationIntent } from "../article-library-navigation";

type RefreshState = "idle" | "refreshing" | "error";
type ProductionTab = "questions" | "single" | "batch";
type WorkbenchTab = ProductionTab | "history";

const REFRESH_CONFIRMATION_MS = 3000;
const PRODUCTION_TAB_KEY = "auto-publish:content-production-tab";
const ARTICLE_STAGE_KEY = "auto-publish:article-library-stage";
const SELECTED_CLIENT_KEY = "auto-publish:selected-client";
const ARTICLE_STAGE_VALUES: ArticleWorkflowFilter[] = [
  "all",
  "pending_submission",
  "needs_completion",
  "in_submission",
  "published",
  "trash",
];

function loadProductionTab(): ProductionTab {
  if (typeof localStorage === "undefined") return "questions";
  const value = localStorage.getItem(PRODUCTION_TAB_KEY);
  return value === "single" || value === "batch" || value === "questions"
    ? value
    : "questions";
}

function loadArticleStage(): ArticleWorkflowFilter {
  if (typeof localStorage === "undefined") return "pending_submission";
  const value = localStorage.getItem(ARTICLE_STAGE_KEY) as ArticleWorkflowFilter | null;
  return value && ARTICLE_STAGE_VALUES.includes(value)
    ? value
    : "pending_submission";
}

function loadSelectedClientId() {
  if (typeof localStorage === "undefined") return "";
  return localStorage.getItem(SELECTED_CLIENT_KEY) || "";
}

function remember(key: string, value: string) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(key, value);
  } catch (_) {
    // UI position memory is optional.
  }
}

interface ContentWorkbenchProps {
  content: ContentWorkbenchFeature;
  mode?: "production" | "library";
  articleIntent?: ArticleLibraryNavigationIntent | null;
  onArticleIntentConsumed?: () => void;
  onOpenArticleLibrary?: (intent?: ArticleLibraryNavigationIntent) => void;
  favoriteMediaPage?: FavoriteMediaPage;
  onFavoriteMediaPageChange?: (page: number) => void;
  onOpenOrders?: () => void;
  onOpenAttention?: () => void;
}

export default function ContentWorkbench({
  content,
  mode = "production",
  articleIntent,
  onArticleIntentConsumed,
  onOpenArticleLibrary,
  favoriteMediaPage,
  onFavoriteMediaPageChange,
  onOpenOrders,
  onOpenAttention,
}: ContentWorkbenchProps) {
  const { confirm } = useConfirmation();
  const {
    clients,
    templateCatalog,
    selectedClientId: clientId,
    currentArticle: article,
    query,
    questions,
    research,
    researchByClient,
    management,
    clientQuery,
    managementQuery,
    doubaoQueue,
    doubaoLogin,
    doubaoQueueQuery,
    doubaoLoginQuery,
  } = content.snapshot;
  useConfirmationScope(
    content.snapshot.scope && clientId
      ? `${content.snapshot.scope.workspaceRuntimeId}:${clientId}`
      : null,
  );
  const [historyEditingArticle, setHistoryEditingArticle] =
    useState<GeneratedContentArticle | null>(null);
  const [historyEditingPublished, setHistoryEditingPublished] = useState(false);
  const [historyEditingEditable, setHistoryEditingEditable] = useState(true);
  const [historyEditingFingerprint, setHistoryEditingFingerprint] = useState<
    string | null
  >(null);
  const [tab, setTab] = useState<WorkbenchTab>(
    mode === "library" ? "history" : loadProductionTab(),
  );
  const [articleStageFilter, setArticleStageFilter] = useState<
    ArticleWorkflowFilter
  >(mode === "library" ? loadArticleStage() : "all");
  const [generationBatchFilter, setGenerationBatchFilter] = useState<
    string | null
  >(null);
  const [articleNavigationIntent, setArticleNavigationIntent] =
    useState<ArticleLibraryNavigationIntent | null>(null);
  const [error, setError] = useState("");
  const [refreshConfirmationVisible, setRefreshConfirmationVisible] =
    useState(false);
  const historyDirtyRef = useRef(false);
  const [historyDirtyArticleId, setHistoryDirtyArticleId] = useState<
    string | null
  >(null);
  const historySourceRef = useRef<HTMLElement | null>(null);

  function saveClientLiejuPublicationProfile(input: { clientId: string; profile: LiejuPublicationProfile }) {
    return content.commands.saveClientLiejuPublicationProfile(input);
  }

  function isArticleEditorSnapshot(
    value: unknown,
  ): value is ArticleEditorSnapshot {
    if (!value || typeof value !== "object") return false;
    const candidate = value as { article?: unknown; editFingerprint?: unknown };
    return Boolean(
      candidate.article &&
      typeof candidate.article === "object" &&
      typeof candidate.editFingerprint === "string",
    );
  }

  useEffect(() => {
    setTab(mode === "library" ? "history" : loadProductionTab());
    if (mode === "library") setArticleStageFilter(loadArticleStage());
  }, [mode]);

  useEffect(() => {
    if (!clients.length) return;
    const rememberedClientId = loadSelectedClientId();
    if (
      rememberedClientId &&
      rememberedClientId !== clientId &&
      clients.some((client) => client.id === rememberedClientId)
    ) {
      void content.selectClient(rememberedClientId);
    }
  }, [clientId, clients, content]);

  useEffect(() => {
    if (!refreshConfirmationVisible) return;
    const timeout = window.setTimeout(
      () => setRefreshConfirmationVisible(false),
      REFRESH_CONFIRMATION_MS,
    );
    return () => window.clearTimeout(timeout);
  }, [refreshConfirmationVisible]);

  useEffect(() => {
    if (!articleIntent) return;
    setTab("history");
    setArticleStageFilter("all");
    setGenerationBatchFilter(articleIntent.generationBatchId || null);
    setArticleNavigationIntent(articleIntent);
    if (articleIntent.clientId) content.selectClient(articleIntent.clientId);
    onArticleIntentConsumed?.();
  }, [articleIntent, content, onArticleIntentConsumed]);

  useEffect(() => {
    function guardWindowClose(event: BeforeUnloadEvent) {
      if (!historyDirtyRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", guardWindowClose);
    return () => window.removeEventListener("beforeunload", guardWindowClose);
  }, []);

  const requestHistoryLeave = useCallback(
    async (action: () => void) => {
      if (!historyEditingArticle || !historyDirtyRef.current) {
        action();
        return;
      }
      if (
        await confirm({
          title: "放弃未保存修改？",
          message: "文章库有未保存修改，确认离开并放弃这些修改吗？",
          confirmLabel: "放弃修改",
          tone: "warning",
        })
      )
        action();
    },
    [confirm, historyEditingArticle],
  );

  function closeHistoryEditor(skipGuard = false) {
    if (!skipGuard && historyDirtyRef.current) {
      requestHistoryLeave(() => closeHistoryEditor(true));
      return;
    }
    const source = historySourceRef.current;
    historySourceRef.current = null;
    historyDirtyRef.current = false;
    setHistoryDirtyArticleId(null);
    setHistoryEditingArticle(null);
    setHistoryEditingFingerprint(null);
    setHistoryEditingEditable(true);
    historyEditorRequestRef.current += 1;
    source?.focus();
    requestAnimationFrame(() => source?.focus());
  }

  const historyEditorRequestRef = useRef(0);

  function openHistoryEditor(
    nextArticle: GeneratedContentArticle,
    source?: HTMLElement | null,
    published = false,
  ) {
    const workflow = management.workflowByArticle[nextArticle.id];
    const editable =
      !published && workflow?.operations?.edit?.allowed !== false;
    const open = () => {
      const requestId = ++historyEditorRequestRef.current;
      historySourceRef.current = source || null;
      historyDirtyRef.current = false;
      setHistoryDirtyArticleId(null);
      setHistoryEditingPublished(published);
      setHistoryEditingEditable(editable);
      setHistoryEditingFingerprint(null);
      setHistoryEditingArticle(nextArticle);
      const loadEditor = content.commands.getArticleEditor;
      if (typeof loadEditor !== "function") return;
      void loadEditor({ clientId, articleId: nextArticle.id })
        .then((result: unknown) => {
          if (
            requestId !== historyEditorRequestRef.current ||
            !isArticleEditorSnapshot(result)
          )
            return;
          setHistoryEditingArticle(result.article);
          setHistoryEditingFingerprint(result.editFingerprint);
        })
        .catch(() => {
          // The management snapshot remains a safe read-only fallback when the
          // optional editor query is unavailable in an older renderer fixture.
          reportRuntimeDiagnostic(
            "ARTICLE_HISTORY_EDITOR_QUERY_UNAVAILABLE",
            "workspace-invalidation",
          );
        });
    };
    if (historyEditingArticle && historyEditingArticle.id !== nextArticle.id)
      requestHistoryLeave(open);
    else open();
  }

  useEffect(() => {
    if (!historyEditingArticle) return;
    const workflow = management.workflowByArticle[historyEditingArticle.id];
    const published = workflow?.stage === "published";
    const editable =
      !published &&
      (workflow?.operations?.edit?.allowed ?? workflow?.locks?.canEdit) === true;
    setHistoryEditingPublished(published);
    setHistoryEditingEditable(editable);
  }, [historyEditingArticle, management.revision, management.workflowByArticle]);

  function handleClientChange(nextClientId: string) {
    if (nextClientId === clientId) return;
    requestHistoryLeave(() => {
      closeHistoryEditor(true);
      remember(SELECTED_CLIENT_KEY, nextClientId);
      content.selectClient(nextClientId);
      setError("");
      setGenerationBatchFilter(null);
    });
  }

  async function refreshClientsAndTemplates() {
    setRefreshConfirmationVisible(false);
    if (await content.refresh("manual")) setRefreshConfirmationVisible(true);
  }

  function changeTab(nextTab: WorkbenchTab) {
    if (nextTab === tab) return;
    requestHistoryLeave(() => {
      closeHistoryEditor(true);
      setTab(nextTab);
      if (nextTab === "questions" || nextTab === "single" || nextTab === "batch")
        remember(PRODUCTION_TAB_KEY, nextTab);
    });
  }

  function changeArticleStageFilter(nextStage: ArticleWorkflowFilter) {
    setArticleStageFilter(nextStage);
    remember(ARTICLE_STAGE_KEY, nextStage);
  }

  function openGenerationBatchArticles(
    batchId: string,
    targetClientId?: string,
    articleId?: string,
  ) {
    if (!batchId) return;
    if (onOpenArticleLibrary) {
      onOpenArticleLibrary({
        generationBatchId: batchId,
        clientId: targetClientId || clientId || undefined,
        ...(articleId ? { articleId, destination: "article" as const } : {}),
      });
      return;
    }
    requestHistoryLeave(() => {
      closeHistoryEditor(true);
      setTab("history");
      setArticleStageFilter("all");
      setGenerationBatchFilter(batchId);
      if (targetClientId && targetClientId !== clientId)
        void content.selectClient(targetClientId);
    });
  }

  const loading =
    !content.snapshot.scope || (query.loading && clients.length === 0);
  const refreshState: RefreshState = query.loading
    ? "refreshing"
    : query.error
      ? "error"
      : "idle";
  const visibleError = error || query.error?.userMessage || "";
  const tabs = mode === "production"
    ? (["questions", "single", "batch"] as const)
    : ([] as const);
  if (loading)
    return (
      <div className="flex h-full items-center justify-center text-slate-500">
        <LoaderCircle className="mr-2 h-5 w-5 animate-spin" />
        加载客户资料与模板目录
      </div>
    );
  return (
    <div className="content-workbench relative flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-4 py-3">
        {tabs.map((id) => {
          const label =
            id === "questions"
              ? "问题采集"
              : id === "single"
                ? "单篇生成"
                : "批量生成";
          return (
            <button
              id={id}
              type="button"
              key={id}
              aria-label={label}
              onClick={() => changeTab(id)}
              className={`rounded-md px-3 py-2 text-xs font-semibold ${tab === id ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-100"}`}
            >
              {label}
            </button>
          );
        })}
        <div className="ml-auto flex items-center gap-2">
          <label className="text-xs text-slate-500">
            当前客户
          </label>
          <select
            aria-label="当前客户"
            value={clientId}
            onChange={(event) => handleClientChange(event.target.value)}
            className="h-9 min-w-32 rounded-md border border-slate-300 bg-white px-2 text-sm"
          >
            <option value="">暂无客户</option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void refreshClientsAndTemplates()}
            disabled={refreshState === "refreshing"}
            className="inline-flex h-9 items-center gap-1 rounded-md border border-slate-300 px-2 text-xs text-slate-600 disabled:opacity-50"
            aria-label="刷新客户与模板"
            title="刷新客户与模板"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${refreshState === "refreshing" ? "animate-spin" : ""}`}
            />
            {refreshState === "refreshing" ? "刷新中…" : "刷新客户与模板"}
          </button>
        </div>
      </div>
      {refreshConfirmationVisible && (
        <div
          role="status"
          aria-live="polite"
          className="mx-3 mt-3 rounded border border-emerald-100 bg-emerald-50 p-2 text-xs text-emerald-700"
        >
          客户与模板已刷新。
        </div>
      )}
      {visibleError && (
        <div
          role="alert"
          aria-live="assertive"
          className="m-3 rounded border border-rose-100 bg-rose-50 p-2 text-xs text-rose-700"
        >
          {visibleError}
        </div>
      )}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {tab === "questions" && (
          <QuestionCollectionView
            clients={clients}
            clientId={clientId}
            questions={questions}
            research={research}
            query={clientQuery}
            commands={content.commands}
            commandStates={content.snapshot.commands}
            queue={doubaoQueue}
            login={doubaoLogin}
            queueQuery={doubaoQueueQuery}
            loginQuery={doubaoLoginQuery}
          />
        )}
        {(tab === "single" || tab === "batch") && (
          <ArticleGenerationView
            client={clients.find((item) => item.id === clientId)}
            clients={clients}
            clientId={clientId}
            research={research}
            researchByClient={researchByClient}
            getClientDetails={content.getClientDetails}
            templateCatalog={templateCatalog}
            selectedArticle={article}
            onArticleChange={content.setCurrentArticle}
            commands={content.commands}
            commandStates={content.snapshot.commands}
            generationFeature={content.generation}
            generationMode={tab}
            onViewBatchArticles={openGenerationBatchArticles}
          />
        )}
        {mode === "library" && tab === "history" && (
          <div className="flex h-full min-w-0 min-h-0 flex-col gap-3 p-3">
            <ArticleLibraryFilters
              value={articleStageFilter}
              onChange={changeArticleStageFilter}
              counts={management.lifecycleCounts}
            />
            <div className="relative flex min-h-0 min-w-0 flex-1 flex-col gap-3 lg:flex-row">
              <div className="min-h-0 min-w-0 flex-1">
                <GeneratedArticlesView
                  clientId={clientId}
                  workspaceScopeKey={
                    content.snapshot.scope
                      ? `${content.snapshot.scope.workspaceRuntimeId}:${clientId}`
                      : `unscoped:${clientId}`
                  }
                  client={clients.find((item) => item.id === clientId)}
                  saveClientLiejuPublicationProfile={saveClientLiejuPublicationProfile}
                  management={management}
                  query={managementQuery}
                  commands={content.commands}
                  commandStates={content.snapshot.commands}
                  removal={content.snapshot.removal}
                  watchRemovalTransaction={content.watchRemovalTransaction}
                  stageFilter={articleStageFilter}
                  generationBatchId={generationBatchFilter}
                  onClearGenerationBatchFilter={() => setGenerationBatchFilter(null)}
                  onGenerationBatchFilterChange={setGenerationBatchFilter}
                  dirtyArticleId={historyDirtyArticleId}
                  articleNavigationIntent={articleNavigationIntent}
                  favoriteMediaPage={favoriteMediaPage}
                  onFavoriteMediaPageChange={onFavoriteMediaPageChange}
                  onArticleSelect={openHistoryEditor}
                  onStageFilterChange={changeArticleStageFilter}
                  onOpenOrders={onOpenOrders}
                  onOpenAttention={onOpenAttention}
                />
              </div>
              {historyEditingArticle && (
                <GeneratedArticleEditorPanel
                  article={historyEditingArticle}
                  published={historyEditingPublished}
                  editable={historyEditingEditable}
                  editFingerprint={historyEditingFingerprint}
                  onEditFingerprintChange={setHistoryEditingFingerprint}
                  onConflict={async () => {
                    const result = await content.commands.getArticleEditor({
                      clientId,
                      articleId: historyEditingArticle.id,
                    });
                    return isArticleEditorSnapshot(result) ? result : null;
                  }}
                  saving={content.snapshot.commands.saveArticle.busy}
                  onSaveArticle={(draft, expectedFingerprint) =>
                    content.commands.saveArticle({
                      article: {
                        ...draft,
                        status: "saved",
                        updatedAt: new Date().toISOString(),
                      },
                      expectedFingerprint,
                    })
                  }
                  onSaved={(saved) => {
                    setHistoryEditingArticle(saved);
                  }}
                  onClose={() => closeHistoryEditor(true)}
                  onDirtyChange={(dirty) => {
                    historyDirtyRef.current = dirty;
                    setHistoryDirtyArticleId(
                      dirty ? historyEditingArticle?.id || null : null,
                    );
                  }}
                />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
