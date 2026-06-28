import React, { useState, useEffect } from 'react';
import { ViewMode, Article, MediaResource, Draft, Order } from './types';
import { INITIAL_ARTICLES, INITIAL_RESOURCES, INITIAL_ORDERS } from './mockData';
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
  const [articles, setArticles] = useState<Article[]>(() => {
    const saved = localStorage.getItem('mw_articles');
    return saved ? JSON.parse(saved) : INITIAL_ARTICLES;
  });
  
  const [resources, setResources] = useState<MediaResource[]>(() => {
    const saved = localStorage.getItem('mw_resources');
    return saved ? JSON.parse(saved) : INITIAL_RESOURCES;
  });
  
  const [orders, setOrders] = useState<Order[]>(() => {
    const saved = localStorage.getItem('mw_orders');
    return saved ? JSON.parse(saved) : INITIAL_ORDERS;
  });

  const [balance, setBalance] = useState<number>(() => {
    const saved = localStorage.getItem('mw_balance');
    return saved ? parseFloat(saved) : 3420.50;
  });

  // UI States
  const [activeArticle, setActiveArticle] = useState<Article | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [isCheckingBalance, setIsCheckingBalance] = useState(false);
  const [isPreflightOpen, setIsPreflightOpen] = useState(false);

  // Sync to Local Storage on updates
  useEffect(() => {
    localStorage.setItem('mw_articles', JSON.stringify(articles));
  }, [articles]);

  useEffect(() => {
    localStorage.setItem('mw_resources', JSON.stringify(resources));
  }, [resources]);

  useEffect(() => {
    localStorage.setItem('mw_orders', JSON.stringify(orders));
  }, [orders]);

  useEffect(() => {
    localStorage.setItem('mw_balance', String(balance));
  }, [balance]);

  // Balance Refresh Handler
  const handleCheckBalance = () => {
    setIsCheckingBalance(true);
    setTimeout(() => {
      setIsCheckingBalance(false);
    }, 800);
  };

  // Article scan triggers simulation
  const handleScanArticles = () => {
    setIsScanning(true);
    setTimeout(() => {
      // Simulate discovering or reloading articles
      setIsScanning(false);
    }, 1000);
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

    setArticles(prev => [newArticle, ...prev]);
  };

  // Save drafts and update internal list states
  const handleSaveDraft = async (draft: Draft): Promise<void> => {
    // Artificial save delay
    return new Promise((resolve) => {
      setTimeout(() => {
        setArticles(prev => prev.map(art => {
          if (art.filename === draft.filename) {
            return {
              ...art,
              title: draft.title,
              selectedResources: draft.selectedResources
            };
          }
          return art;
        }));

        // Keep active article in sync
        setActiveArticle(prev => {
          if (prev && prev.filename === draft.filename) {
            return {
              ...prev,
              title: draft.title,
              selectedResources: draft.selectedResources
            };
          }
          return prev;
        });

        resolve();
      }, 500);
    });
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

  // Bind or unbind a resource to the active article
  const handlePickResource = (resource: MediaResource) => {
    if (!activeArticle) return; // Ignore if no article is currently open

    const isAlreadySelected = activeArticle.selectedResources.some(
      r => r.resourceId === resource.resourceId
    );

    let updatedResources: MediaResource[];
    if (isAlreadySelected) {
      updatedResources = activeArticle.selectedResources.filter(
        r => r.resourceId !== resource.resourceId
      );
    } else {
      updatedResources = [...activeArticle.selectedResources, resource];
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
  const handleAddResource = (newResource: Omit<MediaResource, 'createdAt'>) => {
    const resourceWithDate: MediaResource = {
      ...newResource,
      createdAt: new Date().toISOString().substring(0, 10)
    };
    setResources(prev => [resourceWithDate, ...prev]);
  };

  // Submission Queue Completed Handler
  const handleSubmissionComplete = (newOrder: Order) => {
    setOrders(prev => [newOrder, ...prev]);
    // Deduct total fee from balance
    setBalance(prev => Math.max(0, prev - newOrder.totalFee));
  };

  const handleClearOrders = () => {
    setOrders([]);
  };

  return (
    <div id="app-shell" className="app-shell flex h-screen bg-slate-100 font-sans text-slate-800 antialiased overflow-hidden">
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
