const { AuthError } = require("../auth-errors");
const { isExpired, nowIso } = require("./auth-policy-utils");
const { projectEntitlements } = require("./auth-projection");

const DEFAULT_PRODUCT = "AutoPublish";

class EntitlementPolicy {
  constructor(options) {
    const opts = options || {};
    if (!opts.repository)
      throw new TypeError("EntitlementPolicy requires a repository");
    this.repository = opts.repository;
    this.now = opts.now || (() => Date.now());
    this.product = opts.product || DEFAULT_PRODUCT;
  }

  forUser(userId) {
    return projectEntitlements(this.repository.getEntitlements(userId));
  }

  assertActive(entitlements) {
    const entitlement = (Array.isArray(entitlements) ? entitlements : []).find(
      (item) => item.product === this.product,
    );
    if (!entitlement || !entitlement.enabled)
      throw new AuthError("AUTH_NOT_ENTITLED");
    if (isExpired(entitlement.expiresAt, this.now))
      throw new AuthError("AUTH_LICENSE_EXPIRED");
    return entitlement;
  }

  assertUserEntitled(userId) {
    const entitlements = this.forUser(userId);
    this.assertActive(entitlements);
    return entitlements;
  }

  createForUser(userId, options) {
    const opts = options || {};
    const createdAt = opts.createdAt || nowIso(this.now);
    this.repository.upsertEntitlement({
      userId,
      product: this.product,
      enabled: opts.enabled === undefined ? true : Boolean(opts.enabled),
      expiresAt: opts.expiresAt || null,
      createdAt,
      updatedAt: opts.updatedAt || createdAt,
    });
    return this.forUser(userId);
  }

  setExpiry(userId, expiresAt) {
    const updatedAt = nowIso(this.now);
    this.repository.upsertEntitlement({
      userId,
      product: this.product,
      enabled: true,
      expiresAt: expiresAt || null,
      createdAt: updatedAt,
      updatedAt,
    });
    return this.forUser(userId);
  }
}

module.exports = { DEFAULT_PRODUCT, EntitlementPolicy };
