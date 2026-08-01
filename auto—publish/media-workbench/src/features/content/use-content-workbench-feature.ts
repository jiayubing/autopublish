import { useEffect, useRef, useSyncExternalStore } from 'react';
import {
  getArticleManagementSnapshot,
  copyContentArticleVersion,
  createContentQuestion,
  deleteContentQuestion,
  exportToSubmissionQueue,
  collectDoubaoQuestion,
  listContentClients,
  listContentQuestions,
  listContentResearch,
  listContentTemplateCatalog,
  previewExport,
  retryContentMaterial,
  retryFailedDoubao,
  saveContentArticle,
  saveManualResearch,
  startPreparedDoubaoBatch,
  pauseDoubaoBatch,
  getContentArticleRemovalTransaction,
  onContentArticleRemovalTransaction,
  permanentlyDeleteContentArticle,
  preparePermanentDeleteContentArticle,
  previewCleanupFailedContentSubmissionItems,
  previewContentArticleRemoval,
  previewContentSubmissionBatch,
  retryContentArticleRemovalTransaction,
  resumeDoubaoBatch,
  restoreContentArticle,
  stopDoubaoBatch,
  trashContentArticles,
  cancelContentSubmissionBatch,
  cleanupFailedContentSubmissionItems,
  createContentSubmissionBatch,
  getCachedDoubaoLoginState,
  getDoubaoLoginStatus,
  getDoubaoQueueState,
  openDoubaoLogin,
  previewDoubaoBatch,
  rememberDoubaoLoginState,
  subscribeDoubaoQueue,
  updateContentQuestion,
} from '../../bridge/content';
import { reconcilePublicationHistory } from '../../bridge/publication';
import type { DoubaoBatchTask, GeneratedContentArticle } from '../../types';
import { useWorkspaceRuntimeIdentity, useWorkspaceScope } from '../workspace/workspace-coordinator-context';
import { createContentWorkbenchFeature } from './content-workbench-feature.js';

export function useContentWorkbenchFeature() {
  const workspace = useWorkspaceRuntimeIdentity();
  const featureRef = useRef<ReturnType<typeof createContentWorkbenchFeature> | null>(null);
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
      saveArticle: saveContentArticle,
      copyArticleVersion: copyContentArticleVersion,
      reconcilePublication: reconcilePublicationHistory,
      previewExport,
      exportToSubmissionQueue,
      collectDoubaoQuestion,
      startPreparedDoubaoBatch: (input: { tasks: DoubaoBatchTask[] }) => startPreparedDoubaoBatch(input.tasks),
      pauseDoubaoBatch,
      resumeDoubaoBatch,
      stopDoubaoBatch,
      retryFailedDoubao,
      previewContentSubmissionBatch,
      createContentSubmissionBatch,
      cancelContentSubmissionBatch: (input: { batchId: string; planId: string }) => cancelContentSubmissionBatch(input.batchId, input.planId),
      previewCleanupFailedContentSubmissionItems: (input: { batchId: string }) => previewCleanupFailedContentSubmissionItems(input.batchId),
      cleanupFailedContentSubmissionItems: (input: { batchId: string }) => cleanupFailedContentSubmissionItems(input.batchId),
      previewContentArticleRemoval: (input: { selections: Array<{ clientId: string; articleId: string }> }) => previewContentArticleRemoval(input.selections),
      trashContentArticles,
      getContentArticleRemovalTransaction: (input: { transactionId: string }) => getContentArticleRemovalTransaction(input.transactionId),
      retryContentArticleRemovalTransaction: (input: { transactionId: string }) => retryContentArticleRemovalTransaction(input.transactionId),
      restoreContentArticle,
      preparePermanentDeleteContentArticle,
      permanentlyDeleteContentArticle,
      getDoubaoQueueState,
      getDoubaoLoginStatus,
      openDoubaoLogin,
      previewDoubaoBatch,
    });
  }
  const feature = featureRef.current;
  useEffect(() => {
    if (!workspace.workspaceRuntimeId) return;
    feature.setScope({ workspaceRuntimeId: workspace.workspaceRuntimeId });
    void feature.refresh('initial');
  }, [feature, workspace.workspaceRuntimeId]);
  useWorkspaceScope('contentSources', (event) => {
    if (!event.workspaceRuntimeId) return;
    feature.setScope({ workspaceRuntimeId: event.workspaceRuntimeId });
    void feature.refresh(event.kind);
  });
  useWorkspaceScope('articleManagement', (event) => {
    if (!event.workspaceRuntimeId) return;
    feature.setScope({ workspaceRuntimeId: event.workspaceRuntimeId });
    void feature.refreshManagement(event.kind);
  });
  useEffect(() => () => feature.dispose(), [feature]);
  const snapshot = useSyncExternalStore(feature.subscribe, feature.getSnapshot, feature.getSnapshot);
  return {
    snapshot,
    refresh: (reason = 'manual') => feature.refresh(reason),
    refreshClientData: (reason = 'manual') => feature.refreshClientData(reason),
    refreshManagement: feature.refreshManagement,
    selectClient: feature.selectClient,
    setCurrentArticle: (article: GeneratedContentArticle | null) => feature.setCurrentArticle(article),
    commands: feature.commands,
    subscribeRemovalTransaction: onContentArticleRemovalTransaction,
    subscribeDoubaoQueue,
    getCachedDoubaoLoginState,
    rememberDoubaoLoginState,
  };
}
