const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const repositoryRoot = path.resolve(__dirname, "..", "..");
const workflowPath = path.join(repositoryRoot, ".github", "workflows", "ci.yml");

function job(source, name) {
  const match = source.match(new RegExp(`^  ${name}:\\r?\\n([\\s\\S]*?)(?=^  [A-Za-z][A-Za-z0-9_-]*:|(?![\\s\\S]))`, "m"));
  assert.ok(match, `missing ${name} job`);
  return match[1];
}

test("root CI workflow has the required local-layout command contracts", () => {
  assert.equal(fs.existsSync(workflowPath), true);
  assert.equal(
    fs.existsSync(path.join(repositoryRoot, "auto—publish", ".github", "workflows", "ci.yml")),
    false,
  );
  const workflow = fs.readFileSync(workflowPath, "utf8");
  assert.match(workflow, /^name: CI\r?\n[\s\S]*^jobs:/m);

  const desktop = job(workflow, "desktop");
  assert.match(desktop, /node-version: 24/);
  assert.match(desktop, /npm ci\r?\n        working-directory: auto—publish/);
  assert.match(desktop, /npm ci\r?\n        working-directory: auto—publish\/media-workbench/);
  for (const command of ["npm test", "npm run lint", "npm run typecheck:renderer", "npm run typecheck:bridge", "npm run build:renderer", "npm run test:links", "npm run format:check", "npm run test:packaging", "npm run pack:smoke"]) {
    assert.match(desktop, new RegExp(`run: ${command.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}\\r?\\n        working-directory: auto—publish`));
  }
  assert.match(desktop, /run: npm audit --omit=dev --audit-level=high\r?\n        working-directory: auto—publish/);
  assert.match(desktop, /name: Development dependency audit \(non-blocking known-risk report\)\r?\n        continue-on-error: true\r?\n        run: npm audit --audit-level=high/);

  const auth = job(workflow, "auth");
  assert.match(auth, /node-version: 22/);
  assert.match(auth, /npm ci\r?\n        working-directory: auto—publish\/auth-server/);
  assert.match(auth, /run: npm test\r?\n        working-directory: auto—publish\/auth-server/);

  const links = job(workflow, "link-security");
  assert.match(links, /node-version: 24/);
  assert.match(links, /run: npm run test:links\r?\n        working-directory: auto—publish/);
});
