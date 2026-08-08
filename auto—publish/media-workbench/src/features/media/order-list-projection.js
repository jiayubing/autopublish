export const ORDER_FILTERS = Object.freeze([
  Object.freeze({ id: "0", label: "待安排" }),
  Object.freeze({ id: "1", label: "已安排" }),
  Object.freeze({ id: "2", label: "已发布" }),
  Object.freeze({ id: "4", label: "已退稿" }),
  Object.freeze({ id: "9", label: "售后中" }),
  Object.freeze({ id: "cancelled", label: "已取消" }),
  Object.freeze({ id: "all", label: "全部记录" }),
]);

const LABELS = Object.freeze(
  Object.fromEntries(ORDER_FILTERS.map((filter) => [filter.id, filter.label])),
);

function timestamp(order) {
  const value = Date.parse(order.createdAt || order.submittedAt || "");
  return Number.isFinite(value) ? value : 0;
}

export function projectOrderList(orders, input = {}) {
  const source = Array.isArray(orders) ? orders : [];
  const status = ORDER_FILTERS.some((filter) => filter.id === input.status)
    ? input.status
    : "0";
  const search =
    typeof input.search === "string" ? input.search.trim().toLowerCase() : "";
  const counts = Object.fromEntries(
    ["0", "1", "2", "4", "9", "cancelled"].map((code) => [
      code,
      source.filter((order) => order && order.statusCode === code).length,
    ]),
  );
  counts.all = source.length;
  const items = [...source]
    .sort((left, right) => timestamp(right) - timestamp(left))
    .filter((order) => status === "all" || order.statusCode === status)
    .filter((order) => {
      if (!search) return true;
      return [order.title, order.orderNid, order.resourceName].some((value) =>
        String(value || "")
          .toLowerCase()
          .includes(search),
      );
    })
    .map((order) =>
      Object.freeze({
        ...order,
        statusLabel: LABELS[order.statusCode] || "未知",
        delayNotice: ["0", "1"].includes(order.statusCode),
      }),
    );
  return Object.freeze({
    status,
    counts: Object.freeze(counts),
    items: Object.freeze(items),
  });
}
