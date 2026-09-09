import React, { useCallback, useEffect, useMemo, useState } from "react";
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
import { AlertTriangle, RefreshCw } from "lucide-react";
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

type MainNavigationGuard = (action: () => void) => void;

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
  const [articleLibraryNavigationGuard, setArticleLibraryNavigationGuard] =
    useState<MainNavigationGuard | null>(null);
  const { snapshot: mediaSnapshot, feature: mediaFeature } = useMediaFeature();
  const content = useContentWorkbenchFeature();
  const submissionCenter = useSubmissionCenterFeature();
  const orders = mediaSnapshot.orders.items;
  const balance = mediaSnapshot.balance.value;
  const readinessQueries = [
    mediaSnapshot.articles.query,
    mediaSnapshot.drafts.query,
    mediaSnapshot.resources.query,
    mediaSnapshot.pool.query,
    mediaSnapshot.balance.query,
    mediaSnapshot.orders.query,
    content.snapshot.query,
    content.snapshot.managementQuery,
    submissionCenter.snapshot.query,
  ];
  const dataLoading =
    !mediaSnapshot.scope || readinessQueries.some((query) => query.loading);
  const dataUnavailable =
    !dataLoading && readinessQueries.some((query) => Boolean(query.error));
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

  const registerArticleLibraryNavigationGuard = useCallback(
    (guard: MainNavigationGuard | null) => {
      setArticleLibraryNavigationGuard(() => guard);
    },
    [],
  );

  function runMainNavigation(view: ViewMode, action: () => void) {
    if (view === currentView) {
      action();
      return;
    }
    if (currentView === "article-library" && articleLibraryNavigationGuard) {
      articleLibraryNavigationGuard(action);
      return;
    }
    action();
  }

  function openArticleLibrary(intent?: ArticleLibraryNavigationIntent) {
    const action = () => {
      setArticleLibraryIntent(intent || null);
      setCurrentView("article-library");
    };
    runMainNavigation("article-library", action);
  }

  function changeView(view: ViewMode) {
    runMainNavigation(view, () => setCurrentView(view));
  }

  function openAttention() {
    runMainNavigation("submission-center", () => {
      setSubmissionCenterSection("attention");
      setCurrentView("submission-center");
    });
  }

  const consumeArticleLibraryIntent = () => setArticleLibraryIntent(null);

  return (
    <div className="app-shell flex h-full w-full overflow-hidden">
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

      <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="app-topbar z-10 flex shrink-0 items-center px-4 sm:px-6">
          <div className="flex w-full min-w-0 items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="truncate text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                AutoPublish · 工作台
              </p>
              <p className="mt-0.5 truncate text-sm font-semibold text-slate-700">
                {VIEW_LABELS[currentView]}
              </p>
            </div>
            {dataLoading ? (
              <div
                role="status"
                className="flex shrink-0 items-center gap-2 rounded-full border border-amber-100 bg-amber-50/90 px-3 py-1.5 text-[11px] font-semibold text-amber-700"
              >
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                正在加载数据…
              </div>
            ) : dataUnavailable ? (
              <div
                role="status"
                className="flex shrink-0 items-center gap-2 rounded-full border border-amber-200 bg-amber-50/90 px-3 py-1.5 text-[11px] font-semibold text-amber-800"
              >
                <AlertTriangle className="h-3.5 w-3.5" />
                部分数据不可用
              </div>
            ) : (
              <div
                role="status"
                className="flex shrink-0 items-center gap-2 rounded-full border border-emerald-100 bg-emerald-50/80 px-3 py-1.5 text-[11px] font-semibold text-emerald-700"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                数据已就绪
              </div>
            )}
          </div>
        </header>

        <main className="app-workspace relative min-h-0 flex-1 select-none overflow-y-auto p-3 sm:p-5 lg:p-6">
          <div className="app-page-frame h-full">
            <AnimatePresence mode="sync">
              {currentView === "content-production" && (
                <motion.div
                  key="content-production-view"
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.14 }}
                  className="h-full"
                >
                  <ContentWorkbench
                    content={content.production}
                    mode="production"
                    onOpenArticleLibrary={openArticleLibrary}
                    onOpenOrders={() => changeView("orders")}
                  />
                </motion.div>
              )}

              {currentView === "resources" && (
                <motion.div
                  key="resources-view"
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.14 }}
                  className="mx-auto h-full w-full max-w-6xl"
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
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.14 }}
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
                    onOpenOrders={() => changeView("orders")}
                    onOpenAttention={openAttention}
                    onMainNavigationGuardChange={
                      registerArticleLibraryNavigationGuard
                    }
                  />
                </motion.div>
              )}

              {currentView === "submission-center" && (
                <motion.div
                  key="submission-center-view"
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.14 }}
                  className="h-full"
                >
                  <PlatformWorkbench
                    content={content}
                    submissionCenter={submissionCenter}
                    initialSection={submissionCenterSection}
                    onOpenArticleLibrary={openArticleLibrary}
                    onOpenOrders={() => changeView("orders")}
                  />
                </motion.div>
              )}

              {currentView === "orders" && (
                <motion.div
                  key="orders-view"
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.14 }}
                  className="mx-auto h-full w-full max-w-7xl"
                >
                  <OrdersPage snapshot={mediaSnapshot} feature={mediaFeature} />
                </motion.div>
              )}

              {currentView === "settings" && (
                <motion.div
                  key="settings-view"
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.14 }}
                  className="mx-auto h-full w-full max-w-7xl"
                >
                  <SettingsView />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </main>
      </div>
    </div>
  );
}
