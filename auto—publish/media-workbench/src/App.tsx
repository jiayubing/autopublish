import React, { useState, useEffect } from 'react';
import { ViewMode, Article, MediaResource, Draft, Order } from './types';
import {
  scanArticles,
  setDraft,
  addToPool,
  removeFromPool,
  getBalance,
  getOrders,
  getResourcePage,
  persistArticles,
  persistResources,
  persistOrders,
  persistBalance,
} from "./electron-api";
import Sidebar from './components/Sidebar';
import ArticleList from './components/ArticleList';
import ArticleEditor from './components/ArticleEditor';
import ResourceLibrary from './components/ResourceLibrary';
import PreflightModal from './components/PreflightModal';
import OrdersView from './components/OrdersView';
import SettingsView from './components/SettingsView';
import { 
  Database, 
  HelpCircle, 
  RefreshCw, 
  Layout, 
  ChevronRight, 
  FileText, 
  AlertCircle,
  Plus,
  Compass,
  ListFilter
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function App() {
  const [currentView, setCurrentView] = useState<ViewMode>('workbench');
  
  // Data State with Local Storage Synchronization if desired, otherwise memory-based
  const [articles, setArticles] = useState<Article[]>([]);
  
  const [resources, setResources] = useState<MediaResource[]>([]);
  
  const [orders, setOrders] = useState<Order[]>([]);

  const [balance, setBalance] = useState<number>(0);

  // UI States
  const [activeArticle, setActiveArticle] = useState<Article | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [isCheckingBalance, setIsCheckingBalance] = useState(false);
  const [isPreflightOpen, setIsPreflightOpen] = useState(false);
  const [dataLoaded, setDataLoaded] = useState(false);

  // Load data from API (or localStorage fallback) on mount
  useEffect(() => {
    async function loadData() {
      try {
        const [articlesData, resourcePage, ordersData, balanceData] =
          await Promise.all([
            scanArticles(),
            getResourcePage({ page: 1, pageSize: 200 }),
            getOrders(),
            getBalance(),
          ]);
        setArticles(articlesData);
        setResources(resourcePage.items);
        setOrders(ordersData);
        setBalance(balanceData);
      } catch (e) {
        console.error("Failed to load initial data:", e);
      } finally {
        setDataLoaded(true);
      }
    }
    loadData();
  }, []);

  // Balance Refresh Handler
  const handleCheckBalance = async () => {
    setIsCheckingBalance(true);
    try {
      const bal = await getBalance();
      setBalance(bal);
      persistBalance(bal);
    } catch (e) {
      console.error("Balance check failed:", e);
    } finally {
      setIsCheckingBalance(false);
    }
  };

  // Article scan triggers simulation
  const handleScanArticles = async () => {
    setIsScanning(true);
    try {
      const fresh = await scanArticles();
      setArticles(fresh);
      persistArticles(fresh);
    } catch (e) {
      console.error("Scan failed:", e);
    } finally {
      setIsScanning(false);
    }
  };

  // Add a new mock article from input folder
  const handleAddNewMockArticle = () => {
    const sampleTitles = [
      "2026年量子计算对现代密码学的革命性颠覆与重构",
      "城市绿肺建设：如何在水泥森林中雕琢出生态微景观",
      "重返黑胶时代：数字洪流下，为何年轻人重新拥抱实体唱片"
    ];
    const sampleContents = [
      "量子计算的指数级加速，正将传统的 RSA 加密体系逼入历史的角落...",
      "不仅是树木，立体绿化与海绵微湿地正在重新定义未来的智能城市规划...",
      "微弱的针尖摩擦、厚重的模拟音域，黑胶唱片带来的仪式感不可替代..."
    ];
    const sampleTags = [
      ["量子科技", "安全研报"],
      ["生态规划", "城市设计"],
      ["黑胶文化", "生活方式"]
    ];

    const randIdx = Math.floor(Math.random() * sampleTitles.length);
    const randId = Math.floor(100 + Math.random() * 900);
    const newArticle: Article = {
      filename: `local_draft_${randId}.md`,
      title: sampleTitles[randIdx],
      content: sampleContents[randIdx],
      words: Math.floor(600 + Math.random() * 1000),
      tags: sampleTags[randIdx],
      selectedResources: [],
      lastModified: new Date().toISOString().replace('T', ' ').substring(0, 16)
    };

    const updated = [newArticle, ...articles];
    setArticles(updated);
    persistArticles(updated);
  };

  // Save drafts and update internal list states
  const handleSaveDraft = async (draft: Draft): Promise<void> => {
    await setDraft(draft.filename, draft);

    setArticles((prev) =>
      prev.map((art) => {
        if (art.filename === draft.filename) {
          return {
            ...art,
            title: draft.title,
            selectedResources: draft.selectedResources,
          };
        }
        return art;
      })
    );

    setActiveArticle((prev) => {
      if (prev && prev.filename === draft.filename) {
        return {
          ...prev,
          title: draft.title,
          selectedResources: draft.selectedResources,
        };
      }
      return prev;
    });

    persistArticles(articles);
  };

  // Remove individual bound resource from the draft
  const handleRemoveSelectedResource = (resourceId: string) => {
    if (!activeArticle) return;

    const updatedResources = activeArticle.selectedResources.filter(
      r => r.resourceId !== resourceId
    );

    setArticles(prev => prev.map(art => {
      if (art.filename === activeArticle.filename) {
        return {
          ...art,
          selectedResources: updatedResources
        };
      }
      return art;
    }));

    setActiveArticle((prev) => {
      if (prev) {
        return {
          ...prev,
          selectedResources: updatedResources,
        };
      }
      return null;
    });

    removeFromPool(resourceId).catch(console.error);
  };

  // Bind or unbind a resource to the active article
  const handlePickResource = (resource: MediaResource) => {
    if (!activeArticle) return; // Ignore if no article is currently open

    const isAlreadySelected = activeArticle.selectedResources.some(
      r => r.resourceId === resource.resourceId
    );

    let updatedResources: MediaResource[];
    if (isAlreadySelected) {
      updatedResources = activeArticle.selectedResources.filter(
        (r) => r.resourceId !== resource.resourceId
      );
      removeFromPool(resource.resourceId).catch(console.error);
    } else {
      updatedResources = [...activeArticle.selectedResources, resource];
      addToPool(resource).catch(console.error);
    }

    setArticles(prev => prev.map(art => {
      if (art.filename === activeArticle.filename) {
        return {
          ...art,
          selectedResources: updatedResources
        };
      }
      return art;
    }));

    setActiveArticle(prev => {
      if (prev) {
        return {
          ...prev,
          selectedResources: updatedResources
        };
      }
      return null;
    });
  };

  // Add new media item into the pool
  const handleAddResource = (newResource: Omit<MediaResource, "createdAt">) => {
    const resourceWithDate: MediaResource = {
      ...newResource,
      createdAt: new Date().toISOString().substring(0, 10),
    };
    const updated = [resourceWithDate, ...resources];
    setResources(updated);
    persistResources(updated);
    addToPool(resourceWithDate).catch(console.error);
  };

  // Submission Queue Completed Handler
  const handleSubmissionComplete = (newOrder: Order) => {
    const updatedOrders = [newOrder, ...orders];
    setOrders(updatedOrders);
    persistOrders(updatedOrders);

    const newBalance = Math.max(0, balance - newOrder.totalFee);
    setBalance(newBalance);
    persistBalance(newBalance);
  };

  const handleClearOrders = () => {
    setOrders([]);
    persistOrders([]);
  };

  // Show a brief loading placeholder while data loads on first mount
  if (!dataLoaded) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#f6f7f4]">
        <div className="flex flex-col items-center space-y-3">
          <div className="w-8 h-8 border-3 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-slate-500">
            姝ｅ湪鍔犺浇宸ヤ綔鍙版暟�?..
          </span>
        </div>
      </div>
    );
  }

  return (
    <div id="app-shell" className="app-shell flex h-screen bg-[#f6f7f4] font-sans text-slate-800 antialiased overflow-hidden">
      {/* 1. Left Navigation Sidebar */}
      <Sidebar
        currentView={currentView}
        onViewChange={(view) => {
          setCurrentView(view);
          // Auto close article active editing on view shifts if not on workbench
          if (view !== 'workbench') setActiveArticle(null);
        }}
        balance={balance}
        onCheckBalance={handleCheckBalance}
        isCheckingBalance={isCheckingBalance}
        totalArticles={articles.length}
        totalResources={resources.length}
        totalOrders={orders.length}
      />

      {/* 2. Main Workspace Panel */}
      <main className="flex-1 flex flex-col h-screen min-w-0 overflow-hidden relative bg-slate-50/50">
        
        {/* Workspace dynamic header */}
        <header className="px-6 py-4 border-b border-slate-200/60 bg-white flex items-center justify-between shadow-3xs flex-shrink-0">
          <div className="flex items-center space-x-2 text-xs text-slate-500">
            <span className="font-semibold text-slate-400">自媒体平台</span>
            <ChevronRight className="w-3.5 h-3.5 text-slate-300" />
            <span className="text-slate-800 font-bold">
              {currentView === 'workbench' && '稿件与工作台'}
              {currentView === 'resources' && '媒体资源库'}
              {currentView === 'orders' && '投稿分发订单记录'}
              {currentView === 'settings' && '配置中心'}
            </span>
          </div>

          {currentView === 'workbench' && (
            <button
              id="preflightMediaBtn"
              onClick={() => setIsPreflightOpen(true)}
              disabled={articles.length === 0}
              className="flex items-center space-x-1.5 px-4.5 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 text-white disabled:text-slate-400 text-xs font-bold rounded-lg shadow-sm transition-all active:scale-95 disabled:pointer-events-none"
            >
              <span>🚀 预检并一键提交</span>
            </button>
          )}
        </header>

        {/* Dynamic Views viewport */}
        <div className="flex-1 overflow-y-auto p-6 min-h-0 relative select-none">
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
                    onOpenArticle={(art) => setActiveArticle(art)}
                    onScanArticles={handleScanArticles}
                    isScanning={isScanning}
                    onAddNewMockArticle={handleAddNewMockArticle}
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
                    resources={resources}
                    selectedResourceIds={activeArticle ? activeArticle.selectedResources.map(r => r.resourceId) : []}
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
                    onPickResource={() => {}}
                    onAddResource={handleAddResource}
                  />
                </div>
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
                className="max-w-3xl mx-auto h-full"
              >
                <SettingsView />
              </motion.div>
            )}

          </AnimatePresence>
        </div>
      </main>

      {/* 3. Global Interactive Modals */}
      <AnimatePresence>
        {isPreflightOpen && (
          <PreflightModal
            isOpen={isPreflightOpen}
            onClose={() => setIsPreflightOpen(false)}
            articles={articles}
            balance={balance}
            onSubmissionComplete={handleSubmissionComplete}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
