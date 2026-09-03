import { useEffect, useRef, useSyncExternalStore } from "react";
import {
  getArticleManagementSnapshot,
  openPublicationUrl,
  getArticleEditor,
  createContentQuestion,
  deleteContentQuestion,
  collectDoubaoQuestion,
  listContentClients,
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
import { generateContentArticle, saveContentArticle } from "../../bridge/generation";
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
import { createContentWorkbenchFeature } from "./content-workbench-feature.js";

export function useContentWorkbenchFeature() {
  const workspace = useWorkspaceRuntimeIdentity();
  const featureRef = useRef<ReturnType<
    typeof createContentWorkbenchFeature
  > | null>(null);
  if (!featureRef.current) {
    featureRef.current = createContentWorkbenchFeature({
      listClients: listContentClients,
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
      generateArticle: generateContentArticle,
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
  useEffect(() => {
    if (!workspace.workspaceRuntimeId) return;
    feature.setScope({ workspaceRuntimeId: workspace.workspaceRuntimeId });
    void feature.refresh("initial");
    void feature.refreshDoubaoQueue("initial");
  }, [feature, workspace.workspaceRuntimeId]);
  useWorkspaceScope("contentSources", (event) => {
    if (!event.workspaceRuntimeId) return;
    feature.setScope({ workspaceRuntimeId: event.workspaceRuntimeId });
    if (!["initial", "identity", "runtime-switch"].includes(event.kind)) {
      void feature.refreshContentSources(event.kind);
      void feature.refreshDoubaoQueue(event.kind);
    }
  });
  useWorkspaceScope("articleManagement", (event) => {
    if (!event.workspaceRuntimeId) return;
    feature.setScope({ workspaceRuntimeId: event.workspaceRuntimeId });
    // The removal transaction event is the authoritative management refresh
    // owner.  The paired workspace invalidation still refreshes attention and
    // platform consumers, but must not issue a second management query.
    if (
      !["initial", "identity", "runtime-switch"].includes(event.kind) &&
      event.reasonCode !== "ARTICLE_REMOVAL_TRANSACTION_CHANGED"
    )
      void feature.refreshManagement(event.kind);
  });
  useEffect(() => () => feature.dispose(), [feature]);
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
    refresh: (reason = "manual") => feature.refresh(reason),
    refreshClientData: (reason = "manual") => feature.refreshClientData(reason),
    refreshManagement: feature.refreshManagement,
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
