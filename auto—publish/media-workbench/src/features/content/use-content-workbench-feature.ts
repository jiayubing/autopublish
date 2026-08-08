import { useEffect, useRef, useSyncExternalStore } from "react";
import {
  getArticleManagementSnapshot,
  getArticleEditor,
  createContentQuestion,
  deleteContentQuestion,
  collectDoubaoQuestion,
  listContentClients,
  listContentQuestions,
  listContentResearch,
  listContentTemplateCatalog,
  retryContentMaterial,
  retryFailedDoubao,
  saveManualResearch,
  startPreparedDoubaoBatch,
  pauseDoubaoBatch,
  previewCleanupFailedContentSubmissionItems,
  previewContentSubmissionBatch,
  previewRegularQueueAdmission,
  resumeDoubaoBatch,
  stopDoubaoBatch,
  cancelContentSubmissionBatch,
  cleanupFailedContentSubmissionItems,
  createContentSubmissionBatch,
  admitRegularQueueItems,
  previewPaidMediaPreflight,
  confirmPaidMediaBatch,
  listPaidMediaBatches,
  startPaidMediaBatch,
  pausePaidMediaBatch,
  removePendingQueueItems,
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
  getContentArticleRemovalTransaction,
  onContentArticleRemovalTransaction,
  permanentlyDeleteContentArticle,
  preparePermanentDeleteContentArticle,
  previewContentArticleRemoval,
  retryContentArticleRemovalTransaction,
  restoreContentArticle,
  trashContentArticles,
} from "../../bridge/content-removal";
import {
  prepareRegularUncertainResolution,
  confirmRegularAccepted,
  confirmRegularNotAccepted,
} from "../../bridge/publication";
import {
  prepareBindPaidOrderNumber,
  bindPaidOrderNumber,
  prepareConfirmPaidOrderAbsent,
  confirmPaidOrderAbsent,
} from "../../bridge/media";
import type { DoubaoBatchTask } from "../../types/content";
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
      listTemplateCatalog: listContentTemplateCatalog,
      listQuestions: listContentQuestions,
      listResearch: listContentResearch,
      loadManagement: getArticleManagementSnapshot,
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
      prepareRegularUncertainResolution,
      confirmRegularAccepted,
      confirmRegularNotAccepted,
      collectDoubaoQuestion,
      startPreparedDoubaoBatch: (input: { tasks: DoubaoBatchTask[] }) =>
        startPreparedDoubaoBatch(input.tasks),
      pauseDoubaoBatch,
      resumeDoubaoBatch,
      stopDoubaoBatch,
      retryFailedDoubao,
      previewContentSubmissionBatch,
      createContentSubmissionBatch,
      previewRegularQueueAdmission,
      admitRegularQueueItems,
      previewPaidMediaPreflight,
      confirmPaidMediaBatch,
      listPaidMediaBatches,
      startPaidMediaBatch,
      pausePaidMediaBatch,
      prepareBindPaidOrderNumber,
      bindPaidOrderNumber,
      prepareConfirmPaidOrderAbsent,
      confirmPaidOrderAbsent,
      removePendingQueueItems,
      cancelContentSubmissionBatch: (input: {
        batchId: string;
        planId: string;
      }) => cancelContentSubmissionBatch(input.batchId, input.planId),
      previewCleanupFailedContentSubmissionItems: (input: {
        batchId: string;
      }) => previewCleanupFailedContentSubmissionItems(input.batchId),
      cleanupFailedContentSubmissionItems: (input: { batchId: string }) =>
        cleanupFailedContentSubmissionItems(input.batchId),
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
    refresh: (reason = "manual") => feature.refresh(reason),
    refreshClientData: (reason = "manual") => feature.refreshClientData(reason),
    refreshManagement: feature.refreshManagement,
    refreshPaidMediaBatches: (reason = "manual") =>
      feature.refreshPaidMediaBatches(reason),
    refreshDoubaoQueue: feature.refreshDoubaoQueue,
    selectClient: feature.selectClient,
    setCurrentArticle: (article: GeneratedContentArticle | null) =>
      feature.setCurrentArticle(article),
    commands: feature.commands,
    watchRemovalTransaction: feature.watchRemovalTransaction,
    clearRemovalTransaction: feature.clearRemovalTransaction,
  };
}
