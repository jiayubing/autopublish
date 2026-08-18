import type { useMediaFeature } from "../features/media/use-media-feature";
import ResourceLibrary from "./ResourceLibrary";

type MediaFeatureState = ReturnType<typeof useMediaFeature>;

interface ResourceLibraryPageProps {
  snapshot: MediaFeatureState["snapshot"];
  feature: MediaFeatureState["feature"];
}

export default function ResourceLibraryPage({
  snapshot,
  feature,
}: ResourceLibraryPageProps) {
  const refreshResult = snapshot.commands.refreshResources.result as {
    truncated?: boolean;
    resourceCount?: number;
  } | null;
  const statusMessage = refreshResult
    ? refreshResult.truncated
      ? `资源刷新达到安全上限，已加载 ${refreshResult.resourceCount || 0} 项，结果已截断。`
      : `资源库已刷新，共 ${refreshResult.resourceCount || 0} 项。`
    : null;
  const errorMessage =
    snapshot.commands.refreshResources.error?.userMessage ||
    snapshot.commands.togglePool.error?.userMessage ||
    snapshot.resources.query.error?.userMessage;

  return (
    <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-sm">
      <ResourceLibrary
        resources={snapshot.resources.items}
        selectedResourceIds={[]}
        mode="management"
        activeArticleLabel=""
        poolResourceIds={snapshot.pool.memberResourceIds}
        onTogglePool={(resource) => {
          void feature.togglePool(resource);
        }}
        onRefreshResources={() => {
          void feature.refreshResources();
        }}
        isRefreshingResources={snapshot.commands.refreshResources.busy}
        onPickResource={() => {}}
        totalResources={snapshot.resources.total}
        resourcePage={snapshot.resources.page}
        resourcePageSize={snapshot.resources.pageSize}
        resourceSearch={snapshot.resources.search}
        onResourceSearch={(query) => {
          void feature.searchResources(query);
        }}
        onResourcePageChange={(page) => {
          void feature.loadResourcePage(page, "manual");
        }}
        errorMessage={errorMessage}
        statusMessage={statusMessage}
      />
    </div>
  );
}
