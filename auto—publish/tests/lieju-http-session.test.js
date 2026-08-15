"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  createStateFileLease,
  createBrowserSessionLifecycle,
  stateLeaseFilename,
} = require("../src/platforms/shared/browser-session-lifecycle");
const {
  createLiejuHttpSession,
} = require("../src/platforms/lieju/http-session");

const LOGIN_PROBE_URL = "https://post.lieju.com/117/239";
const { createPlatformAdapter } = require("../src/platforms/lieju/adapter");

function response(options) {
  const value = options || {};
  return {
    status: () => (value.status === undefined ? 200 : value.status),
    url: () => value.url || "https://post.lieju.com/117/239",
    headers: () =>
      value.headers || { "content-type": "text/html; charset=utf-8" },
    body: async () => Buffer.from(value.body || "<html></html>", "utf8"),
  };
}

function makeRequestRuntime(options) {
  const value = options || {};
  const calls = [];
  const postCalls = [];
  const newContexts = [];
  const responses = (value.responses || []).slice();
  const postResponses = (value.postResponses || []).slice();
  const context = {
    get: async (url, input) => {
      calls.push({ url, input });
      const next = responses.shift();
      if (next instanceof Error) throw next;
      return typeof next === "function" ? next(url, input) : next;
    },
    post: async (url, input) => {
      postCalls.push({ url, input });
      const next = postResponses.shift();
      if (next instanceof Error) throw next;
      return typeof next === "function" ? next(url, input) : next;
    },
    storageState: async ({ path: filename }) => {
      if (value.storageStateError) throw value.storageStateError;
      fs.writeFileSync(
        filename,
        value.serializedState || '{"cookies":[]}',
        "utf8",
      );
    },
    dispose: async () => {
      if (value.disposeError) throw value.disposeError;
    },
  };
  return {
    calls,
    postCalls,
    newContexts,
    request: {
      newContext: async (input) => {
        newContexts.push(input);
        if (value.newContextError) throw value.newContextError;
        return context;
      },
    },
  };
}

function stateFixture() {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "autopublish-lieju-http-"),
  );
  const stateFile = path.join(root, "lieju.json");
  fs.writeFileSync(stateFile, '{"cookies":[{"name":"prior"}]}', "utf8");
  return { root, stateFile };
}

function removeFixture(fixture) {
  fs.rmSync(fixture.root, { recursive: true, force: true });
}

test("Lieju HTTP probe and city/form GETs use request contexts without launching a browser", async () => {
  const fixture = stateFixture();
  const runtime = makeRequestRuntime({
    responses: [
      response(),
      response({ body: '<meta charset="utf-8"><a>北京</a>' }),
      response({ body: '<meta charset="utf-8"><form></form>' }),
    ],
    serializedState: '{"cookies":[{"name":"updated","value":"secret"}]}',
  });
  let browserLaunches = 0;
  try {
    const session = createLiejuHttpSession({
      stateFile: fixture.stateFile,
      request: runtime.request,
      loginProbeUrl: LOGIN_PROBE_URL,
    });
    const result = await session.withGetPort(async (port) => {
      assert.deepEqual(await port.probeLogin(), { status: "authenticated" });
      const city = await port.get("https://www.lieju.com/city.php?post=239");
      const form = await port.get("https://post.lieju.com/117/239");
      assert.throws(() => JSON.stringify(city), {
        code: "LIEJU_HTTP_RESPONSE_SERIALIZATION_FORBIDDEN",
      });
      return {
        city: city.body.toString("utf8"),
        form: form.body.toString("utf8"),
      };
    });

    assert.equal(browserLaunches, 0);
    assert.deepEqual(runtime.newContexts, [
      { storageState: fixture.stateFile },
    ]);
    assert.deepEqual(result, {
      city: '<meta charset="utf-8"><a>北京</a>',
      form: '<meta charset="utf-8"><form></form>',
    });
    assert.equal(runtime.calls.length, 3);
    assert.equal(
      runtime.calls.every((call) => call.input.maxRedirects === 0),
      true,
    );
    assert.equal(
      fs.readFileSync(fixture.stateFile, "utf8").includes("updated"),
      true,
    );
    assert.equal(
      fs.readdirSync(fixture.root).some((name) => name.includes(".tmp-")),
      false,
    );
  } finally {
    removeFixture(fixture);
  }
});

test("Lieju HTTP session classifies missing, corrupt, expired, unclassified, timeout, and unsafe redirect state without GET retry", async () => {
  const fixture = stateFixture();
  try {
    fs.rmSync(fixture.stateFile);
    const missing = createLiejuHttpSession({
      stateFile: fixture.stateFile,
      request: makeRequestRuntime().request,
    });
    await assert.rejects(() => missing.withGetPort(async () => undefined), {
      code: "LIEJU_HTTP_STATE_MISSING",
    });

    fs.writeFileSync(fixture.stateFile, "not-json", "utf8");
    const corrupt = createLiejuHttpSession({
      stateFile: fixture.stateFile,
      request: makeRequestRuntime({
        newContextError: new Error("invalid JSON"),
      }).request,
    });
    await assert.rejects(() => corrupt.withGetPort(async () => undefined), {
      code: "LIEJU_HTTP_STATE_INVALID",
    });

    fs.writeFileSync(fixture.stateFile, "{}", "utf8");
    const expired = createLiejuHttpSession({
      stateFile: fixture.stateFile,
      request: makeRequestRuntime({
        responses: [response({ status: 403 })],
      }).request,
      loginProbeUrl: LOGIN_PROBE_URL,
    });
    assert.deepEqual(await expired.withGetPort((port) => port.probeLogin()), {
      status: "expired",
    });

    const unclassified = createLiejuHttpSession({
      stateFile: fixture.stateFile,
      request: makeRequestRuntime({
        responses: [
          response({ url: "https://www.lieju.com/member/upage.php" }),
        ],
      }).request,
      loginProbeUrl: LOGIN_PROBE_URL,
    });
    assert.deepEqual(
      await unclassified.withGetPort((port) => port.probeLogin()),
      { status: "unclassified" },
    );

    const timeoutRuntime = makeRequestRuntime({
      responses: [new Error("timeout with cookie=secret")],
    });
    const timeout = createLiejuHttpSession({
      stateFile: fixture.stateFile,
      request: timeoutRuntime.request,
    });
    await assert.rejects(
      () =>
        timeout.withGetPort((port) =>
          port.get("https://post.lieju.com/117/239"),
        ),
      { code: "LIEJU_HTTP_GET_FAILED" },
    );
    assert.equal(timeoutRuntime.calls.length, 1);

    const redirectRuntime = makeRequestRuntime({
      responses: [
        response({
          status: 302,
          headers: { location: "https://attacker.invalid/" },
        }),
      ],
    });
    const redirected = createLiejuHttpSession({
      stateFile: fixture.stateFile,
      request: redirectRuntime.request,
    });
    await assert.rejects(
      () =>
        redirected.withGetPort((port) =>
          port.get("https://post.lieju.com/117/239"),
        ),
      { code: "LIEJU_HTTP_REDIRECT_UNSAFE" },
    );
    assert.equal(redirectRuntime.calls.length, 1);
  } finally {
    removeFixture(fixture);
  }
});

test("Lieju HTTP and browser sessions hold separate leases, recover stale locks, and retain the primary GET result on save or cleanup failure", async () => {
  const fixture = stateFixture();
  const diagnostics = [];
  let releaseOperation;
  let operationEntered;
  const entered = new Promise((resolve) => {
    operationEntered = resolve;
  });
  const httpLease = createStateFileLease({ stateFile: fixture.stateFile });
  const browserLease = createStateFileLease({ stateFile: fixture.stateFile });
  const session = createLiejuHttpSession({
    stateFile: fixture.stateFile,
    stateLease: httpLease,
    request: makeRequestRuntime().request,
  });
  const browser = createBrowserSessionLifecycle({
    session: { session: "lieju-test", stateFile: fixture.stateFile },
    stateLease: browserLease,
    run: (args) => (args[0] === "list" ? "lieju-test" : ""),
  });
  try {
    const held = session.withGetPort(async () => {
      operationEntered();
      return new Promise((resolve) => {
        releaseOperation = resolve;
      });
    });
    await entered;
    assert.throws(() => browser.ensureStarted(), {
      code: "BROWSER_SESSION_STATE_LEASE_UNAVAILABLE",
    });
    releaseOperation("primary-result");
    assert.equal(await held, "primary-result");

    fs.writeFileSync(
      stateLeaseFilename(fixture.stateFile),
      JSON.stringify({ version: 1, pid: 999999999, leaseId: "stale" }),
      "utf8",
    );
    const restarted = createStateFileLease({
      stateFile: fixture.stateFile,
      isProcessAlive: () => false,
    });
    restarted.acquire();
    restarted.release();

    const failingFs = Object.assign({}, fs, {
      renameSync() {
        throw new Error("rename failed with cookie=secret");
      },
    });
    const result = await createLiejuHttpSession({
      stateFile: fixture.stateFile,
      fs: failingFs,
      diagnose: (event) => diagnostics.push(event),
      request: makeRequestRuntime({
        responses: [response()],
        disposeError: new Error("cleanup failed with token=secret"),
      }).request,
    }).withGetPort(async (port) => {
      await port.get("https://post.lieju.com/117/239");
      return "primary-get-result";
    });
    assert.equal(result, "primary-get-result");
    assert.deepEqual(diagnostics.map((event) => event.code).sort(), [
      "LIEJU_HTTP_CONTEXT_CLEANUP_FAILED",
      "LIEJU_HTTP_STATE_SAVE_FAILED",
    ]);
    assert.equal(JSON.stringify(diagnostics).includes("secret"), false);
  } finally {
    removeFixture(fixture);
  }
});

test("Lieju adapter exposes only the narrow HTTP GET port", async () => {
  const fixture = stateFixture();
  try {
    const runtime = makeRequestRuntime({ responses: [response()] });
    const adapter = createPlatformAdapter({
      browserRuntime: { stateFile: fixture.stateFile },
      httpRequest: runtime.request,
    });
    const result = await adapter.withHttpGetPort(async (port) => {
      assert.deepEqual(Object.keys(port).sort(), ["get", "probeLogin"]);
      const value = await port.get("https://post.lieju.com/117/239");
      return { status: value.status, contentType: value.contentType };
    });
    assert.deepEqual(result, {
      status: 200,
      contentType: "text/html; charset=utf-8",
    });
    assert.equal("stateFile" in adapter, false);
  } finally {
    removeFixture(fixture);
  }
});

test("Lieju HTTP submission port sends one bounded no-retry POST and reports state-save failure", async () => {
  const fixture = stateFixture();
  const diagnostics = [];
  try {
    const runtime = makeRequestRuntime({
      postResponses: [
        response({
          status: 302,
          headers: {
            location: "https://ly.lieju.com/beijing/123456.html",
            "content-type": "text/html; charset=utf-8",
          },
        }),
      ],
    });
    const result = await createLiejuHttpSession({
      stateFile: fixture.stateFile,
      request: runtime.request,
    }).withSubmissionPort(async (port) => {
      assert.deepEqual(Object.keys(port), ["post"]);
      return port.post("https://post.lieju.com/1/239?action=postnew", {
        body: Buffer.from("synthetic-multipart"),
        headers: { "content-type": "multipart/form-data; boundary=synthetic" },
      });
    });

    assert.equal(runtime.postCalls.length, 1);
    assert.deepEqual(runtime.postCalls[0], {
      url: "https://post.lieju.com/1/239?action=postnew",
      input: {
        data: Buffer.from("synthetic-multipart"),
        headers: { "content-type": "multipart/form-data; boundary=synthetic" },
        timeout: 20000,
        maxRedirects: 0,
        maxRetries: 0,
        failOnStatusCode: false,
      },
    });
    assert.equal(result.stateSaved, true);
    assert.equal(
      result.result.redirectUrl,
      "https://ly.lieju.com/beijing/123456.html",
    );

    const failedSave = await createLiejuHttpSession({
      stateFile: fixture.stateFile,
      fs: Object.assign({}, fs, {
        renameSync() {
          throw new Error("save failed with cookie=secret");
        },
      }),
      diagnose: (event) => diagnostics.push(event),
      request: makeRequestRuntime({
        postResponses: [response({ body: '<meta charset="utf-8">发布成功' })],
      }).request,
    }).withSubmissionPort((port) =>
      port.post("https://post.lieju.com/1/239?action=postnew", {
        body: Buffer.from("synthetic-multipart"),
        headers: { "content-type": "multipart/form-data; boundary=synthetic" },
      }),
    );
    assert.equal(failedSave.stateSaved, false);
    assert.deepEqual(diagnostics.map((event) => event.code), [
      "LIEJU_HTTP_STATE_SAVE_FAILED",
    ]);
    assert.equal(JSON.stringify(diagnostics).includes("secret"), false);
  } finally {
    removeFixture(fixture);
  }
});
