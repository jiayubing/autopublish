export function articleLibraryBadgeCount(management) {
  const lifecycleCount = management?.lifecycleCounts?.needs_completion;
  if (typeof lifecycleCount === "number") return lifecycleCount;
  const workflows = management?.workflowByArticle;
  if (!workflows || typeof workflows !== "object") return 0;
  return Object.values(workflows).filter(
    (workflow) =>
      Boolean(workflow) &&
      typeof workflow === "object" &&
      workflow.stage === "needs_completion",
  ).length;
}

export function submissionCenterBadgeCount(counts) {
  const value = counts?.attentionItems;
  return typeof value === "number" && value > 0 ? value : 0;
}

export function ordersBadgeCount(orders) {
  if (!Array.isArray(orders)) return 0;
  return orders.filter(
    (order) =>
      Boolean(order?.anomaly) ||
      Boolean(order?.cancellation?.manualResolutionRequired),
  ).length;
}
