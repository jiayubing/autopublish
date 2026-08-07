import React, { lazy, Suspense, useEffect, useState } from "react";
import type { ViewMode } from "./types/view";
import Sidebar from "./components/Sidebar";
import ArticleList from "./components/ArticleList";
import ArticleEditor from "./components/ArticleEditor";
import { useWorkspaceRuntimeIdentity } from "./features/workspace/workspace-coordinator-context";
import { PlatformFeatureProvider } from "./features/platform/platform-feature-context";
import ConfirmationHost from "./components/ConfirmationHost";
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
  ListFilter,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useMediaFeature } from "./features/media/use-media-feature";
import { SettingsFeatureProvider } from "./features/settings/settings-context";
import MediaThirdPartyIdControl from "./components/MediaThirdPartyIdControl";

const ResourceLibrary = lazy(() => import("./components/ResourceLibrary"));
const OrdersView = lazy(() => import("./components/OrdersView"));
const SettingsView = lazy(() => import("./components/SettingsView"));
const PlatformWorkbench = lazy(() => import("./components/PlatformWorkbench"));
const ContentWorkbench = lazy(() => import("./components/ContentWorkbench"));
export default function App() {
  return (
    <PlatformFeatureProvider>
      <AppContent />
    </PlatformFeatureProvider>
  );
}

export function WorkspaceScopedConfirmationHost({
  children,
}: {
  children: React.ReactNode;
}) {
  const { workspaceRuntimeId } = useWorkspaceRuntimeIdentity();
  return (
    <ConfirmationHost scopeKey={workspaceRuntimeId || "workspace-bootstrap"}>
      <SettingsFeatureProvider>{children}</SettingsFeatureProvider>
    </ConfirmationHost>
  );
}

function AppContent() {
  const [currentView, setCurrentView] = useState<ViewMode>("workbench");
  const [articleAttentionIntent, setArticleAttentionIntent] = useState<{
    attentionId?: string;
    clientId?: string;
  } | null>(null);
  const { snapshot: mediaSnapshot, feature: mediaFeature } = useMediaFeature();
  const articles = mediaSnapshot.articles.items;
  const activeArticle = mediaSnapshot.articles.activeArticle;
  const resources = mediaSnapshot.resources.items;
  const poolResources = mediaSnapshot.pool.items;
  const orders = mediaSnapshot.orders.items;
  const balance = mediaSnapshot.balance.value;
  useEffect(() => {
    if (currentView === "orders") void mediaFeature.openOrders();
  }, [currentView, mediaFeature, mediaSnapshot.scope]);
  const dataLoaded =
    Boolean(mediaSnapshot.scope) &&
    [
      mediaSnapshot.articles.query,
      mediaSnapshot.drafts.query,
      mediaSnapshot.resources.query,
      mediaSnapshot.pool.query,
      mediaSnapshot.balance.query,
      mediaSnapshot.orders.query,
    ].every((query) => !query.loading);
  const isScanning = mediaSnapshot.commands.scanArticles.busy;
  const isCheckingBalance = mediaSnapshot.commands.checkBalance.busy;
  const mediaRefreshResult = mediaSnapshot.commands.refreshResources.result as {
    truncated?: boolean;
    resourceCount?: number;
  } | null;
  const mediaRefreshMessage = mediaRefreshResult
    ? mediaRefreshResult.truncated
      ? `资源刷新达到安全上限，已加载 ${mediaRefreshResult.resourceCount || 0} 项，结果已截断。`
      : `资源库已刷新，共 ${mediaRefreshResult.resourceCount || 0} 项。`
    : null;

  const openArticleAttention = (
    intent: { attentionId?: string; clientId?: string } = {},
  ) => {
    setArticleAttentionIntent(intent);
    setCurrentView("content");
  };

  return (
    <div className="flex h-full w-full overflow-hidden bg-slate-50">
      {/* 1. Fixed Left Sidebar */}
      <Sidebar
        currentView={currentView}
        onViewChange={setCurrentView}
        balance={balance}
        onCheckBalance={() => {
          void mediaFeature.checkBalance();
        }}
        isCheckingBalance={isCheckingBalance}
        totalArticles={articles.length}
        totalResources={mediaSnapshot.resources.total}
        totalOrders={orders.length}
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
            {currentView === "workbench" && (
              <div className="flex min-w-0 items-center gap-3">
                <MediaThirdPartyIdControl />
              </div>
            )}
          </div>
        </header>
        {/* Scrollable Main Viewport */}
        <main className="flex-1 overflow-y-auto p-6 min-h-0 relative select-none">
          <Suspense
            fallback={
              <div className="flex h-full items-center justify-center text-sm text-slate-500">
                正在加载工作台…
              </div>
            }
          >
            <AnimatePresence mode="wait">
              {/* View 1: Workbench Workspace */}
              {currentView === "workbench" && (
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
                      onOpenArticle={(article) =>
                        mediaFeature.openArticle(article.filename)
                      }
                      onScanArticles={() => mediaFeature.scanArticles()}
                      isScanning={isScanning}
                    />
                  </div>

                  {/* Article detail Editor block */}
                  <div className="xl:col-span-5 h-full">
                    <ArticleEditor
                      activeArticle={activeArticle}
                      onSaveDraft={(draft) => mediaFeature.saveDraft(draft)}
                      onCloseArticle={() => mediaFeature.closeArticle()}
                      onRemoveSelectedResource={(resourceId) =>
                        mediaFeature.removeSelectedResource(resourceId)
                      }
                    />
                  </div>

                  {/* Right side Sticky Resources Media Pool */}
                  <div className="xl:col-span-3 h-full">
                    <ResourceLibrary
                      resources={activeArticle ? poolResources : resources}
                      selectedResourceIds={
                        activeArticle
                          ? activeArticle.selectedResources.map(
                              (r) => r.resourceId,
                            )
                          : []
                      }
                      poolResourceIds={
                        activeArticle
                          ? poolResources.map((resource) => resource.resourceId)
                          : mediaSnapshot.pool.memberResourceIds
                      }
                      onTogglePool={(resource) => {
                        void mediaFeature.togglePool(resource);
                      }}
                      onRefreshResources={() => {
                        void mediaFeature.refreshResources();
                      }}
                      isRefreshingResources={
                        mediaSnapshot.commands.refreshResources.busy
                      }
                      mode={activeArticle ? "picker" : "management"}
                      activeArticleLabel={
                        activeArticle ? activeArticle.title : ""
                      }
                      onPickResource={(resource) =>
                        mediaFeature.toggleSelectedResource(resource)
                      }
                      totalResources={
                        activeArticle
                          ? mediaSnapshot.pool.total
                          : mediaSnapshot.resources.total
                      }
                      resourcePage={
                        activeArticle
                          ? mediaSnapshot.pool.page
                          : mediaSnapshot.resources.page
                      }
                      resourcePageSize={
                        activeArticle
                          ? mediaSnapshot.pool.pageSize
                          : mediaSnapshot.resources.pageSize
                      }
                      resourceSearch={
                        activeArticle ? "" : mediaSnapshot.resources.search
                      }
                      onResourceSearch={
                        activeArticle
                          ? undefined
                          : (query) => {
                              void mediaFeature.searchResources(query);
                            }
                      }
                      onResourcePageChange={
                        activeArticle
                          ? (page) => {
                              void mediaFeature.loadPoolPage(page, "manual");
                            }
                          : (page) => {
                              void mediaFeature.loadResourcePage(
                                page,
                                "manual",
                              );
                            }
                      }
                      errorMessage={
                        mediaSnapshot.commands.openArticle.error?.userMessage ||
                        mediaSnapshot.commands.refreshResources.error
                          ?.userMessage ||
                        mediaSnapshot.commands.togglePool.error?.userMessage ||
                        (activeArticle
                          ? mediaSnapshot.pool.query.error
                          : mediaSnapshot.resources.query.error
                        )?.userMessage
                      }
                      statusMessage={mediaRefreshMessage}
                    />
                  </div>
                </motion.div>
              )}

              {/* View 2: Full Resources Management View */}
              {currentView === "resources" && (
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
                      poolResourceIds={mediaSnapshot.pool.memberResourceIds}
                      onTogglePool={(resource) => {
                        void mediaFeature.togglePool(resource);
                      }}
                      onRefreshResources={() => {
                        void mediaFeature.refreshResources();
                      }}
                      isRefreshingResources={
                        mediaSnapshot.commands.refreshResources.busy
                      }
                      onPickResource={() => {}}
                      totalResources={mediaSnapshot.resources.total}
                      resourcePage={mediaSnapshot.resources.page}
                      resourcePageSize={mediaSnapshot.resources.pageSize}
                      resourceSearch={mediaSnapshot.resources.search}
                      onResourceSearch={(query) => {
                        void mediaFeature.searchResources(query);
                      }}
                      onResourcePageChange={(page) => {
                        void mediaFeature.loadResourcePage(page, "manual");
                      }}
                      errorMessage={
                        mediaSnapshot.commands.refreshResources.error
                          ?.userMessage ||
                        mediaSnapshot.commands.togglePool.error?.userMessage ||
                        mediaSnapshot.resources.query.error?.userMessage
                      }
                      statusMessage={mediaRefreshMessage}
                    />
                  </div>
                </motion.div>
              )}

              {/* View 2.5: Platforms View */}
              {currentView === "content" && (
                <motion.div
                  key="content-view"
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -5 }}
                  transition={{ duration: 0.15 }}
                  className="h-full"
                >
                  <ContentWorkbench
                    attentionIntent={articleAttentionIntent}
                    onAttentionIntentConsumed={() =>
                      setArticleAttentionIntent(null)
                    }
                    onOpenOrders={() => setCurrentView("orders")}
                  />
                </motion.div>
              )}

              {currentView === "platforms" && (
                <motion.div
                  key="platforms-view"
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -5 }}
                  transition={{ duration: 0.15 }}
                  className="h-full"
                >
                  <PlatformWorkbench
                    onOpenArticleManagement={() => openArticleAttention({})}
                  />
                </motion.div>
              )}

              {/* View 3: Orders Record list view */}
              {currentView === "orders" && (
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
                    onSyncOrder={(orderNid) => mediaFeature.syncOrder(orderNid)}
                    onSyncAllOrders={() => mediaFeature.syncAllOrders()}
                    onPrepareAnomaly={(orderNid) =>
                      mediaFeature.prepareOrderStatusAnomalyResolution(orderNid)
                    }
                    onResolveAnomaly={(orderNid, action) =>
                      action === "resumeOrderTracking"
                        ? mediaFeature.resumeOrderTracking(orderNid)
                        : action === "confirmOrderPublished"
                          ? mediaFeature.confirmOrderPublished(orderNid)
                          : mediaFeature.confirmOrderNotPublished(orderNid)
                    }
                    onOpenPublishedUrl={(orderNid) =>
                      mediaFeature.openPublishedUrl(orderNid)
                    }
                    syncingOrderNid={mediaSnapshot.orders.syncingOrderNid}
                    syncingAll={mediaSnapshot.commands.syncAllOrders.busy}
                    orderActionsBusy={mediaSnapshot.orders.mutationBusy}
                    syncFailures={mediaSnapshot.orders.syncFailures}
                    anomalyPreparations={
                      mediaSnapshot.orders.anomalyPreparations
                    }
                    errorMessage={
                      mediaSnapshot.commands.openPublishedUrl.error
                        ?.userMessage ||
                      mediaSnapshot.commands.syncOrder.error?.userMessage ||
                      mediaSnapshot.commands.syncAllOrders.error?.userMessage ||
                      mediaSnapshot.commands
                        .prepareOrderStatusAnomalyResolution.error
                        ?.userMessage ||
                      mediaSnapshot.commands.resumeOrderTracking.error
                        ?.userMessage ||
                      mediaSnapshot.commands.confirmOrderPublished.error
                        ?.userMessage ||
                      mediaSnapshot.commands.confirmOrderNotPublished.error
                        ?.userMessage ||
                      mediaSnapshot.orders.query.error?.userMessage
                    }
                  />
                </motion.div>
              )}

              {/* View 4: System settings configure view */}
              {currentView === "settings" && (
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
      </div>
    </div>
  );
}
