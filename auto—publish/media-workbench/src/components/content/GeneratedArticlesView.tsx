import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Search, Send, Trash2 } from "lucide-react";
import {
  articleMatchesLibraryDateRange,
  articleSelectionKey,
  groupArticlesByTemplate,
  groupPublishedArticlesByTarget,
  publishedTimeFactsByArticle,
  selectableArticles,
} from "../../article-history-logic";
import type {
  PublicationArchiveEntry,
  PublicationHistoryRecord,
} from "../../types/publication";
import type { GeneratedContentArticle } from "../../types/generation";
import { type ArticleWorkflowFilter } from "../../article-workflow";
import type { ArticleLibraryNavigationIntent } from "../../article-library-navigation";
import type {
  ArticleManagementReadModel,
  FavoriteMediaPage,
  GeneratedArticlesViewProps as GeneratedArticlesViewPropsBase,
} from "./GeneratedArticlesView.types";
import PublicationHistoryDrawer from "./PublicationHistoryDrawer";
import GeneratedArticlesList from "./GeneratedArticlesList";
import ArticleTrashPanel from "./ArticleTrashPanel";
import ClientLiejuPublicationProfileEditor from "./ClientLiejuPublicationProfileEditor";
import { useConfirmation } from "../../confirmation";
import { useSubmissionIntakeSession } from "./use-submission-intake-session";
import SubmissionIntakeDialog from "./SubmissionIntakeDialog";
import { useArticleRemovalSession } from "./use-article-removal-session";
import ArticleRemovalDialog from "./ArticleRemovalDialog";
import { Button, PageHeader, Surface } from "../ui/primitives";

type GeneratedArticlesViewProps = {
  management: ArticleManagementReadModel;
} & Omit<GeneratedArticlesViewPropsBase, "management">;

const EMPTY_FAVORITE_MEDIA_PAGE: FavoriteMediaPage = {
  items: [],
  total: 0,
  page: 1,
  totalPages: 0,
  hasPrev: false,
  hasNext: false,
  loading: false,
};

function selectionKey(article: GeneratedContentArticle) {
  return articleSelectionKey(article);
}

export default function GeneratedArticlesView({
  clientId,
  workspaceScopeKey,
  client,
  saveClientLiejuPublicationProfile,
  management,
  query,
  commands,
  commandStates,
  removal,
  watchRemovalTransaction,
  stageFilter = "all",
  generationBatchId,
  articleNavigationIntent,
  onClearGenerationBatchFilter,
  onGenerationBatchFilterChange,
  dirtyArticleId,
  favoriteMediaPage = EMPTY_FAVORITE_MEDIA_PAGE,
  onFavoriteMediaPageChange,
  onArticleSelect,
  onStageFilterChange,
  onOpenOrders,
  onOpenAttention,
}: GeneratedArticlesViewProps) {
  const { confirm } = useConfirmation();
  const {
    articles,
    trash,
    publicationRecords,
    publishedArchives = [],
    workflowByArticle: snapshotWorkflowByArticle,
    submissionPlatforms: allSubmissionPlatforms,
  } = management;
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [filter, setFilter] = useState("");
  const [createdFrom, setCreatedFrom] = useState("");
  const [createdTo, setCreatedTo] = useState("");
  const [selectedStage, setSelectedStage] = useState<ArticleWorkflowFilter>(
    stageFilter,
  );
  const submissionPlatforms = useMemo(
    () =>
      allSubmissionPlatforms.filter((platform) => platform.contentQueueImport),
    [allSubmissionPlatforms],
  );
  const [drawerArticle, setDrawerArticle] =
    useState<GeneratedContentArticle | null>(null);
  const handledArticleNavigationRef =
    useRef<ArticleLibraryNavigationIntent | null>(null);
  const lastNonTrashStageRef = useRef<ArticleWorkflowFilter>(
    stageFilter === "trash" ? "all" : stageFilter,
  );
  const [selected, setSelected] = useState<string[]>([]);
  const visibleError = query.error?.userMessage || "";

  const commandBusy = useCallback(
    (...names: string[]) =>
      names.some((name) => commandStates[name]?.busy === true),
    [commandStates],
  );

  useEffect(() => {
    setSelectedStage(stageFilter);
    if (stageFilter !== "trash") lastNonTrashStageRef.current = stageFilter;
  }, [stageFilter]);

  useEffect(() => {
    setSelected([]);
  }, [generationBatchId]);

  const updateSelected = useCallback((next: React.SetStateAction<string[]>) => {
    setSelected((current) =>
      typeof next === "function" ? next(current) : next,
    );
  }, []);

  useEffect(() => {
    setDrawerArticle(null);
  }, [clientId]);

  const publicationRecordsByArticle = useMemo(() => {
    const grouped = new Map<string, PublicationHistoryRecord[]>();
    publicationRecords.forEach((record) => {
      if (!record.articleId) return;
      grouped.set(record.articleId, [
        ...(grouped.get(record.articleId) || []),
        record,
      ]);
    });
    return grouped;
  }, [publicationRecords]);

  const publicationArchivesByArticle = useMemo(() => {
    const grouped = new Map<string, PublicationArchiveEntry[]>();
    publishedArchives.forEach((archive) => {
      const articleId = archive.publicationEvidence.articleIdentityV1.articleId;
      grouped.set(articleId, [
        ...(grouped.get(articleId) || []),
        archive,
      ]);
    });
    return grouped;
  }, [publishedArchives]);

  const publishedTimeFacts = useMemo(
    () => publishedTimeFactsByArticle(publishedArchives),
    [publishedArchives],
  );
  const workflowByArticle = useMemo(
    () => new Map(Object.entries(snapshotWorkflowByArticle)),
    [snapshotWorkflowByArticle],
  );
  const generationBatches = useMemo(
    () =>
      [
        ...new Set(
          articles.map((article) => article.generationBatchId).filter(Boolean),
        ),
      ].sort(),
    [articles],
  );

  function workflowForArticle(article: GeneratedContentArticle) {
    return workflowByArticle.get(article.id);
  }

  function canSubmitArticle(article: GeneratedContentArticle): boolean {
    const workflow = workflowForArticle(article);
    const allowed =
      workflow?.operations?.submit?.allowed ?? workflow?.locks.canSubmit;
    return allowed === true && !(dirtyArticleId && article.id === dirtyArticleId);
  }

  function canTrashArticle(article: GeneratedContentArticle): boolean {
    const workflow = workflowForArticle(article);
    const allowed =
      workflow?.operations?.trash?.allowed ?? workflow?.locks.canTrash;
    return allowed === true && !isPublishedArticle(article);
  }

  function isArticleSelectable(article: GeneratedContentArticle): boolean {
    return (
      selectableArticles([article], clientId).length > 0 &&
      (canSubmitArticle(article) || canTrashArticle(article))
    );
  }

  function isPublishedArticle(article: GeneratedContentArticle): boolean {
    const workflow = workflowForArticle(article);
    return workflow?.stage === "published";
  }

  const filtered = useMemo(() => {
    const query = filter.trim().toLowerCase();
    return articles.filter((article) => {
      const stageMatches =
        selectedStage === "all" ||
        workflowByArticle.get(article.id)?.stage === selectedStage;
      const batchMatches =
        !generationBatchId || article.generationBatchId === generationBatchId;
      const dateMatches = articleMatchesLibraryDateRange(
        article,
        selectedStage,
        publishedTimeFacts,
        createdFrom,
        createdTo,
      );
      const textMatches =
        !query ||
        `${article.title} ${article.content} ${article.platform} ${article.templateId} ${article.templateSnapshot?.name || ""} ${article.templateSnapshot?.scenario || ""} ${article.templateSnapshot?.body || ""}`
          .toLowerCase()
          .includes(query);
      return stageMatches && batchMatches && textMatches && dateMatches;
    });
  }, [
    articles,
    createdFrom,
    createdTo,
    filter,
    generationBatchId,
    publishedTimeFacts,
    selectedStage,
    workflowByArticle,
  ]);

  const groups = useMemo(
    () =>
      selectedStage === "published"
        ? groupPublishedArticlesByTarget(
            filtered,
            publishedArchives,
            publicationRecords,
          )
        : groupArticlesByTemplate(filtered),
    [filtered, publicationRecords, publishedArchives, selectedStage],
  );
  const operable = useMemo(
    () => selectableArticles(filtered, clientId).filter(isArticleSelectable),
    [filtered, clientId, workflowByArticle, dirtyArticleId],
  );
  const selectedArticles = filtered.filter(
    (article) =>
      selected.includes(selectionKey(article)) && isArticleSelectable(article),
  );
  const selectedDirtyArticle = selectedArticles.find((article) =>
    Boolean(dirtyArticleId && article.id === dirtyArticleId),
  );
  const selectedSubmittableArticles = selectedDirtyArticle
    ? []
    : selectedArticles.filter(canSubmitArticle);
  const selectedTrashableArticles = selectedArticles.filter(canTrashArticle);

  const submissionSession = useSubmissionIntakeSession({
    scopeKey: workspaceScopeKey,
    availableArticleRefs: selectedSubmittableArticles.map((article) => ({
      clientId: article.clientId,
      articleId: article.id,
    })),
    previewRegularQueueAdmission: commands.previewRegularQueueAdmission,
    admitRegularQueueItems: commands.admitRegularQueueItems,
    previewPaidMediaPreflight: commands.previewPaidMediaPreflight,
    confirmPaidMediaBatch: commands.confirmPaidMediaBatch,
    commandStates,
    confirm,
    onCommitted: () => updateSelected([]),
  });
  const intake = submissionSession.snapshot;
  const intakeIntents = submissionSession.intents;

  const removalSession = useArticleRemovalSession({
    clientId,
    scopeKey: workspaceScopeKey,
    removal,
    watchRemovalTransaction,
    previewContentArticleRemoval: commands.previewContentArticleRemoval,
    trashContentArticles: commands.trashContentArticles,
    retryContentArticleRemovalTransaction:
      commands.retryContentArticleRemovalTransaction,
    restoreContentArticle: commands.restoreContentArticle,
    preparePermanentDeleteContentArticle:
      commands.preparePermanentDeleteContentArticle,
    permanentlyDeleteContentArticle: commands.permanentlyDeleteContentArticle,
    commandStates,
    confirm,
    onTrashCommitted: () => updateSelected([]),
  });
  const removalSnapshot = removalSession.snapshot;
  const removalIntents = removalSession.intents;
  const removalCommandBusy = useCallback(
    (...names: string[]) => removalSnapshot.busy || commandBusy(...names),
    [commandBusy, removalSnapshot.busy],
  );

  function toggleArticle(article: GeneratedContentArticle) {
    if (!isArticleSelectable(article)) return;
    const key = selectionKey(article);
    updateSelected((current) =>
      current.includes(key)
        ? current.filter((item) => item !== key)
        : [...current, key],
    );
  }

  function toggleGroup(groupArticles: GeneratedContentArticle[]) {
    const ids = selectableArticles(groupArticles, clientId)
      .filter(isArticleSelectable)
      .map(selectionKey);
    const allSelected =
      ids.length > 0 && ids.every((id) => selected.includes(id));
    updateSelected((current) =>
      allSelected
        ? current.filter((id) => !ids.includes(id))
        : [...new Set([...current, ...ids])],
    );
  }

  function openSubmissionIntake() {
    if (!selectedSubmittableArticles.length || selectedDirtyArticle) return;
    intakeIntents.open(
      selectedSubmittableArticles.map((article) => ({
        clientId: article.clientId,
        articleId: article.id,
      })),
    );
  }

  function openArticle(
    article: GeneratedContentArticle,
    source?: HTMLElement | null,
  ) {
    const workflow = workflowForArticle(article);
    if (!workflow) return;
    onArticleSelect(article, source, workflow.stage === "published");
  }

  useEffect(() => {
    if (
      !articleNavigationIntent ||
      handledArticleNavigationRef.current === articleNavigationIntent
    )
      return;
    const articleId = articleNavigationIntent?.articleId;
    if (!articleId) return;
    const target = articles.find((article) => article.id === articleId);
    if (!target) return;
    handledArticleNavigationRef.current = articleNavigationIntent;
    const destination = articleNavigationIntent.destination || "publication";
    if (destination === "publication") {
      setDrawerArticle(target);
      return;
    }
    if (destination === "article") {
      openArticle(target);
      return;
    }
    if (!canSubmitArticle(target)) return;
    updateSelected([selectionKey(target)]);
    intakeIntents.open([
      { clientId: target.clientId, articleId: target.id },
    ]);
  }, [
    articleNavigationIntent,
    articles,
    canSubmitArticle,
    intakeIntents,
    openArticle,
    updateSelected,
  ]);

  async function trashSelected() {
    await removalIntents.previewTrash(
      selectedTrashableArticles.map((article) => ({
        clientId: article.clientId,
        articleId: article.id,
      })),
    );
  }

  function toggleAll() {
    const ids = operable.map(selectionKey);
    const allSelected =
      ids.length > 0 && ids.every((id) => selected.includes(id));
    updateSelected((current) =>
      allSelected
        ? current.filter((id) => !ids.includes(id))
        : [...new Set([...current, ...ids])],
    );
  }

  if (selectedStage === "trash")
    return (
      <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-3">
        <div className="grid min-w-0 gap-2">
          <ArticleRemovalDialog
            snapshot={removalSnapshot}
            intents={removalIntents}
          />
        </div>
        <ArticleTrashPanel
          trash={trash}
          visibleError={visibleError}
          commandBusy={removalCommandBusy}
          workflowByArticle={workflowByArticle}
          onBack={() => {
            const next = lastNonTrashStageRef.current;
            setSelectedStage(next);
            onStageFilterChange?.(next);
          }}
          onRestore={(entry) => void removalIntents.restore(entry)}
          onPermanentlyDelete={(entry) =>
            void removalIntents.permanentlyDelete(entry)
          }
        />
      </div>
    );

  return (
    <div className="relative h-full w-full min-w-0 overflow-x-hidden overflow-y-auto p-3 sm:p-4">
      <div className="mb-3 grid min-w-0 gap-3">
        <PageHeader
          eyebrow="Article Library"
          title={<span aria-label="文章库">文章库</span>}
          description="按文章阶段、生成批次和关键词筛选；编辑、发起投稿、进度与发布档案均从这里进入。"
          actions={
            <div className="text-right">
              <span className="block text-[9px] font-semibold uppercase tracking-[0.09em] text-slate-400">
                当前结果
              </span>
              <span className="mt-0.5 block font-mono text-sm font-bold text-slate-700">
                {filtered.length} 篇
              </span>
            </div>
          }
        />

        <ClientLiejuPublicationProfileEditor
          client={client}
          saveProfile={saveClientLiejuPublicationProfile}
        />

        <Surface className="overflow-hidden">
          <div className="grid min-w-0 gap-2 bg-slate-50/55 p-2.5 lg:grid-cols-[minmax(13rem,1fr)_minmax(10rem,auto)_auto_auto]">
            <div className="relative min-w-0">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                placeholder="筛选标题、平台或模板"
                aria-label="筛选文章库"
                className="ui-field h-9 pl-8"
              />
            </div>
            <select
              aria-label="生成批次筛选"
              value={generationBatchId || ""}
              onChange={(event) =>
                onGenerationBatchFilterChange?.(event.target.value || null)
              }
              disabled={!generationBatches.length && !generationBatchId}
              className="ui-field h-9 bg-white disabled:opacity-50"
            >
              <option value="">全部生成批次</option>
              {generationBatchId &&
                !generationBatches.includes(generationBatchId) && (
                  <option value={generationBatchId}>{generationBatchId}</option>
                )}
              {generationBatches.map((batchId) => (
                <option key={batchId} value={batchId}>
                  {batchId}
                </option>
              ))}
            </select>
            <label className="flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-[11px] font-medium text-slate-500">
              起始
              <input
                type="date"
                aria-label={
                  selectedStage === "published"
                    ? "文章发布时间起始日期"
                    : "文章创建起始日期"
                }
                value={createdFrom}
                onChange={(event) => setCreatedFrom(event.target.value)}
                className="min-w-0 bg-transparent text-slate-700 outline-none"
              />
            </label>
            <label className="flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-[11px] font-medium text-slate-500">
              结束
              <input
                type="date"
                aria-label={
                  selectedStage === "published"
                    ? "文章发布时间结束日期"
                    : "文章创建结束日期"
                }
                value={createdTo}
                onChange={(event) => setCreatedTo(event.target.value)}
                className="min-w-0 bg-transparent text-slate-700 outline-none"
              />
            </label>
          </div>

          {generationBatchId && (
            <div
              role="status"
              data-testid="generation-batch-filter"
              className="flex flex-wrap items-center justify-between gap-2 border-t border-blue-100 bg-blue-50/70 px-3 py-2 text-[11px] text-blue-800"
            >
              <span>当前筛选：生成批次 {generationBatchId}</span>
              {onClearGenerationBatchFilter && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={onClearGenerationBatchFilter}
                >
                  清除批次筛选
                </Button>
              )}
            </div>
          )}
        </Surface>

        <div className="flex min-w-0 flex-wrap items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 py-2 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
          <span className="mr-1 text-[11px] font-medium text-slate-400">
            已选 {selectedArticles.length}
          </span>
          <Button
            variant="primary"
            size="sm"
            onClick={openSubmissionIntake}
            disabled={
              !selectedSubmittableArticles.length || Boolean(selectedDirtyArticle)
            }
            title={
              selectedDirtyArticle
                ? "当前编辑文章有未保存修改，请先保存后投稿。"
                : undefined
            }
          >
            <Send className="h-3.5 w-3.5" />
            发起投稿 ({selectedSubmittableArticles.length})
          </Button>
          <Button size="sm" onClick={toggleAll} disabled={!operable.length}>
            全选当前结果
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={() => void trashSelected()}
            disabled={
              !selectedTrashableArticles.length ||
              removalSnapshot.trashBusy ||
              removalSnapshot.removalSubmitDisabled
            }
          >
            <Trash2 className="h-3.5 w-3.5" />
            移入回收站 ({selectedTrashableArticles.length})
          </Button>
        </div>

        {intake.feedback && (
          <div
            role={intake.feedback.kind === "error" ? "alert" : "status"}
            aria-live={
              intake.feedback.kind === "error" ? "assertive" : "polite"
            }
            tabIndex={intake.feedback.kind === "error" ? -1 : undefined}
            className={`min-w-0 rounded-xl border p-3 text-xs ${
              intake.feedback.kind === "error"
                ? "border-rose-100 bg-rose-50 text-rose-700"
                : "border-blue-100 bg-blue-50 text-blue-700"
            }`}
          >
            {intake.feedback.text}
          </div>
        )}

        <ArticleRemovalDialog
          snapshot={removalSnapshot}
          intents={removalIntents}
        />
      </div>

      {visibleError && (
        <div
          role="alert"
          className="mb-3 rounded-xl border border-rose-100 bg-rose-50 p-3 text-xs text-rose-700"
        >
          {visibleError}
        </div>
      )}

      <GeneratedArticlesList
        groups={groups}
        visibleError={visibleError}
        clientId={clientId}
        collapsed={collapsed}
        selected={selected}
        workflowByArticle={workflowByArticle}
        publishedArchives={publishedArchives}
        publishedView={selectedStage === "published"}
        isArticleSelectable={isArticleSelectable}
        isArticleSubmittable={canSubmitArticle}
        removalSubmitDisabled={removalSnapshot.removalSubmitDisabled}
        commandBusy={commandBusy}
        onToggleCollapsed={(key) =>
          setCollapsed((current) => ({
            ...current,
            [key]: current[key] === false,
          }))
        }
        onToggleGroup={toggleGroup}
        onToggleArticle={toggleArticle}
        onOpenArticle={openArticle}
        onOpenPublication={(article) => setDrawerArticle(article)}
        onOpenOrder={onOpenOrders}
      />

      <PublicationHistoryDrawer
        article={drawerArticle}
        records={
          drawerArticle
            ? publicationRecordsByArticle.get(drawerArticle.id) || []
            : []
        }
        archives={
          drawerArticle
            ? publicationArchivesByArticle.get(drawerArticle.id) || []
            : []
        }
        summary={
          drawerArticle
            ? workflowByArticle.get(drawerArticle.id)?.publicationSummary
            : undefined
        }
        onOpenPublicationUrl={(record) => {
          void commands
            .openPublicationUrl({ publicationId: record.publicationId })
            .catch(() => undefined);
        }}
        publicationUrlBusy={commandStates.openPublicationUrl?.busy === true}
        publicationUrlError={
          commandStates.openPublicationUrl?.error?.userMessage || null
        }
        onOpenAttention={onOpenAttention}
        onClose={() => setDrawerArticle(null)}
      />
      <SubmissionIntakeDialog
        snapshot={intake}
        intents={intakeIntents}
        submissionPlatforms={submissionPlatforms}
        favoriteMediaPage={favoriteMediaPage}
        onFavoriteMediaPageChange={onFavoriteMediaPageChange}
      />
    </div>
  );
}
