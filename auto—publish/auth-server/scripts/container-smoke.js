"use strict";

const http = require("node:http");
const { spawn } = require("node:child_process");

function smokeError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function request(pathname) {
  return new Promise((resolve, reject) => {
    const request = http.get(
      { host: "127.0.0.1", port: 3180, path: pathname, timeout: 1000 },
      (response) => {
        response.resume();
        response.on("end", () => resolve(response.statusCode));
      },
    );
    request.on("timeout", () =>
      request.destroy(
        smokeError("AUTH_CONTAINER_TIMEOUT", "health request timed out"),
      ),
    );
    request.on("error", reject);
  });
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitForHealth() {
  let lastError;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const status = await request("/healthz/live");
      if (status === 200) return;
    } catch (error) {
      lastError = error;
    }
    await delay(100);
  }
  throw smokeError(
    "AUTH_CONTAINER_UNAVAILABLE",
    "container health endpoint unavailable",
  );
}

async function runContainerSmoke() {
  const child = spawn(process.execPath, ["src/server.js"], {
    cwd: "/app",
    env: {
      PATH: process.env.PATH || "",
      PORT: "3180",
      HOST: "127.0.0.1",
      AUTH_DB_PATH: "/data/auth.db",
      NODE_ENV: "test",
    },
    stdio: ["ignore", "ignore", "ignore"],
  });
  try {
    await waitForHealth();
    const readiness = await request("/healthz/ready");
    if (readiness !== 200)
      throw smokeError(
        "AUTH_CONTAINER_NOT_READY",
        "container readiness probe failed",
      );
    return {
      status: "PASSED",
      operation: "auth-linux-container-smoke",
      runtimeMajor: Number(process.versions.node.split(".")[0]),
      liveness: "PASSED",
      readiness: "PASSED",
      externalServices: 0,
    };
  } finally {
    if (!child.killed) child.kill("SIGTERM");
  }
}

if (require.main === module) {
  runContainerSmoke()
    .then((report) => process.stdout.write(JSON.stringify(report) + "\n"))
    .catch((error) => {
      process.stderr.write(
        (error.code || "AUTH_CONTAINER_SMOKE_FAILED") +
          ":auth container smoke failed\n",
      );
      process.exitCode = 1;
    });
}

module.exports = { runContainerSmoke, waitForHealth };
