const assert = require("node:assert/strict");
const path = require("node:path");
const { after, before, beforeEach, describe, it } = require("node:test");
const { chromium } = require("playwright");
const esbuild = require("../media-workbench/node_modules/esbuild");

const rendererSource = path.resolve(__dirname, "..", "media-workbench", "src");

async function buildHarness() {
  const result = await esbuild.build({
    stdin: {
      contents: `
        import React, { useEffect, useRef, useState } from 'react';
        import { createRoot } from 'react-dom/client';
        import ConfirmationHost from './components/ConfirmationHost';
        import { useConfirmation } from './confirmation';

        function Controls() {
          const { confirm } = useConfirmation();
          const controllers = useRef(new Map());

          useEffect(() => {
            window.__confirmationHarness.request = (key, abortable = false) => {
              const controller = abortable ? new AbortController() : null;
              if (controller) controllers.current.set(key, controller);
              void confirm({
                title: key,
                message: 'message-' + key,
                confirmLabel: 'confirm-' + key,
                signal: controller?.signal,
              }).then((value) => {
                window.__confirmationResults.push({ key, value });
                controllers.current.delete(key);
              });
            };
            window.__confirmationHarness.abort = (key) => controllers.current.get(key)?.abort();
            return () => {
              delete window.__confirmationHarness.request;
              delete window.__confirmationHarness.abort;
            };
          }, [confirm]);

          return <button id="request-trigger" type="button">request trigger</button>;
        }

        function Root() {
          const [scopeKey, setScopeKey] = useState('workspace-a');
          const [hostMounted, setHostMounted] = useState(true);
          const [requesterMounted, setRequesterMounted] = useState(true);
          useEffect(() => {
            window.__confirmationHarness.setScope = setScopeKey;
            window.__confirmationHarness.unmountHost = () => setHostMounted(false);
            window.__confirmationHarness.disposeRequester = () => setRequesterMounted(false);
          }, []);
          return hostMounted
            ? <ConfirmationHost scopeKey={scopeKey}>{requesterMounted ? <Controls /> : <div id="requester-unmounted">requester unmounted</div>}</ConfirmationHost>
            : <div id="host-unmounted">host unmounted</div>;
        }

        window.__confirmationResults = [];
        window.__confirmationHarness = {};
        createRoot(document.getElementById('root')).render(<Root />);
      `,
      loader: "tsx",
      resolveDir: rendererSource,
      sourcefile: "confirmation-host-harness.tsx",
    },
    bundle: true,
    format: "iife",
    platform: "browser",
    write: false,
  });
  return result.outputFiles[0].text;
}

async function waitForResult(page, key) {
  await page.waitForFunction(
    (target) => window.__confirmationResults.some((result) => result.key === target),
    key,
  );
  return page.evaluate(
    (target) => window.__confirmationResults.find((result) => result.key === target),
    key,
  );
}

describe("renderer confirmation host behavior", { concurrency: false }, () => {
  let browser;
  let bundle;
  let page;

  before(async () => {
    bundle = await buildHarness();
    browser = await chromium.launch({ headless: true });
  });

  beforeEach(async () => {
    await page?.close();
    page = await browser.newPage();
    await page.setContent('<main id="root"></main>');
    await page.addScriptTag({ content: bundle });
    await page.waitForFunction(() => typeof window.__confirmationHarness.request === "function");
  });

  after(async () => {
    await page?.close();
    await browser?.close();
  });

  it("shows concurrent requests in FIFO order and settles each exactly once", async () => {
    await page.locator("#request-trigger").focus();
    await page.evaluate(() => {
      window.__confirmationHarness.request("first");
      window.__confirmationHarness.request("second");
    });

    const firstDialog = page.getByRole("dialog");
    await firstDialog.getByRole("heading", { name: "first" }).waitFor();
    await page.waitForFunction(() => document.activeElement?.textContent === "取消");
    assert.equal(await page.evaluate(() => document.activeElement?.textContent), "取消");
    await firstDialog.getByRole("button", { name: "取消" }).click();
    assert.deepEqual(await waitForResult(page, "first"), { key: "first", value: false });

    const secondDialog = page.getByRole("dialog");
    await secondDialog.getByRole("heading", { name: "second" }).waitFor();
    await page.evaluate(() => {
      const button = [...document.querySelectorAll("button")].find((item) => item.textContent === "confirm-second");
      button.click();
      button.click();
    });
    assert.deepEqual(await waitForResult(page, "second"), { key: "second", value: true });
    assert.equal(await page.evaluate(() => window.__confirmationResults.filter((result) => result.key === "second").length), 1);
    await page.waitForFunction(() => document.activeElement?.id === "request-trigger");
  });

  it("cancels aborted requesters, workspace changes, and host unmount without leaking queued dialogs", async () => {
    await page.evaluate(() => {
      window.__confirmationHarness.request("active");
      window.__confirmationHarness.request("disposed-requester", true);
      window.__confirmationHarness.abort("disposed-requester");
    });
    assert.deepEqual(await waitForResult(page, "disposed-requester"), { key: "disposed-requester", value: false });
    await page.getByRole("dialog").getByRole("button", { name: "取消" }).click();
    assert.deepEqual(await waitForResult(page, "active"), { key: "active", value: false });
    assert.equal(await page.getByRole("dialog").count(), 0);

    await page.evaluate(() => {
      window.__confirmationHarness.request("old-workspace-active");
      window.__confirmationHarness.request("old-workspace-queued");
      window.__confirmationHarness.setScope("workspace-b");
    });
    assert.deepEqual(await waitForResult(page, "old-workspace-active"), { key: "old-workspace-active", value: false });
    assert.deepEqual(await waitForResult(page, "old-workspace-queued"), { key: "old-workspace-queued", value: false });
    assert.equal(await page.getByRole("dialog").count(), 0);

    await page.evaluate(() => {
      window.__confirmationHarness.request("unmounted-active");
      window.__confirmationHarness.request("unmounted-queued");
      window.__confirmationHarness.unmountHost();
    });
    await page.locator("#host-unmounted").waitFor();
    assert.deepEqual(await waitForResult(page, "unmounted-active"), { key: "unmounted-active", value: false });
    assert.deepEqual(await waitForResult(page, "unmounted-queued"), { key: "unmounted-queued", value: false });
  });

  it("cancels all requests owned by a useConfirmation consumer when that requester unmounts", async () => {
    await page.evaluate(() => {
      window.__confirmationHarness.request("requester-active");
      window.__confirmationHarness.request("requester-queued");
      window.__confirmationHarness.disposeRequester();
    });
    await page.locator("#requester-unmounted").waitFor();
    assert.deepEqual(await waitForResult(page, "requester-active"), { key: "requester-active", value: false });
    assert.deepEqual(await waitForResult(page, "requester-queued"), { key: "requester-queued", value: false });
    assert.equal(await page.getByRole("dialog").count(), 0);
    assert.equal(await page.locator("#host-unmounted").count(), 0);
  });

  it("traps Tab and Shift+Tab, cancels on Escape, and restores focus", async () => {
    await page.locator("#request-trigger").focus();
    await page.evaluate(() => window.__confirmationHarness.request("keyboard"));
    const dialog = page.getByRole("dialog");
    const cancel = dialog.getByRole("button", { name: "取消" });
    const confirm = dialog.getByRole("button", { name: "confirm-keyboard" });
    await cancel.waitFor();
    await page.waitForFunction(() => document.activeElement?.textContent === "取消");

    await page.keyboard.press("Shift+Tab");
    assert.equal(await confirm.evaluate((element) => element === document.activeElement), true);
    await page.keyboard.press("Tab");
    assert.equal(await cancel.evaluate((element) => element === document.activeElement), true);
    await page.keyboard.press("Escape");

    assert.deepEqual(await waitForResult(page, "keyboard"), { key: "keyboard", value: false });
    await page.waitForFunction(() => document.activeElement?.id === "request-trigger");

    await page.evaluate(() => window.__confirmationHarness.request("backdrop"));
    await page.locator("[data-confirmation-backdrop]").dispatchEvent("mousedown");
    assert.deepEqual(await waitForResult(page, "backdrop"), { key: "backdrop", value: false });
  });
});
