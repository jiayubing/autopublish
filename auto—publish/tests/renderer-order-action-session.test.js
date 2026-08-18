const { after, before, describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { once } = require("node:events");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require("playwright");

const rootDir = path.resolve(__dirname, "..");
const rendererDir = path.join(rootDir, "media-workbench");
const viteEntry = path.join(
  path.dirname(require.resolve("vite/package.json", { paths: [rendererDir] })),
  "bin",
  "vite.js",
);
const viteConfig = path.join(rendererDir, "vite.config.ts");
let browser;
let fixtureDir;
let fixtureServer;

function buildHarness() {
  fixtureDir = fs.mkdtempSync(path.join(rendererDir, ".order-action-session-"));
  const entry = path.join(fixtureDir, "main.tsx");
  const index = path.join(fixtureDir, "index.html");
  const dist = path.join(fixtureDir, "dist");
  const sessionModule = path
    .relative(
      fixtureDir,
      path.join(
        rendererDir,
        "src",
        "components",
        "use-order-action-session.ts",
      ),
    )
    .replaceAll("\\", "/");
  const viewModule = path
    .relative(
      fixtureDir,
      path.join(rendererDir, "src", "components", "OrdersView.tsx"),
    )
    .replaceAll("\\", "/");
  const relativeImport = (value) =>
    value.startsWith(".") ? value : `./${value}`;

  fs.writeFileSync(
    index,
    '<!doctype html><html><head><meta charset="utf-8"></head><body><div id="root"></div><script type="module" src="/main.tsx"></script></body></html>',
    "utf8",
  );
  fs.writeFileSync(
    entry,
    `
      import React, { useMemo, useState } from "react";
      import { createRoot } from "react-dom/client";
      import OrdersView from ${JSON.stringify(relativeImport(viewModule))};
      import { useOrderActionSession } from ${JSON.stringify(relativeImport(sessionModule))};

      const calls = {
        cancellationPreparation: [],
        cancellations: [],
        resolutionPreparation: [],
        resolutions: [],
      };
      let resolveStalePreparation;
      const stalePreparation = new Promise((resolve) => {
        resolveStalePreparation = resolve;
      });
      const orders = [
        {
          orderNid: "cancel-order",
          title: "取消预检订单",
          statusCode: "0",
          cancellation: {
            actionLabel: "取消订单",
            riskCode: null,
            manualResolutionRequired: false,
            cancellationAttemptId: null,
          },
        },
        {
          orderNid: "manual-order",
          title: "人工核对订单",
          statusCode: "1",
          cancellation: {
            actionLabel: null,
            riskCode: null,
            manualResolutionRequired: true,
            cancellationAttemptId: "manual-attempt",
          },
        },
        {
          orderNid: "stale-order",
          title: "过期预检订单",
          statusCode: "0",
          cancellation: {
            actionLabel: "取消订单",
            riskCode: null,
            manualResolutionRequired: false,
            cancellationAttemptId: null,
          },
        },
      ];

      function Harness() {
        const [scopeKey, setScopeKey] = useState("scope-a");
        const orderActions = useOrderActionSession({
          scopeKey,
          orderIds: orders.map((order) => order.orderNid),
          prepareOrderCancellation: (orderId) => {
            calls.cancellationPreparation.push(orderId);
            if (orderId === "stale-order") return stalePreparation;
            return Promise.resolve({
              orderId,
              cancellationAttemptId: "cancel-attempt",
              actionLabel: "取消订单",
              riskCode: null,
              confirmationToken: "cancel-token",
              expiresAt: "2026-08-18T00:00:00.000Z",
            });
          },
          cancelOrder: (input) => {
            calls.cancellations.push(input);
            return Promise.resolve({ status: "cancelled" });
          },
          prepareCancellationResolution: (cancellationAttemptId) => {
            calls.resolutionPreparation.push(cancellationAttemptId);
            return Promise.resolve({
              cancellationAttemptId,
              classification: "verified_cancelled",
              confirmationToken: "manual-token",
              evidenceFingerprint: "manual-evidence",
            });
          },
          confirmCancellationSucceeded: (input) => {
            calls.resolutions.push(["succeeded", input]);
            return Promise.resolve({ status: "cancelled" });
          },
          confirmCancellationNotApplied: (input) => {
            calls.resolutions.push(["not_applied", input]);
            return Promise.resolve({ status: "rejected" });
          },
          openPublishedUrl: () => Promise.resolve(),
        });
        window.__orderActionSessionFixture = {
          calls,
          scopeKey,
          switchScope: () => setScopeKey("scope-b"),
          resolveStalePreparation: () =>
            resolveStalePreparation({
              orderId: "stale-order",
              cancellationAttemptId: "stale-attempt",
              actionLabel: "取消订单",
              riskCode: null,
              confirmationToken: "stale-token",
              expiresAt: "2026-08-18T00:00:00.000Z",
            }),
        };
        return <OrdersView
          orders={orders}
          onSyncOrder={() => Promise.resolve()}
          onSyncAllOrders={() => Promise.resolve()}
          onPrepareAnomaly={() => Promise.resolve()}
          onResolveAnomaly={() => Promise.resolve()}
          orderActions={orderActions}
        />;
      }

      createRoot(document.getElementById("root")).render(<Harness />);
    `,
    "utf8",
  );
  execFileSync(
    process.execPath,
    [
      viteEntry,
      "build",
      fixtureDir,
      "--config",
      viteConfig,
      "--outDir",
      dist,
      "--emptyOutDir",
    ],
    { cwd: rendererDir, stdio: "inherit" },
  );
  return dist;
}

async function serveFixture(directory) {
  fixtureServer = http.createServer((request, response) => {
    const pathname = new URL(
      request.url || "/",
      "http://127.0.0.1",
    ).pathname;
    const requested = pathname === "/" ? "index.html" : pathname.slice(1);
    const filePath = path.resolve(directory, requested);
    if (
      path.relative(directory, filePath).startsWith("..") ||
      !fs.existsSync(filePath)
    ) {
      response.writeHead(404);
      response.end();
      return;
    }
    response.writeHead(200, {
      "content-type": filePath.endsWith(".js")
        ? "application/javascript; charset=utf-8"
        : filePath.endsWith(".css")
          ? "text/css; charset=utf-8"
          : "text/html; charset=utf-8",
    });
    response.end(fs.readFileSync(filePath));
  });
  fixtureServer.listen(0, "127.0.0.1");
  await once(fixtureServer, "listening");
  const address = fixtureServer.address();
  if (!address || typeof address === "string")
    throw new Error("fixture server did not expose a TCP address");
  return `http://127.0.0.1:${address.port}/`;
}

describe("renderer order action session", () => {
  let fixtureUrl;

  before(async () => {
    fixtureUrl = await serveFixture(buildHarness());
    browser = await chromium.launch({ headless: true });
  });

  after(async () => {
    if (browser) await browser.close();
    if (fixtureServer)
      await new Promise((resolve, reject) =>
        fixtureServer.close((error) => (error ? reject(error) : resolve())),
      );
    if (fixtureDir) fs.rmSync(fixtureDir, { recursive: true, force: true });
  });

  it("keeps cancellation preparation, confirmation, manual verification, and stale scope results inside one session", async () => {
    const page = await browser.newPage();
    try {
      await page.goto(fixtureUrl);
      assert.match(await page.locator("body").innerText(), /取消订单/);
      await page.getByRole("button", { name: "取消订单" }).first().click();
      await page.getByRole("button", { name: "确认取消订单" }).waitFor();
      await page.getByRole("button", { name: "确认取消订单" }).click();
      await page.waitForFunction(
        () =>
          window.__orderActionSessionFixture.calls.cancellations.length === 1,
      );
      assert.deepEqual(
        await page.evaluate(
          () => window.__orderActionSessionFixture.calls.cancellations,
        ),
        [{ orderId: "cancel-order", confirmationToken: "cancel-token" }],
      );

      await page.getByRole("button", { name: /已安排/ }).click();
      await page.getByRole("button", { name: "核对取消结果" }).click();
      await page.getByRole("button", { name: "确认已取消" }).click();
      await page.waitForFunction(
        () => window.__orderActionSessionFixture.calls.resolutions.length === 1,
      );
      assert.deepEqual(
        await page.evaluate(
          () => window.__orderActionSessionFixture.calls.resolutions,
        ),
        [
          [
            "succeeded",
            {
              cancellationAttemptId: "manual-attempt",
              confirmationToken: "manual-token",
              evidenceFingerprint: "manual-evidence",
            },
          ],
        ],
      );

      await page.getByRole("button", { name: /待安排/ }).click();
      await page
        .getByText("过期预检订单", { exact: true })
        .locator("..")
        .locator("..")
        .locator("..")
        .getByRole("button", { name: "取消订单" })
        .click();
      await page.evaluate(() =>
        window.__orderActionSessionFixture.switchScope(),
      );
      await page.waitForFunction(
        () => window.__orderActionSessionFixture.scopeKey === "scope-b",
      );
      await page.evaluate(() =>
        window.__orderActionSessionFixture.resolveStalePreparation(),
      );
      assert.equal(
        await page.getByRole("button", { name: "确认取消订单" }).count(),
        0,
      );
      assert.deepEqual(
        await page.evaluate(
          () =>
            window.__orderActionSessionFixture.calls.cancellationPreparation,
        ),
        ["cancel-order", "stale-order"],
      );
    } finally {
      await page.close();
    }
  });
});
