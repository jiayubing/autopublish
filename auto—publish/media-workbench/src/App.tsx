import React, { useEffect, useMemo, useState } from "react";
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
import { CheckCircle2, RefreshCw } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useMediaFeature } from "./features/media/use-media-feature";
import { useContentWorkbenchFeature } from "./features/content/use-content-workbench-feature";
import { SettingsFeatureProvider } from "./features/settings/settings-context";
import { useSubmissionCenterFeature } from "./features/submission-center/use-submission-center-feature";
import type { ArticleLibraryNavigationIntent } from "./article-library-navigation";

const LAST_VIEW_KEY = "auto-publish:last-main-view";
const VIEW_MODES: ViewMode[] = [
  "content-production",
  "article-library",
  "submission-center",
  "orders",
  "resources",
  "settings",
];

const VIEW_LABELS: Record<ViewMode, string> = {
  "content-production": "内容生产",
  "article-library": "文章库",
  "submission-center": "投稿中心",
  orders: "订单",
  resources: "媒体资源",
  settings: "设置",
};

function loadLastView(): ViewMode {
  if (typeof localStorage === "undefined") return "article-library";
  const value = localStorage.getItem(LAST_VIEW_KEY) as ViewMode | null;
  return value && VIEW_MODES.includes(value) ? value : "article-library";
}

function rememberLastView(view: ViewMode) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(LAST_VIEW_KEY, view);
  } catch (_) {
    // UI position memory is optional.
  }
}

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
  const [currentView, setCurrentView] = useState<ViewMode>(loadLastView);
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
      content.snapshot.management.lifecycleCounts?.needs_completion;
    const articleLibrary =
      typeof lifecycleCount === "number"
        ? lifecycleCount
        : Object.values(content.snapshot.management.workflowByArticle).filter(
            (workflow) =>
              Boolean(
                workflow &&
                  typeof workflow === "object" &&
                  "stage" in workflow &&
                  workflow.stage === "needs_completion",
              ),
          ).length;
    const orderAttention = orders.filter(
      (order) =>
        Boolean(order.anomaly) ||
        Boolean(order.cancellation?.manualResolutionRequired),
    ).length;
    return {
      articleLibrary,
      submissionCenter: submissionCenter.snapshot.data.counts.attentionItems,
      orders: orderAttention,
    };
  }, [
    content.snapshot,
    orders,
    submissionCenter.snapshot.data.counts.attentionItems,
  ]);

  useEffect(() => {
    rememberLastView(currentView);
  }, [currentView]);

  function openArticleLibrary(intent?: ArticleLibraryNavigationIntent) {
    setArticleLibraryIntent(intent || null);
    setCurrentView("article-library");
  }

  function changeView(view: ViewMode) {
    setCurrentView(view);
  }

  function openAttention() {
    setSubmissionCenterSection("attention");
    setCurrentView("submission-center");
  }

  const consumeArticleLibraryIntent = () => setArticleLibraryIntent(null);

  return (
    <div className="app-shell flex h-full w-full overflow-hidden bg-slate-100">
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

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="app-topbar z-10 flex h-14 shrink-0 items-center border-b border-slate-200/80 bg-white/95 px-4 backdrop-blur sm:px-6">
          <div className="flex w-full min-w-0 items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-2 text-sm">
              <span className="hidden font-medium text-slate-400 sm:inline">
                AutoPublish
              </span>
              <span className="hidden text-slate-300 sm:inline">/</span>
              <span className="truncate font-semibold text-slate-800">
                {VIEW_LABELS[currentView]}
              </span>
            </div>
            {dataLoaded ? (
              <div
                role="status"
                className="inline-flex items-center gap-1.5 rounded-full border border-emerald-100 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                数据已就绪
              </div>
            ) : (
              <div
                role="status"
                className="inline-flex items-center gap-1.5 rounded-full border border-amber-100 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700"
              >
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                正在加载数据
              </div>
            )}
          </div>
        </header>

        <main
          data-app-view={currentView}
          className="app-main relative min-h-0 flex-1 overflow-y-auto p-3 select-none sm:p-5"
        >
          <AnimatePresence mode="sync">
            {currentView === "content-production" && (
              <motion.div
                key="content-production-view"
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
                transition={{ duration: 0.15 }}
                className="app-view app-view--content-production h-full"
              >
                <ContentWorkbench
                  content={content.production}
                  mode="production"
                  onOpenArticleLibrary={openArticleLibrary}
                  onOpenOrders={() => setCurrentView("orders")}
                />
              </motion.div>
            )}

            {currentView === "resources" && (
              <motion.div
                key="resources-view"
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
                transition={{ duration: 0.15 }}
                className="app-view app-view--resources mx-auto h-full w-full max-w-5xl"
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
                className="app-view app-view--article-library h-full"
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
                className="app-view app-view--submission-center h-full"
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

            {currentView === "orders" && (
              <motion.div
                key="orders-view"
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
                transition={{ duration: 0.15 }}
                className="app-view app-view--orders mx-auto h-full w-full max-w-6xl"
              >
                <OrdersPage snapshot={mediaSnapshot} feature={mediaFeature} />
              </motion.div>
            )}

            {currentView === "settings" && (
              <motion.div
                key="settings-view"
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
                transition={{ duration: 0.15 }}
                className="app-view app-view--settings mx-auto h-full w-full max-w-6xl"
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
