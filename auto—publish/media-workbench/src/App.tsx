import React, { lazy, Suspense, useState, useEffect, useCallback, useRef } from 'react';
import { ViewMode, Article, MediaResource, Draft, Order } from './types';
import {
  scanArticles,
  previewArticle,
  setDraft,
  addToPool,
  removeFromPool,
  getPool,
  getBalance,
  getOrders,
  refreshResources,
  getResourcePage,
  getDraft,
  buildConfirmation,
  submitSelected,
} from "./bridge/media";
import Sidebar from './components/Sidebar';
import ArticleList from './components/ArticleList';
import ArticleEditor from './components/ArticleEditor';
import PreflightModal, { MediaPreflightSummary } from './components/PreflightModal';
import { WorkspaceDataProvider, usePlatformQueue } from './workspace-data-store';
import { PlatformTaskProvider } from './platform-task-store';
import { 
  Database, 
  HelpCircle, 
  RefreshCw, 
  Layout,
  Send, 
  ChevronRight, 
  FileText, 
  AlertCircle,
  Plus,
  Compass,
  ListFilter
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

const ResourceLibrary = lazy(() => import('./components/ResourceLibrary'));
const OrdersView = lazy(() => import('./components/OrdersView'));
const SettingsView = lazy(() => import('./components/SettingsView'));
const PlatformWorkbench = lazy(() => import('./components/PlatformWorkbench'));
const ContentWorkbench = lazy(() => import('./components/ContentWorkbench'));

export default function App() {
  return <PlatformTaskProvider><WorkspaceDataProvider><AppContent /></WorkspaceDataProvider></PlatformTaskProvider>;
}

function AppContent() {
  const [currentView, setCurrentView] = useState<ViewMode>('workbench');
  const [articleAttentionIntent, setArticleAttentionIntent] = useState<{ attentionId?: string; clientId?: string } | null>(null);
  const { snapshot: platformQueue } = usePlatformQueue();
  
  // Data State
  const [articles, setArticles] = useState<Article[]>([]);
  
  const [resources, setResources] = useState<MediaResource[]>([]);
  const [poolResources, setPoolResources] = useState<MediaResource[]>([]);
  
  const [orders, setOrders] = useState<Order[]>([]);

  const [balance, setBalance] = useState<number>(0);

  // UI States
  const [activeArticle, setActiveArticle] = useState<Article | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [isCheckingBalance, setIsCheckingBalance] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmation, setConfirmation] = useState<MediaPreflightSummary | null>(null);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [isRefreshingResources, setIsRefreshingResources] = useState(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const mediaRefreshRequestId = useRef(0);

  const openArticleAttention = (intent: { attentionId?: string; clientId?: string } = {}) => {
    setArticleAttentionIntent(intent);
    setCurrentView('content');
  };

  // Load data from API (or localStorage fallback) on mount
  useEffect(() => {
    async function loadData() {
      try {
        const [articlesData, resourcePage, ordersData, balanceData] =
          await Promise.all([
            scanArticles(),
            getResourcePage({ page: 1, pageSize: 99999 }),
            getOrders(),
            getBalance(),
          ]);
        setArticles(articlesData);
        setResources(resourcePage.items);
        setOrders(ordersData);
        setBalance(balanceData);
        const pool = await getPool();
        setPoolResources(pool);
      } catch (e) {
        console.error("Failed to load initial data:", e);
      } finally {
        setDataLoaded(true);
      }
    }
    loadData();
  }, []);

  // Toggle resource in/out of media pool
  const handleTogglePool = async (resource: MediaResource) => {
    const inPool = poolResources.some(r => r.resourceId === resource.resourceId);
    try {
      if (inPool) {
        await removeFromPool(resource.resourceId);
        setPoolResources(prev => prev.filter(r => r.resourceId !== resource.resourceId));
      } else {
        await addToPool(resource);
        setPoolResources(prev => [...prev, resource]);
      }
    } catch (e) { console.error("Pool toggle failed:", e); }
  };

  // Refresh all resources from API (slow, pulls all pages)
  const handleRefreshResources = async () => {
    setIsRefreshingResources(true);
    try {
      await refreshResources({ fetchAll: true });
      const page = await getResourcePage({ page: 1, pageSize: 99999 });
      setResources(page.items);
    } catch (e) {
      console.error("Resource refresh failed:", e);
    } finally {
      setIsRefreshingResources(false);
    }
  };

  // Balance Refresh Handler
  const handleCheckBalance = async () => {
    setIsCheckingBalance(true);
    try {
      const bal = await getBalance();
      setBalance(bal);
    } catch (e) {
      console.error("Balance check failed:", e);
    } finally {
      setIsCheckingBalance(false);
    }
  };

  // Article scan triggers real IPC scan
  const handleScanArticles = async () => {
    setIsScanning(true);
    try {
      const fresh = await scanArticles();
      setArticles(fresh);
    } catch (e) {
      console.error("Scan failed:", e);
    } finally {
      setIsScanning(false);
    }
  };


  // Save drafts and update internal list states
  const handleSaveDraft = async (draft: Draft) => {
    // Update the active article's in-memory state and persist to backend
    if (activeArticle) {
      // Store draft in Electron main or localStorage
      await setDraft(draft.filename, draft);
      
      // Update the articles list with draft modifications
      setArticles(prev => prev.map(a => {
        if (a.filename === draft.filename) {
          return {
            ...a,
            title: draft.title,
            remark: draft.remark,
            ignoreImages: draft.ignoreImages,
            selectedResources: draft.selectedResources,
          };
        }
        return a;
      }));

      // Update active article to reflect changes
      setActiveArticle(prev => prev && prev.filename === draft.filename ? {
        ...prev,
        title: draft.title,
        remark: draft.remark,
        ignoreImages: draft.ignoreImages,
        selectedResources: draft.selectedResources,
      } : prev);
    }
  };

  // Pick a resource: bind or unbind to the active article
  const handlePickResource = (resource: MediaResource) => {
    if (!activeArticle) return;

    const alreadySelected = activeArticle.selectedResources.some(
      (r) => r.resourceId === resource.resourceId
    );

    if (alreadySelected) {
      // Remove from selection
      setActiveArticle(prev => prev ? {
        ...prev,
        selectedResources: prev.selectedResources.filter(
          (r) => r.resourceId !== resource.resourceId
        ),
      } : prev);
    } else {
      // Append to selection
      setActiveArticle(prev => prev ? {
        ...prev,
        selectedResources: [...prev.selectedResources, resource],
      } : prev);
    }
  };

  // Remove a selected resource from the active article
  const handleRemoveSelectedResource = (resourceId: string) => {
    if (!activeArticle) return;
    setActiveArticle(prev => prev ? {
      ...prev,
      selectedResources: prev.selectedResources.filter(
        (r) => r.resourceId !== resourceId
      ),
    } : prev);
  };

  // Directly add a resource to the active article selection
  const handleAddResource = (resource: MediaResource) => {
    if (!activeArticle) return;
    const alreadySelected = activeArticle.selectedResources.some(
      (r) => r.resourceId === resource.resourceId
    );
    if (!alreadySelected) {
      setActiveArticle(prev => prev ? {
        ...prev,
        selectedResources: [...prev.selectedResources, resource],
      } : prev);
    }
  };

  // Order & submission handling
  const handleClearOrders = () => {
    setOrders([]);
  };
  const readyForSubmit = articles.length > 0 && articles.every((article) => article.selectedResources && article.selectedResources.length > 0 && (!article.hasImages || article.ignoreImages));
  const handleRealSubmit = async () => {
    if (!readyForSubmit || isSubmitting) return;
    setIsSubmitting(true);
    setSubmissionError(null);
    try { const preflight = await buildConfirmation(articles) as MediaPreflightSummary; setConfirmation(preflight); }
    catch (e) { console.error('media submit failed', e); }
    finally { setIsSubmitting(false); }
  };

  // The media workbench owns this snapshot.  A submission may consume files,
  // so refresh articles before orders and ignore responses superseded by a
  // newer refresh.
  const refreshMediaWorkbenchData = useCallback(async () => {
    const requestId = ++mediaRefreshRequestId.current;
    const freshArticles = await scanArticles();
    if (requestId !== mediaRefreshRequestId.current) return;
    setArticles(freshArticles);
    setActiveArticle((current) => current && !freshArticles.some((article) => article.filename === current.filename) ? null : current);

    const freshOrders = await getOrders();
    if (requestId !== mediaRefreshRequestId.current) return;
    setOrders(freshOrders);
  }, []);
  const confirmRealSubmit = async () => {
    setIsSubmitting(true);
    setSubmissionError(null);
    try {
      await submitSelected(articles);
      await refreshMediaWorkbenchData();
      setConfirmation(null);
    } catch (error) {
      console.error('media submit failed', error);
      setSubmissionError(error instanceof Error ? error.message : '提交失败，请稍后重试');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Clear all local order records
    return (
    <div className="flex h-full w-full overflow-hidden bg-slate-50">
      {/* 1. Fixed Left Sidebar */}
      <Sidebar
        currentView={currentView}
        onViewChange={setCurrentView}
        balance={balance}
        onCheckBalance={handleCheckBalance}
        isCheckingBalance={isCheckingBalance}
        totalArticles={articles.length}
        totalResources={resources.length}
        totalOrders={orders.length}
        platformQueueSnapshot={platformQueue}
      />

      {/* 2. Main Content Viewport */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        {/* Top Toolbar / Header bar */}
        <header className="h-14 border-b border-slate-200 bg-white flex items-center px-6 shadow-sm z-10 shrink-0">
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center space-x-3">
              {dataLoaded ? (
                <div className="flex items-center space-x-2 text-xs text-slate-500 font-medium">
                  <div className="w-2 h-2 rounded-full bg-emerald-400"></div>
                  <span>数据已就绪</span>
                </div>
              ) : (
                <div className="flex items-center space-x-2 text-xs text-amber-500 font-medium">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>正在加载数据...</span>
                </div>
              )}
            </div>
            {currentView === 'workbench' && articles.some(a => a.selectedResources && a.selectedResources.length > 0) && (
              <button
                onClick={handleRealSubmit}
                disabled={!readyForSubmit || isSubmitting}
                title={readyForSubmit ? "将执行真实预检并提交" : "所有文章必须选择资源，并处理图片后才能提交"}
                className="flex items-center space-x-1.5 px-4 py-2 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white text-sm font-bold rounded-lg shadow-sm transition-all active:scale-95"
              >
                <Send className="w-4 h-4" />
                <span>{isSubmitting ? '提交中' : '预检并提交'}</span>
              </button>
            )}
          </div>
        </header>
{/* Scrollable Main Viewport */}
        <main className="flex-1 overflow-y-auto p-6 min-h-0 relative select-none">
          <Suspense fallback={<div className="flex h-full items-center justify-center text-sm text-slate-500">正在加载工作台…</div>}>
          <AnimatePresence mode="wait">
            
            {/* View 1: Workbench Workspace */}
            {currentView === 'workbench' && (
              <motion.div
                key="workbench-view"
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
                transition={{ duration: 0.15 }}
                className="grid grid-cols-1 xl:grid-cols-12 gap-6 h-full items-start"
              >
                {/* Articles List block */}
                <div className="xl:col-span-4 h-full">
                  <ArticleList
                    articles={articles}
                    activeArticle={activeArticle}
                    onOpenArticle={async (art) => { try { const preview = await previewArticle(art.filename); const wordCount = String(preview.content || '').replace(/\s/g, '').length; const updated = { ...art, content: preview.content, words: wordCount || art.words }; setActiveArticle(updated); setArticles(prev => prev.map(a => a.filename === art.filename ? updated : a)); } catch (e) { console.error(e); setActiveArticle(art); } }}
                    onScanArticles={handleScanArticles}
                    isScanning={isScanning}
                  />
                </div>

                {/* Article detail Editor block */}
                <div className="xl:col-span-5 h-full">
                  <ArticleEditor
                    activeArticle={activeArticle}
                    onSaveDraft={handleSaveDraft}
                    onCloseArticle={() => setActiveArticle(null)}
                    onRemoveSelectedResource={handleRemoveSelectedResource}
                  />
                </div>

                {/* Right side Sticky Resources Media Pool */}
                <div className="xl:col-span-3 h-full">
                  <ResourceLibrary
                    resources={activeArticle ? poolResources : resources}
                    selectedResourceIds={activeArticle ? activeArticle.selectedResources.map(r => r.resourceId) : []}
                    poolResourceIds={poolResources.map(r => r.resourceId)}
                    onTogglePool={handleTogglePool}
                    onRefreshResources={handleRefreshResources}
                    isRefreshingResources={isRefreshingResources}
                    mode={activeArticle ? 'picker' : 'management'}
                    activeArticleLabel={activeArticle ? activeArticle.title : ''}
                    onPickResource={handlePickResource}
                    onAddResource={handleAddResource}
                  />
                </div>
              </motion.div>
            )}

            {/* View 2: Full Resources Management View */}
            {currentView === 'resources' && (
              <motion.div
                key="resources-view"
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
                transition={{ duration: 0.15 }}
                className="max-w-4xl mx-auto h-full"
              >
                <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-sm">
                  <ResourceLibrary
                    resources={resources}
                    selectedResourceIds={[]}
                    mode="management"
                    activeArticleLabel=""
                    poolResourceIds={poolResources.map(r => r.resourceId)}
                    onTogglePool={handleTogglePool}
                    onPickResource={() => {}}
                    onAddResource={handleAddResource}
                  />
                </div>
              </motion.div>
            )}

            {/* View 2.5: Platforms View */}
            {currentView === 'content' && (
              <motion.div
                key="content-view"
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
                transition={{ duration: 0.15 }}
                className="h-full"
              >
                <ContentWorkbench attentionIntent={articleAttentionIntent} onAttentionIntentConsumed={() => setArticleAttentionIntent(null)} />
              </motion.div>
            )}

            {currentView === 'platforms' && (
              <motion.div
                key="platforms-view"
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
                transition={{ duration: 0.15 }}
                className="h-full"
              >
                <PlatformWorkbench onOpenArticleManagement={() => openArticleAttention({})} />
              </motion.div>
            )}

            {/* View 3: Orders Record list view */}
            {currentView === 'orders' && (
              <motion.div
                key="orders-view"
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
                transition={{ duration: 0.15 }}
                className="max-w-4xl mx-auto h-full"
              >
                <OrdersView
                  orders={orders}
                  onClearOrders={handleClearOrders}
                />
              </motion.div>
            )}

            {/* View 4: System settings configure view */}
            {currentView === 'settings' && (
              <motion.div
                key="settings-view"
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
                transition={{ duration: 0.15 }}
                className="max-w-6xl mx-auto h-full w-full"
              >
                <SettingsView />
              </motion.div>
            )}

          </AnimatePresence>
          </Suspense>
        </main>
        <PreflightModal isOpen={Boolean(confirmation)} onClose={() => { setSubmissionError(null); setConfirmation(null); }} articles={articles} balance={balance} summary={confirmation || {}} isSubmitting={isSubmitting} submissionError={submissionError} onSubmit={confirmRealSubmit} />
      </div>

    </div>
  );
}
