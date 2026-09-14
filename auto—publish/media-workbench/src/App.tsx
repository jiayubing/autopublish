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
import { useContentWorkbenchFeature } from "./features/content/use-content-workbench-feature";
import { SettingsFeatureProvider } from "./features/settings/settings-context";
import { useSubmissionCenterFeature } from "./features/submission-center/use-submission-center-feature";
import type { ArticleLibraryNavigationIntent } from "./article-library-navigation";
import { getPoolPage } from "./bridge/media";
import { DEFAULT_RESOURCE_PAGE_SIZE } from "./features/media/media-feature.js";
import type { FavoriteMediaPage } from "./components/content/GeneratedArticlesView.types";
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

const EMPTY_FAVORITE_MEDIA_PAGE: FavoriteMediaPage = {
  items: [],
  total: 0,
  page: 1,
  totalPages: 0,
  hasPrev: false,
  hasNext: false,
  loading: false,
};

type MainNavigationGuard = (action: () => void) => void;
type PageReadiness = { loading: boolean; error: boolean };

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

function ContentProductionPage({
  onOpenArticleLibrary,
  onOpenOrders,
  onReadinessChange,
}: {
  onOpenArticleLibrary: (intent?: ArticleLibraryNavigationIntent) => void;
  onOpenOrders: () => void;
  onReadinessChange: (readiness: PageReadiness) => void;
}) {
  const content = useContentWorkbenchFeature({ page: "production" });
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
      onOpenArticleLibrary={onOpenArticleLibrary}
      onOpenOrders={onOpenOrders}
    />
  );
}

function ArticleLibraryPage({
  articleIntent,
  onArticleIntentConsumed,
  onOpenArticleLibrary,
  onOpenOrders,
  onOpenAttention,
  onMainNavigationGuardChange,
  onBadgeChange,
  onReadinessChange,
}: {
  articleIntent?: ArticleLibraryNavigationIntent | null;
  onArticleIntentConsumed: () => void;
  onOpenArticleLibrary: (intent?: ArticleLibraryNavigationIntent) => void;
  onOpenOrders: () => void;
  onOpenAttention: () => void;
  onMainNavigationGuardChange: (guard: MainNavigationGuard | null) => void;
  onBadgeChange: (count: number) => void;
  onReadinessChange: (readiness: PageReadiness) => void;
}) {
  const content = useContentWorkbenchFeature({ page: "library" });
  const [favoriteMediaPage, setFavoriteMediaPage] = useState(
    EMPTY_FAVORITE_MEDIA_PAGE,
  );
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

  async function loadFavoriteMediaPage(page: number) {
    setFavoriteMediaPage((current) => ({
      ...current,
      page,
      loading: true,
      errorMessage: undefined,
    }));
    try {
      const result = await getPoolPage({
        page,
        pageSize: DEFAULT_RESOURCE_PAGE_SIZE,
        resourceIds: [],
      });
      setFavoriteMediaPage({
        items: result.items,
        total: result.total,
        page: result.page,
        totalPages: result.totalPages,
        hasPrev: result.hasPrev,
        hasNext: result.hasNext,
        loading: false,
      });
    } catch (_) {
      setFavoriteMediaPage((current) => ({
        ...current,
        loading: false,
        errorMessage: "无法加载收藏媒体。",
      }));
    }
  }

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
  initialSection,
  onOpenArticleLibrary,
  onOpenOrders,
  onBadgeChange,
  onReadinessChange,
}: {
  initialSection: "regular" | "paid" | "attention";
  onOpenArticleLibrary: (intent?: ArticleLibraryNavigationIntent) => void;
  onOpenOrders: () => void;
  onBadgeChange: (count: number) => void;
  onReadinessChange: (readiness: PageReadiness) => void;
}) {
  const content = useContentWorkbenchFeature({ page: "shell" });
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
      submissionCenter={submissionCenter}
      initialSection={initialSection}
      onOpenArticleLibrary={onOpenArticleLibrary}
      onOpenOrders={onOpenOrders}
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
                  <ContentProductionPage
                    onOpenArticleLibrary={openArticleLibrary}
                    onOpenOrders={() => changeView("orders")}
                    onReadinessChange={reportReadiness}
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
                  <ArticleLibraryPage
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
                  <SubmissionCenterPage
                    initialSection={submissionCenterSection}
                    onOpenArticleLibrary={openArticleLibrary}
                    onOpenOrders={() => changeView("orders")}
                    onBadgeChange={reportSubmissionCenterBadge}
                    onReadinessChange={reportReadiness}
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
