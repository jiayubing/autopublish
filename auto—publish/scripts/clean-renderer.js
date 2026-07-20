const fs = require("node:fs");
const path = require("node:path");

const rendererRoot = path.resolve(__dirname, "..", "media-workbench");
for (const relative of ["dist", "server.js"]) {
  const target = path.resolve(rendererRoot, relative);
  if (target !== path.join(rendererRoot, relative))
    throw new Error("Refusing to clean an unexpected renderer path");
  fs.rmSync(target, { recursive: true, force: true });
}
