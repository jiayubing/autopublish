const { execFileSync, spawn } = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { chromium } = require("playwright");

const rootDir = path.resolve(__dirname, "..", "..");
const rendererDir = path.join(rootDir, "media-workbench");
const viteEntry = path.join(
  rendererDir,
  "node_modules",
  "vite",
  "bin",
  "vite.js",
);
const buildLock = path.join(os.tmpdir(), "auto-publish-renderer-build.lock");
let buildPromise;
let browserPromise;
const servers = new Map();

function waitForServer(url) {
  const deadline = Date.now() + 20000;
  return new Promise((resolve, reject) => {
    const probe = () => {
      if (Date.now() >= deadline)
        return reject(new Error("Vite renderer server did not start"));
      const request = http.get(url, (response) => {
        response.resume();
        if (response.statusCode >= 200 && response.statusCode < 500) resolve();
        else setTimeout(probe, 100);
      });
      request.on("error", () => setTimeout(probe, 100));
    };
    probe();
  });
}

function ensureBuild() {
  if (!buildPromise) {
    buildPromise = Promise.resolve().then(async () => {
      const latestSourceMtime = () => {
        let latest = 0;
        const visit = (directory) => {
          for (const entry of fs.readdirSync(directory, {
            withFileTypes: true,
          })) {
            const target = path.join(directory, entry.name);
            if (entry.isDirectory()) {
              if (entry.name !== "node_modules" && entry.name !== "dist")
                visit(target);
              continue;
            }
            if (/\.(ts|tsx|js|css|html)$/.test(entry.name))
              latest = Math.max(latest, fs.statSync(target).mtimeMs);
          }
        };
        visit(rendererDir);
        return latest;
      };
      const indexPath = path.join(rendererDir, "dist", "index.html");
      if (
        fs.existsSync(indexPath) &&
        fs.statSync(indexPath).mtimeMs >= latestSourceMtime()
      )
        return;
      let lockHandle;
      while (!lockHandle) {
        try {
          lockHandle = fs.openSync(buildLock, "wx");
        } catch (error) {
          if (error.code !== "EEXIST") throw error;
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }
      try {
        if (
          !fs.existsSync(indexPath) ||
          fs.statSync(indexPath).mtimeMs < latestSourceMtime()
        ) {
          if (process.platform === "win32")
            execFileSync(
              process.env.ComSpec || "cmd.exe",
              ["/d", "/s", "/c", "npm --prefix media-workbench run build"],
              { cwd: rootDir, stdio: "inherit" },
            );
          else
            execFileSync(
              "npm",
              ["--prefix", "media-workbench", "run", "build"],
              { cwd: rootDir, stdio: "inherit" },
            );
        }
      } finally {
        try {
          fs.closeSync(lockHandle);
        } catch (_) {}
        try {
          fs.unlinkSync(buildLock);
        } catch (_) {}
      }
    });
  }
  return buildPromise;
}

async function startRenderer(options) {
  const port = Number((options && options.port) || 4174);
  await ensureBuild();
  if (!browserPromise) browserPromise = chromium.launch({ headless: true });
  if (!servers.has(port)) {
    const url = `http://127.0.0.1:${port}/`;
    const processValue = spawn(
      process.execPath,
      [viteEntry, "preview", "--host", "127.0.0.1", "--port", String(port)],
      { cwd: rendererDir, stdio: ["ignore", "pipe", "pipe"] },
    );
    servers.set(port, { process: processValue, url });
    await waitForServer(url);
  }
  return { browser: await browserPromise, url: servers.get(port).url };
}

async function closeRenderer() {
  if (browserPromise) {
    const browser = await browserPromise;
    await browser.close();
  }
  const processes = [...servers.values()].map(
    ({ process: processValue }) => processValue,
  );
  const exits = processes.map((processValue) => {
    if (processValue.exitCode !== null || processValue.signalCode !== null)
      return Promise.resolve();
    return new Promise((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve();
      };
      const timer = setTimeout(() => {
        try {
          if (
            processValue.exitCode === null &&
            processValue.signalCode === null
          )
            processValue.kill("SIGKILL");
        } catch (_) {}
        finish();
      }, 5000);
      processValue.once("close", finish);
      processValue.once("error", finish);
      try {
        processValue.kill();
      } catch (_) {
        finish();
      }
    });
  });
  await Promise.all(exits);
  servers.clear();
  browserPromise = null;
}

module.exports = { closeRenderer, ensureBuild, startRenderer };
