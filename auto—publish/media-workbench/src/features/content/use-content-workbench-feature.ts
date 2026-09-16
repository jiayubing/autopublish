import { useEffect, useRef, useSyncExternalStore } from "react";
import {
  getArticleManagementSnapshot,
  openPublicationUrl,
  getArticleEditor,
  createContentQuestion,
  deleteContentQuestion,
  collectDoubaoQuestion,
  listContentClients,
  getClientGroups,
  updateClientGroups,
  getContentClientDetails,
  saveClientLiejuPublicationProfile,
  listContentQuestions,
  listContentResearch,
  listContentResearchMetadata,
  listContentTemplateCatalog,
  retryContentMaterial,
  retryFailedDoubao,
  saveManualResearch,
  startPreparedDoubaoBatch,
  pauseDoubaoBatch,
  previewRegularQueueAdmission,
  resumeDoubaoBatch,
  stopDoubaoBatch,
  admitRegularQueueItems,
  startRegularQueueGroup,
  previewPaidMediaPreflight,
  confirmPaidMediaBatch,
  listPaidMediaBatches,
  startPaidMediaBatch,
  startAllPaidMediaBatches,
  pausePaidMediaBatch,
  cancelRemainingPaidMediaBatchItems,
  getCachedDoubaoLoginState,
  getDoubaoLoginStatus,
  getDoubaoQueueState,
  openDoubaoLogin,
  previewDoubaoBatch,
  rememberDoubaoLoginState,
  subscribeDoubaoQueue,
  updateContentQuestion,
} from "../../bridge/content";
import { saveContentArticle } from "../../bridge/generation";
import {
  getClientGenerationState,
  retryClientGeneration,
  startClientGeneration,
  subscribeClientGeneration,
} from "../../bridge/client-generation";
import {
  getContentArticleRemovalTransaction,
  onContentArticleRemovalTransaction,
  permanentlyDeleteContentArticle,
  preparePermanentDeleteContentArticle,
  previewContentArticleRemoval,
  retryContentArticleRemovalTransaction,
  restoreContentArticle,
  trashContentArticles,
} from "../../bridge/content-removal";
import type { DoubaoBatchMode } from "../../types/content";
import type { GeneratedContentArticle } from "../../types/generation";
import {
  useWorkspaceRuntimeIdentity,
  useWorkspaceScope,
} from "../workspace/workspace-coordinator-context";
import {
  createContentWorkbenchFeature,
  loadContentWorkbenchPage,
} from "./content-workbench-feature.js";

export type ContentWorkbenchPage = "library" | "production" | "shell";

const LOCAL_QUESTION_MUTATION_REASONS = new Set([
  "CONTENT_QUESTION_CREATED",
  "CONTENT_QUESTION_UPDATED",
  "CONTENT_QUESTION_DELETED",
]);

export function useContentWorkbenchFeature(options?: {
  page?: ContentWorkbenchPage | null;
}) {
  const page = options && "page" in options ? options.page ?? null : "library";
  const workspace = useWorkspaceRuntimeIdentity();
  const featureRef = useRef<ReturnType<
    typeof createContentWorkbenchFeature
  > | null>(null);
  if (!featureRef.current) {
    featureRef.current = createContentWorkbenchFeature({
      listClients: listContentClients,
      getClientGroups,
      updateClientGroups,
      saveClientLiejuPublicationProfile,
      listTemplateCatalog: listContentTemplateCatalog,
      listQuestions: listContentQuestions,
      listResearch: listContentResearch,
      getClientDetails: getContentClientDetails,
      listResearchMetadata: listContentResearchMetadata,
      loadManagement: getArticleManagementSnapshot,
      openPublicationUrl,
      createQuestion: createContentQuestion,
      updateQuestion: updateContentQuestion,
      deleteQuestion: deleteContentQuestion,
      saveManualResearch,
      retryMaterial: retryContentMaterial,
      getArticleEditor: (input: { clientId: string; articleId: string }) =>
        getArticleEditor(input),
      saveArticle: (input: {
        article: GeneratedContentArticle;
        expectedFingerprint: string;
      }) => saveContentArticle(input.article, input.expectedFingerprint),
      startClientGeneration,
      getClientGenerationState,
      retryClientGeneration,
      subscribeClientGeneration,
      collectDoubaoQuestion,
      startPreparedDoubaoBatch: (input: { clientIds: string[]; mode: DoubaoBatchMode }) =>
        startPreparedDoubaoBatch(input),
      pauseDoubaoBatch,
      resumeDoubaoBatch,
      stopDoubaoBatch,
      retryFailedDoubao,
      previewRegularQueueAdmission,
      admitRegularQueueItems,
      startRegularQueueGroup,
      previewPaidMediaPreflight,
      confirmPaidMediaBatch,
      listPaidMediaBatches,
      startPaidMediaBatch,
      startAllPaidMediaBatches,
      pausePaidMediaBatch,
      cancelRemainingPaidMediaBatchItems,
      previewContentArticleRemoval: (input: {
        selections: Array<{ clientId: string; articleId: string }>;
      }) => previewContentArticleRemoval(input.selections),
      trashContentArticles,
      getContentArticleRemovalTransaction: (input: { transactionId: string }) =>
        getContentArticleRemovalTransaction(input.transactionId),
      retryContentArticleRemovalTransaction: (input: {
        transactionId: string;
      }) => retryContentArticleRemovalTransaction(input.transactionId),
      restoreContentArticle,
      preparePermanentDeleteContentArticle,
      permanentlyDeleteContentArticle,
      getRemovalTransaction: (input: { transactionId: string }) =>
        getContentArticleRemovalTransaction(input.transactionId),
      subscribeRemovalTransaction: onContentArticleRemovalTransaction,
      getDoubaoQueueState,
      getDoubaoLoginStatus,
      openDoubaoLogin,
      previewDoubaoBatch,
      subscribeDoubaoQueue,
      getCachedDoubaoLoginState,
      rememberDoubaoLoginState,
    });
  }
  const feature = featureRef.current;
  const pageRef = useRef<ContentWorkbenchPage | null>(page);
  pageRef.current = page;
  const hydrationRuntimeRef = useRef<string | null>(null);
  const hydratedPagesRef = useRef<Set<ContentWorkbenchPage>>(new Set());
  const hydrationRequestsRef = useRef<
    Map<ContentWorkbenchPage, Promise<boolean>>
  >(new Map());

  const alignHydrationRuntime = (workspaceRuntimeId: string | null) => {
    if (hydrationRuntimeRef.current === workspaceRuntimeId) return;
    hydrationRuntimeRef.current = workspaceRuntimeId;
    hydratedPagesRef.current.clear();
    hydrationRequestsRef.current.clear();
  };

  const hydratePage = (
    targetPage: ContentWorkbenchPage,
    reason = "initial",
  ): Promise<boolean> => {
    const workspaceRuntimeId = hydrationRuntimeRef.current;
    if (!workspaceRuntimeId) return Promise.resolve(false);
    if (reason === "initial" && hydratedPagesRef.current.has(targetPage))
      return Promise.resolve(true);
    if (reason === "initial") {
      const existing = hydrationRequestsRef.current.get(targetPage);
      if (existing) return existing;
    }

    let request: Promise<boolean>;
    request = Promise.resolve(
      loadContentWorkbenchPage(feature, targetPage, reason),
    )
      .then((result) => {
        if (
          result !== false &&
          hydrationRuntimeRef.current === workspaceRuntimeId
        )
          hydratedPagesRef.current.add(targetPage);
        return result !== false;
      })
      .finally(() => {
        if (hydrationRequestsRef.current.get(targetPage) === request)
          hydrationRequestsRef.current.delete(targetPage);
      });
    if (reason === "initial")
      hydrationRequestsRef.current.set(targetPage, request);
    return request;
  };

  useEffect(() => {
    const workspaceRuntimeId = workspace.workspaceRuntimeId || null;
    alignHydrationRuntime(workspaceRuntimeId);
    if (!workspaceRuntimeId || !page) return;
    feature.setScope({ workspaceRuntimeId });
    void hydratePage(page, "initial");
  }, [feature, page, workspace.workspaceRuntimeId]);
  useWorkspaceScope("contentSources", (event) => {
    if (!event.workspaceRuntimeId) return;
    alignHydrationRuntime(event.workspaceRuntimeId);
    feature.setScope({ workspaceRuntimeId: event.workspaceRuntimeId });
    if (["initial", "identity", "runtime-switch"].includes(event.kind)) return;
    // Question commands apply their returned question and research change in
    // the sources feature.  Do not hydrate the same page again for the paired
    // desktop invalidation event.
    if (LOCAL_QUESTION_MUTATION_REASONS.has(event.reasonCode)) return;
    hydratedPagesRef.current.clear();
    if (!pageRef.current) return;
    return hydratePage(pageRef.current, event.kind);
  });
  useWorkspaceScope("articleManagement", (event) => {
    if (!event.workspaceRuntimeId) return;
    alignHydrationRuntime(event.workspaceRuntimeId);
    feature.setScope({ workspaceRuntimeId: event.workspaceRuntimeId });
    if (["initial", "identity", "runtime-switch"].includes(event.kind)) return;
    if (pageRef.current !== "library") {
      hydratedPagesRef.current.delete("library");
      return;
    }
    // The removal transaction event is the authoritative management refresh
    // owner.  The paired workspace invalidation still refreshes attention and
    // platform consumers, but must not issue a second management query.
    if (event.reasonCode === "ARTICLE_REMOVAL_TRANSACTION_CHANGED") return;
    const wasHydrated = hydratedPagesRef.current.has("library");
    return Promise.resolve(feature.refreshManagement(event.kind)).then((result) => {
      if (result === false) hydratedPagesRef.current.delete("library");
      else if (wasHydrated) hydratedPagesRef.current.add("library");
      return result;
    });
  });
  useEffect(
    () => () => {
      hydratedPagesRef.current.clear();
      hydrationRequestsRef.current.clear();
      feature.dispose();
    },
    [feature],
  );
  const snapshot = useSyncExternalStore(
    feature.subscribe,
    feature.getSnapshot,
    feature.getSnapshot,
  );
  return {
    snapshot,
    getClientDetails: getContentClientDetails,
    production: feature.production,
    library: feature.library,
    refresh: (reason = "manual") =>
      pageRef.current ? hydratePage(pageRef.current, reason) : Promise.resolve(false),
    refreshClientData: (reason = "manual") => feature.refreshClientData(reason),
    refreshManagement: feature.refreshManagement,
    refreshClientGroups: feature.refreshClientGroups,
    refreshPaidMediaBatches: (reason = "manual") =>
      feature.refreshPaidMediaBatches(reason),
    refreshDoubaoQueue: feature.refreshDoubaoQueue,
    selectClient: feature.selectClient,
    setCurrentArticle: (article: GeneratedContentArticle | null) =>
      feature.setCurrentArticle(article),
    generation: feature.production.generation!,
    commands: feature.commands,
    watchRemovalTransaction: feature.watchRemovalTransaction,
    clearRemovalTransaction: feature.clearRemovalTransaction,
  };
}

export type ContentWorkbenchFeature = ReturnType<
  typeof useContentWorkbenchFeature
>;
