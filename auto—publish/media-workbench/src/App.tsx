import React, { useCallback, useEffect, useState } from "react";
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
import {
  useContentWorkbenchFeature,
  type ContentWorkbenchFeature,
  type ContentWorkbenchPage,
} from "./features/content/use-content-workbench-feature";
import { SettingsFeatureProvider } from "./features/settings/settings-context";
import { useSubmissionCenterFeature } from "./features/submission-center/use-submission-center-feature";
import type { ArticleLibraryNavigationIntent } from "./article-library-navigation";
import { useFavoriteMediaQuery } from "./features/media/use-favorite-media-query";
import {
  articleLibraryBadgeCount,
  ordersBadgeCount,
  submissionCenterBadgeCount,
} from "./features/navigation-badges.js";
import type { NavigationBadges } from "./components/Sidebar";

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
type PageReadiness = { loading: boolean; error: boolean };

function contentPageForView(view: ViewMode): ContentWorkbenchPage | null {
  if (view === "content-production") return "production";
  if (view === "article-library") return "library";
  if (view === "submission-center") return "shell";
  return null;
}

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
  return <AppContent />;
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

function ContentProductionPage({
  content,
  initialBatchClientIds,
  onOpenArticleLibrary,
  onOpenOrders,
  onReadinessChange,
}: {
  content: ContentWorkbenchFeature;
  initialBatchClientIds?: string[];
  onOpenArticleLibrary: (intent?: ArticleLibraryNavigationIntent) => void;
  onOpenOrders: () => void;
  onReadinessChange: (readiness: PageReadiness) => void;
}) {
  useEffect(() => {
    onReadinessChange({
      loading:
        !content.snapshot.scope || Boolean(content.snapshot.query.loading),
      error: Boolean(content.snapshot.query.error),
    });
  }, [
    content.snapshot.query.error,
    content.snapshot.query.loading,
    content.snapshot.scope,
    onReadinessChange,
  ]);
  return (
    <ContentWorkbench
      content={content.production}
      mode="production"
      initialBatchClientIds={initialBatchClientIds}
      onOpenArticleLibrary={onOpenArticleLibrary}
      onOpenOrders={onOpenOrders}
    />
  );
}

function ArticleLibraryPage({
  content,
  articleIntent,
  onArticleIntentConsumed,
  onOpenArticleLibrary,
  onOpenOrders,
  onOpenAttention,
  onMainNavigationGuardChange,
  onBadgeChange,
  onReadinessChange,
}: {
  content: ContentWorkbenchFeature;
  articleIntent?: ArticleLibraryNavigationIntent | null;
  onArticleIntentConsumed: () => void;
  onOpenArticleLibrary: (intent?: ArticleLibraryNavigationIntent) => void;
  onOpenOrders: () => void;
  onOpenAttention: () => void;
  onMainNavigationGuardChange: (guard: MainNavigationGuard | null) => void;
  onBadgeChange: (count: number) => void;
  onReadinessChange: (readiness: PageReadiness) => void;
}) {
  const { snapshot: favoriteMediaPage, loadPage: loadFavoriteMediaPage } =
    useFavoriteMediaQuery();
  useEffect(() => {
    onBadgeChange(articleLibraryBadgeCount(content.snapshot.management));
  }, [content.snapshot.management, onBadgeChange]);
  useEffect(() => {
    onReadinessChange({
      loading:
        !content.snapshot.scope ||
        Boolean(content.snapshot.query.loading) ||
        Boolean(content.snapshot.managementQuery.loading),
      error: Boolean(
        content.snapshot.query.error || content.snapshot.managementQuery.error,
      ),
    });
  }, [
    content.snapshot.managementQuery.error,
    content.snapshot.managementQuery.loading,
    content.snapshot.query.error,
    content.snapshot.query.loading,
    content.snapshot.scope,
    onReadinessChange,
  ]);

  return (
    <ContentWorkbench
      content={content.library}
      mode="library"
      favoriteMediaPage={favoriteMediaPage}
      onFavoriteMediaPageChange={(page) => {
        void loadFavoriteMediaPage(page);
      }}
      articleIntent={articleIntent}
      onArticleIntentConsumed={onArticleIntentConsumed}
      onOpenArticleLibrary={onOpenArticleLibrary}
      onOpenOrders={onOpenOrders}
      onOpenAttention={onOpenAttention}
      onMainNavigationGuardChange={onMainNavigationGuardChange}
    />
  );
}

function SubmissionCenterPage({
  content,
  onOpenBatchGeneration,
  initialSection,
  onOpenArticleLibrary,
  onOpenOrders,
  onOpenSettings,
  onBadgeChange,
  onReadinessChange,
}: {
  content: ContentWorkbenchFeature;
  onOpenBatchGeneration: (clientIds: string[]) => void;
  initialSection: "regular" | "paid" | "attention";
  onOpenArticleLibrary: (intent?: ArticleLibraryNavigationIntent) => void;
  onOpenOrders: () => void;
  onOpenSettings: () => void;
  onBadgeChange: (count: number) => void;
  onReadinessChange: (readiness: PageReadiness) => void;
}) {
  const submissionCenter = useSubmissionCenterFeature();
  useEffect(() => {
    onBadgeChange(
      submissionCenterBadgeCount(submissionCenter.snapshot.data.counts),
    );
  }, [onBadgeChange, submissionCenter.snapshot.data.counts]);
  useEffect(() => {
    onReadinessChange({
      loading:
        !submissionCenter.snapshot.scope ||
        Boolean(submissionCenter.snapshot.query.loading) ||
        Boolean(content.snapshot.query.loading),
      error: Boolean(
        submissionCenter.snapshot.query.error || content.snapshot.query.error,
      ),
    });
  }, [
    content.snapshot.query.error,
    content.snapshot.query.loading,
    onReadinessChange,
    submissionCenter.snapshot.query.error,
    submissionCenter.snapshot.query.loading,
    submissionCenter.snapshot.scope,
  ]);
  return (
    <PlatformWorkbench
      content={content}
      onOpenBatchGeneration={onOpenBatchGeneration}
      submissionCenter={submissionCenter}
      initialSection={initialSection}
      onOpenArticleLibrary={onOpenArticleLibrary}
      onOpenOrders={onOpenOrders}
      onOpenSettings={onOpenSettings}
    />
  );
}

function OrdersRoute({
  onBadgeChange,
  onReadinessChange,
}: {
  onBadgeChange: (count: number) => void;
  onReadinessChange: (readiness: PageReadiness) => void;
}) {
  const { snapshot, feature } = useMediaFeature({ surface: "orders" });
  useEffect(() => {
    onBadgeChange(ordersBadgeCount(snapshot.orders.items));
  }, [onBadgeChange, snapshot.orders.items]);
  useEffect(() => {
    onReadinessChange({
      loading: !snapshot.scope || Boolean(snapshot.orders.query.loading),
      error: Boolean(snapshot.orders.query.error),
    });
  }, [
    onReadinessChange,
    snapshot.orders.query.error,
    snapshot.orders.query.loading,
    snapshot.scope,
  ]);
  return <OrdersPage snapshot={snapshot} feature={feature} />;
}

function ResourcesRoute({
  onReadinessChange,
}: {
  onReadinessChange: (readiness: PageReadiness) => void;
}) {
  const { snapshot, feature } = useMediaFeature({ surface: "resources" });
  useEffect(() => {
    onReadinessChange({
      loading:
        !snapshot.scope ||
        Boolean(snapshot.resources.query.loading) ||
        Boolean(snapshot.pool.query.loading),
      error: Boolean(
        snapshot.resources.query.error || snapshot.pool.query.error,
      ),
    });
  }, [
    onReadinessChange,
    snapshot.pool.query.error,
    snapshot.pool.query.loading,
    snapshot.resources.query.error,
    snapshot.resources.query.loading,
    snapshot.scope,
  ]);
  return <ResourceLibraryPage snapshot={snapshot} feature={feature} />;
}

function AppContent() {
  const [currentView, setCurrentView] = useState<ViewMode>(loadLastView);
  const [batchClientIds, setBatchClientIds] = useState<string[] | undefined>();
  useEffect(() => {
    if (currentView !== "content-production") setBatchClientIds(undefined);
  }, [currentView]);
  const contentPage = contentPageForView(currentView);
  const content = useContentWorkbenchFeature({ page: contentPage });
  const [submissionCenterSection, setSubmissionCenterSection] = useState<
    "regular" | "paid" | "attention"
  >("regular");
  const [articleLibraryIntent, setArticleLibraryIntent] =
    useState<ArticleLibraryNavigationIntent | null>(null);
  const [articleLibraryNavigationGuard, setArticleLibraryNavigationGuard] =
    useState<MainNavigationGuard | null>(null);
  const [badges, setBadges] = useState<NavigationBadges>({
    articleLibrary: 0,
    submissionCenter: 0,
    orders: 0,
  });
  const [pageReadiness, setPageReadiness] = useState<PageReadiness>({
    loading: true,
    error: false,
  });

  useEffect(() => {
    rememberLastView(currentView);
  }, [currentView]);

  useEffect(() => {
    setPageReadiness({
      loading: currentView !== "settings",
      error: false,
    });
  }, [currentView]);

  const registerArticleLibraryNavigationGuard = useCallback(
    (guard: MainNavigationGuard | null) => {
      setArticleLibraryNavigationGuard(() => guard);
    },
    [],
  );

  const reportReadiness = useCallback((readiness: PageReadiness) => {
    setPageReadiness(readiness);
  }, []);

  const reportArticleLibraryBadge = useCallback((count: number) => {
    setBadges((current) =>
      current.articleLibrary === count
        ? current
        : { ...current, articleLibrary: count },
    );
  }, []);
  const reportSubmissionCenterBadge = useCallback((count: number) => {
    setBadges((current) =>
      current.submissionCenter === count
        ? current
        : { ...current, submissionCenter: count },
    );
  }, []);
  const reportOrdersBadge = useCallback((count: number) => {
    setBadges((current) =>
      current.orders === count ? current : { ...current, orders: count },
    );
  }, []);

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
  const dataLoading = pageReadiness.loading;
  const dataUnavailable = !dataLoading && pageReadiness.error;

  return (
    <div className="app-shell flex h-full w-full overflow-hidden">
      <Sidebar
        currentView={currentView}
        onViewChange={changeView}
        badges={badges}
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
            <AnimatePresence mode="wait">
              {currentView === "content-production" && (
                <motion.div
                  key="content-production-view"
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.14 }}
                  className="h-full"
                >
                  <PlatformFeatureProvider>
                    <ContentProductionPage
                      content={content}
                      initialBatchClientIds={batchClientIds}
                      onOpenArticleLibrary={openArticleLibrary}
                      onOpenOrders={() => changeView("orders")}
                      onReadinessChange={reportReadiness}
                    />
                  </PlatformFeatureProvider>
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
                  <ResourcesRoute onReadinessChange={reportReadiness} />
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
                  <PlatformFeatureProvider>
                    <ArticleLibraryPage
                      content={content}
                      articleIntent={articleLibraryIntent}
                      onArticleIntentConsumed={consumeArticleLibraryIntent}
                      onOpenArticleLibrary={openArticleLibrary}
                      onOpenOrders={() => changeView("orders")}
                      onOpenAttention={openAttention}
                      onMainNavigationGuardChange={
                        registerArticleLibraryNavigationGuard
                      }
                      onBadgeChange={reportArticleLibraryBadge}
                      onReadinessChange={reportReadiness}
                    />
                  </PlatformFeatureProvider>
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
                  <PlatformFeatureProvider loadQueue>
                    <SubmissionCenterPage
                      content={content}
                      onOpenBatchGeneration={(clientIds) => {
                        setBatchClientIds(clientIds);
                        changeView("content-production");
                      }}
                      initialSection={submissionCenterSection}
                      onOpenArticleLibrary={openArticleLibrary}
                      onOpenOrders={() => changeView("orders")}
                      onOpenSettings={() => changeView("settings")}
                      onBadgeChange={reportSubmissionCenterBadge}
                      onReadinessChange={reportReadiness}
                    />
                  </PlatformFeatureProvider>
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
                  <OrdersRoute
                    onBadgeChange={reportOrdersBadge}
                    onReadinessChange={reportReadiness}
                  />
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
                  <PlatformFeatureProvider>
                    <SettingsView />
                  </PlatformFeatureProvider>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </main>
      </div>
    </div>
  );
}
