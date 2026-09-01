import React, { useMemo, useState } from "react";
import type { ViewMode } from "./types/view";
import Sidebar from "./components/Sidebar";
import ContentWorkbench from "./components/ContentWorkbench";
import OrdersPage from "./components/OrdersPage";
import PlatformWorkbench from "./components/PlatformWorkbench";
import ResourceLibraryPage from "./components/ResourceLibraryPage";
import SettingsView from "./components/SettingsView";
import { useWorkspaceRuntimeIdentity } from "./features/workspace/workspace-coordinator-context";
import { PlatformFeatureProvider } from "./features/platform/platform-feature-context";
import ConfirmationHost from "./components/ConfirmationHost";
import {
  RefreshCw,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useMediaFeature } from "./features/media/use-media-feature";
import { useContentWorkbenchFeature } from "./features/content/use-content-workbench-feature";
import { SettingsFeatureProvider } from "./features/settings/settings-context";
import { useSubmissionCenterFeature } from "./features/submission-center/use-submission-center-feature";
import type { ArticleLibraryNavigationIntent } from "./article-library-navigation";

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
  const [currentView, setCurrentView] = useState<ViewMode>("article-library");
  const [submissionCenterSection, setSubmissionCenterSection] = useState<
    "regular" | "paid" | "attention"
  >("regular");
  const [articleLibraryIntent, setArticleLibraryIntent] =
    useState<ArticleLibraryNavigationIntent | null>(null);
  const { snapshot: mediaSnapshot, feature: mediaFeature } = useMediaFeature();
  const content = useContentWorkbenchFeature();
  const submissionCenter = useSubmissionCenterFeature();
  const orders = mediaSnapshot.orders.items;
  const balance = mediaSnapshot.balance.value;
  const dataLoaded =
    Boolean(mediaSnapshot.scope) &&
    [
      mediaSnapshot.articles.query,
      mediaSnapshot.drafts.query,
      mediaSnapshot.resources.query,
      mediaSnapshot.pool.query,
      mediaSnapshot.balance.query,
      mediaSnapshot.orders.query,
    ].every((query) => !query.loading) &&
    !content.snapshot.query.loading &&
    !content.snapshot.managementQuery.loading &&
    !submissionCenter.snapshot.query.loading;
  const isCheckingBalance = mediaSnapshot.commands.checkBalance.busy;
  const navigationBadges = useMemo(() => {
    const lifecycleCount =
      content.snapshot.management.lifecycleCounts?.pending_submission;
    const articleLibrary =
      typeof lifecycleCount === "number"
        ? lifecycleCount
        : Object.values(content.snapshot.management.workflowByArticle).filter(
            (workflow) =>
              Boolean(
                workflow &&
                  typeof workflow === "object" &&
                  "stage" in workflow &&
                  workflow.stage === "pending_submission",
              ),
          ).length;
    return {
      articleLibrary,
      submissionCenter: submissionCenter.snapshot.data.counts.total,
      orders: orders.length,
    };
  }, [content.snapshot, orders.length, submissionCenter.snapshot.data.counts.total]);

  function openArticleLibrary(intent?: ArticleLibraryNavigationIntent) {
    setArticleLibraryIntent(intent || null);
    setCurrentView("article-library");
  }

  function changeView(view: ViewMode) {
    if (view === "submission-center") setSubmissionCenterSection("regular");
    setCurrentView(view);
  }

  function openAttention() {
    setSubmissionCenterSection("attention");
    setCurrentView("submission-center");
  }

  const consumeArticleLibraryIntent = () => setArticleLibraryIntent(null);

  return (
    <div className="flex h-full w-full overflow-hidden bg-slate-50">
      {/* 1. Fixed Left Sidebar */}
      <Sidebar
        currentView={currentView}
        onViewChange={changeView}
        balance={balance}
        onCheckBalance={() => {
          void mediaFeature.checkBalance();
        }}
        isCheckingBalance={isCheckingBalance}
        badges={navigationBadges}
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
          </div>
        </header>
        {/* Scrollable Main Viewport */}
        <main className="flex-1 overflow-y-auto p-3 sm:p-6 min-h-0 relative select-none">
          <AnimatePresence mode="sync">
              {currentView === "content-production" && (
                <motion.div
                  key="content-production-view"
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -5 }}
                  transition={{ duration: 0.15 }}
                  className="h-full"
                >
                  <ContentWorkbench
                    content={content.production}
                    mode="production"
                    onOpenArticleLibrary={openArticleLibrary}
                    onOpenOrders={() => setCurrentView("orders")}
                  />
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
                  <ResourceLibraryPage
                    snapshot={mediaSnapshot}
                    feature={mediaFeature}
                  />
                </motion.div>
              )}

              {currentView === "article-library" && (
                <motion.div
                  key="article-library-view"
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -5 }}
                  transition={{ duration: 0.15 }}
                  className="h-full"
                >
                  <ContentWorkbench
                    content={content.library}
                    mode="library"
                    favoriteMediaPage={{
                      items: mediaSnapshot.pool.items,
                      total: mediaSnapshot.pool.total,
                      page: mediaSnapshot.pool.page,
                      totalPages: mediaSnapshot.pool.totalPages,
                      hasPrev: mediaSnapshot.pool.hasPrev,
                      hasNext: mediaSnapshot.pool.hasNext,
                      loading: mediaSnapshot.pool.query.loading,
                      errorMessage:
                        mediaSnapshot.pool.query.error?.userMessage,
                    }}
                    onFavoriteMediaPageChange={(page) => {
                      void mediaFeature.loadPoolPage(page, "manual");
                    }}
                    articleIntent={articleLibraryIntent}
                    onArticleIntentConsumed={consumeArticleLibraryIntent}
                    onOpenArticleLibrary={openArticleLibrary}
                    onOpenOrders={() => setCurrentView("orders")}
                    onOpenAttention={openAttention}
                  />
                </motion.div>
              )}

              {currentView === "submission-center" && (
                <motion.div
                  key="submission-center-view"
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -5 }}
                  transition={{ duration: 0.15 }}
                  className="h-full"
                >
                  <PlatformWorkbench
                    content={content}
                    submissionCenter={submissionCenter}
                    initialSection={submissionCenterSection}
                    onOpenArticleLibrary={openArticleLibrary}
                    onOpenOrders={() => setCurrentView("orders")}
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
                    className="max-w-5xl mx-auto h-full"
                >
                  <OrdersPage snapshot={mediaSnapshot} feature={mediaFeature} />
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
        </main>
      </div>
    </div>
  );
}
