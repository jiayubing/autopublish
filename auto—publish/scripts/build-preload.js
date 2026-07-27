const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const outputFlag = process.argv.indexOf("--output");
const output =
  outputFlag >= 0 && process.argv[outputFlag + 1]
    ? path.resolve(process.argv[outputFlag + 1])
    : path.join(root, "build", "preload", "preload.cjs");
const esbuildPath = require.resolve("esbuild", {
  paths: [path.join(root, "media-workbench")],
});
const esbuild = require(esbuildPath);

fs.mkdirSync(path.dirname(output), { recursive: true });
esbuild.buildSync({
  entryPoints: [path.join(root, "desktop", "preload.js")],
  outfile: output,
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "es2022",
  external: ["electron"],
  legalComments: "none",
  logLevel: "silent",
});

const bundled = fs.readFileSync(output, "utf8");
if (/require\(["']\.\//.test(bundled)) {
  const error = new Error("Bundled preload retains a local runtime require");
  error.code = "PRELOAD_BUNDLE_LOCAL_REQUIRE";
  throw error;
}

process.stdout.write(
  JSON.stringify({ output, bytes: Buffer.byteLength(bundled) }) + "\n",
);
