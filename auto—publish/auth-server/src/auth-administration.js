const { AuthError } = require("./auth-errors");

const COMMANDS = new Set([
  "create-user",
  "create-admin",
  "enable-user",
  "disable-user",
  "reset-password",
  "set-expiry",
  "set-device-limit",
  "revoke-device",
  "revoke-sessions",
  "update-note",
]);

const QUERIES = new Set([
  "list-users",
  "show-user",
  "list-devices",
  "list-audit",
]);

class AuthAdministration {
  constructor(options, maybeDomain) {
    const opts = options || {};
    this.domain = opts.domain || maybeDomain;
    this.repository =
      opts.repository || (this.domain && this.domain.repository);
    if (!this.domain || !this.repository)
      throw new TypeError("AuthAdministration requires domain and repository");
  }

  async execute(command) {
    const request = command || {};
    if (!COMMANDS.has(request.type))
      throw new AuthError("AUTH_ADMIN_COMMAND_INVALID");
    switch (request.type) {
      case "create-user":
      case "create-admin":
        return this.domain.createManagedUser({
          loginName: request.loginName,
          password: request.password,
          role:
            request.type === "create-admin" ? "admin" : request.role || "user",
          permanent: request.permanent === true,
          expiresAt: request.expiresAt,
          maxDevices: request.maxDevices === undefined ? 1 : request.maxDevices,
          note: request.note,
          mustChangePassword: request.mustChangePassword,
          entitlementEnabled: request.entitlementEnabled,
        });
      case "enable-user":
        return this.domain.setUserEnabled(this._identifier(request), true);
      case "disable-user":
        return this.domain.setUserEnabled(this._identifier(request), false);
      case "reset-password":
        if (typeof request.password !== "string")
          throw new AuthError("AUTH_INPUT_INVALID");
        return this.domain.resetPassword(
          this._identifier(request),
          request.password,
        );
      case "set-expiry":
        return this.domain.setExpiry(
          this._identifier(request),
          request.expiresAt,
          request.permanent === true,
        );
      case "set-device-limit":
        return this.domain.setDeviceLimit(
          this._identifier(request),
          request.maxDevices,
        );
      case "revoke-device":
        return this.domain.revokeDevice(
          this._identifier(request),
          request.deviceId,
        );
      case "revoke-sessions":
        return this.domain.revokeSessions(this._identifier(request));
      case "update-note":
        return this.domain.setNote(this._identifier(request), request.note);
      default:
        throw new AuthError("AUTH_ADMIN_COMMAND_INVALID");
    }
  }

  async query(query) {
    const request = query || {};
    if (!QUERIES.has(request.type))
      throw new AuthError("AUTH_ADMIN_QUERY_INVALID");
    switch (request.type) {
      case "list-users":
        return this.domain.listUsers();
      case "show-user":
        return this.domain.showUser(this._identifier(request));
      case "list-devices":
        return this.domain.listDevices(this._identifier(request));
      case "list-audit":
        return this.domain.listAudit({
          userId: request.userId,
          limit: request.limit,
        });
      default:
        throw new AuthError("AUTH_ADMIN_QUERY_INVALID");
    }
  }

  _identifier(request) {
    const identifier = request.userId || request.loginName || request.user;
    if (!identifier) throw new AuthError("AUTH_INPUT_INVALID");
    return identifier;
  }
}

module.exports = { AuthAdministration, COMMANDS, QUERIES };
