import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  articleSelectionKey,
  groupArticlesByTemplate,
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
  const [selectedStage, setSelectedStage] = useState<
    ArticleWorkflowFilter
  >(stageFilter);
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
    if (stageFilter !== "trash")
      lastNonTrashStageRef.current = stageFilter;
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
  const workflowByArticle = useMemo(
    () =>
      new Map(
        Object.entries(snapshotWorkflowByArticle),
      ),
    [snapshotWorkflowByArticle],
  );
  const generationBatches = useMemo(
    () =>
      [...new Set(articles.map((article) => article.generationBatchId).filter(Boolean))].sort(),
    [articles],
  );

  function workflowForArticle(article: GeneratedContentArticle) {
    return workflowByArticle.get(article.id);
  }

  function canSubmitArticle(article: GeneratedContentArticle): boolean {
    const workflow = workflowForArticle(article);
    const allowed =
      workflow?.operations?.submit?.allowed ??
      workflow?.locks.canSubmit;
    return (
      allowed === true && !(dirtyArticleId && article.id === dirtyArticleId)
    );
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
      const createdDate = article.createdAt.slice(0, 10);
      const createdFromMatches = !createdFrom || createdDate >= createdFrom;
      const createdToMatches = !createdTo || createdDate <= createdTo;
      const textMatches =
        !query ||
        `${article.title} ${article.content} ${article.platform} ${article.templateId} ${article.templateSnapshot?.name || ""} ${article.templateSnapshot?.scenario || ""} ${article.templateSnapshot?.body || ""}`
          .toLowerCase()
          .includes(query);
      return stageMatches && batchMatches && textMatches && createdFromMatches && createdToMatches;
    });
  }, [articles, createdFrom, createdTo, filter, generationBatchId, selectedStage, workflowByArticle]);
  const groups = useMemo(() => groupArticlesByTemplate(filtered), [filtered]);
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
    startRegularQueueGroup: commands.startRegularQueueGroup,
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
    <div className="relative h-full w-full min-w-0 overflow-x-hidden overflow-y-auto p-4">
      <div className="mb-4 grid min-w-0 gap-3">
        <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
          <h2 aria-label="文章库" className="text-base font-semibold text-slate-800">
            文章库
          </h2>
          <p className="mt-1 max-w-prose text-xs leading-5 text-slate-500">
            按文章当前阶段、生成批次和关键词筛选；编辑、发起投稿、进度与发布档案均从这里进入。
          </p>
          </div>
        </div>

        <ClientLiejuPublicationProfileEditor
          client={client}
          saveProfile={saveClientLiejuPublicationProfile}
        />

        <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(10rem,auto)_auto_auto]">
          <input
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="筛选标题、平台或模板"
            aria-label="筛选文章库"
            className="h-9 min-w-0 w-full rounded-md border border-slate-300 px-2 text-xs"
          />
          <select
            aria-label="生成批次筛选"
            value={generationBatchId || ""}
            onChange={(event) =>
              onGenerationBatchFilterChange?.(event.target.value || null)
            }
            disabled={!generationBatches.length && !generationBatchId}
            className="h-9 min-w-0 rounded-md border border-slate-300 bg-white px-2 text-xs disabled:opacity-50"
          >
            <option value="">全部生成批次</option>
            {generationBatchId && !generationBatches.includes(generationBatchId) && (
              <option value={generationBatchId}>{generationBatchId}</option>
            )}
            {generationBatches.map((batchId) => (
              <option key={batchId} value={batchId}>{batchId}</option>
            ))}
          </select>
          <label className="flex h-9 items-center gap-1 rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-500">
            起始日期
            <input
              type="date"
              aria-label="文章创建起始日期"
              value={createdFrom}
              onChange={(event) => setCreatedFrom(event.target.value)}
              className="min-w-0 bg-transparent text-slate-700 outline-none"
            />
          </label>
          <label className="flex h-9 items-center gap-1 rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-500">
            结束日期
            <input
              type="date"
              aria-label="文章创建结束日期"
              value={createdTo}
              onChange={(event) => setCreatedTo(event.target.value)}
              className="min-w-0 bg-transparent text-slate-700 outline-none"
            />
          </label>
          {generationBatchId && (
            <div
              role="status"
              data-testid="generation-batch-filter"
              className="flex flex-wrap items-center justify-between gap-2 rounded border border-blue-100 bg-blue-50 p-2 text-xs text-blue-800"
            >
              <span>当前筛选：生成批次 {generationBatchId}</span>
              {onClearGenerationBatchFilter && (
                <button
                  type="button"
                  onClick={onClearGenerationBatchFilter}
                  className="rounded border border-blue-200 px-2 py-1 text-blue-700"
                >
                  清除批次筛选
                </button>
              )}
            </div>
          )}
        </div>

        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={openSubmissionIntake}
            disabled={!selectedSubmittableArticles.length || Boolean(selectedDirtyArticle)}
            title={selectedDirtyArticle ? "当前编辑文章有未保存修改，请先保存后投稿。" : undefined}
            className="rounded bg-blue-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
          >
            发起投稿 ({selectedSubmittableArticles.length})
          </button>
          <button
            type="button"
            onClick={toggleAll}
            disabled={!operable.length}
            className="rounded border border-slate-300 px-3 py-2 text-xs disabled:opacity-40"
          >
            全选当前结果
          </button>
          <button
            type="button"
            onClick={() => void trashSelected()}
            disabled={
              !selectedTrashableArticles.length ||
              removalSnapshot.trashBusy ||
              removalSnapshot.removalSubmitDisabled
            }
            className="rounded bg-rose-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
          >
            移入回收站 ({selectedTrashableArticles.length})
          </button>
        </div>
        {intake.feedback && (
          <div
            role={intake.feedback.kind === "error" ? "alert" : "status"}
            aria-live={intake.feedback.kind === "error" ? "assertive" : "polite"}
            tabIndex={intake.feedback.kind === "error" ? -1 : undefined}
            className={`min-w-0 rounded border p-2 text-xs ${intake.feedback.kind === "error" ? "border-rose-100 bg-rose-50 text-rose-700" : "border-blue-100 bg-blue-50 text-blue-700"}`}
          >
            {intake.feedback.text}
          </div>
        )}
        <ArticleRemovalDialog
          snapshot={removalSnapshot}
          intents={removalIntents}
        />

        <div className="rounded-md border border-slate-200 bg-slate-50 p-2 text-xs text-slate-500">
          选择文章后点击“发起投稿”，在确认面板中选择普通平台目标或收藏媒体。
        </div>
      </div>
      {visibleError && (
        <div
          role="alert"
          className="mb-3 rounded border border-rose-100 bg-rose-50 p-2 text-xs text-rose-700"
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
