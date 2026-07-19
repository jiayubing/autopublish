const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { AuthDomain } = require("../src/auth-domain");
const { AuthAdministration } = require("../src/auth-administration");
const { InMemoryAuthRepository } = require("../src/repositories/in-memory-auth-repository");

function createMemoryAuth(options) {
  const repository = new InMemoryAuthRepository();
  const domain = new AuthDomain(Object.assign({ repository, passwordCost: 16384, maxConcurrentPasswordComputations: 2 }, options || {}));
  const administration = new AuthAdministration({ repository, domain });
  return { repository, domain, administration };
}

async function createUser(administration, loginName, options) {
  const opts = options || {};
  return administration.execute({
    type: opts.role === "admin" ? "create-admin" : "create-user",
    loginName,
    password: opts.password || "temporary-password",
    permanent: opts.permanent === undefined ? true : opts.permanent,
    expiresAt: opts.expiresAt,
    mustChangePassword: opts.mustChangePassword === undefined ? false : opts.mustChangePassword,
    maxDevices: opts.maxDevices === undefined ? 1 : opts.maxDevices,
    note: opts.note,
  });
}

function temporaryDb() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "autopublish-auth-test-"));
  return { root, filePath: path.join(root, "auth.db"), cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}

module.exports = { createMemoryAuth, createUser, temporaryDb };
