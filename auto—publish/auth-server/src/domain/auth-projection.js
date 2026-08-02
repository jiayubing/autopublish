function projectUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    loginName: user.loginName,
    role: user.role,
    enabled: Boolean(user.enabled),
    mustChangePassword: Boolean(user.mustChangePassword),
    maxDevices: Number(user.maxDevices),
    note: user.note || null,
  };
}

function projectEntitlements(entitlements) {
  return (Array.isArray(entitlements) ? entitlements : []).map((item) => ({
    product: item.product,
    enabled: Boolean(item.enabled),
    expiresAt: item.expiresAt || null,
  }));
}

function projectDevice(device, activeCount, maxDevices) {
  return {
    id: device.id,
    displayName: device.displayName || null,
    appVersion: device.appVersion || null,
    registered: true,
    revokedAt: device.revokedAt || null,
    firstSeenAt: device.firstSeenAt,
    lastSeenAt: device.lastSeenAt,
    deviceCount: activeCount,
    maxDevices,
  };
}

function projectSession(session) {
  return {
    id: session.id,
    familyId: session.familyId,
    deviceId: session.deviceId,
    createdAt: session.createdAt,
    lastSeenAt: session.lastSeenAt,
    revokedAt: session.revokedAt,
    revokeReason: session.revokeReason,
  };
}

function projectAuditEvent(event) {
  return {
    id: event.id,
    eventCode: event.eventCode,
    userId: event.userId,
    deviceId: event.deviceId,
    sourceFingerprint: event.sourceFingerprint,
    resultCode: event.resultCode,
    createdAt: event.createdAt,
  };
}

module.exports = {
  projectAuditEvent,
  projectDevice,
  projectEntitlements,
  projectSession,
  projectUser,
  sanitizeDevice: projectDevice,
  sanitizeEntitlements: projectEntitlements,
  sanitizeUser: projectUser,
};
