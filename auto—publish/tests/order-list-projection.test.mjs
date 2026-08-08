import assert from "node:assert/strict";
import test from "node:test";

import {
  ORDER_FILTERS,
  projectOrderList,
} from "../media-workbench/src/features/media/order-list-projection.js";

const orders = [
  {
    orderNid: "older-pending",
    title: "甲",
    resourceName: "媒体甲",
    statusCode: "0",
    createdAt: "2026-08-08T00:00:00.000Z",
  },
  {
    orderNid: "published",
    title: "乙",
    resourceName: "媒体乙",
    statusCode: "2",
    createdAt: "2026-08-08T03:00:00.000Z",
  },
  {
    orderNid: "newer-pending",
    title: "丙",
    resourceName: "媒体丙",
    statusCode: "0",
    createdAt: "2026-08-08T02:00:00.000Z",
  },
  {
    orderNid: "scheduled",
    title: "丁",
    resourceName: "媒体丁",
    statusCode: "1",
    createdAt: "2026-08-08T01:00:00.000Z",
  },
  {
    orderNid: "rejected",
    title: "戊",
    resourceName: "媒体戊",
    statusCode: "4",
    createdAt: "2026-08-08T04:00:00.000Z",
  },
  {
    orderNid: "aftercare",
    title: "己",
    resourceName: "媒体己",
    statusCode: "9",
    createdAt: "2026-08-08T05:00:00.000Z",
  },
];

test("order projection defaults to pending and owns counts plus creation-time ordering", () => {
  const view = projectOrderList(orders);
  assert.equal(view.status, "0");
  assert.deepEqual(
    view.items.map((order) => order.orderNid),
    ["newer-pending", "older-pending"],
  );
  assert.deepEqual(view.counts, {
    0: 2,
    1: 1,
    2: 1,
    4: 1,
    9: 1,
    cancelled: 0,
    all: 6,
  });
  assert.deepEqual(
    ORDER_FILTERS.map((filter) => filter.id),
    ["0", "1", "2", "4", "9", "cancelled", "all"],
  );
  assert.equal(
    view.items.every((order) => order.delayNotice),
    true,
  );
});

test("all/status/search filters reuse the same read-model owner", () => {
  assert.deepEqual(
    projectOrderList(orders, { status: "all" }).items.map(
      (order) => order.orderNid,
    ),
    [
      "aftercare",
      "rejected",
      "published",
      "newer-pending",
      "scheduled",
      "older-pending",
    ],
  );
  assert.deepEqual(
    projectOrderList(orders, { status: "2", search: "媒体乙" }).items.map(
      (order) => order.orderNid,
    ),
    ["published"],
  );
});
