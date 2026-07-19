// Compatibility test entry point. Production uses SqliteAuthRepository directly;
// this adapter deliberately never reads or migrates the historical auth.json.
const { InMemoryAuthRepository } = require("./repositories/in-memory-auth-repository");
const { AuthDomain } = require("./auth-domain");

function createAuthStore(options) {
  const opts = options || {};
  const repository = opts.repository || new InMemoryAuthRepository();
  const domain = opts.domain || new AuthDomain({ repository, now: opts.now, accessTtlMs: opts.accessTtlMs, refreshTtlMs: opts.refreshTtlMs });
  return {
    repository,
    domain,
    async createAdmin(loginName, password) {
      return domain.createManagedUser({ loginName, password, role: "admin", permanent: true, mustChangePassword: false });
    },
    async updatePassword(loginName, password) { return domain.resetPassword(loginName, password); },
    async setEnabled(loginName, enabled) { return domain.setUserEnabled(loginName, enabled); },
    async authenticate(loginName, password) {
      try { return await domain.login({ loginName, password, deviceId: "compatibility-test" }); } catch (_) { return null; }
    },
    async createSession(userId, deviceId) {
      const user = repository.findUserById(userId);
      if (!user) return null;
      return domain.login({ loginName: user.loginName, password: "", deviceId });
    },
    async revokeByRefreshToken(refreshToken) { return (await domain.logout({ refreshToken })).revoked; },
    async revokeByAccessToken(accessToken) { return (await domain.logout({ accessToken })).revoked; },
    async revokeAllSessions(userId) { return domain.revokeSessions(userId); },
    findUser(loginName) { return repository.findUserByLoginName(loginName); },
    getData() { return repository.getData(); },
    save() {},
  };
}

module.exports = { createAuthStore };
